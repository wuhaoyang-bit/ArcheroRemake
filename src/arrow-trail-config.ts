export const ARROW_TRAIL_DEFAULTS={
  arrowTrailEnabled:1,arrowTrailLength:3.2,arrowTrailWidth:.18,
  arrowTrailOpacity:.9,arrowTrailTaper:.8,arrowTrailFade:.65,
};
export type ArrowTrailSettings=typeof ARROW_TRAIL_DEFAULTS;
export const ARROW_TRAIL_LIMITS:Record<keyof ArrowTrailSettings,[number,number,number]>={
  arrowTrailEnabled:[0,1,1],arrowTrailLength:[0,15,.1],arrowTrailWidth:[0,2,.01],
  arrowTrailOpacity:[0,1,.01],arrowTrailTaper:[.1,5,.05],arrowTrailFade:[.1,5,.05],
};
export const ARROW_TRAIL_CONTROLS:[keyof ArrowTrailSettings,string,string,string][]=[
  ['arrowTrailEnabled','启用箭尾拖尾','0/1','0 关闭，1 开启；立即作用于飞行中的箭。'],
  ['arrowTrailLength','拖尾最大长度','u','箭缩放为 1 时的长度，随箭缩放；出生后随飞行距离逐渐拉长，默认 3.2。'],
  ['arrowTrailWidth','拖尾起始宽度','u','箭尾连接处的完整宽度，随箭缩放；默认 0.18，末端收尖。'],
  ['arrowTrailOpacity','拖尾透明度','比例','0 完全透明，1 不透明；默认 0.90。'],
  ['arrowTrailTaper','变细曲线强度','指数','越大越快收窄；1 为线性，默认 0.80。'],
  ['arrowTrailFade','淡出曲线强度','指数','越大越快变透明；1 为线性，默认 0.65。'],
];
