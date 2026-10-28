export const CAMERA_ZOOM_DEFAULTS={
 cameraZoomShotEnabled:1,cameraZoomHitEnabled:1,
 cameraZoomShotAmount:4,cameraZoomHitAmount:4,cameraZoomMaxAmount:12,
 cameraZoomAttack:.04,cameraZoomHold:0,cameraZoomPower:3,
 cameraZoomFrequency:7,cameraZoomDamping:1,
};
export type CameraZoomSettings=typeof CAMERA_ZOOM_DEFAULTS;
export const CAMERA_ZOOM_LIMITS:Record<keyof CameraZoomSettings,[number,number,number]>={
 cameraZoomShotEnabled:[0,1,1],cameraZoomHitEnabled:[0,1,1],
 cameraZoomShotAmount:[0,20,.5],cameraZoomHitAmount:[0,20,.5],cameraZoomMaxAmount:[0,40,.5],
 cameraZoomAttack:[0,.3,.005],cameraZoomHold:[0,.3,.005],cameraZoomPower:[1,6,.1],
 cameraZoomFrequency:[2,16,.5],cameraZoomDamping:[.15,2,.05],
};
export const CAMERA_ZOOM_CONTROLS:[keyof CameraZoomSettings,string,string,string][]=[
 ['cameraZoomShotEnabled','开关 1 · 出箭触发','0/1','每支箭实际射出时触发；与命中触发独立，可同时开启。关闭立即清除该通道。'],
 ['cameraZoomHitEnabled','开关 2 · 命中触发','0/1','箭实际命中怪物时触发；穿透箭每次有效命中均可触发。关闭立即清除该通道。'],
 ['cameraZoomShotAmount','出箭放大幅度','%','默认 4%；出箭与命中各有独立状态，两通道的偏移相加。'],
 ['cameraZoomHitAmount','命中放大幅度','%','默认 4%；同通道连击从当前缩放重新推近，不瞬间跳回基准。'],
 ['cameraZoomMaxAmount','叠加幅度上限','%','限制两通道合计的放大及缩小偏移，默认 12%。'],
 ['cameraZoomAttack','推近时间','s','默认 0.04 秒；Out 曲线先快后慢，0 为瞬间推近。'],
 ['cameraZoomPower','Out 曲线指数','指数','3 为 OutCubic；越大越集中在前段，1 为匀速。'],
 ['cameraZoomHold','峰值停留','s','默认 0；停留结束后以零速度进入弹簧回位。'],
 ['cameraZoomFrequency','回位弹簧频率','Hz','默认 7；越大响应越快。时序参数修改后下次触发生效。'],
 ['cameraZoomDamping','回位弹簧阻尼','比例','1 为无振荡的临界阻尼；小于 1 越过原位回弹，大于 1 更缓慢。与示意页 05 相同。'],
];
