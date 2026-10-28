import type {Settings,SettingKey} from './config.ts';
import './slime-color-controls.css';
const colors=[{id:'slimeColorStart',label:'初始颜色',keys:['slimeColorStartR','slimeColorStartG','slimeColorStartB']},{id:'slimeColorEnd',label:'满容量颜色',keys:['slimeColorEndR','slimeColorEndG','slimeColorEndB']}] as const;
export function slimeColorMarkup(key:SettingKey):string|undefined{
 const color=colors.find(c=>c.keys.some(k=>k===key));if(!color)return undefined;if(key!==color.keys[0])return '';
 return `<div class="setting control slime-color-control" data-control="${color.id}" data-slime-color="${color.id}"><label for="${color.id}-picker">${color.label}</label><div class="slime-color-row"><input id="${color.id}-picker" type="color" aria-label="${color.label}色板"><input class="slime-color-hex" type="text" maxlength="7" spellcheck="false" aria-label="${color.label}色号"><button type="button" class="slime-eyedropper">采色</button></div><small class="slime-color-status" role="status"></small></div>`;
}
type EyeDropperConstructor=new()=>{open():Promise<{sRGBHex:string}>};
export function bindSlimeColors(read:()=>Settings,write:(values:Partial<Record<SettingKey,number>>)=>void){
 const entries=colors.map(color=>{const root=document.querySelector<HTMLElement>(`[data-slime-color=${color.id}]`)!;const picker=root.querySelector<HTMLInputElement>('input[type=color]')!,hex=root.querySelector<HTMLInputElement>('input[type=text]')!,button=root.querySelector<HTMLButtonElement>('button')!,status=root.querySelector<HTMLElement>('small')!;
 const apply=(value:string)=>{if(!/^#[0-9a-f]{6}$/i.test(value)){status.textContent='请输入 #RRGGBB 格式的色号。';return;}const values:Partial<Record<SettingKey,number>>={};color.keys.forEach((key,i)=>values[key]=parseInt(value.slice(1+i*2,3+i*2),16));picker.value=hex.value=value.toLowerCase();status.textContent='';write(values);};
 picker.addEventListener('input',()=>apply(picker.value));hex.addEventListener('change',()=>apply(hex.value.trim()));
 const EyeDropper=(window as unknown as {EyeDropper?:EyeDropperConstructor}).EyeDropper;button.hidden=!EyeDropper;
 button.onclick=async()=>{if(!EyeDropper)return;button.disabled=true;try{const result=await new EyeDropper().open();apply(result.sRGBHex);}catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))status.textContent='采色未完成，请重试或点击色板选色。';}finally{button.disabled=false;}};
 return {color,picker,hex,button};});
 return {render(){const c=read();for(const e of entries){const value='#'+e.color.keys.map(key=>Math.round(c[key]).toString(16).padStart(2,'0')).join('');e.picker.value=e.hex.value=value;}},setEnabled(enabled:boolean){for(const e of entries){e.picker.disabled=e.hex.disabled=e.button.disabled=!enabled;}}};
}
