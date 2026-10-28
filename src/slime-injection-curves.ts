import {spring} from './hit-response.ts';
export const INJECTION_CURVES=[
 {id:'quick',name:'快速注入',reason:'颜料一进入就把身体撑开，大部分变化集中在命中后前段，随后放缓。强调每箭即时、清脆的反馈。',duration:.32},
 {id:'pressure',name:'蓄压后撑开',reason:'外皮先抵抗一下，压力积累后加速撑开，接近新体型时减速。强调厚实、有韧性的表皮。',duration:.48},
 {id:'spring',name:'弹性鼓胀',reason:'注入把软胶身体推过新的平衡位置，再轻轻回缩。强调柔软与弹性；回缩的是外形，颜料量不会减少。',duration:1.1},
 {id:'spread',name:'注入后扩散',reason:'先出现一小段快速鼓起，再由内部颜料扩散带动剩余膨胀。强调液体进入身体后继续传递压力。',duration:.5},
] as const;
export type InjectionCurve=typeof INJECTION_CURVES[number]['id'];
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const out=(x:number)=>1-(1-clamp(x))**3;
/** Normalized visual response only. Capacity is updated once per impact, independently. */
export function injectionProgress(id:InjectionCurve,t:number){
 if(t<=0)return 0;
 switch(id){
 case 'quick':return out(t/.32);
 case 'pressure':{const u=clamp((t-.06)/.42);return u*u*u*(10+u*(-15+6*u));}
 case 'spring':return t>=1.1?1:1-spring(1,0,t,5.5,.55).x;
 case 'spread':return t<.1?.25*out(t/.1):.25+.75*out((t-.16)/.34);
 }
}
export class InjectionResponse{
 target=0;visual=0;age=Infinity;private from=0;
 constructor(readonly curve:InjectionCurve){}
 hit(amount:number){this.from=this.visual;this.target=Math.min(1,this.target+Math.max(0,amount));this.age=0;}
 update(dt:number){this.age+=Math.max(0,dt);this.visual=this.from+(this.target-this.from)*injectionProgress(this.curve,this.age);}
 reset(){this.target=this.visual=this.from=0;this.age=Infinity;}
}
