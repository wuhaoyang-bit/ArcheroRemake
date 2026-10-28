import { Vector3, type Camera } from 'three/webgpu';
import { DESIGN_WIDTH, type Settings } from './config.ts';
import { LockRings } from './lock-rings.ts';

export class LockRingView {
  readonly state=new LockRings();
  readonly element:SVGSVGElement;
  private wave:SVGCircleElement;
  private player:SVGCircleElement;
  private target:SVGCircleElement;
  private point=new Vector3();
  constructor(private viewport:HTMLElement){
    this.element=document.createElementNS('http://www.w3.org/2000/svg','svg');
    this.element.classList.add('lock-rings');this.element.setAttribute('aria-hidden','true');
    this.element.innerHTML='<circle data-ring-wave=""/><circle data-ring="player"/><circle data-ring="target"/>';
    this.wave=this.element.querySelector('[data-ring-wave]')!;
    this.player=this.element.querySelector('[data-ring="player"]')!;this.target=this.element.querySelector('[data-ring="target"]')!;
    viewport.append(this.element);this.reset();
  }
  reset(){this.state.reset();this.element.style.display='none';}
  update(dt:number,settings:Settings,camera:Camera,position:{x:number;z:number},target:{id:string;x:number;z:number}|null){
    if(!target){this.reset();return;}
    const width=DESIGN_WIDTH,height=this.viewport.clientHeight/this.viewport.clientWidth*width;
    if(!Number.isFinite(height)||height<=0)return;
    const config=this.state.config??settings;
    const project=(p:{x:number;z:number},h:number)=>{
      this.point.set(p.x,h,p.z).project(camera);
      return {x:(this.point.x+1)*width/2,y:(1-this.point.y)*height/2};
    };
    const center=project(target,config.ringTargetHeight),player=project(position,config.ringPlayerHeight);
    this.state.update(dt,target.id,settings,center,width,height);
    this.element.style.display='block';this.element.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const draw=(circle:SVGCircleElement,p:{x:number;y:number},radius:number,stroke:number)=>{
      circle.setAttribute('cx',String(p.x));circle.setAttribute('cy',String(p.y));circle.setAttribute('r',String(radius));
      circle.setAttribute('stroke-width',String(stroke));
    };
    const wave=this.state.waveVisual;this.wave.style.display=wave&&wave.stroke>0?'':'none';
    if(wave)draw(this.wave,center,wave.radius,wave.stroke);
    draw(this.player,player,config.ringPlayerDiameter/2,config.ringPlayerStroke);
    draw(this.target,center,this.state.radius,this.state.stroke);
  }
}
