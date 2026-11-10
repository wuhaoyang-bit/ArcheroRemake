import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {DEFAULTS} from '../src/config.ts';
import {SlimePresets,SOFT_DISABLED_EFFECTS} from '../src/slime-presets.ts';
import {HIT_SPLASH_PARTICLE_CONTROLS} from '../src/hit-feedback-config.ts';
import {BOW_FX_CONTROLS} from '../src/bow-release-config.ts';
import {ARROW_PAINT_CONTROLS,ARROW_TRAIL_CONTROLS} from '../src/arrow-trail-config.ts';
import {settingsDocument} from '../src/settings-store.ts';
import {settingsMiddleware} from '../tools/settings-server.ts';
const hard=()=>({...structuredClone(DEFAULTS),slimeMaxScale:1.1,slimeBulge:.55,burstScale:1.25,slimeTrailEnabled:0,monsterScale:1.2,slimeFragmentsEnabled:1,hitSplashParticlesCount:16,hitSplashParticlesScale:.55});

test('historical soft preset restores slime values and leaves every protected control intact',()=>{
 const current=hard(),modes=new SlimePresets(current);assert.equal(modes.mode,'hard');
 const soft=modes.toggle(current);assert.equal(soft.slimeMaxScale,1.35);assert.equal(soft.slimeBulge,.65);assert.equal(soft.burstScale,1.4);assert.equal(soft.slimeTrailEnabled,1);assert.equal(soft.monsterScale,1.3);
 for(const key of SOFT_DISABLED_EFFECTS)assert.equal(soft[key],0);assert.equal(soft.slimeFragmentsEnabled,0);
 for(const [key] of [...HIT_SPLASH_PARTICLE_CONTROLS,...BOW_FX_CONTROLS,...ARROW_PAINT_CONTROLS,...ARROW_TRAIL_CONTROLS])assert.deepEqual(soft[key],current[key],key);
 for(const key of ['recoilEnabled','recoilDistance','recoilDuration','recoilSpeedCurve','attackSpeed','bowScale','arrowSpeed','arrowScale','arrowPierce','arrowSpeedAfterPierce','arrowHitLinger','arrowPiercePauseMs','arrowPierceEntrySpeed','arrowsPerAttack','arrowFireInterval','monsterCount','monsterSpeed','roomSize','viewWidth'] as const)assert.deepEqual(soft[key],current[key],key);
});

test('both modes keep their tuning, shared edits survive both directions, arrays do not alias',()=>{
 const current=hard(),modes=new SlimePresets(current);current.slimeFragmentsSoftness=1.3;current.slimeEyeSpeedCurve[0].progress=91;
 const soft=modes.toggle(current);soft.slimeBulge=.8;soft.hitSplashParticlesCount=8;soft.hitSplashParticlesScale=.25;soft.arrowSpeed=147;soft.recoilDistance=.27;soft.slimeEyeSpeedCurve[0].progress=50;
 const back=modes.toggle(soft);assert.equal(back.slimeFragmentsSoftness,1.3);assert.equal(back.slimeFragmentsEnabled,1);assert.equal(back.slimeEyeSpeedCurve[0].progress,91);
 assert.equal(back.hitSplashParticlesCount,8);assert.equal(back.hitSplashParticlesScale,.25);assert.equal(back.arrowSpeed,147);assert.equal(back.recoilDistance,.27);
 const again=modes.toggle(back);assert.equal(again.slimeBulge,.8);assert.equal(again.slimeEyeSpeedCurve[0].progress,50);assert.equal(again.hitSplashParticlesCount,8);
 again.slimeFragmentsEnabled=1;assert.equal(modes.enforce(again).slimeFragmentsEnabled,0);
});

test('saving from soft mode preserves hard startup and both banks across reload',()=>{
 const current=hard(),modes=new SlimePresets(current);const soft=modes.toggle(current);assert.equal(modes.dirty(soft),false);
 soft.slimeBulge=.82;soft.arrowSpeed=146;assert.equal(modes.dirty(soft),true);
 const bundle=modes.saveBundle(soft);assert.equal(bundle.settings.slimeBulge,.55);assert.equal(bundle.settings.slimeFragmentsEnabled,1);assert.equal(bundle.settings.arrowSpeed,146);
 modes.markSaved(bundle);assert.equal(modes.dirty(soft),false);
 const restored=new SlimePresets(bundle.settings,bundle.slimePresets);assert.equal(restored.mode,'hard');const again=restored.toggle(bundle.settings);assert.equal(again.slimeBulge,.82);assert.equal(again.arrowSpeed,146);assert.equal(again.slimeFragmentsEnabled,0);
});

test('optional presets cannot overwrite protected values or enable later effects',()=>{
 const current=hard(),modes=new SlimePresets(current,{version:1,soft:{arrowSpeed:1,hitSplashParticlesCount:33,hitSplashParticlesScale:2,slimeFragmentsEnabled:1,slimeBulge:.9}}),soft=modes.toggle(current);
 assert.equal(soft.arrowSpeed,current.arrowSpeed);assert.equal(soft.hitSplashParticlesCount,16);assert.equal(soft.hitSplashParticlesScale,.55);assert.equal(soft.slimeFragmentsEnabled,0);assert.equal(soft.slimeBulge,.9);
});

test('settings service retains both presets on read/write and older-page saves',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'archero-slime-presets-')),file=join(dir,'params.json'),handler=settingsMiddleware(file),server=createServer((req,res)=>handler(req,res,()=>{res.statusCode=404;res.end();}));
 await writeFile(file,JSON.stringify(settingsDocument(hard())));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number},base=`http://127.0.0.1:${address.port}`;
 try{
  const modes=new SlimePresets(hard()),soft=modes.toggle(hard());soft.slimeBulge=.84;
  const bundle=modes.saveBundle(soft),payload={version:1,...bundle};
  const post=(body:unknown)=>fetch(base+'/__save-params',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)});
  assert.equal((await post(payload)).status,200);const saved=await(await fetch(base+'/params.json')).json();assert.equal(saved.slimePresets.soft.slimeBulge,.84);assert.equal(saved.settings.slimeFragmentsEnabled,1);
  assert.equal((await post(settingsDocument({...bundle.settings,arrowSpeed:150}))).status,200);const legacySaved=JSON.parse(await readFile(file,'utf8'));assert.equal(legacySaved.slimePresets.soft.slimeBulge,.84);assert.equal(legacySaved.settings.arrowSpeed,150);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
