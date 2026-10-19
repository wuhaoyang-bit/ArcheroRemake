import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const out = new URL('../analysis/character-import/', import.meta.url);
await mkdir(out, { recursive: true });
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined),
  headless: true, args: ['--enable-unsafe-webgpu'],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /No target node|not found|bone.*missing/i.test(message.text())) errors.push(message.text());
  });
  await page.goto(process.env.BASE_URL || 'http://localhost:5173');
  await page.waitForFunction(() => window.__ARCHERO__?.snapshot().ready, {}, { timeout: 60000 });
  const report = await page.evaluate(async () => {
    const { loadCharacter } = await import('/src/character.ts');
    const { model, mixer, idle, run } = await loadCharacter();
    const meshes = [];
    model.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
    const vector = model.position.clone();
    const pose = (action, time) => {
      idle.setEffectiveWeight(action === idle ? 1 : 0);
      run.setEffectiveWeight(action === run ? 1 : 0);
      action.time = time;
      mixer.update(0);
      model.updateMatrixWorld(true);
      meshes.forEach(mesh => mesh.skeleton.update());
      const vertices = [], centers = {}, bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (const mesh of meshes) {
        const center = [0, 0, 0];
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
          mesh.getVertexPosition(i, vector).applyMatrix4(mesh.matrixWorld);
          vertices.push(vector.x, vector.y, vector.z);
          vector.toArray().forEach((v, axis) => center[axis] += v / mesh.geometry.attributes.position.count);
          if (mesh.name === 'Bow_WeaponHand101001') continue;
          vector.toArray().forEach((v, axis) => { bounds.min[axis] = Math.min(bounds.min[axis], v); bounds.max[axis] = Math.max(bounds.max[axis], v); });
        }
        centers[mesh.name] = center;
      }
      const root = model.getObjectByName('CharacterRoot');
      return { vertices, bounds, centers, root: root.getWorldPosition(vector).toArray() };
    };
    const delta = (a, b) => Math.max(...a.vertices.map((v, i) => Math.abs(v - b.vertices[i])));
    const idle0 = pose(idle, 0), idleMid = pose(idle, .5), idleEnd = pose(idle, idle.getClip().duration);
    const run0 = pose(run, 0), runMid = pose(run, 1 / 6), runEnd = pose(run, run.getClip().duration);
    const maxStep = action => {
      let previous = pose(action, 0), max = 0;
      for (let t = 1 / 60; t < action.getClip().duration; t += 1 / 60) {
        const next = pose(action, t); max = Math.max(max, delta(previous, next)); previous = next;
      }
      return max;
    };
    const idleStep = maxStep(idle), runStep = maxStep(run);
    idle.setEffectiveWeight(0); run.setEffectiveWeight(1);
    run.time = 0; run.setEffectiveTimeScale(2); mixer.update(.1);
    const result = {
      clips: [idle, run].map(action => ({ name: action.getClip().name, duration: action.getClip().duration, tracks: action.getClip().tracks.length })),
      meshes: meshes.map(mesh => ({ name: mesh.name, bones: mesh.skeleton.bones.length, hasTexture: !!mesh.material.map, textureSize: [mesh.material.map?.image.width, mesh.material.map?.image.height] })),
      idleBounds: idle0.bounds,
      idleCenters: idle0.centers, runCenters: run0.centers,
      idleDeformation: delta(idle0, idleMid), runDeformation: delta(run0, runMid),
      idleLoopSeam: delta(idle0, idleEnd), runLoopSeam: delta(run0, runEnd),
      idleMaxFrameStep: idleStep, runMaxFrameStep: runStep,
      rootSamples: [idle0.root, idleMid.root, run0.root, runMid.root],
      runTimeAtDoubleSpeed: run.time,
    };
    mixer.stopAllAction(); mixer.uncacheRoot(model);
    return result;
  });
  await writeFile(new URL('browser-report.json', out), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  assert.deepEqual(report.clips.map(clip => clip.name), ['Idle', 'Run']);
  assert.ok(Math.abs(report.clips[0].duration - 1) < 1e-6);
  assert.ok(Math.abs(report.clips[1].duration - 2 / 3) < 1e-6);
  assert.equal(report.meshes.length, 4);
  assert.ok(report.meshes.every(mesh => mesh.name !== 'Bow_WeaponHand101001'), 'Weapon must be removed from the character');
  assert.ok(report.meshes.every(mesh => mesh.hasTexture && mesh.bones === 63));
  assert.ok(Math.abs(report.idleBounds.min[1]) < .001, 'Feet must rest on the floor');
  assert.ok(Math.abs(report.idleBounds.max[1] - 3.25) < .001, 'Body height must match the existing game scale');
  assert.ok(report.idleDeformation > .001 && report.runDeformation > .1, 'Both clips must deform the actual skinned mesh');
  // Preserve the supplied animation. Its sampled endpoints are not identical;
  // the wrap must stay smaller than a normal frame's vertex displacement.
  assert.ok(report.idleLoopSeam <= report.idleMaxFrameStep && report.runLoopSeam <= report.runMaxFrameStep, 'Loop wrap exceeds normal frame motion');
  assert.ok(report.rootSamples.every(root => Math.abs(root[0]) < 1e-6 && Math.abs(root[2]) < 1e-6), 'Animation must not move the game root');
  assert.ok(Math.abs(report.runTimeAtDoubleSpeed - .2) < 1e-6);
  await page.screenshot({ path: new URL('desktop-idle.png', out).pathname });
  const rect = await page.locator('#viewport').boundingBox();
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height * .76 };
  // Capture each cardinal direction after settling, without saving any tuning.
  for (const [name, dx, dy] of [['down', 0, 55], ['left', -55, 0], ['up', 0, -55], ['right', 55, 0]]) {
    await page.mouse.move(center.x, center.y); await page.mouse.down();
    await page.mouse.move(center.x + dx, center.y + dy); await page.waitForTimeout(500);
    await page.screenshot({ path: new URL(`run-${name}.png`, out).pathname });
    await page.mouse.up(); await page.waitForTimeout(400);
  }
  assert.deepEqual(errors, []);
  console.log('PASS character: textures, skinning, clip timing, loop continuity, foot height, root stability, Run speed, WebGPU rendering');
} finally {
  await browser.close();
}
