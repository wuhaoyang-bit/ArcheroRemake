import { CAMERA_ZOOM_DEFAULTS } from '../src/camera-zoom-config.ts';
import { BOW_FX_DEFAULTS } from '../src/bow-release-config.ts';
import { ARROW_TRAIL_DEFAULTS } from '../src/arrow-trail-config.ts';
import { HIT_DEFAULTS } from '../src/hit-feedback-config.ts';
import test from 'node:test';
import { exponentialCurve } from '../src/turn-curve.ts';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { DEFAULTS, LIMITS } from '../src/config.ts';
import { parseSettingsDocument, settingsDocument } from '../src/settings-store.ts';
import { settingsMiddleware } from '../tools/settings-server.ts';
import { MovementController } from '../src/controller.ts';

test('requested defaults match the screenshot, with speed 16 / upper limit 30 and independent Run rate', () => {
  assert.deepEqual(DEFAULTS, {
    ...HIT_DEFAULTS,
    ...CAMERA_ZOOM_DEFAULTS,
    ...BOW_FX_DEFAULTS,
    ...ARROW_TRAIL_DEFAULTS,
    recoilEnabled:1,recoilDistance:.16,recoilDuration:.12,recoilSpeedCurve:DEFAULTS.recoilSpeedCurve,
    monsterSpeed: 3, monsterScale: 1, monsterHitRadius: 1.105, monsterHitSpeed: 1, attackSpeed: 1,
    joystickSize: 1, joystickRadius: 64, unlockDistance: 12, showThreshold: 0, anchorScale: 0.036, anchorFollow: 1, anchorCurve: DEFAULTS.anchorCurve,
    moveSpeed: 16, moveModel: 0, moveCurve: DEFAULTS.moveCurve, turnSpeed: 1200, turnModel: 0, curveSnapAngle: 0.1, turnCurve: exponentialCurve(10.4), blendDuration: 0.06, runSpeed: 1.6, bowScale: 1.5, arrowScale: 1.5, arrowSpeed: 50,
    monsterCount: 2, arrowPierce: 0, arrowsPerAttack: 1, arrowFireInterval: 0.05,
    slerpResponse: 40.872, slerpSnapAngle: 0.1, smoothTime: 0.03039, smoothSnapAngle: 0.1,
    targetModel: 0, lockRange: 22, showLockRange: 0, targetCone: 90, targetAdvantage: 8, targetDwell: 160,
    ringPlayerDiameter: 4, ringTargetDiameter: 8, ringPlayerStroke: 1, ringTargetStroke: 1.2, ringWaveDuration:.4,ringWaveDistance:32,ringWaveStroke:1.2,ringWaveCurve:DEFAULTS.ringWaveCurve,ringSwitchDuration:.25,ringSwitchAmount:150,ringSwitchCurve:DEFAULTS.ringSwitchCurve,ringLinkThreshold:95, ringLinkStroke:1,
    ringPlayerHeight: 1.4, ringTargetHeight: 1.2, ringDuration: .25, ringCurve: DEFAULTS.ringCurve, ringStrokeCurve: DEFAULTS.ringStrokeCurve, ringLinkAttackCurve: DEFAULTS.ringLinkAttackCurve,
    lockTurnModel: 0, lockTurnSpeed: 1200, lockCurveSnapAngle: .1, lockTurnCurve: exponentialCurve(10.4),
    lockSlerpResponse: 40.872, lockSlerpSnapAngle: .1, lockSmoothTime: .03039, lockSmoothSnapAngle: .1,
    roomSize: 16, roomLength: 38, cameraResponse: 9, cameraOffset: 0, viewWidth: 18,
  });
  assert.equal(LIMITS.moveSpeed[1], 30);
  const c = new MovementController(); c.press(1, 0, 0); c.move(1, 40, 0);
  c.set('runSpeed', 4); c.update(0.1); assert.equal(c.position.x, 1.6);
  assert.equal(c.settings.moveSpeed, 16); assert.equal(c.settings.blendDuration, 0.06);
});

test('saved files round-trip only known tuning values; missing new fields default; invalid data cannot poison state', () => {
  const document = settingsDocument({ ...DEFAULTS, moveSpeed: 24, bowScale: 2, arrowScale: 6, arrowSpeed: 120, position: { x: 99, z: 99 }, remembered: { x: 1, z: 2 } } as typeof DEFAULTS);
  assert.deepEqual(Object.keys(document), ['version', 'settings']);
  assert.deepEqual(parseSettingsDocument(JSON.parse(JSON.stringify(document))), { ...DEFAULTS, moveSpeed: 24, bowScale: 2, arrowScale: 6, arrowSpeed: 120 });
  assert.equal('position' in document.settings, false); assert.equal('remembered' in document.settings, false);
  assert.equal(parseSettingsDocument({ version: 1, settings: { moveSpeed: 18 } }).runSpeed, 1.6);
  assert.equal(parseSettingsDocument({ version: 1, settings: { moveSpeed: 90 } }).moveSpeed, 30);
  for (const raw of [null, [], { version: 2, settings: {} }, { version: 1, settings: [] }, { version: 1, settings: { runSpeed: '2' } }, { version: 1, settings: { moveSpeed: Infinity } }]) {
    assert.throws(() => parseSettingsDocument(raw));
  }
  assert.throws(() => parseSettingsDocument({ version: 1, settings: { moveSpeed: 31 } }, true));
});

test('HTTP save writes real JSON, is shared across servers, survives restart, and preserves last good data on rejection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'archero-settings-')), file = join(dir, 'params.json');
  const servers: ReturnType<typeof createServer>[] = [];
  async function start() {
    const middleware = settingsMiddleware(file);
    const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); servers.push(server);
    const address = server.address(); assert.ok(address && typeof address === 'object');
    return `http://127.0.0.1:${address.port}`;
  }
  const payload = settingsDocument({ ...DEFAULTS, moveSpeed: 23, runSpeed: 2.5, turnModel: 2, turnCurve: [{ angle: 0, speed: 45 }, { angle: 80, speed: 900 }, { angle: 180, speed: 2300 }] });
  const post = (base: string, value: unknown, origin = base) => fetch(`${base}/__save-params`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(value) });
  try {
    await writeFile(file, JSON.stringify(settingsDocument(DEFAULTS)));
    const first = await start(), second = await start();
    const response = await post(first, payload); assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), payload);
    const shared = await fetch(`${second}/params.json`); assert.equal(shared.headers.get('cache-control'), 'no-store'); assert.deepEqual(await shared.json(), payload);
    const invalid = await post(first, { version: 1, settings: { runSpeed: -1 } }); assert.equal(invalid.status, 400);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), payload);
    assert.equal((await post(first, payload, 'https://different.example')).status, 403);
    assert.equal((await fetch(`${first}/__save-params`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })).status, 400);
    await new Promise<void>(resolve => servers[0].close(() => resolve()));
    const restarted = await start(); assert.deepEqual(await (await fetch(`${restarted}/params.json`)).json(), payload);
    assert.equal((await fetch(`${second}/__save-params`)).status, 405);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), payload);
  } finally {
    for (const server of servers) if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test('new models round-trip, retired selections migrate, constant and custom experiments survive', () => {
  const curve = [{ angle: 0, speed: 260 }, { angle: 30, speed: 1215 }, { angle: 180, speed: 1720 }];
  for (const turnModel of [0, 2, 5, 6, 7]) {
    const tuned = { ...DEFAULTS, turnModel, turnSpeed: 1210, turnCurve: curve,
      slerpResponse: 30, slerpSnapAngle: .2, smoothTime: .04, smoothSnapAngle: .3 };
    assert.deepEqual(parseSettingsDocument(settingsDocument(tuned)), tuned);
  }
  for (const turnModel of [1, 3, 4]) {
    const migrated = parseSettingsDocument({version: 1, settings: {turnModel, turnSpeed: 1210,
      turnCurve: curve, turnResponse: 17.6, dampingResponse: 20, velocitySmoothTime: .04}});
    assert.equal(migrated.turnModel, 0);
    assert.equal(migrated.turnSpeed, 1210);
    assert.deepEqual(migrated.turnCurve, curve);
    assert.equal(migrated.slerpResponse, 40.872);
    assert.equal('turnResponse' in settingsDocument(migrated).settings, false);
    assert.equal('velocitySmoothTime' in settingsDocument(migrated).settings, false);
  }
  for (const value of [-1, .5, 8]) assert.throws(() => parseSettingsDocument({version: 1, settings: {turnModel: value}}));
  assert.throws(() => parseSettingsDocument({version: 1, settings: {smoothTime: 0}}, true));
  assert.throws(() => parseSettingsDocument({version: 1, settings: {slerpResponse: Infinity}}));
});

test('HTTP save accepts five full curves without losing tuning; oversized writes preserve the last document', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'archero-curves-')), file = join(dir, 'params.json');
  const middleware = settingsMiddleware(file);
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  const curve = Array.from({length:128}, (_,i) => ({angle:i===127?180:i*180/127,speed:1000+i/127}));
  const payload = settingsDocument({...DEFAULTS, turnCurve:curve, lockTurnCurve:curve.map(p=>({...p,speed:p.speed+100})),
    moveCurve:curve, anchorCurve:curve.map(p=>({distance:p.angle/2,speed:p.speed})),
    ringWaveCurve:Array.from({length:128},(_,i)=>({time:i===127?100:i*100/127,progress:i===127?100:i*100/127})),
    ringSwitchCurve:Array.from({length:128},(_,i)=>({time:i===127?100:i*100/127,progress:i===0||i===127?0:50})),
    ringLinkAttackCurve:Array.from({length:128},(_,i)=>({completion:i===127?100:i*100/127,width:100})),
    ringStrokeCurve:Array.from({length:128},(_,i)=>({completion:i===127?100:i*100/127,width:100})),
    ringCurve:Array.from({length:128},(_,i)=>({time:i===127?100:i*100/127,progress:i===127?100:i*100/127})), targetModel:2, lockTurnModel:2});
  const body = JSON.stringify(payload);
  assert.ok(Buffer.byteLength(body) > 16384);
  try {
    server.listen(0,'127.0.0.1'); await once(server,'listening');
    const address=server.address();assert.ok(address&&typeof address==='object');
    const base=`http://127.0.0.1:${address.port}`;
    const post = (body:string) => fetch(`${base}/__save-params`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body});
    assert.equal((await post(body)).status,200);assert.deepEqual(JSON.parse(await readFile(file,'utf8')),payload);
    assert.equal((await post(' '.repeat(131073))).status,413);
    assert.deepEqual(JSON.parse(await readFile(file,'utf8')),payload);
  } finally {
    if(server.listening) await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(dir,{recursive:true,force:true});
  }
});

test('camera zoom tuning round trips and old documents receive defaults',()=>{
 const tuned={...DEFAULTS,cameraZoomShotEnabled:0,cameraZoomHitEnabled:1,cameraZoomShotAmount:2.5,cameraZoomHitAmount:7,cameraZoomMaxAmount:10,cameraZoomAttack:.065,cameraZoomHold:.03,cameraZoomPower:4,cameraZoomFrequency:5.5,cameraZoomDamping:.6};
 assert.deepEqual(parseSettingsDocument(settingsDocument(tuned)),tuned);
 const migrated=parseSettingsDocument({version:1,settings:{moveSpeed:16}});
 for(const key of Object.keys(CAMERA_ZOOM_DEFAULTS) as (keyof typeof CAMERA_ZOOM_DEFAULTS)[])assert.equal(migrated[key],CAMERA_ZOOM_DEFAULTS[key]);
});

test('directional squash mode persists and old files keep overall scaling',()=>{
 const tuned={...DEFAULTS,hitSquashMode:1,hitSquashCompensation:.6};
 assert.deepEqual(parseSettingsDocument(settingsDocument(tuned)),tuned);
 assert.equal(parseSettingsDocument({version:1,settings:{}}).hitSquashMode,0);
});

test('removed spark settings are discarded when loading and saving legacy documents',()=>{
 const legacy={hitBaseEnabled:1,hitDirectionEnabled:1,hitParticleFeetEnabled:1,hitParticleDuration:.8,hitParticleLife:.6,hitParticleCount:14,hitParticleAngle:26,hitParticleMinSpeed:10,hitParticleMaxSpeed:17.5,hitParticleDrag:5,hitParticleSize:1};
 const loaded=parseSettingsDocument({version:1,settings:{...legacy,juiceEnabled:1,hitSquashAmount:.3}},true);
 const saved=settingsDocument(loaded).settings;
 for(const key of Object.keys(legacy)){assert.equal(key in loaded,false);assert.equal(key in saved,false);}
 assert.equal(saved.juiceEnabled,1);assert.equal(saved.hitSquashAmount,.3);
});
