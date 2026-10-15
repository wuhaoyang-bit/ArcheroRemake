import { validateAnchorCurve } from './anchor-follow.ts';
import { exponentialCurve, validateCurve } from './turn-curve.ts';
import { DEFAULTS, LIMITS, sanitize, type Settings, type SettingKey } from './config.ts';

export type SettingsDocument = { version: 1; settings: Settings };

type AndroidSettingsBridge = { readSettings(): string; writeSettings(document: string): string };
declare global { interface Window { ArcheroAndroid?: AndroidSettingsBridge } }
export const isAndroidApp = () => typeof window !== 'undefined' && !!window.ArcheroAndroid;

function readBridgeResult(raw: string): { ok: boolean; document?: unknown; error?: string } {
  const result = JSON.parse(raw);
  if (!result?.ok) throw new Error(result?.error || '应用本地参数读写失败');
  return result;
}

/** Only tuning values are persisted. Input ownership, position and anchor memory are transient. */
export function parseSettingsDocument(raw: unknown, strict = false): Settings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('参数文件格式无效');
  const doc = raw as Record<string, unknown>;
  if (doc.version !== 1) throw new Error('参数文件版本不受支持');
  if (!doc.settings || typeof doc.settings !== 'object' || Array.isArray(doc.settings)) throw new Error('参数文件缺少 settings');
  const source = doc.settings as Record<string, unknown>, settings = { ...DEFAULTS };
  for (const key of Object.keys(LIMITS) as SettingKey[]) {
    const value = source[key];
    if (value === undefined) continue; // Older files gain newly added parameters from defaults.
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`参数 ${key} 必须是有限数字`);
    if (key === 'turnModel' && (![0, 1, 2, 3, 4, 5, 6].includes(value))) {
      throw new Error('转向模型编号无效');
    }
    if (strict && (value < LIMITS[key][0] || value > LIMITS[key][1])) throw new Error(`参数 ${key} 超出范围`);
    settings[key] = sanitize(key, value);
  }
  settings.turnCurve = source.turnCurve === undefined ? exponentialCurve(typeof source.turnResponse === 'number' && Number.isFinite(source.turnResponse) ? Math.max(0.1, Math.min(60, source.turnResponse)) : 10.4) : validateCurve(source.turnCurve);
  if (source.curveSnapAngle === undefined) settings.curveSnapAngle = typeof source.turnSnapAngle === 'number' ? sanitize('curveSnapAngle', source.turnSnapAngle) : DEFAULTS.curveSnapAngle;
  settings.anchorCurve = validateAnchorCurve(source.anchorCurve ?? DEFAULTS.anchorCurve);
  return settings;
}

export function settingsDocument(settings: Settings): SettingsDocument {
  // Whitelist the schema even when callers pass an object containing runtime state.
  return { version: 1, settings: parseSettingsDocument({ version: 1, settings }, true) };
}

export async function loadSettings(): Promise<Settings> {
  if (isAndroidApp()) return parseSettingsDocument(readBridgeResult(window.ArcheroAndroid!.readSettings()).document);
  const response = await fetch(`${import.meta.env.BASE_URL}params.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error('无法读取 params.json');
  return parseSettingsDocument(await response.json());
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (isAndroidApp()) {
    readBridgeResult(window.ArcheroAndroid!.writeSettings(JSON.stringify(settingsDocument(settings))));
    return;
  }
  const response = await fetch(`${import.meta.env.BASE_URL}__save-params`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settingsDocument(settings)),
  });
  const body = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
  if (!response.ok || !body?.ok) throw new Error(body?.error || '保存服务不可用，请通过项目开发服务或 preview 运行');
}
