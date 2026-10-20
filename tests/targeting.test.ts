import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, type Settings } from '../src/config.ts';
import { TargetSelection, type Target } from '../src/targeting.ts';
import { MovementController, wrapAngle } from '../src/controller.ts';
import { smoothDampAngleTurn } from '../src/turn-damping.ts';
import { parseSettingsDocument, settingsDocument } from '../src/settings-store.ts';

const near = (a: number, b: number, epsilon = 1e-8) => assert.ok(Math.abs(a-b) < epsilon, `${a} != ${b}`);
const origin = {x: 0, z: 0};
const target = (id: string, bearing: number, distance = 10): Target => ({
  id, label: id, x: Math.sin(bearing*Math.PI/180)*distance, z: -Math.cos(bearing*Math.PI/180)*distance,
});
const heading = (bearing: number) => Math.PI - bearing*Math.PI/180;
const controller = (settings: Partial<Settings> = {}) => {
  const c = new MovementController({...DEFAULTS, anchorFollow: 0, moveSpeed: 1, ...settings});
  c.setTraining('locking'); return c;
};

test('A: activation, ground distance, radius boundary, nearest changes, removal and empty range', () => {
  const s = new TargetSelection(), targets = [target('far', 0, 21), target('near', 90, 5)];
  const rules = {...DEFAULTS, lockRange: 5};
  s.update(targets, origin, Math.PI, rules, .1); assert.equal(s.target, null);
  s.active = true; s.update(targets, origin, Math.PI, rules, .1); assert.equal(s.snapshot().target?.id, 'near');
  s.update(targets, {x:0,z:-20}, Math.PI, {...rules, lockRange:22}, .1); assert.equal(s.snapshot().target?.id, 'far');
  s.update([targets[1]], origin, Math.PI, rules, .1); assert.equal(s.snapshot().target?.id, 'near');
  s.update(targets, origin, Math.PI, {...rules, lockRange:4.9}, .1); assert.equal(s.target, null);
});

test('B: cone angle outranks proximity, angle ties prefer closer, cone boundaries and empty cone', () => {
  const s = new TargetSelection(); s.active = true;
  const rules = {...DEFAULTS, targetModel:1, targetCone:90};
  const targets = [target('center', 0, 20), target('near', 30, 2), target('edge',45,1)];
  s.update(targets,origin,heading(0),rules,.1); assert.equal(s.snapshot().target?.id,'center');
  s.update([target('far',-30,10), target('near',30,2)],origin,heading(0),rules,.1); assert.equal(s.snapshot().target?.id,'near');
  s.update([targets[2]],origin,heading(0),rules,.1); assert.equal(s.snapshot().target?.id,'edge');
  s.update(targets,origin,heading(180),rules,.1); assert.equal(s.target,null);
});

test('C: keeps a valid old target outside cone; requires continuous same-candidate advantage', () => {
  const s = new TargetSelection(); s.active = true;
  const rules = {...DEFAULTS, targetModel:2};
  const targets = [target('north',0),target('east',90),target('south',180)];
  s.update(targets,origin,heading(0),rules,0); assert.equal(s.snapshot().target?.id,'north');
  s.update(targets,origin,heading(90),rules,.1); assert.equal(s.snapshot().target?.id,'north'); near(s.elapsed,.1);
  s.update(targets,origin,heading(180),rules,.05); assert.equal(s.candidate?.id,'south'); near(s.elapsed,.05);
  s.update(targets,origin,heading(90),rules,.1); assert.equal(s.candidate?.id,'east'); near(s.elapsed,.1);
  s.update(targets,origin,heading(90),rules,.06); assert.equal(s.snapshot().target?.id,'east'); near(s.elapsed,0);
  s.update(targets,origin,heading(270),rules,2); assert.equal(s.snapshot().target?.id,'east'); assert.equal(s.candidate,null);
});

test('C: equal-angle nearer candidate cannot bypass advantage, even with zero threshold/time', () => {
  const s = new TargetSelection(); s.active = true;
  const targets = [target('far',-20,10),target('near',20,2)], rules = {...DEFAULTS,targetModel:2,targetAdvantage:0,targetDwell:0};
  s.update(targets,origin,heading(-20),rules,0); assert.equal(s.snapshot().target?.id,'far');
  s.update(targets,origin,heading(0),rules,2); assert.equal(s.snapshot().target?.id,'far'); assert.equal(s.candidate,null);
  s.update(targets,origin,heading(1),rules,0); assert.equal(s.snapshot().target?.id,'near');
});

test('C: insufficient advantage resets elapsed; invalid old target reacquires without dwell', () => {
  const s = new TargetSelection(); s.active = true;
  const targets = [target('north',0,20),target('east',90,5)], rules = {...DEFAULTS,targetModel:2,targetCone:180};
  s.update(targets,origin,heading(0),rules,0);
  s.update(targets,origin,heading(90),rules,.1); near(s.elapsed,.1);
  s.update(targets,origin,heading(46),rules,.01); near(s.elapsed,0); assert.equal(s.candidate,null);
  s.update(targets,origin,heading(90),{...rules,lockRange:10},0); assert.equal(s.snapshot().target?.id,'east');
  s.update([targets[0]],origin,heading(0),rules,0); assert.equal(s.snapshot().target?.id,'north');
  s.update([],origin,heading(0),rules,0); assert.equal(s.target,null);
});

test('C: seconds-based candidate dwell has identical switching at 30 / 60 / 120 Hz', () => {
  for (const hz of [30,60,120]) {
    const s = new TargetSelection(); s.active=true;
    const ts=[target('north',0),target('east',90)], rules={...DEFAULTS,targetModel:2,targetDwell:200};
    s.update(ts,origin,heading(0),rules,0);
    for(let i=0;i<hz/5-1;i++) s.update(ts,origin,heading(90),rules,1/hz);
    assert.equal(s.snapshot().target?.id,'north'); s.update(ts,origin,heading(90),rules,1/hz); assert.equal(s.snapshot().target?.id,'east');
  }
});

test('entry and re-entry never acquire until game press; UI model change cannot activate', () => {
  const c=controller(); c.update(1); assert.equal(c.targeting.active,false); assert.equal(c.targeting.target,null);
  c.set('targetModel',1); c.update(.1); assert.equal(c.targeting.target,null); near(c.heading,Math.PI);
  c.press(1,0,0); assert.equal(c.targeting.snapshot().target?.id,'north'); assert.equal(c.usesLockTurn,true);
  c.release(1); assert.equal(c.usesLockTurn,true);
  c.setTraining('free'); c.press(2,0,0); assert.equal(c.targeting.active,false);
  c.setTraining('locking'); c.update(.1); assert.equal(c.targeting.active,false); assert.equal(c.targeting.target,null);
  assert.deepEqual(c.offset,origin);
});

test('B/C use initial facing then actual anchor, retaining last valid direction at zero', () => {
  for (const targetModel of [1,2]) {
    const c=controller({targetModel,targetDwell:0}); c.press(1,0,0); assert.equal(c.targeting.snapshot().target?.id,'north');
    c.offset={x:1,z:0}; c.heading=0; c.update(.01); assert.equal(c.targeting.snapshot().target?.id,'east');
    c.offset={x:0,z:0}; c.update(.01); assert.equal(c.targeting.snapshot().target?.id,'east');
  }
});

test('anchor smoothing: target endpoint and raw stick cannot choose before actual anchor follows', () => {
  const c=controller({targetModel:1,anchorFollow:1,anchorCurve:[{distance:0,speed:0},{distance:10,speed:0}]});
  c.press(1,0,0); c.move(1,0,-40); c.update(.01);
  c.move(1,40,0); c.update(.01);
  assert.ok(c.targetOffset.x>0); assert.equal(c.offset.x,0); assert.equal(c.targeting.snapshot().target?.id,'north');
  c.release(1,{x:40,y:0}); assert.equal(c.offset.z,0); assert.equal(c.targeting.snapshot().target?.id,'east');
});

test('C: release resets candidate dwell, handoff preserves it, ignored old fingers cannot reset it', () => {
  const c=controller({targetModel:2}); c.press(1,0,0); c.offset={x:1,z:0}; c.update(.1);
  assert.equal(c.targeting.snapshot().target?.id,'north'); near(c.targeting.elapsed,.1);
  c.press(2,50,50); near(c.targeting.elapsed,.1);
  c.release(1); near(c.targeting.elapsed,.1); assert.equal(c.pointerId,2);
  c.release(2); near(c.targeting.elapsed,0); assert.equal(c.targeting.snapshot().target?.id,'north');
  c.update(.159); assert.equal(c.targeting.snapshot().target?.id,'north');
  c.update(.001); assert.equal(c.targeting.snapshot().target?.id,'east'); assert.equal(c.mode,'idle');
});

test('switching selection model immediately reacquires without C delay; range changes invalidate immediately', () => {
  const c=controller({targetModel:2}); c.press(1,0,0); c.offset={x:1,z:0}; c.update(.05);
  assert.equal(c.targeting.snapshot().target?.id,'north'); c.set('targetModel',1); assert.equal(c.targeting.snapshot().target?.id,'east');
  c.set('targetModel',2); assert.equal(c.targeting.snapshot().target?.id,'east'); near(c.targeting.elapsed,0);
  c.release(1); c.set('lockRange',5); assert.equal(c.targeting.target,null); assert.equal(c.usesLockTurn,false);
  c.set('lockRange',22); assert.equal(c.targeting.snapshot().target?.id,'east'); assert.equal(c.usesLockTurn,true);
});

test('in-place and idle use lock turning; threshold unlock switches to ordinary anchor turning', () => {
  const c=controller({turnSpeed:90,lockTurnSpeed:180}); c.position.x=1; c.press(1,0,0);
  assert.equal(c.targeting.snapshot().target?.id,'east'); c.offset={x:0,z:1}; c.update(.1);
  near(c.angularSpeed,180); assert.equal(c.usesLockTurn,true);
  near(c.targetHeading,Math.PI/2); near(c.anchorHeading,0);
  const heldPosition={...c.position};
  c.move(1,c.settings.unlockDistance,0); c.update(.1);
  assert.equal(c.mode,'in-place'); assert.equal(c.usesLockTurn,true); near(c.angularSpeed,180);
  assert.deepEqual(c.position,heldPosition); assert.deepEqual(c.offset,{x:0,z:1});
  c.press(2,50,50); c.release(1); assert.equal(c.mode,'in-place'); assert.equal(c.usesLockTurn,true);
  c.set('lockRange',0); assert.equal(c.usesLockTurn,false); near(c.targetHeading,0);
  c.update(.1); near(c.angularSpeed,90);
  c.set('lockRange',22); assert.equal(c.usesLockTurn,true);
  c.move(2,0,40); assert.equal(c.mode,'moving'); assert.equal(c.usesLockTurn,false); near(c.targetHeading,0);
  c.update(.1); near(c.angularSpeed,90); assert.ok(c.position.z>heldPosition.z);
  const pose=c.heading, position={...c.position}, offset={...c.offset};
  c.release(2); near(c.heading,pose); c.update(.1); near(c.angularSpeed,180); assert.equal(c.usesLockTurn,true);
  assert.deepEqual(c.position,position); assert.deepEqual(c.offset,offset); assert.deepEqual(c.remembered,offset);
  c.press(3,10,10); assert.equal(c.usesLockTurn,true); assert.deepEqual(c.offset,offset);
  c.update(.01); assert.deepEqual(c.position,position);
});

test('release uses final pointer despite stale stick and lost capture, then selects from final anchor', () => {
  const c=controller({targetModel:1}); c.press(1,0,0); c.move(1,-40,0); c.update(.01);
  c.loseCapture(1); c.stick={x:40,y:0}; c.release(1,{x:0,y:-200});
  near(c.offset.x,0); near(c.offset.z,-64*c.settings.anchorScale);
  assert.equal(c.targeting.snapshot().target?.id,'north'); assert.deepEqual(c.remembered,c.offset);
  const pos={...c.position}; c.update(.1); assert.deepEqual(c.position,pos);
});

test('moving handoff keeps anchor and ordinary turn; release of owner never resumes older finger', () => {
  const c=controller(); c.press(1,0,0); c.move(1,40,0); c.update(.01);
  const offset={...c.offset}; c.press(2,50,50); c.update(.01);
  assert.equal(c.mode,'moving'); assert.equal(c.usesLockTurn,false); assert.deepEqual(c.offset,offset);
  c.release(2); assert.equal(c.usesLockTurn,true); const pos={...c.position};
  c.move(1,0,-40); c.release(1); c.update(.01); assert.deepEqual(c.position,pos); assert.deepEqual(c.offset,offset);
});

test('movement direction and speed curve use anchor, even after facing enemy in idle', () => {
  const c=controller({moveSpeed:10,moveModel:1,moveCurve:[{angle:0,speed:100},{angle:180,speed:50}]});
  c.position.x=1; c.press(1,0,0); c.release(1); c.update(1); near(c.heading,Math.PI/2);
  c.press(2,0,0); c.move(2,0,-40); const p={...c.position}; c.update(.01);
  near(c.movementAngleError,90); near(c.movementSpeed,7.5); near(c.position.x,p.x); near(c.position.z,p.z-.075);
});

test('SmoothDampAngle carries same-direction velocity between both configs, but uses new parameters', () => {
  const c=controller({targetModel:1,turnModel:6,lockTurnModel:6,smoothTime:.2,lockSmoothTime:.3});
  c.press(1,0,0); c.move(1,40,0); c.update(.01);
  const before=c.heading, velocity=c.snapshot().dampingVelocity*Math.PI/180;
  c.release(1); near(c.heading,before); near(c.snapshot().dampingVelocity*Math.PI/180,velocity);
  const expected=smoothDampAngleTurn(wrapAngle(c.targetHeading-before),velocity,.3,.1*Math.PI/180,.01);
  c.update(.01); near(wrapAngle(c.heading-before),expected.turn);
  const v=c.snapshot().dampingVelocity*Math.PI/180, h=c.heading;
  c.press(2,0,0); c.move(2,40,0);
  const next=smoothDampAngleTurn(wrapAngle(c.targetHeading-h),v,.2,.1*Math.PI/180,.01);
  c.update(.01); near(wrapAngle(c.heading-h),next.turn);
});

test('different rotation models clear damping, inactive model edits do not disturb active velocity', () => {
  const c=controller({targetModel:1,turnModel:6,lockTurnModel:6,smoothTime:.2});
  c.press(1,0,0); c.move(1,40,0); c.update(.01);
  const v=c.snapshot().dampingVelocity; assert.notEqual(v,0);
  c.set('lockTurnModel',0); near(c.snapshot().dampingVelocity,v);
  c.release(1); c.update(.01); near(c.snapshot().dampingVelocity,0);
  c.press(2,0,0); c.move(2,40,0); const h=c.heading;
  const next=smoothDampAngleTurn(wrapAngle(c.targetHeading-h),0,.2,.1*Math.PI/180,.01);
  c.update(.01); near(wrapAngle(c.heading-h),next.turn);
});

test('lock turning preserves horizontal 180-degree tie convention in every rotation model', () => {
  for (const lockTurnModel of [0,2,5,6,7]) for (const side of [-1,1]) {
    const c=controller({targetModel:1,lockTurnModel}); c.press(1,0,0);
    c.offset={x:-side,z:0}; c.heading=side*Math.PI/2; c.release(1); c.update(.001);
    assert.equal(Math.sign(Math.cos(c.heading)),side);
  }
});

test('old JSON copies all ordinary rotation values once, with independent curves; new config round trips', () => {
  const curve=[{angle:0,speed:260},{angle:80,speed:1000},{angle:180,speed:2600}];
  const s=parseSettingsDocument({version:1,settings:{turnModel:2,turnSpeed:1230,turnCurve:curve,
    curveSnapAngle:.3,slerpResponse:22,slerpSnapAngle:.2,smoothTime:.08,smoothSnapAngle:.4}});
  assert.equal(s.lockTurnModel,2); assert.equal(s.lockTurnSpeed,1230); assert.deepEqual(s.lockTurnCurve,curve);
  assert.equal(s.lockCurveSnapAngle,.3); assert.equal(s.lockSlerpResponse,22); assert.equal(s.lockSlerpSnapAngle,.2);
  assert.equal(s.lockSmoothTime,.08); assert.equal(s.lockSmoothSnapAngle,.4);
  s.lockTurnCurve[0].speed=400; assert.equal(s.turnCurve[0].speed,260);
  s.turnSpeed=1400; assert.equal(s.lockTurnSpeed,1230);
  Object.assign(s,{targetModel:2,lockRange:12.5,showLockRange:1,targetCone:120,targetAdvantage:4,targetDwell:250,lockTurnModel:6});
  assert.deepEqual(parseSettingsDocument(JSON.parse(JSON.stringify(settingsDocument(s)))),s);
  for (const settings of [{targetModel:3},{targetModel:.5},{lockTurnModel:8},{lockTurnCurve:null},{lockTurnCurve:[{angle:90,speed:100}]},{lockRange:-1}]) {
    assert.throws(()=>parseSettingsDocument({version:1,settings},true));
  }
});
