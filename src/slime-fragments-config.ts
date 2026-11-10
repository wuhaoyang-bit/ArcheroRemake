export const SLIME_FRAGMENTS_DEFAULTS={
 slimeFragmentsEnabled:1,slimeFragmentsSoftness:.8,slimeFragmentsVolume:.05,
 slimeFragmentsDamping:1.8,slimeFragmentsImpactDamping:18,slimeFragmentsSettleDamping:5,slimeFragmentsGroupFilter:.75,slimeFragmentsSubsteps:8,slimeFragmentsIterations:1,
 slimeFragmentsSpeed:1,slimeFragmentsStretch:1.2,slimeFragmentsSpin:2,
 slimeFragmentsGravity:20,slimeFragmentsFriction:1,slimeFragmentsBounce:0,
 slimeFragmentsLifetime:6,slimeFragmentsMaxBursts:3,slimeFragmentsWireEnabled:0,
};
export type SlimeFragmentsSettings=typeof SLIME_FRAGMENTS_DEFAULTS;
export const SLIME_FRAGMENTS_LIMITS:Record<keyof SlimeFragmentsSettings,[number,number,number]>={
 slimeFragmentsEnabled:[0,1,1],slimeFragmentsSoftness:[.01,10,.01],slimeFragmentsVolume:[.01,10,.01],
 slimeFragmentsImpactDamping:[0,40,1],slimeFragmentsSettleDamping:[0,20,.5],
 slimeFragmentsDamping:[0,8,.1],slimeFragmentsGroupFilter:[0,1,.05],slimeFragmentsSubsteps:[1,16,1],slimeFragmentsIterations:[1,4,1],
 slimeFragmentsSpeed:[.1,2,.05],slimeFragmentsStretch:[0,8,.1],slimeFragmentsSpin:[0,6,.1],
 slimeFragmentsGravity:[0,30,.5],slimeFragmentsFriction:[0,1,.05],slimeFragmentsBounce:[0,.8,.01],
 slimeFragmentsLifetime:[1,15,.5],slimeFragmentsMaxBursts:[1,6,1],slimeFragmentsWireEnabled:[0,1,1],
};
export const SLIME_FRAGMENTS_CONTROLS:[keyof SlimeFragmentsSettings,string,string,string][]=[
 ['slimeFragmentsEnabled','启用爆炸碎块','0/1','方案 D：物理 Shape Matching。爆炸时生成 20 块大小不一的不规则碎块；关闭时立即清理已有碎块。'],
 ['slimeFragmentsSoftness','碎块软度','','越大越容易压扁和拉长；0.8 对应预览页顺应度 0.008。立即影响现有碎块。'],
 ['slimeFragmentsVolume','体积可压缩度','','越小越难压瘪；0.1 对应体积顺应度 0.00001。'],
 ['slimeFragmentsDamping','弹性阻尼','1/s','越大越快停止抖动；保留整体平移速度。'],
 ['slimeFragmentsImpactDamping','撞地耗能','1/s','只在碰撞后的短时间吸收内部振动与向上回弹能量；越大越沉。0 关闭。'],
 ['slimeFragmentsSettleDamping','贴地收稳阻尼','1/s','贴地时加快内部晃动衰减；不冻结软体，不影响首次落地前的飞行。'],
 ['slimeFragmentsGroupFilter','局部形变平滑','','清除粒子组内的多余折皱；过大会显得更硬。'],
 ['slimeFragmentsSubsteps','每步物理子步','次','60 Hz 物理步内的子步数量；越多越稳定，CPU 开销越大。'],
 ['slimeFragmentsIterations','每子步迭代','次','材料与接触求解次数；立即生效。'],
 ['slimeFragmentsSpeed','爆开速度倍率','倍','沿用眼球弹出速度曲线；出生速度修改在下一次爆炸生效。'],
 ['slimeFragmentsStretch','爆开内部速度差','1/s','外侧节点额外向外运动，产生真实拉伸；下一次爆炸生效。'],
 ['slimeFragmentsSpin','初始旋转速度','rad/s','下一次爆炸生效。'],
 ['slimeFragmentsGravity','重力','u/s²','立即影响现有碎块。'],
 ['slimeFragmentsFriction','地面摩擦','','1 为落地止滑：接触点不沿地面移动，仍可弹起；小于 1 时使用可滑动摩擦。'],
 ['slimeFragmentsBounce','地面额外反弹','','材料自身会弹性恢复，此值只控制接触点额外反弹。'],
 ['slimeFragmentsLifetime','保留时间','s','末尾 0.5 秒淡出并回收到对象池。'],
 ['slimeFragmentsMaxBursts','最多同时保留','组','每组 20 块；超过上限回收最早的一组，限制连续爆炸开销。'],
 ['slimeFragmentsWireEnabled','显示碎块表面线框','0/1','查看表面如何随物理节点变形。'],
];
