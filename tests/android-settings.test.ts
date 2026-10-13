import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/config.ts';
import { loadSettings, saveSettings, settingsDocument } from '../src/settings-store.ts';

test('offline bridge loads bundled values, saves only settings and restores saved values', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let stored = settingsDocument({ ...DEFAULTS, turnSpeed: 1000, blendDuration: 0.2 });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { ArcheroAndroid: {
    readSettings: () => JSON.stringify({ ok: true, document: stored }),
    writeSettings: (raw: string) => { stored = JSON.parse(raw); return '{"ok":true}'; },
  } } });
  try {
    assert.equal((await loadSettings()).turnSpeed, 1000);
    assert.equal((await loadSettings()).blendDuration, 0.2);
    await saveSettings({ ...DEFAULTS, runSpeed: 2.5, position: { x: 9 } } as typeof DEFAULTS);
    assert.equal((await loadSettings()).runSpeed, 2.5);
    assert.equal('position' in stored.settings, false);
    window.ArcheroAndroid!.writeSettings = () => '{"ok":false,"error":"磁盘写入失败"}';
    await assert.rejects(saveSettings(DEFAULTS), /磁盘写入失败/);
    assert.equal((await loadSettings()).runSpeed, 2.5);
    window.ArcheroAndroid!.readSettings = () => '{"ok":false,"error":"读取失败"}';
    await assert.rejects(loadSettings(), /读取失败/);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
