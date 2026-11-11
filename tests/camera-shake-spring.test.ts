import test from 'node:test';import assert from 'node:assert/strict';
import {screenSpringSample,ScreenSpringFeedback,springKey} from '../src/camera-shake-spring.ts';
import {CameraShakeFeedback} from '../src/camera-shake.ts';
import {DEFAULTS,sanitize} from '../src/config.ts';
import {parseSettingsDocument,settingsDocument} from '../src/settings-store.ts';
test('both spring curves start and finish at baseline with alternating decreasing peaks',()=>{
 for(const kind of ['Roll','Scale'] as const){const c=DEFAULTS,attack=c[springKey(kind,'Attack')],f=c[springKey(kind,'Frequency')],z=c[springKey(kind,'Damping')],half=1/(2*f*Math.sqrt(1-z*z));
 assert.equal(screenSpringSample(0,c,kind),0);assert.equal(screenSpringSample(c[springKey(kind,'Time')],c,kind),0);
 const a=screenSpringSample(attack,c,kind),b=screenSpringSample(attack+half,c,kind),d=screenSpringSample(attack+2*half,c,kind);
 assert.ok(a>0&&b<0&&d>0);assert.ok(a>Math.abs(b)&&Math.abs(b)>d);
 }
});
test('exclusive modes, frame-independent clock, retrigger, reset and master switch',()=>{
 for(const mode of [0,1,2]){const c={...DEFAULTS,cameraShakeExtraMode:mode},a=new CameraShakeFeedback(),b=new CameraShakeFeedback();a.trigger(c);b.trigger(c);a.update(.1,c);for(let i=0;i<12;i++)b.update(1/120,c);
 assert.ok(Math.abs(a.extra.value().scale-b.extra.value().scale)<1e-9);assert.ok(Math.abs(a.extra.value().rotation-b.extra.value().rotation)<1e-9);
 if(mode!==1)assert.equal(a.extra.value().rotation,0);if(mode!==2)assert.equal(a.extra.value().scale,1);
 a.update(4,c);assert.deepEqual(a.extra.value(),{rotation:0,scale:1});a.trigger(c);a.update(.05,c);a.update(0,{...c,cameraShakeEnabled:0});assert.equal(a.extra.snapshot().active,false);
 }
 const s=new ScreenSpringFeedback();s.trigger(DEFAULTS,2);s.update(.04);assert.ok(s.value().scale<1);s.trigger(DEFAULTS,1);assert.deepEqual(s.value(),{rotation:0,scale:1});
});
test('new parameters persist and legacy files default to no additional effect',()=>{
 const c={...DEFAULTS,cameraShakeExtraMode:2,cameraShakeRollTime:.83,cameraShakeScaleDamping:.36};assert.deepEqual(parseSettingsDocument(settingsDocument(c)),c);
 assert.equal(parseSettingsDocument({version:1,settings:{}}).cameraShakeExtraMode,0);assert.equal(sanitize('cameraShakeRollTime',.83),.83);assert.equal(sanitize('cameraShakeExtraMode',1.7),2);
});
