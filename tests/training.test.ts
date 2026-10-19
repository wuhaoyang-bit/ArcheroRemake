import test from 'node:test';
import assert from 'node:assert/strict';
import { MovementController, PLAYER_RADIUS } from '../src/controller.ts';
import { trainingCourse } from '../src/training.ts';

test('courses fit adjustable rooms with alternating route and clear start / finish', () => {
  for (const w of [8,16,24]) for (const l of [8,38,80]) {
    const c = trainingCourse(w,l);
    assert.ok(c.obstacles.length > 0);
    for (let i=0;i<c.obstacles.length;i++) {
      const o=c.obstacles[i];
      assert.ok(o.z<c.startZ-1.4 && o.z>c.finishZ+1.4);
      assert.ok(Math.abs(c.route[i+1].x)>o.radius+PLAYER_RADIUS);
      if(i) assert.ok(c.route[i].x*c.route[i+1].x<0);
    }
  }
});
test('switch resets gesture and anchor but retains tuning; ordinary arena has no obstacle collision', () => {
  const c=new MovementController(); c.press(1,0,0);c.move(1,60,0);
  const settings=structuredClone(c.settings);
  c.setTraining('obstacles');assert.equal(c.mode,'idle');assert.equal(c.pointerId,null);
  assert.deepEqual(c.offset,{x:0,z:0});assert.deepEqual(c.settings,settings);
  c.setTraining('free');const o=c.course.obstacles[0];c.position={x:0,z:o.z+2};
  c.press(2,0,0);c.move(2,0,-60);c.update(.2);assert.ok(c.position.z<o.z);
});
test('obstacles block direct movement even for a long frame without changing desired anchor', () => {
  const c=new MovementController(); c.setTraining('obstacles');const o=c.course.obstacles[0];
  c.position={x:0,z:o.z+2};c.press(1,0,0);c.move(1,0,-60);
  const anchor={...c.offset};c.update(.5);
  assert.ok(c.position.z>=o.z+o.radius+PLAYER_RADIUS-1e-8);
  assert.deepEqual(c.offset,anchor);assert.equal(c.mode,'moving');
});
test('weaving reaches finish, restarts once, ignores old finger and preserves saved tuning', () => {
  const c=new MovementController();c.setTraining('obstacles');const settings=structuredClone(c.settings);
  c.press(1,0,0);
  for (const target of c.course.route.slice(1)) {
    for(let i=0;i<1000;i++) {
      const dx=target.x-c.position.x,dz=target.z-c.position.z,d=Math.hypot(dx,dz);
      if(d<.15 || c.completions) break;
      c.move(1,dx/d*60,dz/d*60);c.update(1/120);
      for(const o of c.course.obstacles) assert.ok(Math.hypot(c.position.x-o.x,c.position.z-o.z)>=o.radius+PLAYER_RADIUS-1e-8);
    }
  }
  if (!c.completions) {c.move(1,0,-60);c.update(.03);}
  assert.equal(c.completions,1);assert.equal(c.position.z,c.course.startZ);
  assert.equal(c.mode,'idle');assert.equal(c.pointerId,null);assert.deepEqual(c.settings,settings);
  c.move(1,0,-60);c.release(1,{x:60,y:0});c.update(1);
  assert.equal(c.completions,1);assert.deepEqual(c.offset,{x:0,z:0});
});

test('rounded route has continuous vertical tangents and clears obstacle collision boundaries', () => {
  for (const width of [8,16,24]) for (const length of [8,38,80]) {
    const course = trainingCourse(width,length);
    for (const segment of course.segments) for (const p of segment) {
      for (const o of course.obstacles) assert.ok(Math.hypot(p.x-o.x,p.z-o.z)>o.radius+PLAYER_RADIUS, 'route must be walkable');
    }
    for(let i=1;i<course.segments.length;i++) {
      const a=course.segments[i-1],b=course.segments[i];
      assert.deepEqual(a.at(-1),b[0]);
      assert.ok(Math.abs(a.at(-1)!.x-a.at(-2)!.x)<.01);
      assert.ok(Math.abs(b[1].x-b[0].x)<.01);
    }
  }
});
test('checkpoint progress is ordered, persistent when leaving, and reset on restart / switch', () => {
  const c=new MovementController();c.setTraining('obstacles');c.press(1,0,0);
  c.position={...c.course.checkpoints[1]};c.move(1,60,0);c.update(.001);
  assert.equal(c.passedCheckpoints,0);
  for(let i=0;i<c.course.checkpoints.length;i++) {
    c.position={...c.course.checkpoints[i]};c.update(.001);
    assert.equal(c.passedCheckpoints,i+1);
    c.position={x:3,z:c.course.startZ};c.update(.001);
    assert.equal(c.passedCheckpoints,i+1);
  }
  c.restartTraining();assert.equal(c.passedCheckpoints,0);
  c.setTraining('free');assert.equal(c.passedCheckpoints,0);
});

test('locking field starts in the center and switching discards an old gesture without changing tuning', () => {
  const c = new MovementController(); c.setTraining('obstacles');
  const settings = structuredClone(c.settings);
  c.press(1, 0, 0); c.move(1, 60, 0); c.update(.1);
  c.setTraining('locking');
  assert.deepEqual(c.position, { x: 0, z: 0 });
  assert.equal(c.mode, 'idle'); assert.equal(c.pointerId, null);
  assert.deepEqual(c.offset, { x: 0, z: 0 });
  c.move(1, 0, -60); c.release(1, { x: 0, y: -60 }); c.update(.1);
  assert.deepEqual(c.position, { x: 0, z: 0 });
  assert.deepEqual(c.settings, settings);
  c.setTraining('obstacles'); assert.equal(c.position.z, c.course.startZ);
  c.setTraining('free'); assert.equal(c.position.z, c.settings.roomSize * .27);
});

test('locking field keeps anchor-driven movement and never triggers obstacle-course completion', () => {
  const field = new MovementController(), ordinary = new MovementController();
  field.setTraining('locking'); ordinary.position = { x: 0, z: 0 };
  for (const controller of [field, ordinary]) { controller.press(1, 0, 0); controller.move(1, 40, -60); }
  for (let i = 0; i < 240; i++) {
    field.update(1 / 120); ordinary.update(1 / 120);
    assert.deepEqual(field.position, ordinary.position);
    assert.equal(field.heading, ordinary.heading);
  }
  field.position = { x: 0, z: field.course.finishZ + .01 };
  field.move(1, 0, -60); field.update(.2);
  assert.equal(field.completions, 0); assert.equal(field.passedCheckpoints, 0);
  assert.equal(field.mode, 'moving'); assert.equal(field.pointerId, 1);
});
