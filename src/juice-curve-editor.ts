import { ProgressCurveEditor } from './progress-curve-editor.ts';
import { DEFAULT_JUICE_SPEED_CURVE, validateJuiceSpeedCurve, type JuiceSpeedPoint } from './juice-speed-curve.ts';
export class JuiceCurveEditor extends ProgressCurveEditor{
 constructor(root:HTMLElement,read:()=>JuiceSpeedPoint[],change:(points:JuiceSpeedPoint[])=>void){
  super(root,read,change,true,false,false,false,{title:'绿汁自定义速度曲线',x:'粒子寿命进度',y:'初速度百分比',max:300,defaults:DEFAULT_JUICE_SPEED_CURVE,validate:validateJuiceSpeedCurve,help:'横轴：出生 0% → 消失 100%；纵轴：100% 为原初速，10% 为十分之一初速。双击空白加点，拖动调整，双击点或点“编辑数值”精调；端点可改速度，不能删除。相邻点直线连接。仅控制速度，尺寸保持 OutCubic。'});
 }
}
