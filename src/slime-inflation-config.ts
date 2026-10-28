export const SLIME_INFLATION_DEFAULTS={slimeInflationEnabled:1,slimeInjectionAmount:20,slimeCapacity:100,slimeMaxScale:1.35,slimeBulge:.65,slimeInflationFrequency:5.5,slimeInflationDamping:.55};
export type SlimeInflationSettings=typeof SLIME_INFLATION_DEFAULTS;
export const SLIME_INFLATION_LIMITS:Record<keyof SlimeInflationSettings,[number,number,number]>={slimeInflationEnabled:[0,1,1],slimeInjectionAmount:[0,100,1],slimeCapacity:[1,500,1],slimeMaxScale:[1,2,.01],slimeBulge:[0,1,.01],slimeInflationFrequency:[1,12,.1],slimeInflationDamping:[.15,2,.05]};
export const SLIME_INFLATION_CONTROLS:[keyof SlimeInflationSettings,string,string,string][]=[
 ['slimeInflationEnabled','启用累计鼓胀','0/1','仅黄色史莱姆。关闭暂停注入并隐藏累计膨胀，保留已注入量；重置怪物清空。与受击伸缩独立。'],
 ['slimeInjectionAmount','每箭注入量','单位','每次有效命中累计一次，默认 20。'],
 ['slimeCapacity','颜料容量','单位','默认 100；填满后维持满体型，目前不触发爆开。修改后按当前累计量重新计算。'],
 ['slimeMaxScale','满容量尺寸倍率','倍','默认 1.35；对应目标体积为原体积的倍率三次方。鼓面会改变外接尺寸。'],
 ['slimeBulge','最大鼓面程度','比例','方案 02 外鼓形态插值；0 保留原形，越大面中央越鼓。'],
 ['slimeInflationFrequency','鼓胀弹簧频率','Hz','方案 03 默认 5.5 Hz，越大越快。修改后下次命中生效。'],
 ['slimeInflationDamping','鼓胀弹簧阻尼','比例','默认 0.55；小于 1 有超调回弹，1 为临界阻尼。修改后下次命中生效。'],
];
