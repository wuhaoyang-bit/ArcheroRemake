export const SHAKE_TIERS = ['weak', 'mid', 'strong'] as const;
export type ShakeTierId = typeof SHAKE_TIERS[number];
export const SHAKE_LABELS = {weak: '弱', mid: '中', strong: '强'};
const PREFIX = {weak: 'Weak', mid: 'Mid', strong: 'Strong'} as const;
export type ShakeField = 'Formula' | 'A0' | 'Duration' | 'Omega' | 'P' | 'N' | 'Decay';
export type ShakeTierKey = `cameraShake${typeof PREFIX[ShakeTierId]}${ShakeField}`;
export type CameraShakeSettings = Record<ShakeTierKey | 'cameraShakeEnabled' | 'cameraShakeTier', number>;
export type CameraShakeKey = keyof CameraShakeSettings;
export const shakeKey = (tier: ShakeTierId, field: ShakeField): ShakeTierKey => `cameraShake${PREFIX[tier]}${field}`;

// SmashBroCER's defaults: 9 frames at 60 Hz, with 2 / 4 / 8 pixel amplitudes.
export const CAMERA_SHAKE_DEFAULTS: CameraShakeSettings = {
  cameraShakeEnabled: 1, cameraShakeTier: 1,
  ...Object.fromEntries(SHAKE_TIERS.flatMap((tier, i) => Object.entries({
    Formula: i === 2 ? 1 : 0, A0: 2 ** (i + 1), Duration: 9,
    Omega: .9, P: 3, N: 2, Decay: 1 / 9,
  }).map(([field, value]) => [shakeKey(tier, field as ShakeField), value]))) as Record<ShakeTierKey, number>,
};
export const SHAKE_FIELDS: {field: ShakeField; label: string; unit: string; limits: [number, number, number]; hint: string}[] = [
  {field:'Formula',label:'衰减公式',unit:'',limits:[0,1,1],hint:'剩余时间：按持续帧数收束；Trauma：按每帧衰减量收束。'},
  {field:'A0',label:'初始振幅 A0',unit:'px',limits:[0,20,.1],hint:'以 390 像素宽游戏画面为基准，随视口等比缩放；0 为无位移。'},
  {field:'Duration',label:'持续帧数 M',unit:'帧',limits:[1,60,1],hint:'按 60 帧/秒计时，9 帧 = 0.15 秒。修改时同步 Trauma 衰减量为 1/M。'},
  {field:'Omega',label:'角频率 ω',unit:'rad/帧',limits:[.1,3,.05],hint:'越大震动越快；沿用 SmashBroCER 的运动轨迹。'},
  {field:'P',label:'剩余时间指数 p',unit:'',limits:[1,5,.1],hint:'振幅 = A0 × (剩余时间比例)^p；越大越快收束。'},
  {field:'N',label:'Trauma 指数 n',unit:'',limits:[1,3,.1],hint:'振幅 = A0 × Trauma^n。'},
  {field:'Decay',label:'Trauma 每帧衰减',unit:'/帧',limits:[.001,.5,.001],hint:'Trauma 从 1 线性递减；可在修改持续帧数后单独微调。持续帧数到达时停止。'},
];
export const CAMERA_SHAKE_LIMITS: Record<CameraShakeKey, [number, number, number]> = {
  cameraShakeEnabled: [0,1,1], cameraShakeTier: [0,2,1],
  ...Object.fromEntries(SHAKE_TIERS.flatMap(tier => SHAKE_FIELDS.map(f => [shakeKey(tier, f.field), f.limits]))) as Record<ShakeTierKey, [number, number, number]>,
};
