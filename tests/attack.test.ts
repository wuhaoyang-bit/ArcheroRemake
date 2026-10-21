import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { DEFAULTS } from '../src/config.ts';
import { MovementController } from '../src/controller.ts';
import { CharacterAnimation, bowAttackClip } from '../src/character-animation.ts';

const locking = () => {
  const c = new MovementController({...DEFAULTS, targetModel: 1, lockRange: 30, anchorFollow: 0});
  c.setTraining('locking'); return c;
};
const near = (a: number, b: number) => assert.ok(Math.abs(a-b) < 1e-6, `${a} != ${b}`);

test('attack requires owner pointerup with a target; pressing, moving and idle acquisition never fire', () => {
  const c = locking(); c.update(.1); assert.equal(c.attackRequest, null);
  c.press(1,0,0); assert.ok(c.targeting.target); assert.equal(c.attackRequest,null);
  c.move(1,40,0); c.update(.01); assert.equal(c.attackRequest,null);
  const position = {...c.position};
  c.release(1,{x:0,y:-40},'pointerup');
  assert.equal(c.targeting.target?.id,'east'); assert.equal(c.attackRequest,1);
  assert.equal(c.mode,'idle'); assert.equal(c.movementSpeed,0); assert.equal(c.usesLockTurn,true);
  c.update(.5); assert.deepEqual(c.position,position);
  c.release(1,{x:40,y:0},'pointerup'); assert.equal(c.attackRequest,1);
  c.set('lockRange',0); c.press(2,0,0); c.move(2,40,0); c.update(.01); c.release(2,undefined,'pointerup'); assert.equal(c.attackRequest,null);
  c.set('lockRange',30); c.update(.1); assert.equal(c.targeting.target,null); assert.equal(c.attackRequest,null);
  c.setTraining('free'); c.press(3,0,0); c.release(3,undefined,'pointerup'); assert.equal(c.attackRequest,null);
});

test('cancellation and capture loss never fire; final pointerup after capture loss fires once', () => {
  const c = locking(); c.press(1,0,0); c.move(1,40,0); c.loseCapture(1);
  assert.equal(c.attackRequest,null); c.release(1,{x:0,y:-40},'pointerup');
  assert.equal(c.attackRequest,1); assert.equal(c.targeting.target?.id,'north');
  c.release(1,undefined,'pointerup'); c.loseCapture(1); assert.equal(c.attackRequest,1);
  c.press(2,0,0); assert.equal(c.attackRequest,null); c.release(2); assert.equal(c.attackRequest,null);
  c.release(2,undefined,'pointerup'); assert.equal(c.attackRequest,null);
  c.press(3,0,0); c.loseCapture(3); c.cancel(); c.release(3,undefined,'pointerup'); assert.equal(c.attackRequest,null);
  c.press(4,0,0); c.release(4,undefined,'pointerup'); assert.equal(c.attackRequest,2);
  c.setTraining('locking'); assert.equal(c.attackRequest,null); assert.equal(c.targeting.target,null);
});

test('handoff ignores old finger release; re-press cancels and next owner release gets a new shot', () => {
  const c = locking(); c.press(1,0,0); c.press(2,10,10);
  c.release(1,undefined,'pointerup'); assert.equal(c.attackRequest,null);
  c.release(2,undefined,'pointerup'); assert.equal(c.attackRequest,1);
  c.release(1,undefined,'pointerup'); assert.equal(c.attackRequest,1);
  c.press(3,0,0); assert.equal(c.attackRequest,null);
  c.release(3,undefined,'pointerup'); assert.equal(c.attackRequest,2);
});

test('released attack follows death replacement and stays cancelled after press or blur', () => {
  const c=locking();c.press(1,0,0);c.release(1,undefined,'pointerup');
  assert.equal(c.activeAttackRequest,1);
  const old=c.targeting.target!.id;c.notifyTargetDeath(old);assert.notEqual(c.targeting.target?.id,old);assert.equal(c.activeAttackRequest,1);
  c.press(2,0,0);assert.equal(c.activeAttackRequest,null);
  c.release(2,undefined,'pointerup');assert.equal(c.activeAttackRequest,2);
  c.cancel();c.set('lockRange',0);c.set('lockRange',30);assert.equal(c.activeAttackRequest,null);
});

const animator = () => {
  const object = new THREE.Object3D(), mixer = new THREE.AnimationMixer(object);
  const clip = (name: string, values: number[], duration: number) => new THREE.AnimationClip(name,duration,
    [new THREE.NumberKeyframeTrack('.rotation[x]',values.map((_,i)=>i*duration/(values.length-1)),values)]);
  const idle = mixer.clipAction(clip('Idle',[0,0],1)).setEffectiveWeight(1).play();
  const run = mixer.clipAction(clip('Run',[.1,.3,.1],.6)).setEffectiveWeight(0).play();
  const attack = mixer.clipAction(clip('Attack',[0,1,0],1));
  return {animation:new CharacterAnimation(mixer,idle,run,attack), object, mixer, attack, run, idle};
};

test('one release loops continuously, independently of Run speed and update frequency', () => {
  for (const hz of [30,60,120]) {
    const {animation,mixer,attack,run,idle} = animator();
    let loops = 0; mixer.addEventListener('loop',event=>{if(event.action===attack)loops+=event.loopDelta;});
    animation.update(.1,'in-place',null,.06,4);
    for (let i=0;i<hz/2;i++) animation.update(1/hz,'idle',1,.06,4);
    near(attack.time,.5); near(attack.getEffectiveTimeScale(),1); near(run.getEffectiveTimeScale(),4);
    for (let i=0;i<hz*3;i++) animation.update(1/hz,'idle',1,.06,4);
    assert.equal(loops,3); assert.equal(animation.snapshot().playing,true); near(attack.time,.5);
    near(idle.getEffectiveWeight(),0); near(attack.getEffectiveWeight(),1);
    animation.update(0,'idle',null,.06,4); near(idle.getEffectiveWeight(),1); near(attack.getEffectiveWeight(),0);
    animation.update(.1,'idle',1,.06,4); assert.equal(animation.snapshot().playing,true); near(attack.time,.1);
    animation.update(.1,'idle',2,.06,4); assert.equal(animation.snapshot().playing,true); near(attack.time,.1);
  }
});

test('new press immediately removes attack weight and displays Run, including subsequent loops', () => {
  for (const interruptionTime of [.3,1.05]) {
    const {animation,run,attack,mixer} = animator();
    let finished=0; mixer.addEventListener('finished',()=>finished++);
    for(let t=0;t<interruptionTime;t+=.01) animation.update(.01,'idle',1,.25,1.5);
    assert.ok(attack.getEffectiveWeight()>0);
    animation.update(0,'in-place',null,.25,1.5);
    near(attack.getEffectiveWeight(),0); near(run.getEffectiveWeight(),1);
    assert.equal(animation.snapshot().playing,false);
    const before=finished;
    for(let i=0;i<200;i++) animation.update(.01,'moving',null,.25,1.5);
    assert.equal(finished,before);
    animation.update(.1,'idle',2,.25,1.5); near(attack.time,.1);
  }
});

test('bow phase join retains both seam poses and all source samples at strictly increasing times', () => {
  const a=new THREE.NumberKeyframeTrack('.rotation[x]',[0,.5],[0,1]);
  const b=new THREE.NumberKeyframeTrack('.rotation[x]',[0,.5],[.7,0]);
  const prev=new THREE.AnimationClip('AttackPrev',.5,[a]),end=new THREE.AnimationClip('AttackEnd',.5,[b]);
  const joined=bowAttackClip(prev,end),track=joined.tracks[0];
  assert.deepEqual(Array.from(track.values),[0,1,Math.fround(.7),0]);
  for(let i=1;i<track.times.length;i++) assert.ok(track.times[i]>track.times[i-1]);
  near(track.times[2]-track.times[1],1/60); near(joined.duration,1+1/60);
  assert.equal(a.times.length,2); assert.equal(b.times[0],0);
  const constant=new THREE.NumberKeyframeTrack('.rotation[x]',[0,.5],[0,0],THREE.InterpolateDiscrete);
  const optimized=bowAttackClip(new THREE.AnimationClip('constant',.5,[constant]),end);
  assert.equal(optimized.tracks[0].getInterpolation(),THREE.InterpolateLinear);
  assert.equal(constant.getInterpolation(),THREE.InterpolateDiscrete);
});

test('release callbacks occur once per cycle at the sampled release pose, including multiple crossed loops', () => {
  for (const hz of [30, 60, 120]) {
    const { animation, attack } = animator();
    const releases: number[] = [];
    for (let i = 0; i < hz * 3; i++) animation.update(1/hz, 'idle', 1, 0, 1, remainder => {
      near(attack.time, .55); releases.push((i + 1) / hz - remainder);
    });
    assert.equal(releases.length, 3); releases.forEach((t, i) => near(t, .55 + i));
    animation.update(0, 'idle', 1, 0, 1, () => assert.fail('zero time cannot emit'));
    animation.update(1, 'in-place', null, 0, 1, () => assert.fail('cancelled attack cannot emit'));
  }
  const { animation } = animator(); const remaining: number[] = [];
  animation.update(3, 'idle', 1, 0, 1, r => remaining.push(r));
  assert.equal(remaining.length, 3); remaining.forEach((r, i) => near(r, 2.45 - i));
});

test('interrupting before release emits nothing; restart waits for a full draw', () => {
  const { animation } = animator(); let count = 0; const emit = () => count++;
  animation.update(.4, 'idle', 1, 0, 1, emit);
  animation.update(.3, 'in-place', null, 0, 1, emit); assert.equal(count, 0);
  animation.update(.4, 'idle', 2, 0, 1, emit); assert.equal(count, 0);
  animation.update(.2, 'idle', 2, 0, 1, emit); assert.equal(count, 1);
});


test('attack speed scales release events and passes real flight remainder at every frame rate',()=>{
 for(const speed of [.25,1,2,6])for(const hz of [30,60,120]){
  const {animation,attack}=animator();let elapsed=0;const times:number[]=[];
  for(let i=0;i<hz*4;i++){elapsed+=1/hz;animation.update(1/hz,'idle',1,0,1.5,r=>{times.push(elapsed-r);near(attack.time,.55);},speed);}
  const expected:number[]=[];for(let t=.55/speed;t<=4+1e-8;t+=1/speed)expected.push(t);
  assert.equal(times.length,expected.length);times.forEach((t,i)=>near(t,expected[i]));
 }
 const {animation}=animator(),remainders:number[]=[];
 animation.update(1,'idle',1,0,1,r=>remainders.push(r),6);
 assert.equal(remainders.length,6);remainders.forEach((r,i)=>near(r,1-(.55+i)/6));
});
test('changing attack speed preserves phase and does not scale Run or Idle',()=>{
 const {animation,attack,run,idle}=animator();let count=0;
 animation.update(.2,'idle',1,0,1.5,()=>count++,1);near(attack.time,.2);
 animation.update(0,'idle',1,0,1.5,()=>count++,2);near(attack.time,.2);
 animation.update(.2,'idle',1,0,1.5,r=>{count++;near(r,.025);},2);
 near(attack.time,.6);assert.equal(count,1);near(run.getEffectiveTimeScale(),1.5);near(idle.getEffectiveTimeScale(),1);
 animation.update(.5,'moving',null,0,1.5,()=>assert.fail('interrupted'),6);
 animation.update(.05,'idle',2,0,1.5,()=>assert.fail('before release'),6);near(attack.time,.3);
});
