import {DEFAULTS,type Settings} from './config.ts';
import {parseSettingsDocument} from './settings-store.ts';
import legacy from './presets/slime-soft-2f553d0.json';

export type SlimeMode='hard'|'soft';
export type SlimePresetDocument={version:1;soft:Partial<Settings>};
export type SlimeSaveBundle={settings:Settings;slimePresets:SlimePresetDocument};
/** Only slime presentation is mode-specific. Shooting/recoil, following droplets,
 * room/camera movement, targeting, monster count/speed and audio remain shared. */
export function isSlimePresetKey(key:string){
 if(key==='burstSuppressed'||key.startsWith('hitSplashParticles'))return false;
 return /^(slime|burst|liquid|puddle|eyeHit|hit|juice|spray|cameraShake|cameraZoom)/.test(key)||key==='monsterScale';
}
export const SLIME_PRESET_KEYS=(Object.keys(DEFAULTS) as (keyof Settings)[]).filter(isSlimePresetKey);
export const SOFT_DISABLED_EFFECTS=SLIME_PRESET_KEYS.filter(key=>key.endsWith('Enabled')&&!(key in legacy.settings));
const pick=(settings:Partial<Settings>)=>Object.fromEntries(SLIME_PRESET_KEYS.filter(k=>settings[k]!==undefined).map(k=>[k,structuredClone(settings[k])])) as Partial<Settings>;
const merge=(settings:Settings,patch:Partial<Settings>)=>({...structuredClone(settings),...pick(patch)}) as Settings;
const softOnly=(settings:Settings)=>{for(const key of SOFT_DISABLED_EFFECTS)(settings as unknown as Record<string,unknown>)[key]=0;return settings;};

export class SlimePresets{
 mode:SlimeMode='hard';
 private hard:Partial<Settings>;
 private soft:Partial<Settings>;
 private saved:SlimeSaveBundle;
 constructor(hard:Settings,stored?:unknown){
  this.hard=pick(hard);
  const initial=softOnly(parseSettingsDocument({version:1,settings:{...hard,...legacy.settings}}));
  this.soft=pick(initial);
  if(stored&&typeof stored==='object'&&'version' in stored&&stored.version===1&&'soft' in stored&&stored.soft&&typeof stored.soft==='object'){
   // Validate saved values through the normal settings schema, then whitelist again.
   try{this.soft=pick(softOnly(parseSettingsDocument({version:1,settings:merge(initial,stored.soft as Partial<Settings>)})));}catch{/* Invalid optional presets never prevent loading the main settings. */}
  }
  this.saved={settings:structuredClone(hard),slimePresets:{version:1,soft:structuredClone(this.soft)}};
 }
 enforce(settings:Settings){return this.mode==='soft'?softOnly(settings):settings;}
 capture(settings:Settings){this[this.mode]=pick(this.enforce(structuredClone(settings)));}
 toggle(settings:Settings):Settings{
  this.capture(settings);this.mode=this.mode==='hard'?'soft':'hard';
  return this.enforce(merge(settings,this[this.mode]));
 }
 saveBundle(settings:Settings):SlimeSaveBundle{
  this.capture(settings);
  // Root settings always contain the hard mode: reload starts hard even if saved soft.
  return {settings:merge(settings,this.hard),slimePresets:{version:1,soft:structuredClone(this.soft)}};
 }
 markSaved(bundle:SlimeSaveBundle){this.saved=structuredClone(bundle);}
 baseline():Settings{return this.mode==='hard'?structuredClone(this.saved.settings):softOnly(merge(this.saved.settings,this.saved.slimePresets.soft));}
 dirty(settings:Settings){return JSON.stringify(this.saveBundle(settings))!==JSON.stringify(this.saved);}
}
