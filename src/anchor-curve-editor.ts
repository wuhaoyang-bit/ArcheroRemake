import { DEFAULT_ANCHOR_CURVE, validateAnchorCurve, type AnchorCurvePoint } from './anchor-follow.ts';

export class AnchorCurveEditor {
  private selected = 0;
  private form = document.createElement('dialog');
  private expanded = document.createElement('dialog');
  private surfaces: HTMLElement[];
  private drag: { id: number; distance: number; maxDistance: number; maxSpeed: number;
    startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean } | null = null;
  constructor(root: HTMLElement, private read: () => AnchorCurvePoint[], private change: (points: AnchorCurvePoint[]) => void) {
    this.form.className='curve-number-dialog'; this.form.dataset.ui='';
    this.expanded.className='curve-dialog';this.expanded.dataset.ui='';
    this.expanded.innerHTML='<button class="curve-close">关闭</button><h2>锚点跟随曲线</h2><div class="curve-large"></div>';
    document.body.append(this.form,this.expanded);
    this.expanded.querySelector('button')!.onclick=()=>this.expanded.close();
    this.surfaces=[root,this.expanded.querySelector<HTMLElement>('.curve-large')!];
    for(const surface of this.surfaces) {
      surface.innerHTML=`<svg class="curve-graph" viewBox="0 0 720 400" role="img" aria-label="距离差与锚点跟随速度曲线"></svg>
      <p class="curve-selection"></p><div class="curve-actions"><button data-anchor="edit">编辑点</button><button data-anchor="add">添加点</button><button data-anchor="delete">删除点</button><button data-anchor="expand">放大编辑</button><button data-anchor="reset">恢复默认曲线</button></div>
      <p class="threshold-help">拖动控制点调整距离和速度；0 距离端点只能上下拖动。双击空位加点，双击控制点输入数值。横轴为地面距离差，纵轴为单位/秒。最后一点之后保持该点速度；距离 0 端点不可删除。</p><p class="curve-warning"></p>`;
      const on=(name:string,callback:()=>void)=>surface.querySelector<HTMLButtonElement>(`[data-anchor="${name}"]`)!.onclick=callback;
      on('edit',()=>this.edit(this.selected));on('add',()=>this.edit(null));
      on('delete',()=>{if(this.selected!==0 && this.read().length>2){this.commit(this.read().filter(p=>p.distance!==this.selected));this.selected=0;this.render();}});
      on('expand',()=>{if(!this.expanded.open)this.expanded.showModal();});
      on('reset',()=>this.commit(DEFAULT_ANCHOR_CURVE));
      const svg=surface.querySelector('svg')!;
      const coordinates=(e:MouseEvent)=>{const r=svg.getBoundingClientRect();return {x:(e.clientX-r.left)*720/r.width,y:(e.clientY-r.top)*400/r.height};};
      const nearest=(x:number,y:number)=>this.read()
        .map(p=>({p,d:Math.hypot(this.x(p.distance)-x,this.y(p.speed)-y)}))
        .filter(hit=>hit.d<18).sort((a,b)=>a.d-b.d)[0]?.p;
      let suppressClick = false;
      svg.addEventListener('pointerdown',e=>{
        if(e.button!==0 || this.drag) return;
        const {x,y}=coordinates(e),p=nearest(x,y);if(!p)return;
        e.preventDefault();suppressClick=false;
        this.drag={id:e.pointerId,distance:p.distance,maxDistance:this.maxDistance(),maxSpeed:this.maxSpeed(),
          startX:e.clientX,startY:e.clientY,offsetX:this.x(p.distance)-x,offsetY:this.y(p.speed)-y,moved:false};
        this.selected=p.distance;svg.setPointerCapture(e.pointerId);this.render();
      });
      svg.addEventListener('pointermove',e=>{
        const drag=this.drag;if(!drag || drag.id!==e.pointerId)return;
        if(!drag.moved && Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<3)return;
        e.preventDefault();drag.moved=true;
        const {x,y}=coordinates(e),points=this.read(),index=points.findIndex(p=>p.distance===drag.distance);
        if(index<0)return;
        const lower=index>0?points[index-1].distance:0;
        const upper=index<points.length-1?points[index+1].distance:100;
        const gap=Math.min(.000001,(points[index].distance-lower)/4,(upper-points[index].distance)/4);
        const raw=Number(((x+drag.offsetX-70)/620*drag.maxDistance).toFixed(6));
        const distance=index===0?0:Math.max(lower+gap,Math.min(upper-gap,raw));
        const speed=Math.max(0,Math.min(10000,Number(((345-y-drag.offsetY)/300*drag.maxSpeed).toFixed(6))));
        const next=points.map((p,i)=>i===index?{distance,speed}:p);
        try { validateAnchorCurve(next); } catch { return; }
        drag.distance=distance;this.selected=distance;this.commit(next);
      });
      const end=(e:PointerEvent)=>{
        if(!this.drag || this.drag.id!==e.pointerId)return;
        suppressClick=this.drag.moved;this.drag=null;
        if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
        this.render();
      };
      svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);svg.addEventListener('lostpointercapture',end);
      svg.addEventListener('click',e=>{if(suppressClick){suppressClick=false;return;}const {x,y}=coordinates(e),p=nearest(x,y);if(p){this.selected=p.distance;this.render();}});
      svg.addEventListener('dblclick',e=>{
        e.preventDefault();if(suppressClick){suppressClick=false;return;}const {x,y}=coordinates(e),p=nearest(x,y);
        if(p){this.edit(p.distance);return;}
        if(x>70 && x<690 && y>=45 && y<=345)this.edit(null,{distance:Number(((x-70)/620*this.maxDistance()).toFixed(3)),speed:Number(((345-y)/300*this.maxSpeed()).toFixed(3))});
      });
    }
    this.render();
  }
  private maxDistance(){return this.drag?.maxDistance ?? this.read().at(-1)!.distance*1.15;}
  private maxSpeed(){return this.drag?.maxSpeed ?? Math.max(1,...this.read().map(p=>p.speed*1.15));}
  private x(d:number){return 70+d/this.maxDistance()*620;}
  private y(v:number){return 345-v/this.maxSpeed()*300;}
  private commit(points:AnchorCurvePoint[]){this.change(validateAnchorCurve(points));this.render();}
  private edit(distance:number|null,initial?:AnchorCurvePoint) {
    const p=distance===null?(initial??{distance:Number((this.read().at(-1)!.distance*1.2).toFixed(3)),speed:this.read().at(-1)!.speed}):this.read().find(p=>p.distance===distance)!;
    this.form.innerHTML=`<form><h2>${distance===null?'添加':'编辑'}锚点曲线点</h2><label>距离差（地面单位）<input name="distance" type="number" min="0" max="100" step="any" value="${p.distance}" ${distance===0?'disabled':''} required></label><label>跟随速度（单位/秒）<input name="speed" type="number" min="0" max="10000" step="any" value="${p.speed}" required></label><p class="curve-error"></p><div class="curve-actions"><button type="submit">应用</button><button type="button">取消</button></div></form>`;
    this.form.querySelector<HTMLButtonElement>('[type="button"]')!.onclick=()=>this.form.close();
    this.form.querySelector('form')!.onsubmit=e=>{
      e.preventDefault();const point={distance:distance===0?0:Number(this.form.querySelector<HTMLInputElement>('[name="distance"]')!.value),speed:Number(this.form.querySelector<HTMLInputElement>('[name="speed"]')!.value)};
      try {
        const points=distance===null?[...this.read(),point]:this.read().map(p=>p.distance===distance?point:p);
        this.commit(points);this.selected=point.distance;this.render();this.form.close();
      }catch(error){this.form.querySelector('.curve-error')!.textContent=(error as Error).message;}
    };
    this.form.showModal();this.form.querySelector<HTMLInputElement>('[name="speed"]')!.focus();
  }
  render() {
    const points=this.read();if(!points.some(p=>p.distance===this.selected))this.selected=0;
    const selected=points.find(p=>p.distance===this.selected)!;
    for(const surface of this.surfaces) {
      surface.querySelector('svg')!.innerHTML=`<rect x="70" y="45" width="620" height="300" fill="#102b25"/>
      ${[0,1,2,3,4].map(i=>`<path d="M70 ${345-i*75}H690" stroke="#365148"/><text x="62" y="${350-i*75}" text-anchor="end">${Number((this.maxSpeed()*i/4).toFixed(2))}</text><text x="${70+i*155}" y="370" text-anchor="middle">${Number((this.maxDistance()*i/4).toFixed(3))}</text>`).join('')}
      <text x="70" y="25">跟随速度（单位/秒）</text><text x="690" y="395" text-anchor="end">距离差（地面单位）→</text>
      <path d="${points.map((p,i)=>`${i?'L':'M'}${this.x(p.distance)} ${this.y(p.speed)}`).join(' ')} L690 ${this.y(points.at(-1)!.speed)}" fill="none" stroke="#b6e284" stroke-width="3"/>
      ${points.map(p=>`<circle cx="${this.x(p.distance)}" cy="${this.y(p.speed)}" r="${p.distance===this.selected?8:6}" fill="${p.distance===this.selected?'white':'#b6e284'}"/>`).join('')}`;
      surface.querySelector('.curve-selection')!.textContent=`已选：距离 ${selected.distance} · 速度 ${selected.speed} 单位/秒`;
      surface.querySelector<HTMLButtonElement>('[data-anchor="delete"]')!.disabled=this.selected===0 || points.length<=2;
      surface.querySelector('.curve-warning')!.textContent=points.some(p=>p.distance>0&&p.speed===0)?'存在非零距离的零速度点：锚点可能停在目标附近。':'';
    }
  }
}
