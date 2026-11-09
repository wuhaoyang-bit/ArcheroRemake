import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import {
  bindSurfaceBary,
  buildChunkSoftbodyModel,
  buildChunkSoftbodyModelLite,
  centroidFanTets,
} from '../src/slime-burst-centroid-fan.ts';

const near = (a: number, b: number, eps = 1e-5) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

/** Signed tet volume (a,b,c,d) = (1/6) * scalarTriple(b-a, c-a, d-a). */
function signedVol(
  verts: Float32Array,
  a: number,
  b: number,
  c: number,
  d: number,
): number {
  const ax = verts[a * 3]!, ay = verts[a * 3 + 1]!, az = verts[a * 3 + 2]!;
  const bx = verts[b * 3]! - ax, by = verts[b * 3 + 1]! - ay, bz = verts[b * 3 + 2]! - az;
  const cx = verts[c * 3]! - ax, cy = verts[c * 3 + 1]! - ay, cz = verts[c * 3 + 2]! - az;
  const dx = verts[d * 3]! - ax, dy = verts[d * 3 + 1]! - ay, dz = verts[d * 3 + 2]! - az;
  return (
    (1 / 6) *
    (bx * (cy * dz - cz * dy) + by * (cz * dx - cx * dz) + bz * (cx * dy - cy * dx))
  );
}

function tetShell(): T.BufferGeometry {
  // Regular-ish tetrahedron shell: 4 verts, 4 faces, outward winding.
  const positions = new Float32Array([
    1, 1, 1,
    1, -1, -1,
    -1, 1, -1,
    -1, -1, 1,
  ]);
  // Faces oriented so outward normals point away from origin (centroid).
  const indices = new Uint32Array([
    0, 2, 1,
    0, 1, 3,
    0, 3, 2,
    1, 2, 3,
  ]);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new T.BufferAttribute(new Float32Array(12), 3));
  geo.setIndex(new T.BufferAttribute(indices, 1));
  return geo;
}

test('centroidFanTets: unit cube → tetCount === faceCount, positive volumes, no fails', () => {
  const geo = new T.BoxGeometry(1, 1, 1);
  const faceCount = geo.index!.count / 3;
  const fan = centroidFanTets(geo);
  assert.equal(fan.tetIds.length / 4, faceCount);
  assert.equal(fan.centroidIndex, geo.getAttribute('position')!.count);
  assert.equal(fan.volumeSignFailCount, 0);
  for (let f = 0; f < faceCount; f++) {
    const a = fan.tetIds[f * 4]!, b = fan.tetIds[f * 4 + 1]!, c = fan.tetIds[f * 4 + 2]!, d = fan.tetIds[f * 4 + 3]!;
    assert.ok(signedVol(fan.tetVerts, a, b, c, d) > 0, `tet ${f} volume not positive`);
  }
  near(fan.tetVerts[fan.centroidIndex * 3]!, 0);
  near(fan.tetVerts[fan.centroidIndex * 3 + 1]!, 0);
  near(fan.tetVerts[fan.centroidIndex * 3 + 2]!, 0);
});

test('centroidFanTets: tetrahedron shell → tetCount === 4, positive volumes', () => {
  const geo = tetShell();
  const fan = centroidFanTets(geo);
  assert.equal(fan.tetIds.length / 4, 4);
  assert.equal(fan.centroidIndex, 4);
  assert.equal(fan.volumeSignFailCount, 0);
  for (let f = 0; f < 4; f++) {
    const a = fan.tetIds[f * 4]!, b = fan.tetIds[f * 4 + 1]!, c = fan.tetIds[f * 4 + 2]!, d = fan.tetIds[f * 4 + 3]!;
    assert.ok(signedVol(fan.tetVerts, a, b, c, d) > 0);
  }
});

test('bindSurfaceBary: attachedTets / baryCoords lengths and corner bary near axis', () => {
  const geo = tetShell();
  const fan = centroidFanTets(geo);
  const model = bindSurfaceBary(geo, fan.tetVerts, fan.tetIds);
  const vertexCount = geo.getAttribute('position')!.count;
  assert.equal(model.attachedTets.length, vertexCount);
  assert.equal(model.baryCoords.length, vertexCount * 3);
  assert.equal(model.positions.length, vertexCount * 3);
  assert.equal(model.indices.length, 12);
  assert.ok(model.tetVerts.length === fan.tetVerts.length);
  assert.ok(model.tetIds.length === fan.tetIds.length);

  // Each shell corner is a tet corner → one of the three stored bary components ≈ 1
  // (layout stores weights for v1,v2,v3; v0=centroid weight is 1-x-y-z ≈ 0).
  for (let i = 0; i < vertexCount; i++) {
    const x = model.baryCoords[i * 3]!;
    const y = model.baryCoords[i * 3 + 1]!;
    const z = model.baryCoords[i * 3 + 2]!;
    const maxComp = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
    assert.ok(maxComp > 0.9, `vertex ${i} bary (${x},${y},${z}) missing ~1 axis component`);
    near(x + y + z, 1, 1e-3);
  }
});

test('buildChunkSoftbodyModel wires fan + bind', () => {
  const geo = new T.BoxGeometry(2, 2, 2);
  const model = buildChunkSoftbodyModel(geo);
  const vertexCount = geo.getAttribute('position')!.count;
  const faceCount = geo.index!.count / 3;
  assert.equal(model.attachedTets.length, vertexCount);
  assert.equal(model.baryCoords.length, vertexCount * 3);
  assert.equal(model.tetIds.length / 4, faceCount);
  assert.equal((model.tetVerts as number[]).length / 3, vertexCount + 1);
});

test('centroidFanTets expands non-indexed triangle list', () => {
  const positions = new Float32Array([
    1, 1, 1, 1, -1, -1, -1, 1, -1,
    1, 1, 1, 1, -1, -1, -1, -1, 1,
    1, 1, 1, -1, -1, 1, -1, 1, -1,
    1, -1, -1, -1, 1, -1, -1, -1, 1,
  ]);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new T.BufferAttribute(new Float32Array(positions.length), 3));
  const fan = centroidFanTets(geo);
  assert.equal(fan.tetIds.length / 4, 4);
  assert.equal(fan.volumeSignFailCount, 0);
});

test('buildChunkSoftbodyModelLite uses far fewer tets than dense shell fan', () => {
  const dense = new T.BoxGeometry(1, 1, 1, 8, 8, 8);
  const full = buildChunkSoftbodyModel(dense);
  const lite = buildChunkSoftbodyModelLite(dense);
  assert.ok(lite.tetIds.length / 4 < 40, `lite tets ${lite.tetIds.length / 4}`);
  assert.ok(full.tetIds.length / 4 > lite.tetIds.length / 4 * 10);
  dense.dispose();
});
