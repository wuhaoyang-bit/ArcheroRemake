export const SLIME_FULLNESS_DEFAULTS={
 slimeColorEnabled:1,slimeColorStartR:255,slimeColorStartG:244,slimeColorStartB:177,
 slimeColorEndR:255,slimeColorEndG:221,slimeColorEndB:50,slimeColorTime:.25,slimeColorPower:1,
 slimeHeavyThreshold:.5,slimeSlowEnabled:1,slimeSlowMultiplier:.65,
 slimeBreathEnabled:1,slimeBreathFrequency:1.2,slimeBreathAmplitude:.04,slimeBreathFade:.15,
};
export type SlimeFullnessSettings=typeof SLIME_FULLNESS_DEFAULTS;
export const SLIME_FULLNESS_LIMITS:Record<keyof SlimeFullnessSettings,[number,number,number]>={
 slimeColorEnabled:[0,1,1],slimeColorStartR:[0,255,1],slimeColorStartG:[0,255,1],slimeColorStartB:[0,255,1],
 slimeColorEndR:[0,255,1],slimeColorEndG:[0,255,1],slimeColorEndB:[0,255,1],slimeColorTime:[0,2,.01],slimeColorPower:[.1,4,.1],
 slimeHeavyThreshold:[0,1,.01],slimeSlowEnabled:[0,1,1],slimeSlowMultiplier:[0,1,.01],
 slimeBreathEnabled:[0,1,1],slimeBreathFrequency:[.1,5,.1],slimeBreathAmplitude:[0,.2,.005],slimeBreathFade:[0,1,.01],
};
export const SLIME_FULLNESS_CONTROLS:[keyof SlimeFullnessSettings,string,string,string][]=[
 ['slimeColorEnabled','启用充盈变色','0/1','淡黄色随实际注入量逐渐过渡到满容量颜色，不随鼓胀超调反复变色。'],
 ['slimeColorStartR','初始颜色 · 红','0–255','未注入时的浅黄色。'],['slimeColorStartG','初始颜色 · 绿','0–255','未注入时的浅黄色。'],['slimeColorStartB','初始颜色 · 蓝','0–255','未注入时的浅黄色。'],
 ['slimeColorEndR','满容量颜色 · 红','0–255','默认保留原来的黄色 #ffdd32。'],['slimeColorEndG','满容量颜色 · 绿','0–255','默认保留原来的黄色 #ffdd32。'],['slimeColorEndB','满容量颜色 · 蓝','0–255','默认保留原来的黄色 #ffdd32。'],
 ['slimeColorTime','颜色过渡时间','s','每次注入后接近新颜色的平滑时间；0 立即更新。'],['slimeColorPower','颜色变化曲线幂次','','1 随充盈比例变化；大于1偏后期变黄，小于1偏前期。'],
 ['slimeHeavyThreshold','减速 / 呼吸充盈阈值','比例','默认0.5：严格超过50%注入量后启用；不按命中次数或鼓胀超调判断。'],
 ['slimeSlowEnabled','充盈减速开关','0/1','仅影响黄色史莱姆自主行走，不改变击退。'],['slimeSlowMultiplier','阈值后移动速度倍率','倍','默认0.65，即基础移动速度的65%；0停止自主移动。'],
 ['slimeBreathEnabled','行走呼吸开关','0/1','超过阈值且实际行走时呼吸式伸缩，停下、击退或充满后淡出。'],
 ['slimeBreathFrequency','行走呼吸频率','Hz','每秒伸缩次数。'],['slimeBreathAmplitude','行走呼吸幅度','比例','默认±4%；叠加原有受击、鼓胀效果，脚底保持接地。'],['slimeBreathFade','呼吸起止过渡','s','开始行走时渐入，停止时渐出；0立即切换。'],
];
