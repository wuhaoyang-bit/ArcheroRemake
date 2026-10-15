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
    joystickRadius: 64, unlockDistance: 12, showThreshold: 0, anchorScale: 0.036, anchorFollow: 1, anchorCurve: DEFAULTS.anchorCurve,
    moveSpeed: 16, turnSpeed: 1200, turnModel: 0, curveSnapAngle: 0.1, turnCurve: exponentialCurve(10.4), blendDuration: 0.06, runSpeed: 1.6,
    slerpResponse: 40.872, slerpSnapAngle: 0.1, smoothTime: 0.03039, smoothSnapAngle: 0.1,
    roomSize: 16, roomLength: 38, cameraResponse: 9, cameraOffset: 0, viewWidth: 18,
  });
  assert.equal(LIMITS.moveSpeed[1], 30);
  const c = new MovementController(); c.press(1, 0, 0); c.move(1, 40, 0);
  c.set('runSpeed', 4); c.update(0.1); assert.equal(c.position.x, 1.6);
  assert.equal(c.settings.moveSpeed, 16); assert.equal(c.settings.blendDuration, 0.06);
});

test('saved files round-trip only known tuning values; missing new fields default; invalid data cannot poison state', () => {
  const document = settingsDocument({ ...DEFAULTS, moveSpeed: 24, position: { x: 99, z: 99 }, remembered: { x: 1, z: 2 } } as typeof DEFAULTS);
  assert.deepEqual(Object.keys(document), ['version', 'settings']);
  assert.deepEqual(parseSettingsDocument(JSON.parse(JSON.stringify(document))), { ...DEFAULTS, moveSpeed: 24 });
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
  for (const turnModel of [0, 2, 5, 6]) {
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
  for (const value of [-1, .5, 7]) assert.throws(() => parseSettingsDocument({version: 1, settings: {turnModel: value}}));
  assert.throws(() => parseSettingsDocument({version: 1, settings: {smoothTime: 0}}, true));
  assert.throws(() => parseSettingsDocument({version: 1, settings: {slerpResponse: Infinity}}));
});
