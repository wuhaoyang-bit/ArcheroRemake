export const BOW_RELEASE_DEFAULTS={ringLife:.3,spikeLife:.15,delay:0,radius:.35,expand:.95,thickness:1.8,gain:3,spikeCount:6,spikeLength:2.8,spikeStartLength:1,spikeGrowTime:.1,spikeWidth:.35,spikeRadius:.3,outwardAngle:25,spikeOpacity:.15,height:0,forward:.5};
export type BowReleaseSettings=typeof BOW_RELEASE_DEFAULTS;

export const BOW_FX_DEFAULTS={
 bowFxEnabled:1,bowFxRingEnabled:1,bowFxSpikesEnabled:1,bowFxRingCurve:1,
 bowFxRingLife:.3,bowFxSpikeLife:.15,bowFxDelay:0,bowFxRadius:.35,bowFxExpand:.95,
 bowFxThickness:1.8,bowFxGain:3,bowFxSpikeCount:6,bowFxSpikeLength:2.8,
 bowFxSpikeStartLength:1,bowFxSpikeGrowTime:.1,bowFxSpikeWidth:.35,bowFxSpikeRadius:.3,
 bowFxOutwardAngle:25,bowFxSpikeOpacity:.15,bowFxHeight:0,bowFxForward:.5,
};
export type BowFxSettings=typeof BOW_FX_DEFAULTS;
export const BOW_FX_LIMITS:Record<keyof BowFxSettings,[number,number,number]>={
 bowFxEnabled:[0,1,1],bowFxRingEnabled:[0,1,1],bowFxSpikesEnabled:[0,1,1],bowFxRingCurve:[0,1,1],
 bowFxRingLife:[.03,2,.01],bowFxSpikeLife:[.03,2,.01],bowFxDelay:[0,1,.005],bowFxRadius:[0,3,.05],bowFxExpand:[0,4,.05],
 bowFxThickness:[.1,4,.1],bowFxGain:[0,6,.1],bowFxSpikeCount:[0,12,1],bowFxSpikeLength:[0,6,.05],
 bowFxSpikeStartLength:[0,6,.05],bowFxSpikeGrowTime:[0,2,.005],bowFxSpikeWidth:[.01,1,.005],bowFxSpikeRadius:[0,2,.01],
 bowFxOutwardAngle:[0,90,1],bowFxSpikeOpacity:[0,1,.01],bowFxHeight:[-2,3,.05],bowFxForward:[-2,3,.05],
};
export const BOW_FX_CONTROLS:[keyof BowFxSettings,string,string,string][]=[
 ['bowFxEnabled','启用出箭特效','0/1','实时开关环带与尖刺。'],
 ['bowFxRingEnabled','显示白色环带','0/1','单独控制环带。'],
 ['bowFxSpikesEnabled','显示尖刺冲击','0/1','单独控制尖刺。'],
 ['bowFxRingCurve','环带扩张曲线','0/1','0 匀速，1 先快后慢。'],
 ['bowFxDelay','出箭后延迟','s','从实际出箭时刻开始计时。'],
 ['bowFxForward','沿出箭方向偏移','u','相对出箭位置，正值向前，负值向后。'],
 ['bowFxHeight','特效高度偏移','u','相对出箭高度，正值向上。'],
 ['bowFxGain','白色强度','倍','同时影响环带和尖刺。'],
 ['bowFxRingLife','环带持续时间','s','从延迟结束开始计算。'],
 ['bowFxRadius','环带起始半径','u','出现时的半径。'],
 ['bowFxExpand','环带扩张距离','u','在起始半径上增加的距离。'],
 ['bowFxThickness','环带厚度','倍','环带遮罩的厚度。'],
 ['bowFxSpikeLife','尖刺持续时间','s','从延迟结束开始计算。'],
 ['bowFxSpikeCount','尖刺数量','根','围绕箭轴均匀排列，最多 12 根。'],
 ['bowFxSpikeOpacity','尖刺透明度','比例','0 隐藏，1 不透明。'],
 ['bowFxSpikeStartLength','尖刺起始长度','u','尖刺出现时的长度。'],
 ['bowFxSpikeLength','尖刺目标长度','u','增长结束时的长度。'],
 ['bowFxSpikeGrowTime','尖刺增长用时','s','从起始长度线性变化到目标长度；0 立即到达。'],
 ['bowFxSpikeWidth','尖刺宽度','u','交叉尖刺网格的宽度。'],
 ['bowFxSpikeRadius','尖刺围绕半径','u','尖刺根部到箭轴的距离。'],
 ['bowFxOutwardAngle','尖刺向外偏角','°','相对箭的反方向向外张开。'],
];
export function bowReleaseParameters(s:BowFxSettings):BowReleaseSettings{
 return {ringLife:s.bowFxRingLife,spikeLife:s.bowFxSpikeLife,delay:s.bowFxDelay,radius:s.bowFxRadius,expand:s.bowFxExpand,thickness:s.bowFxThickness,gain:s.bowFxGain,spikeCount:s.bowFxSpikeCount,spikeLength:s.bowFxSpikeLength,spikeStartLength:s.bowFxSpikeStartLength,spikeGrowTime:s.bowFxSpikeGrowTime,spikeWidth:s.bowFxSpikeWidth,spikeRadius:s.bowFxSpikeRadius,outwardAngle:s.bowFxOutwardAngle,spikeOpacity:s.bowFxSpikeOpacity,height:s.bowFxHeight,forward:s.bowFxForward};
}
