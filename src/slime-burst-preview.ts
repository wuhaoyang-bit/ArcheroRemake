import {burstEndTime,burstSample} from './slime-burst-state.ts';
import {spring} from './hit-response.ts';
import type {BurstSettings} from './slime-burst-config.ts';
import './camera-zoom-preview.css';
/** Uses the same analytic functions as the runtime; scrubbing never mutates gameplay. */
export class SlimeBurstPreview {
 private time=0;private duration=1;private frame=0;private playing=false;private c!:BurstSettings;
 constructor(private root:HTMLElement,private read:()=>BurstSettings,private puddle=false){
  root.className='camera-zoom-preview';root.innerHTML=`<h3>${puddle?'液滩弹簧展开':'蓄爆伸缩'}曲线</h3><svg class="curve-graph" viewBox="0 0 720 260" role="img" aria-label="${puddle?'液滩尺寸':'蓄爆尺寸与鼓面进度'}曲线"></svg><div class="zoom-preview-actions"><button type="button">播放预览</button><output></output></div><input class="zoom-scrub" aria-label="动画预览时间" type="range" min="0" max="1" step=".001" value="0"><p class="threshold-help">黄线：尺寸倍率，虚线：1 倍。${puddle?'使用游戏内同一弹簧公式，包含超调和回弹。':'蓝线：鼓面增长进度；终点包含等待指定爆开相位的时间。'} 修改参数更新曲线；拖动时间条查看，播放时可暂停。运行中的怪物使用触发时参数，新参数下次触发生效。</p>`;
  root.querySelector('button')!.onclick=()=>{if(this.playing){this.stop();return;}if(this.time>=this.duration)this.time=0;this.playing=true;const start=performance.now()-this.time*1000;root.querySelector('button')!.textContent='暂停';const tick=(now:number)=>{this.time=Math.min(this.duration,(now-start)/1000);this.cursor();if(this.time<this.duration)this.frame=requestAnimationFrame(tick);else this.stop();};this.frame=requestAnimationFrame(tick);};
  root.querySelector('input')!.oninput=e=>{this.stop();this.time=Number((e.target as HTMLInputElement).value);this.cursor();};this.render();
 }
 private stop(){cancelAnimationFrame(this.frame);this.playing=false;this.root.querySelector('button')!.textContent='播放预览';}
 private value(t:number){return this.puddle?Math.max(0,1+spring(this.c.puddleStart-1,this.c.puddleVelocity,t*this.c.puddleSpeed,this.c.puddleFrequency,this.c.puddleDamping).x):burstSample(t,this.c).scale;}
 render(){this.stop();this.c={...this.read()};this.duration=burstEndTime(this.c);
  if(this.puddle){this.duration=.1;while(this.duration<30){const s=spring(this.c.puddleStart-1,this.c.puddleVelocity,this.duration*this.c.puddleSpeed,this.c.puddleFrequency,this.c.puddleDamping);if(Math.abs(s.x)<1e-5&&Math.abs(s.v)<1e-4)break;this.duration+=.02;}}
  const samples=Array.from({length:1001},(_,i)=>this.value(i*this.duration/1000)),lo=Math.min(0,...samples),hi=Math.max(1.1,...samples)*1.05,y=(v:number)=>220-(v-lo)/(hi-lo)*190;
  let svg=`<path d="M55 ${y(1)}H690" stroke="#9fa9a0" stroke-dasharray="5 5"/><path d="${samples.map((v,i)=>`${i?'L':'M'}${55+i*.635},${y(v)}`).join(' ')}" fill="none" stroke="#f5d54a" stroke-width="2"/>`;
  if(!this.puddle)svg+=`<path d="${samples.map((_,i)=>`${i?'L':'M'}${55+i*.635},${y(burstSample(i*this.duration/1000,this.c).bulgeProgress)}`).join(' ')}" fill="none" stroke="#73bcff" stroke-width="2"/>`;
  for(let i=0;i<=4;i++){svg+=`<text x="${55+i*158.75}" y="245" text-anchor="middle">${(i*this.duration/4).toFixed(2)}s</text><text x="50" y="${y(i*hi/4)}" text-anchor="end">${(i*hi/4).toFixed(2)}</text>`;}
  this.root.querySelector('svg')!.innerHTML=svg+'<line class="burst-cursor" y1="25" y2="220" stroke="white"/>';this.root.querySelector('input')!.max=String(this.duration);this.time=Math.min(this.time,this.duration);this.cursor();
 }
 private cursor(){const x=55+635*this.time/this.duration,line=this.root.querySelector('.burst-cursor')!;line.setAttribute('x1',String(x));line.setAttribute('x2',String(x));this.root.querySelector('input')!.value=String(this.time);this.root.querySelector('output')!.textContent=`${this.time.toFixed(3)} s · ${this.value(this.time).toFixed(3)} 倍`;}
}
