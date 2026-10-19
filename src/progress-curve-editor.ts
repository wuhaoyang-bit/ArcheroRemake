import { DEFAULT_RING_CURVE, DEFAULT_SWITCH_CURVE, validateSwitchCurve, DEFAULT_LINK_ATTACK_CURVE, type AttackPhase, validateProgressCurve, validateStrokeCurve, type ProgressPoint } from './lock-rings.ts';

/** Same gestures as the existing curve editors, with fixed percentage endpoints. */
export class ProgressCurveEditor {
  private selected=100;
  private playback:AttackPhase={playing:false,time:0,duration:1.05,weight:0,releaseTime:.55};
  private expanded=document.createElement('dialog');
  private form=document.createElement('dialog');
  private surfaces:HTMLElement[];
  private drag:{id:number;time:number;x:number;y:number;moved:boolean}|null=null;
  constructor(root:HTMLElement,private read:()=>ProgressPoint[],private change:(points:ProgressPoint[])=>void,private strokeMode=false,private attackMode=false,private switchMode=false){
    this.expanded.className='curve-dialog';this.form.className='curve-number-dialog';
    this.expanded.dataset.ui='';this.form.dataset.ui='';
    this.expanded.innerHTML='<button class="curve-close">关闭</button><h2>锁定圆环收缩进度</h2><div class="curve-large"></div>';
    if(this.strokeMode)this.expanded.querySelector('h2')!.textContent=this.attackMode?'连线粗细 / 攻击动画进度':'目标圆环粗细 / 收缩完成度';
    if(this.switchMode)this.expanded.querySelector('h2')!.textContent='换目标扩张 / 时间进度';
    document.body.append(this.expanded,this.form);
    this.surfaces=[root,this.expanded.querySelector<HTMLElement>('.curve-large')!];
    for(const surface of this.surfaces){
      surface.innerHTML=`<svg class="curve-graph" viewBox="0 0 720 400" role="img" aria-label="时间进度与收缩完成度曲线"></svg>
        <p class="curve-selection"></p><div class="curve-actions"><button data-curve="edit">编辑数值</button><button data-curve="delete">删除点</button>${surface===root?'<button data-curve="expand">放大编辑</button>':''}<button data-curve="generate">恢复默认曲线</button></div>
        <p class="threshold-help">双击空白加点；拖动点调整；双击点输入数值。起终点固定，中间完成度不能倒退。曲线越陡，收缩越快。修改在下一次入场生效。</p><p class="curve-warning"></p>`;
      surface.querySelector('[data-curve="edit"]')!.addEventListener('click',()=>this.edit());
      surface.querySelector('[data-curve="delete"]')!.addEventListener('click',()=>{
        if(this.endpoint(this.selected))return;
        this.commit(this.read().filter(p=>p.time!==this.selected));this.selected=100;this.render();
      });
      surface.querySelector('[data-curve="expand"]')?.addEventListener('click',()=>this.expanded.showModal());
      surface.querySelector('[data-curve="generate"]')!.addEventListener('click',()=>{this.selected=100;this.commit(this.switchMode?DEFAULT_SWITCH_CURVE:this.attackMode?DEFAULT_LINK_ATTACK_CURVE.map(p=>({time:p.completion,progress:p.width})):this.strokeMode?[{time:0,progress:100},{time:100,progress:100}]:DEFAULT_RING_CURVE)});
      if(this.strokeMode){surface.querySelector('.threshold-help')!.textContent='横轴是收缩完成度，纵轴是基础目标线宽的百分比。100% 保持原粗细。双击加点或输入数值；拖动点调整。端点可改粗细但不能删除。下一次入场生效。';surface.querySelector('svg')!.setAttribute('aria-label','目标圆环粗细与收缩完成度曲线');}
      if(this.attackMode){
        surface.querySelector('.threshold-help')!.textContent='横轴为攻击动画实际进度，纵轴为基础连线粗细倍率。默认蓄力变细、松弦附近快速变粗、随后恢复。松弦参考取前摇/收招分界，不是精确发射事件。端点可改粗细；首尾值相同可避免循环跳变。修改下一次锁定入场生效。';
        surface.querySelector('svg')!.setAttribute('aria-label','连线粗细与攻击动画进度曲线');
        surface.insertAdjacentHTML('beforeend','<p class="attack-phase-readout threshold-help"></p>');
      }
      if(this.switchMode){surface.querySelector('.threshold-help')!.textContent='横轴为换目标动画时间，纵轴为额外扩张量。100% 达到设置的放大幅度，0% 回到正常大小；上升段扩张，下降段收紧，越陡速度越快。首尾固定 0；支持拖点、双击加点和数值编辑。下一次锁定入场生效。';surface.querySelector('svg')!.setAttribute('aria-label','换目标扩张量与时间进度曲线');}
      const svg=surface.querySelector('svg')!;
      const coords=(event:MouseEvent)=>{const r=svg.getBoundingClientRect();return {x:(event.clientX-r.left)*720/r.width,y:(event.clientY-r.top)*400/r.height}};
      const nearest=(x:number,y:number)=>this.read().reduce<ProgressPoint|undefined>((best,p)=>{
        const d=Math.hypot(this.x(p.time)-x,this.y(p.progress)-y),limit=11*720/svg.getBoundingClientRect().width;
        return d<limit&&(!best||d<Math.hypot(this.x(best.time)-x,this.y(best.progress)-y))?p:best;
      },undefined);
      svg.addEventListener('pointerdown',event=>{
        if(event.button!==0||this.drag)return;
        const {x,y}=coords(event),p=nearest(x,y);if(!p)return;
        event.preventDefault();this.selected=p.time;this.render();if(this.endpoint(p.time)&&!this.strokeMode)return;
        this.drag={id:event.pointerId,time:p.time,x:event.clientX,y:event.clientY,moved:false};svg.setPointerCapture(event.pointerId);
      });
      svg.addEventListener('pointermove',event=>{
        const d=this.drag;if(!d||event.pointerId!==d.id)return;
        if(!d.moved&&Math.hypot(event.clientX-d.x,event.clientY-d.y)<3)return;d.moved=true;
        const {x,y}=coords(event),points=this.read(),i=points.findIndex(p=>p.time===d.time);
        if(i<0||(!this.strokeMode&&(i===0||i===points.length-1)))return;
        const time=this.endpoint(d.time)?d.time:Math.max(points[i-1].time+.001,Math.min(points[i+1].time-.001,Math.round((x-70)/620*10000)/100));
        const progress=Math.max(this.strokeMode||this.switchMode?0:points[i-1].progress,Math.min(this.strokeMode||this.switchMode?this.maxY():points[i+1].progress,Math.round((345-y)/300*this.maxY()*100)/100));
        if(!this.endpoint(time)&&(time<=points[i-1].time||time>=points[i+1].time))return;
        this.selected=time;this.commit(points.map((p,j)=>j===i?{time,progress}:p));d.time=time;
      });
      const end=(event:PointerEvent)=>{if(event.pointerId===this.drag?.id){this.drag=null;this.render()}};
      svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);svg.addEventListener('lostpointercapture',end);
      svg.addEventListener('dblclick',event=>{
        event.preventDefault();const {x,y}=coords(event),p=nearest(x,y);
        if(p){this.selected=p.time;this.edit();return;}
        if(x<=70||x>=690||y<45||y>345)return;
        const time=Math.round((x-70)/620*10000)/100,progress=Math.round((345-y)/300*this.maxY()*100)/100;
        try{this.commit([...this.read(),{time,progress}]);this.selected=time;this.render()}
        catch(error){surface.querySelector('.curve-warning')!.textContent=(error as Error).message}
      });
    }
    this.expanded.querySelector('button')!.addEventListener('click',()=>this.expanded.close());this.render();
  }
  private endpoint(time:number){return time===0||time===100}
  private x(time:number){return 70+time/100*620}
  private maxY(){return this.strokeMode?1000:100}
  private y(progress:number){return 345-progress/this.maxY()*300}
  private commit(points:ProgressPoint[]){this.change(this.switchMode?validateSwitchCurve(points):this.strokeMode?validateStrokeCurve(points.map(p=>({completion:p.time,width:p.progress}))).map(p=>({time:p.completion,progress:p.width})):validateProgressCurve(points));this.render()}
  private edit(){
    const p=this.read().find(p=>p.time===this.selected);if(!p||(this.endpoint(p.time)&&!this.strokeMode))return;
    this.form.innerHTML=`<form><h2>编辑收缩控制点</h2><label>${this.attackMode?'攻击动画进度':this.strokeMode?'收缩完成度':'时间进度'}（%）<input name="time" type="number" ${this.endpoint(p.time)?'readonly':''} min="0" max="100" step="any" required value="${p.time}"></label><label>${this.switchMode?'额外扩张量':this.strokeMode?'粗细倍率':'收缩完成度'}（%）<input name="progress" type="number" min="0" max="${this.maxY()}" step="any" required value="${p.progress}"></label><p class="curve-error"></p><div class="curve-actions"><button type="submit">应用</button><button type="button" class="curve-cancel">取消</button></div></form>`;
    this.form.querySelector('.curve-cancel')!.addEventListener('click',()=>this.form.close());
    this.form.querySelector('form')!.addEventListener('submit',event=>{
      event.preventDefault();const time=this.form.querySelector<HTMLInputElement>('[name=time]')!.valueAsNumber,progress=this.form.querySelector<HTMLInputElement>('[name=progress]')!.valueAsNumber;
      try{if(this.endpoint(p.time)&&time!==p.time)throw new Error('端点完成度不可修改');this.commit(this.read().map(point=>point.time===p.time?{time,progress}:point));this.selected=time;this.render();this.form.close()}
      catch(error){this.form.querySelector('.curve-error')!.textContent=(error as Error).message}
    });this.form.showModal();
  }
  setPlayback(phase:AttackPhase){this.playback=phase;this.paintPlayback();}
  private paintPlayback(){
    if(!this.attackMode)return;
    const a=this.playback,p=a.duration>0?a.time/a.duration:0,release=a.releaseTime/a.duration;
    for(const surface of this.surfaces){
      const cursor=surface.querySelector<SVGLineElement>('[data-attack-cursor]');
      if(cursor){cursor.setAttribute('x1',String(this.x(p*100)));cursor.setAttribute('x2',String(this.x(p*100)));cursor.style.display=a.playing?'':'none';}
      const reference=surface.querySelector<SVGLineElement>('[data-release-marker]');
      reference?.setAttribute('x1',String(this.x(release*100)));reference?.setAttribute('x2',String(this.x(release*100)));
      surface.querySelector('.attack-phase-readout')!.textContent=`${a.playing?`播放 ${(p*100).toFixed(1)}% · ${a.time.toFixed(3)}s · 约第 ${Math.floor(a.time*60)} 帧（0 起算）`:'未播放攻击 · 连线使用基础粗细'}。松弦参考 ${(release*100).toFixed(2)}% / ${a.releaseTime.toFixed(3)}s（约第 ${Math.round(a.releaseTime*60)} 帧）；全长 ${a.duration.toFixed(3)}s。`;
    }
  }
  render(){
    const points=this.read();if(!points.some(p=>p.time===this.selected))this.selected=100;
    const selected=points.find(p=>p.time===this.selected)!;
    for(const surface of this.surfaces){
      surface.querySelector('svg')!.innerHTML=`<rect x="70" y="45" width="620" height="300" fill="#102b25"/>
        ${[0,25,50,75,100].map(v=>`<path d="M70 ${this.y(v/100*this.maxY())}H690" stroke="#365148"/><text x="62" y="${this.y(v/100*this.maxY())+5}" text-anchor="end">${v/100*this.maxY()}%</text><text x="${this.x(v)}" y="370" text-anchor="middle">${v}%</text>`).join('')}
        ${this.attackMode?`<text x="180" y="65">蓄力</text><text x="${this.x(this.playback.releaseTime/this.playback.duration*100)+8}" y="85">松弦参考 → 恢复</text><line data-release-marker x1="395" x2="395" y1="45" y2="345" stroke="#e6bc79" stroke-dasharray="5 5"/>`:''}
        <text x="70" y="25">${this.switchMode?'额外扩张量（%）':this.strokeMode?'粗细倍率（%）':'收缩完成度（%）'}</text><text x="690" y="395" text-anchor="end">${this.attackMode?'攻击动画进度':this.strokeMode?'收缩完成度':'时间进度'}：0% → 100%</text>
        <path d="${points.map((p,i)=>`${i?'L':'M'}${this.x(p.time)} ${this.y(p.progress)}`).join(' ')}" fill="none" stroke="#f36c72" stroke-width="3"/>
        ${this.attackMode?'<line data-attack-cursor x1="70" x2="70" y1="45" y2="345" stroke="#8fe8ef" stroke-width="2"/>':''}
        ${points.map(p=>`<circle data-time="${p.time}" cx="${this.x(p.time)}" cy="${this.y(p.progress)}" r="${p.time===this.selected?8:6}" fill="${p.time===this.selected?'#fff':'#f36c72'}" stroke="#20362d" stroke-width="2"/>`).join('')}`;
      surface.querySelector('.curve-selection')!.textContent=`已选：${this.strokeMode?'完成':'时间'} ${selected.time}% · ${this.switchMode?'扩张':this.strokeMode?'粗细':'完成'} ${selected.progress}%${this.endpoint(selected.time)?(this.strokeMode?'（端点粗细可编辑）':'（固定端点）'):''}`;
      for(const action of ['edit','delete'])(surface.querySelector(`[data-curve="${action}"]`) as HTMLButtonElement).disabled=this.endpoint(selected.time)&&(action==='delete'||!this.strokeMode);
      surface.querySelector('.curve-warning')!.textContent='';
    }
    this.paintPlayback();
  }
}
