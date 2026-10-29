import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import {DEFAULTS} from '../src/config.ts';
import {UnifiedSlimeLiquid} from '../src/unified-slime-liquid.ts';
import {SlimeGroundTrail,MAX_TRAIL_MARKS,type SlimeTrailBody} from '../src/slime-ground-trail.ts';
import {createTrainingCube} from '../src/training-monster.ts';
import {TrainingFeedback} from '../src/training-feedback.ts';
import type {LiquidMark} from '../src/slime-liquid-field.ts';

const config={...DEFAULTS,puddleRenderer:2,puddleEnabled:1,puddleSize:4,puddleRoughness:.05};
function body(id='a'):SlimeTrailBody{
 const b:SlimeTrailBody={id,active:true,position:new T.Vector3(),radius:.8,color:new T.Color(1,.4,.02),footToward:(ground,out)=>out.copy(ground).sub(b.position).setY(0).normalize().multiplyScalar(.77).add(b.position).setY(.17)};
 return b;
}
function fixture(){const scene=new T.Scene(),fx=new UnifiedSlimeLiquid(scene),b=body();fx.setTrailBodies([b]);fx.update(0,[],config,16,38);return {scene,fx,b};}
function march(f:ReturnType<typeof fixture>,steps=100,axis:'x'|'z'='x'){for(let i=0;i<steps;i++){f.b.position[axis]+=.025;f.fx.update(1/120,[],config,16,38);}}

test('moving slimes leave continuous real liquid with linear colour; stationary slimes do not accumulate residue',()=>{
 const f=fixture();f.fx.update(.5,[],config,16,38);assert.equal(f.fx.trail.snapshot().marks,0);
 march(f);f.fx.update(0,[],config,16,38);
 for(let x=.1;x<2.1;x+=.08)assert.ok(f.fx.field.sample(x,0)>.25,`gap at ${x}`);
 const color=f.fx.field.color(1,0);assert.ok(Math.abs(color[1]-.4)<1/255);assert.equal(color[0],1);
 const n=f.fx.trail.snapshot().marks;f.fx.update(1,[],config,16,38);assert.equal(f.fx.trail.snapshot().marks,n);assert.equal(f.fx.trail.snapshot().strands,0);
});
test('ground anchors stay on their original liquid during turns; stretch really splits into two shrinking capped pieces',()=>{
 const f=fixture();march(f,72);const before=f.fx.trail.snapshot();assert.ok(before.attached>0);
 const fixed=new Map(before.anchors.map(a=>[a.markId,a.ground]));march(f,5,'z');
 const after=f.fx.trail.snapshot();let compared=0;
 for(const a of after.anchors){if(fixed.has(a.markId)){assert.deepEqual(a.ground,fixed.get(a.markId));compared++;}assert.ok(Math.hypot(a.ground[0]-a.mark[0],a.ground[2]-a.mark[1])<a.mark[2]);}
 assert.ok(compared>0);let split=false;
 for(let i=0;i<120;i++){march(f,1,'z');const s=f.fx.trail.snapshot();if(s.breaking){assert.ok(s.triangles>208*s.strands);split=true;break;}}
 assert.ok(split);const geo=f.fx.trail.mesh.geometry,count=geo.drawRange.count;
 assert.ok(count>0);for(const name of ['position','normal','color'])assert.ok([...geo.getAttribute(name).array].every(Number.isFinite));
});
test('distance sampling produces the same path at 30 and 120 Hz',()=>{
 const run=(fps:number)=>{const fx=new SlimeGroundTrail(new T.Scene()),b=body();fx.update(0,[b],config);for(let i=0;i<fps;i++){b.position.x=3*(i+1)/fps;fx.update(1/fps,[b],config);}const marks:LiquidMark[]=[];fx.appendMarks(marks);return marks;};
 const a=run(30),b=run(120);assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i].x-b[i].x)<1e-6);
});
test('live trail width, lifetime, roughness and mode changes take effect; death and reset remove dangling strands',()=>{
 const f=fixture();march(f);const small=f.fx.field.sample(1,.6);
 f.fx.update(0,[],{...config,slimeTrailWidth:1.6,puddleRoughness:.6},16,38);
 assert.ok(f.fx.field.sample(1,.6)>small);assert.equal(f.fx.trail.mesh.material.roughness,.6);
 const floor=f.scene.getObjectByName('UnifiedSlimeSurface') as T.Mesh<T.BufferGeometry,T.MeshPhysicalNodeMaterial>;
 assert.equal(floor.material.roughness,f.fx.trail.mesh.material.roughness);assert.equal(floor.material.ior,f.fx.trail.mesh.material.ior);assert.equal(floor.material.metalness,f.fx.trail.mesh.material.metalness);
 f.b.active=false;f.fx.update(0,[],config,16,38);assert.equal(f.fx.trail.snapshot().strands,0);assert.ok(f.fx.trail.snapshot().marks>0);
 f.fx.update(0,[],{...config,puddleRenderer:1},16,38);assert.equal(f.fx.trail.mesh.visible,false);
 f.fx.update(2,[],{...config,slimeTrailLifetime:.5,slimeTrailFade:.2},16,38);assert.equal(f.fx.trail.snapshot().marks,0);assert.equal(f.fx.field.sample(1,0),0);
 f.fx.clear();assert.equal(f.fx.trail.snapshot().marks,0);assert.equal(f.fx.trail.mesh.geometry.drawRange.count,0);
});
test('teleports never paint a cross-arena connector, and long trails have a finite memory budget',()=>{
 const fx=new SlimeGroundTrail(new T.Scene()),b=body();fx.update(0,[b],config);b.position.x=.4;fx.update(.1,[b],config);const n=fx.snapshot().marks;
 b.position.x=12;fx.update(.1,[b],config);assert.equal(fx.snapshot().marks,n);assert.equal(fx.snapshot().strands,0);
 for(let i=0;i<1200;i++){b.position.x+=.22;fx.update(.001,[b],{...config,slimeTrailLifetime:30});}
 assert.ok(fx.snapshot().marks<=MAX_TRAIL_MARKS);assert.ok(fx.snapshot().strands<=48);
});
test('real body foot anchors follow rotation, inflation and squash without changing hit bounds',()=>{
 const group=new T.Group(),root=createTrainingCube();root.userData.practiceTarget='a';group.add(root);
 const feedback=new TrainingFeedback(group,[{id:'a',x:0,z:0}],16,38);
 feedback.refresh(config);const b=feedback.slimeTrailBodies()[0],ground=new T.Vector3(0,0,-2),first=b.footToward(ground,new T.Vector3());
 assert.ok(first.y>.02&&first.y<.4);assert.ok(first.z<-.6);
 const proxy=feedback.snapshot()[0].proxyScale;
 feedback.hit('a',{x:1,z:0},{...config,hitKnockEnabled:0});feedback.update(.1,config);
 root.rotation.y=.7;feedback.refresh(config);feedback.slimeTrailBodies();const second=b.footToward(ground,new T.Vector3());
 assert.ok(second.distanceTo(first)>.01);assert.ok(Number.isFinite(second.y));assert.ok(b.radius>0);
 const fx=new SlimeGroundTrail(new T.Scene());fx.update(0,[b],config);b.position.z+=1;fx.update(.2,[b],config);
 assert.deepEqual(feedback.snapshot()[0].proxyScale,feedback.proxies[0].scale.toArray());assert.ok(proxy[0]>0);
 feedback.reset();feedback.slimeTrailBodies();assert.ok(b.active);feedback.dispose();
});
