import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/config.ts';
import { SettingsHistory } from '../src/settings-history.ts';

test('numeric, option and curve edits undo in order without mutable references', () => {
  const s = structuredClone(DEFAULTS), h = new SettingsHistory(s);
  assert.equal(h.canUndo, false); assert.equal(h.dirty, false);
  s.moveSpeed = 10; h.record(s);
  s.turnModel = 2; h.record(s);
  const before = structuredClone(s);
  s.turnCurve[0].speed = 999; h.record(s);
  assert.deepEqual(h.undo(), before);
  assert.equal(h.undo().turnModel, DEFAULTS.turnModel);
  assert.deepEqual(h.undo(), DEFAULTS);
  assert.equal(h.canUndo, false); assert.equal(h.dirty, false);
});
test('complete drag is one step; unchanged and out-and-back gestures add no history', () => {
  const s = structuredClone(DEFAULTS), h = new SettingsHistory(s);
  h.begin(); h.end(); assert.equal(h.canUndo, false);
  h.begin();
  for (let i = 1; i <= 30; i++) { s.turnCurve[0].speed = i; h.record(s); }
  h.end(); assert.deepEqual(h.undo(), DEFAULTS); assert.equal(h.canUndo, false);
  h.begin(); h.record(s); h.record(DEFAULTS); h.end(); assert.equal(h.canUndo, false);
});
test('undo all uses loaded or successfully saved snapshot and clears history', () => {
  const loaded = { ...structuredClone(DEFAULTS), moveSpeed: 12 }, h = new SettingsHistory(loaded);
  const edited = { ...loaded, moveSpeed: 20 };
  h.record(edited); assert.deepEqual(h.undoAll(), loaded);
  h.record(edited); h.saved(edited);
  assert.equal(h.canUndo, false); assert.equal(h.dirty, false);
  h.record(loaded); assert.deepEqual(h.undoAll(), edited); assert.equal(h.canUndo, false);
});
test('save completion preserves newer changes including an active drag', () => {
  const h = new SettingsHistory(DEFAULTS), saved = { ...structuredClone(DEFAULTS), moveSpeed: 12 };
  h.record(saved); h.begin(); h.record({ ...saved, moveSpeed: 13 }); h.saved(saved);
  assert.equal(h.dirty, true); assert.equal(h.canUndo, false);
  h.record({ ...saved, moveSpeed: 14 }); h.end(); assert.equal(h.undo().moveSpeed, 13);
  assert.equal(h.canUndo, false); assert.deepEqual(h.undoAll(), saved);
});
