import {Vector3} from 'three';
import {EyeHitMotion} from './eye-hit-motion.ts';
import type {EyeHitSettings} from './eye-hit-config.ts';
/** Front-hit profile sampled from the actual runtime; negative displacement means inside the body. */
export class EyeHitPreview{
 private motion=new EyeHitMotion();private duration=1;private time=0;private playing=false;private frame=0;
 private normal=new Vector3(0,0,1);private low=-1;private high=1;
 constructor(private root:HTMLElement,private read:()=>EyeHitSettings){
  root.className='camera-zoom-preview';root.innerHTML='<h3>完整过程 · 正面受击位移</h3><svg class="curve-graph" viewBox="0 0 720 280" role="img" aria-label="眼球拉开与入体位移预览"></svg><div class="zoom-preview-actions"><button type="button">播放预览</button><output></output></div><input class="zoom-scrub" aria-label="眼球受击预览时间" type="range" min="0" max="1" step=".001"><p class="threshold-help">正值：拉开；负值：进入身体。按满强度正面受击预览，可拖动时间查看。末段为固定速度直线推出，深度越大耗时越长。下方三条曲线控制阶段内相对速度，面积自动归一化；距离由参数决定。修改后下次命中生效。</p>';
  root.querySelector('button')!.onclick=()=>{if(this.playing){this.stop();return;}if(this.time>=this.duration)this.time=0;this.playing=true;const start=performance.now()-this.time*1000;root.querySelector('button')!.textContent='暂停';const tick=(now:number)=>{this.time=Math.min(this.duration,(now-start)/1000);this.cursor();if(this.time<this.duration)this.frame=requestAnimationFrame(tick);else this.stop();};this.frame=requestAnimationFrame(tick);};
  root.querySelector('input')!.oninput=e=>{this.stop();this.time=Number((e.target as HTMLInputElement).value);this.cursor();};this.render();
 }
 private stop(){cancelAnimationFrame(this.frame);this.playing=false;this.root.querySelector('button')!.textContent='播放预览';}
 private y(v:number){return 230-(v-this.low)/(this.high-this.low)*195;}
 render(){this.stop();const c=this.read();this.motion.reset();this.motion.hit(new Vector3(0,0,-1),this.normal,1,1,c);this.duration=c.eyeHitPullTime+c.eyeHitHoldTime+c.eyeHitReturnTime+c.eyeHitAbsorbTime+c.eyeHitDepth/c.eyeHitRestoreSpeed;this.low=-Math.max(.1,c.eyeHitDepth)*1.15;this.high=Math.max(.1,c.eyeHitPull)*1.15;
  const colors={idle:'#aaa',pull:'#f6d54a',taut:'#ffd79c',return:'#ff976b',absorb:'#e882ae',restore:'#71c2ef'};let paths='';let last={x:55,y:this.y(0)};
  for(let i=0;i<=600;i++){this.motion.age=i*this.duration/600;const s=this.motion.sample(this.normal),x=55+635*i/600,y=this.y(s.offset.z);if(i)paths+=`<path d="M${last.x} ${last.y}L${x} ${y}" stroke="${colors[s.phase]}" stroke-width="2"/>`;last={x,y};}
  this.root.querySelector('svg')!.innerHTML=`<path d="M55 ${this.y(0)}H690" stroke="#a0a9af" stroke-dasharray="4 4"/>${paths}<text x="55" y="18">拉开 ↑ / 入体 ↓（眼球半径）</text><text x="55" y="265">0 s</text><text x="640" y="265">${this.duration.toFixed(2)} s</text><line data-cursor y1="28" y2="235" stroke="white"/>`;this.root.querySelector('input')!.max=String(this.duration);this.time=Math.min(this.time,this.duration);this.cursor();
 }
 private cursor(){this.motion.age=this.time;const s=this.motion.sample(this.normal),names={idle:'正常眼位',pull:'惯性拉开',taut:'胶质绷紧',return:'快速拉回',absorb:'入体吸能',restore:'匀速推出'},line=this.root.querySelector('[data-cursor]')!,x=55+635*this.time/this.duration;line.setAttribute('x1',String(x));line.setAttribute('x2',String(x));this.root.querySelector('input')!.value=String(this.time);this.root.querySelector('output')!.textContent=`${this.time.toFixed(3)} s · ${names[s.phase]} · ${s.offset.z.toFixed(2)} 半径`;}
}
