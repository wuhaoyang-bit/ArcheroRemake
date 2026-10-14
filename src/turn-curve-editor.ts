import type { Settings } from './config.ts';
import { exponentialCurve, validateCurve, type TurnCurvePoint } from './turn-curve.ts';

export class TurnCurveEditor {
  private selected = 180;
  private expanded = document.createElement('dialog');
  private form = document.createElement('dialog');
  private surfaces: HTMLElement[];
  private drag: { angle: number; max: number; moved: boolean; x: number; y: number } | null = null;
  constructor(private root: HTMLElement, private read: () => Settings,
    private change: (points: TurnCurvePoint[]) => void, private regenerated: () => void) {
    this.expanded.className = 'curve-dialog';
    this.expanded.dataset.ui = '';
    this.expanded.innerHTML = '<button class="curve-close">关闭</button><h2>转向速度曲线</h2><div class="curve-large"></div>';
    document.body.append(this.expanded, this.form);
    this.form.className = 'curve-number-dialog'; this.form.dataset.ui = '';
    this.surfaces = [root, this.expanded.querySelector<HTMLElement>('.curve-large')!];
    for (const surface of this.surfaces) {
      surface.innerHTML = `<svg class="curve-graph" viewBox="0 0 720 400" role="img" aria-label="角度差与转向角速度曲线"></svg>
        <p class="curve-selection"></p><div class="curve-actions"><button data-curve="edit">编辑数值</button><button data-curve="delete">删除点</button>${surface === root ? '<button data-curve="expand">放大编辑</button>' : ''}<button data-curve="generate">从当前指数参数生成曲线</button></div>
        <p class="threshold-help">双击空位加点；点击选点，拖动调整；双击点编辑数值。0° / 180° 端点只能改速度，不能删除。相邻点以直线连接。</p><p class="curve-warning"></p>`;
      surface.querySelector('[data-curve="edit"]')!.addEventListener('click', () => this.edit());
      surface.querySelector('[data-curve="delete"]')!.addEventListener('click', () => {
        if (this.selected === 0 || this.selected === 180) return;
        this.commit(this.read().turnCurve.filter(p => p.angle !== this.selected)); this.selected = 180; this.render();
      });
      surface.querySelector('[data-curve="expand"]')?.addEventListener('click', () => this.expanded.showModal());
      surface.querySelector('[data-curve="generate"]')!.addEventListener('click', () => {
        this.commit(exponentialCurve(this.read().turnResponse)); this.regenerated();
      });
      const svg = surface.querySelector<SVGSVGElement>('svg')!;
      const coords = (event: MouseEvent) => { const r = svg.getBoundingClientRect(); return { x: (event.clientX-r.left)*720/r.width, y: (event.clientY-r.top)*400/r.height }; };
      const nearest = (x: number, y: number) => this.read().turnCurve.find(p => Math.hypot(this.x(p.angle)-x, this.y(p.speed, this.max())-y) < 11*720/svg.getBoundingClientRect().width);
      svg.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        const {x,y} = coords(event), point = nearest(x,y);
        if (!point) return;
        event.preventDefault(); this.selected = point.angle;
        this.drag = {angle: point.angle, max: this.max(), moved:false,x:event.clientX,y:event.clientY};
        svg.setPointerCapture(event.pointerId); this.render();
      });
      svg.addEventListener('pointermove', event => {
        if (!this.drag) return;
        const d = this.drag;
        if (!d.moved && Math.hypot(event.clientX-d.x,event.clientY-d.y)<3) return;
        d.moved=true;
        const {x,y}=coords(event);
        const angle = d.angle===0 || d.angle===180 ? d.angle : Math.max(.01,Math.min(179.99,Math.round((180-(x-70)/620*180)*100)/100));
        const speed = Math.max(0,Math.round((345-y)/300*d.max));
        const points=this.read().turnCurve.map(p=>p.angle===d.angle?{angle,speed}:{...p});
        try { validateCurve(points); } catch { return; }
        this.selected=angle; d.angle=angle; this.commit(points);
      });
      const end = () => { this.drag=null; this.render(); };
      svg.addEventListener('pointerup',end); svg.addEventListener('pointercancel',end);
      svg.addEventListener('dblclick',event=>{
        event.preventDefault(); const {x,y}=coords(event), point=nearest(x,y);
        if(point){this.selected=point.angle;this.edit();return;}
        if(x<=70||x>=690||y<45||y>345)return;
        const angle=Math.round((180-(x-70)/620*180)*100)/100;
        const speed=Math.max(0,Math.round((345-y)/300*this.max()));
        try { this.commit([...this.read().turnCurve,{angle,speed}]);this.selected=angle;this.render(); }
        catch(error){surface.querySelector('.curve-warning')!.textContent=String(error);}
      });
    }
    this.expanded.querySelector('.curve-close')!.addEventListener('click',()=>this.expanded.close());
    this.render();
  }
  private max(){return this.drag?.max ?? Math.max(100,...this.read().turnCurve.map(p=>p.speed*1.15));}
  private x(angle:number){return 70+(180-angle)/180*620;}
  private y(speed:number,max:number){return 345-speed/max*300;}
  private commit(points:TurnCurvePoint[]){this.change(validateCurve(points));this.render();}
  private edit(){
    const point=this.read().turnCurve.find(p=>p.angle===this.selected); if(!point)return;
    const endpoint=point.angle===0||point.angle===180;
    this.form.innerHTML=`<form><h2>编辑控制点</h2><label>角度差（°）<input name="angle" type="number" min="0" max="180" step="any" value="${point.angle}" ${endpoint?'disabled':''} required></label><label>角速度（°/s）<input name="speed" type="number" min="0" step="any" value="${point.speed}" required></label><p class="curve-error"></p><div class="curve-actions"><button type="submit">应用</button><button type="button" class="curve-cancel">取消</button></div></form>`;
    this.form.querySelector('.curve-cancel')!.addEventListener('click',()=>this.form.close());
    this.form.querySelector('form')!.addEventListener('submit',event=>{
      event.preventDefault();
      const angle=endpoint?point.angle:Number(this.form.querySelector<HTMLInputElement>('[name="angle"]')!.value);
      const speed=Number(this.form.querySelector<HTMLInputElement>('[name="speed"]')!.value);
      try {this.commit(this.read().turnCurve.map(p=>p.angle===point.angle?{angle,speed}:p));this.selected=angle;this.render();this.form.close();}
      catch(error){this.form.querySelector('.curve-error')!.textContent=(error as Error).message;}
    });
    this.form.showModal();this.form.querySelector<HTMLInputElement>('[name="speed"]')!.focus();
  }
  render(){
    const points=this.read().turnCurve,max=this.max();
    if(!points.some(p=>p.angle===this.selected))this.selected=180;
    const selected=points.find(p=>p.angle===this.selected)!;
    for(const surface of this.surfaces){
      surface.querySelector('svg')!.innerHTML=`<rect x="70" y="45" width="620" height="300" fill="#102b25"/>
        ${[0,1,2,3,4].map(i=>{const y=345-i*75;return `<path d="M70 ${y}H690" stroke="#365148"/><text x="62" y="${y+5}" text-anchor="end">${Math.round(max*i/4)}</text>`;}).join('')}
        ${[180,150,120,90,60,30,0].map(a=>`<text x="${this.x(a)}" y="370" text-anchor="middle">${a}°</text>`).join('')}
        <text x="70" y="25">角速度（°/s）</text><text x="690" y="395" text-anchor="end">角度差：180° → 0°</text>
        <path d="${points.map((p,i)=>`${i?'L':'M'}${this.x(p.angle)} ${this.y(p.speed,max)}`).join(' ')}" fill="none" stroke="#b6e284" stroke-width="3"/>
        ${points.map(p=>`<circle cx="${this.x(p.angle)}" cy="${this.y(p.speed,max)}" r="${p.angle===this.selected?8:6}" fill="${p.angle===this.selected?'#fff':'#b6e284'}" stroke="#20362d" stroke-width="2"/>`).join('')}`;
      surface.querySelector('.curve-selection')!.textContent=`已选：${selected.angle}° · ${Number(selected.speed.toFixed(3))}°/s${selected.angle===0||selected.angle===180?'（端点速度可编辑）':''}`;
      (surface.querySelector('[data-curve="delete"]') as HTMLButtonElement).disabled=this.selected===0||this.selected===180;
      surface.querySelector('.curve-warning')!.textContent=points.some(p=>p.angle>0&&p.speed===0)?'存在非零角度的零速度点：转向可能停在该角度。':'';
    }
  }
}
