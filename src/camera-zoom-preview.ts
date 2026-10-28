import { CameraZoomFeedback } from './camera-zoom.ts';
import type { CameraZoomSettings } from './camera-zoom-config.ts';
import './camera-zoom-preview.css';

/** Samples the game's actual feedback model, including switches and amplitude cap. */
export class CameraZoomPreview {
 private duration=1;
 private time=0;
 private frame=0;
 private playing=false;
 private start=0;
 private config!:CameraZoomSettings;
 private x=(t:number)=>60+620*t/this.duration;
 private y=(v:number)=>0;
 constructor(private root:HTMLElement,private read:()=>CameraZoomSettings){
  root.className='camera-zoom-preview';
  root.innerHTML=`<h3>缩放 / 时间曲线</h3><label>预览触发 <select aria-label="缩放预览触发"><option value="shot">出箭</option><option value="hit">命中</option><option value="both">同时出箭 + 命中</option></select></label>
  <svg class="curve-graph" viewBox="0 0 720 340" role="img" aria-label="屏幕缩放与时间曲线"></svg>
  <div class="zoom-preview-actions"><button type="button">播放预览</button><output aria-live="off"></output></div>
  <input class="zoom-scrub" aria-label="缩放预览时间" type="range" min="0" max="1" step="0.001" value="0">
  <div class="zoom-mini"><div class="zoom-mini-world"><span>＋</span></div></div>
  <p class="threshold-help">横轴：触发后时间；纵轴：镜头缩放，100% 为原位。绿色推近、黄色停留、蓝色弹簧回位。调整上方参数实时更新；拖动时间条逐帧查看。预览遵循两个开关与叠加上限；同时触发仅作对比，游戏命中时刻取决于箭的飞行时间。</p>`;
  root.querySelector('select')!.addEventListener('change',()=>this.render());
  root.querySelector('button')!.addEventListener('click',()=>{
   if(this.playing){this.stop();return;}
   this.playing=true;this.start=performance.now();root.querySelector('button')!.textContent='暂停';
   const tick=(now:number)=>{this.time=Math.min(this.duration,(now-this.start)/1000);this.cursor();if(this.time<this.duration)this.frame=requestAnimationFrame(tick);else this.stop();};
   this.frame=requestAnimationFrame(tick);
  });
  root.querySelector('input')!.addEventListener('input',e=>{this.stop();this.time=Number((e.target as HTMLInputElement).value);this.cursor();});
  this.render();
 }
 private stop(){cancelAnimationFrame(this.frame);this.playing=false;this.root.querySelector('button')!.textContent='播放预览';}
 private pulse(){
  const p=new CameraZoomFeedback(),mode=this.root.querySelector('select')!.value;
  if(mode!=='hit')p.trigger('shot',this.config);
  if(mode!=='shot')p.trigger('hit',this.config);
  return p;
 }
 private at(t:number){const p=this.pulse();p.update(t,this.config);return p.value(this.config)*100;}
 render(){
  this.stop();this.config={...this.read()};
  const p=this.pulse();let end=0;
  // Use the runtime's exact rest thresholds; allow the slowest supported spring to finish.
  while(end<10){p.update(.01,this.config);end+=.01;const s=p.snapshot(this.config);if(!s.shot.active&&!s.hit.active)break;}
  this.duration=Math.max(.5,Math.ceil((end+.05)*10)/10);
  const c=this.config,a=c.cameraZoomAttack,h=a+c.cameraZoomHold;
  const times=[...Array.from({length:501},(_,i)=>i*this.duration/500),a,h].filter(t=>t<=this.duration).sort((a,b)=>a-b);
  const values=times.map(t=>this.at(t)),lo=Math.min(100,...values)-1,hi=Math.max(101,...values)+1;
  this.y=v=>280-(v-lo)/(hi-lo)*240;
  const bands=[[0,a,'#65d5a1'],[a,h,'#e6c96a'],[h,this.duration,'#7cbcff']] as const;
  let svg=bands.map(([s,e,color])=>`<rect x="${this.x(s)}" y="30" width="${this.x(e)-this.x(s)}" height="250" fill="${color}" opacity=".12"/>`).join('');
  for(let i=0;i<=4;i++){
   const t=i*this.duration/4,v=lo+(hi-lo)*i/4;
   svg+=`<text x="${this.x(t)}" y="305" text-anchor="middle">${t.toFixed(2)}s</text><text x="54" y="${this.y(v)+5}" text-anchor="end">${v.toFixed(1)}%</text>`;
  }
  svg+=`<path d="M60 ${this.y(100)}H680" stroke="#a7b5b0" stroke-dasharray="5 5"/><text x="60" y="20">镜头缩放 · 100% = 原位</text><path class="zoom-curve-line" d="${times.map((t,i)=>`${i?'L':'M'}${this.x(t).toFixed(2)},${this.y(values[i]).toFixed(2)}`).join(' ')}" fill="none" stroke="#9ce5bf" stroke-width="3"/><line class="zoom-cursor" y1="30" y2="280" stroke="#fff" opacity=".6"/><circle class="zoom-dot" r="5" fill="#fff"/>`;
  this.root.querySelector('svg')!.innerHTML=svg;
  this.root.querySelector('input')!.max=String(this.duration);
  this.time=Math.min(this.time,this.duration);this.cursor();
 }
 private cursor(){
  const value=this.at(this.time),x=this.x(this.time);
  const line=this.root.querySelector('.zoom-cursor')!;line.setAttribute('x1',String(x));line.setAttribute('x2',String(x));
  const dot=this.root.querySelector('.zoom-dot')!;dot.setAttribute('cx',String(x));dot.setAttribute('cy',String(this.y(value)));
  this.root.querySelector('output')!.textContent=`${this.time.toFixed(3)} s · ${value.toFixed(2)}%`;
  this.root.querySelector('input')!.value=String(this.time);
  this.root.querySelector<HTMLElement>('.zoom-mini-world')!.style.transform=`scale(${value/100})`;
 }
}
