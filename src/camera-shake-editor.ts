import {ShakeSpringEditor} from './camera-shake-spring-editor.ts';
import {CAMERA_SHAKE_LIMITS, SHAKE_FIELDS, SHAKE_LABELS, SHAKE_TIERS, shakeKey, type CameraShakeKey, type CameraShakeSettings, type ShakeTierId} from './camera-shake-config.ts';
import {readShakeTier, shakeEnvelope, shakeOffset} from './camera-shake.ts';
import './camera-zoom-preview.css';
import './camera-shake-editor.css';

export class CameraShakeEditor {
  private get tier(): ShakeTierId {return SHAKE_TIERS[this.read().cameraShakeTier];}
  private enabled=false;
  private springEditor?:ShakeSpringEditor;
  constructor(private root:HTMLElement,private read:()=>CameraShakeSettings,private change:(values:Partial<CameraShakeSettings>)=>void,preview:(tier:ShakeTierId,extraMode?:number)=>void) {
    const select=(key:CameraShakeKey,label:string,options:string[])=>`<div class="turn-model-field"><label for="value-${key}">${label}</label><select id="value-${key}" data-shake-setting="${key}">${options.map((text,i)=>`<option value="${i}">${text}</option>`).join('')}</select></div>`;
    root.innerHTML=select('cameraShakeEnabled','爆炸屏幕震动',['关闭','开启'])+select('cameraShakeTier','爆炸使用档位',['弱 · 纵向','中 · 横纵交织','强 · 衰减圆形'])+
      '<p class="threshold-help">所选档位同时用于实际爆炸、下方调参与预览。三档参数独立保存；切换档位或修改参数后，下次爆开生效。</p>'+
      SHAKE_TIERS.map(tier=>`<div data-shake-tier="${tier}">${SHAKE_FIELDS.map(f=>{
        const key=shakeKey(tier,f.field),[min,max,step]=CAMERA_SHAKE_LIMITS[key];
        const control=f.field==='Formula'?select(key,f.label,['剩余时间 · Remain^p','Trauma^n']):`<div class="setting-label"><label for="slider-${key}">${f.label}</label><div class="numeric"><input id="value-${key}" data-shake-setting="${key}" type="number" min="${min}" max="${max}" step="${step}" aria-label="${SHAKE_LABELS[tier]}震动${f.label}数值"><span>${f.unit}</span></div></div><input id="slider-${key}" data-shake-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" aria-label="${SHAKE_LABELS[tier]}震动${f.label}">`;
        return `<div class="setting" data-shake-field="${f.field}" title="${f.hint}">${control}</div>`;
      }).join('')}</div>`).join('')+
      '<div class="camera-zoom-preview"><h3>振幅与运动轨迹</h3><svg viewBox="0 0 360 160" role="img" aria-label="震动衰减曲线与轨迹"></svg><div class="zoom-preview-actions"><button type="button" id="camera-shake-preview">在游戏中预览当前档</button><output></output></div><p class="threshold-help">左：振幅随时间衰减。右：运动轨迹示意。中／强每次触发随机起始方向。振幅按 390 px 画面宽度等比缩放，计时为 60 帧/秒。</p></div>';
    root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-shake-setting]').forEach(input=>input.addEventListener(input.type==='range'?'input':'change',()=>{
      if(!this.enabled)return;
      const key=input.dataset.shakeSetting as CameraShakeKey,value=Number(input.value);
      if(!Number.isFinite(value)){this.render();return;}
      const values:Partial<CameraShakeSettings>={[key]:value};
      if(key.endsWith('Duration'))values[shakeKey(this.tier,'Decay')]=1/Math.max(1,Math.min(60,Math.round(value)));
      this.change(values);this.render();
    }));
    root.querySelector<HTMLButtonElement>('#camera-shake-preview')!.onclick=()=>preview(this.tier);
    const extraRoot=document.createElement('div');root.append(extraRoot);
    this.springEditor=new ShakeSpringEditor(extraRoot,read,change,mode=>preview(this.tier,mode));
    this.render();
  }
  setEnabled(enabled:boolean){this.enabled=enabled;this.render();}
  render(){
    this.springEditor?.render();this.springEditor?.setEnabled(this.enabled);
    const c=this.read(),t=readShakeTier(c,this.tier);
    this.root.querySelectorAll<HTMLElement>('[data-shake-tier]').forEach(el=>el.hidden=el.dataset.shakeTier!==this.tier);
    this.root.querySelectorAll<HTMLElement>('[data-shake-field]').forEach(el=>{
      const field=el.dataset.shakeField;
      el.hidden=field==='P'?t.formula!==0:(field==='N'||field==='Decay')?t.formula!==1:false;
    });
    this.root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-shake-setting]').forEach(input=>{
      const key=input.dataset.shakeSetting as CameraShakeKey,[min,max]=CAMERA_SHAKE_LIMITS[key];
      input.value=String(c[key]);input.disabled=!this.enabled;input.style.setProperty('--fill',`${(c[key]-min)/(max-min)*100}%`);
    });
    const button=this.root.querySelector<HTMLButtonElement>('#camera-shake-preview')!;
    button.disabled=!this.enabled||!c.cameraShakeEnabled;
    button.textContent=`在游戏中预览${SHAKE_LABELS[this.tier]}档`;
    const scale=52/Math.max(1,t.A0),points=Array.from({length:241},(_,i)=>i*t.duration/240);
    const env=points.map((i,j)=>`${j?'L':'M'}${12+140*i/t.duration},${128-shakeEnvelope(t,i)*scale}`).join(' ');
    const path=points.map((i,j)=>{const p=shakeOffset(t,i,this.tier,Math.PI/4);return `${j?'L':'M'}${266+p.x*scale},${76-p.y*scale}`;}).join(' ');
    this.root.querySelector('svg')!.innerHTML=`<path d="M12 20V128H152M204 76H328M266 14V138" fill="none" stroke="#687a79"/><path d="${env}" fill="none" stroke="#f5d54a" stroke-width="2"/><path d="${path}" fill="none" stroke="#73bcff" stroke-width="2"/><text x="12" y="153">0 → ${t.duration} 帧</text><text x="220" y="153">${SHAKE_LABELS[this.tier]}震动轨迹</text>`;
    this.root.querySelector('output')!.textContent=`${(t.duration/60).toFixed(3)} s`;
  }
}
