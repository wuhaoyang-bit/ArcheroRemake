export const SLIME_TRAIL_DEFAULTS={
 slimeTrailEnabled:1,slimeTrailWidth:.85,slimeTrailLifetime:8,slimeTrailFade:1.2,
 slimeStrandEnabled:1,slimeStrandCount:3,slimeStrandWidth:.15,slimeStrandLength:1.25,slimeStrandRetract:.24,
};
export type SlimeTrailSettings=typeof SLIME_TRAIL_DEFAULTS;
export const SLIME_TRAIL_LIMITS:Record<keyof SlimeTrailSettings,[number,number,number]>={
 slimeTrailEnabled:[0,1,1],slimeTrailWidth:[.3,1.6,.05],slimeTrailLifetime:[.5,30,.5],slimeTrailFade:[.1,5,.1],
 slimeStrandEnabled:[0,1,1],slimeStrandCount:[1,3,1],slimeStrandWidth:[.06,.35,.01],slimeStrandLength:[.3,3,.05],slimeStrandRetract:[.08,.8,.02],
};
export const SLIME_TRAIL_CONTROLS:[keyof SlimeTrailSettings,string,string,string][]=[
 ['slimeTrailEnabled','移动液体路径','0/1','融合液面模式下，史莱姆实际移动时留下同材质液体；重置怪物会清空。'],
 ['slimeTrailWidth','路径宽度','倍','相对身体尺寸；与地面液体缩放共同影响已有路径，沿移动距离连续铺开。'],
 ['slimeTrailLifetime','路径保留时间','s','独立于爆开液滩的保留时间；停下不会继续生成路径。'],
 ['slimeTrailFade','路径消退时间','s','保留时间结束后逐渐消退。'],
 ['slimeStrandEnabled','脚底黏丝','0/1','脚底与真实留下的液滩之间拉出短液桥；关闭时保留路径。'],
 ['slimeStrandCount','每只黏丝数量','条','最多同时牵连的黏丝数量；断裂中的两段会短暂保留。'],
 ['slimeStrandWidth','黏丝粗细','倍','相对身体尺寸；两端铺宽、中央收细。颜色与粗糙度沿用现有黏液。'],
 ['slimeStrandLength','黏丝拉断距离','倍','相对身体尺寸；转弯时地面端保持原位，距离过大后断开。'],
 ['slimeStrandRetract','断开回收时间','s','身体端收回脚底，地面端塌入液滩；停下后也会收回。'],
];
