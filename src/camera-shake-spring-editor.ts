import {SHAKE_SPRING_LIMITS,screenSpringSample,springKey,type ShakeSpringSettings,type SpringKind} from './camera-shake-spring.ts';
export class ShakeSpringEditor{
 private frame=0;
 constructor(private root:HTMLElement,private read:()=>ShakeSpringSettings,change:(values:Partial<ShakeSpringSettings>)=>void,preview:(mode:number)=>void){
  root.innerHTML=`<h3>爆炸震动 · 附加效果</h3><label for="value-cameraShakeExtraMode">附加模式</label><select id="value-cameraShakeExtraMode" data-extra="cameraShakeExtraMode"><option value="0">1 · 什么都不加</option><option value="1">2 · 弹簧旋转</option><option value="2">3 · 弹簧伸缩</option></select><p class="threshold-help">爆炸时与原有平移震动同时开始；各自按持续时间结束。旋转左右回摆；伸缩先缩小画面再回弹。默认不附加效果。</p>`+(['Roll','Scale'] as const).map((kind,index)=>{
   const name=kind==='Roll'?'旋转':'伸缩';
   return `<section class="camera-zoom-preview" data-spring="${kind}"><h3>效果 ${index+2} · ${name}</h3>`+(['Amount','Time','Attack','Frequency','Damping'] as const).map((field,i)=>{
    const key=springKey(kind,field),[min,max,step]=SHAKE_SPRING_LIMITS[key],label=[kind==='Roll'?'旋转幅度（度）':'向内缩小幅度（%）','持续时间（秒）','首次到峰值时间（秒）','弹簧频率（Hz）','弹簧阻尼'][i];
    return `<div class="setting"><label for="value-${key}">${label}</label><input id="value-${key}" type="number" min="${min}" max="${max}" step="${step}" data-extra="${key}"><input type="range" min="${min}" max="${max}" step="${step}" data-extra="${key}" aria-label="${name}${label}"></div>`;
   }).join('')+`<svg viewBox="0 0 360 160" role="img" aria-label="${name}弹簧响应曲线"></svg><div class="zoom-preview-actions"><button type="button" data-play="${kind}">单独预览${name}</button><button type="button" data-game="${index+1}">在游戏中预览${name}</button><output></output></div><div class="zoom-mini"><div class="zoom-mini-world"><span>＋</span></div></div><p class="threshold-help">横轴：时间；虚线：原始状态。阻尼越小，来回次数越多。末尾平滑收束到原位。独立预览不改变下拉选择。</p></section>`;
  }).join('');
  root.querySelectorAll<HTMLInputElement>('[data-extra]').forEach(el=>el.addEventListener(el.type==='range'?'input':'change',()=>{const value=Number(el.value);if(Number.isFinite(value))change({[el.dataset.extra!]:value});this.render();}));
  root.querySelectorAll<HTMLButtonElement>('[data-game]').forEach(el=>el.onclick=()=>preview(Number(el.dataset.game)));
  root.querySelectorAll<HTMLButtonElement>('[data-play]').forEach(el=>el.onclick=()=>{
   this.stop();const kind=el.dataset.play as SpringKind,c={...this.read()},start=performance.now(),section=el.closest('section')!,duration=c[springKey(kind,'Time')];
   const tick=(now:number)=>{const age=Math.min(duration,(now-start)/1000),value=screenSpringSample(age,c,kind);
    section.querySelector<HTMLElement>('.zoom-mini-world')!.style.transform=kind==='Roll'?`rotate(${value}deg)`:`scale(${1-value/100})`;
    section.querySelector('output')!.textContent=`${age.toFixed(2)}s · ${kind==='Roll'?value.toFixed(2)+'°':(100-value).toFixed(2)+'%'}`;
    const x=20+320*age/duration;section.querySelector('.spring-cursor')!.setAttribute('x1',String(x));section.querySelector('.spring-cursor')!.setAttribute('x2',String(x));
    if(age<duration)this.frame=requestAnimationFrame(tick);
   };this.frame=requestAnimationFrame(tick);
  });this.render();
 }
 private stop(){cancelAnimationFrame(this.frame);this.root.querySelectorAll<HTMLElement>('.zoom-mini-world').forEach(el=>el.style.transform='');}
 render(){this.stop();const c=this.read();this.root.querySelectorAll<HTMLInputElement>('[data-extra]').forEach(el=>el.value=String(c[el.dataset.extra as keyof ShakeSpringSettings]));
  for(const kind of ['Roll','Scale'] as const){const duration=c[springKey(kind,'Time')],amp=Math.max(.1,c[springKey(kind,'Amount')]),section=this.root.querySelector(`[data-spring="${kind}"]`)!;
   const path=Array.from({length:401},(_,i)=>{const t=duration*i/400,v=screenSpringSample(t,c,kind);return `${i?'L':'M'}${20+320*i/400},${75-(kind==='Roll'?v:-v)/amp*48}`;}).join(' ');
   section.querySelector('svg')!.innerHTML=`<path d="M20 75H340" stroke="#82968c" stroke-dasharray="4 4"/><path d="${path}" fill="none" stroke="#9ce5bf" stroke-width="2"/><line class="spring-cursor" x1="20" x2="20" y1="20" y2="130" stroke="#fff"/><text x="20" y="15">${kind==='Roll'?'旋转角度（±'+amp+'°）':'画面比例（100% ± '+amp+'%）'}</text><text x="20" y="153">0s</text><text x="270" y="153">${duration.toFixed(2)}s</text>`;
  }
 }
 setEnabled(enabled:boolean){this.root.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,select,button').forEach(el=>el.disabled=!enabled);}
}
