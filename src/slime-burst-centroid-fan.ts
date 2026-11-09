import * as T from 'three/webgpu';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';

export type CentroidFanResult = {
  tetVerts: Float32Array;
  tetIds: Uint32Array;
  centroidIndex: number;
  volumeSignFailCount: number;
};

export type SoftbodyModel = {
  tetVerts: number[] | Float32Array;
  tetIds: number[] | Uint32Array;
  positions: number[];
  indices: number[];
  normals: number[];
  uvs: number[];
  attachedTets: number[];
  baryCoords: number[];
};

type Attr = {array: ArrayLike<number>; count: number};
type GeometryLike = {
  getAttribute(name: string): Attr | undefined;
  index: {array: ArrayLike<number>; count: number} | null;
};

function readPositions(geometry: GeometryLike): Float32Array {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) throw new Error('centroidFanTets: geometry missing position attribute');
  const src = posAttr.array;
  if (src instanceof Float32Array) return src;
  const out = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < out.length; i++) out[i] = src[i]!;
  return out;
}

/** Expand index; non-indexed geometry → sequential triangles. */
function readTriangleIndex(geometry: GeometryLike, vertexCount: number): Uint32Array {
  const index = geometry.index;
  if (index) {
    const src = index.array;
    const n = index.count;
    if (n % 3 !== 0) throw new Error(`centroidFanTets: index count ${n} is not a multiple of 3`);
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i++) out[i] = src[i]!;
    return out;
  }
  if (vertexCount % 3 !== 0) {
    throw new Error(
      `centroidFanTets: non-indexed geometry vertex count ${vertexCount} is not a multiple of 3`,
    );
  }
  const out = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) out[i] = i;
  return out;
}

/** Signed tet volume (a,b,c,d) = (1/6) * scalarTriple(b-a, c-a, d-a). */
function signedTetVolume(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number,
): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const adx = dx - ax, ady = dy - ay, adz = dz - az;
  return (
    (1 / 6) *
    (abx * (acy * adz - acz * ady) + aby * (acz * adx - acx * adz) + abz * (acx * ady - acy * adx))
  );
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function toNumberArray(src: ArrayLike<number>, map?: (v: number) => number): number[] {
  const out = new Array<number>(src.length);
  if (map) {
    for (let i = 0; i < src.length; i++) out[i] = map(src[i]!);
  } else {
    for (let i = 0; i < src.length; i++) out[i] = src[i]!;
  }
  return out;
}

export function centroidFanTets(geometry: GeometryLike): CentroidFanResult {
  const pos = readPositions(geometry);
  const n = pos.length / 3;
  const index = readTriangleIndex(geometry, n);

  let cx = 0, cy = 0, cz = 0;
  let maxAbs = 0;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!;
    cx += x; cy += y; cz += z;
    maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y), Math.abs(z));
  }
  cx /= n; cy /= n; cz /= n;
  const scale = Math.max(maxAbs, 1e-6) ** 3;
  const volEps = 1e-12 * scale;

  const tetVerts = new Float32Array((n + 1) * 3);
  tetVerts.set(pos);
  tetVerts[n * 3] = cx;
  tetVerts[n * 3 + 1] = cy;
  tetVerts[n * 3 + 2] = cz;
  const C = n;

  const faceCount = index.length / 3;
  const tetIds = new Uint32Array(faceCount * 4);
  let volumeSignFailCount = 0;

  for (let f = 0; f < faceCount; f++) {
    let i0 = index[f * 3]!;
    let i1 = index[f * 3 + 1]!;
    let i2 = index[f * 3 + 2]!;
    let vol = signedTetVolume(
      cx, cy, cz,
      pos[i0 * 3]!, pos[i0 * 3 + 1]!, pos[i0 * 3 + 2]!,
      pos[i1 * 3]!, pos[i1 * 3 + 1]!, pos[i1 * 3 + 2]!,
      pos[i2 * 3]!, pos[i2 * 3 + 1]!, pos[i2 * 3 + 2]!,
    );
    if (vol < 0) {
      const tmp = i1;
      i1 = i2;
      i2 = tmp;
      vol = -vol;
    }
    if (Math.abs(vol) < volEps) volumeSignFailCount++;
    tetIds[f * 4] = C;
    tetIds[f * 4 + 1] = i0;
    tetIds[f * 4 + 2] = i1;
    tetIds[f * 4 + 3] = i2;
  }

  return {tetVerts, tetIds, centroidIndex: C, volumeSignFailCount};
}

type TetObj = {
  id: number;
  v0: T.Vector3;
  v1: T.Vector3;
  v2: T.Vector3;
  v3: T.Vector3;
  center: T.Vector3;
};

/** Copy holtsetio processGeometry bary layout: 3 floats per skin vertex (4th = 1-x-y-z in shader). */
export function bindSurfaceBary(
  geometry: GeometryLike,
  tetVerts: Float32Array,
  tetIds: Uint32Array,
): SoftbodyModel {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) throw new Error('bindSurfaceBary: geometry missing position attribute');
  const positionArray = posAttr.array;
  const vertexCount = posAttr.count;

  const normalAttr = geometry.getAttribute('normal');
  const normalArray = normalAttr?.array;
  const uvAttr = geometry.getAttribute('uv');
  const uvArray = uvAttr?.array;

  const index = geometry.index;
  let indexArray: ArrayLike<number>;
  if (index) {
    indexArray = index.array;
  } else {
    const expanded = new Uint32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) expanded[i] = i;
    indexArray = expanded;
  }

  const tets: TetObj[] = [];
  for (let i = 0; i < tetIds.length; i += 4) {
    const id = tets.length;
    const v0 = new T.Vector3(
      tetVerts[tetIds[i]! * 3]!,
      tetVerts[tetIds[i]! * 3 + 1]!,
      tetVerts[tetIds[i]! * 3 + 2]!,
    );
    const v1 = new T.Vector3(
      tetVerts[tetIds[i + 1]! * 3]!,
      tetVerts[tetIds[i + 1]! * 3 + 1]!,
      tetVerts[tetIds[i + 1]! * 3 + 2]!,
    );
    const v2 = new T.Vector3(
      tetVerts[tetIds[i + 2]! * 3]!,
      tetVerts[tetIds[i + 2]! * 3 + 1]!,
      tetVerts[tetIds[i + 2]! * 3 + 2]!,
    );
    const v3 = new T.Vector3(
      tetVerts[tetIds[i + 3]! * 3]!,
      tetVerts[tetIds[i + 3]! * 3 + 1]!,
      tetVerts[tetIds[i + 3]! * 3 + 2]!,
    );
    const center = v0.clone().add(v1).add(v2).add(v3).divideScalar(4);
    tets.push({id, v0, v1, v2, v3, center});
  }

  const findClosestTet = (vertex: T.Vector3): TetObj => {
    let minDist = 1e9;
    let closestTet = tets[0]!;
    for (let i = 0; i < tets.length; i++) {
      const tet = tets[i]!;
      const dist = vertex.distanceTo(tet.center);
      if (dist < minDist) {
        minDist = dist;
        closestTet = tet;
      }
    }
    return closestTet;
  };

  const getMatrixInverse = (tet: TetObj): T.Matrix3 => {
    const {v0, v1, v2, v3} = tet;
    const a = v1.clone().sub(v0);
    const b = v2.clone().sub(v0);
    const c = v3.clone().sub(v0);
    const matrix = new T.Matrix3(a.x, b.x, c.x, a.y, b.y, c.y, a.z, b.z, c.z);
    return matrix.clone().invert();
  };

  const tetIdArray = new Uint32Array(vertexCount);
  const tetBaryCoordsArray = new Float32Array(vertexCount * 3);
  const vertex = new T.Vector3();

  for (let i = 0; i < vertexCount; i++) {
    vertex.set(positionArray[i * 3]!, positionArray[i * 3 + 1]!, positionArray[i * 3 + 2]!);
    const closestTet = findClosestTet(vertex);
    tetIdArray[i] = closestTet.id;
    const baryCoords = vertex.clone().sub(closestTet.v0).applyMatrix3(getMatrixInverse(closestTet));
    tetBaryCoordsArray[i * 3] = baryCoords.x;
    tetBaryCoordsArray[i * 3 + 1] = baryCoords.y;
    tetBaryCoordsArray[i * 3 + 2] = baryCoords.z;
  }

  const positions = toNumberArray(positionArray, round4);
  const normals = normalArray
    ? toNumberArray(normalArray, round4)
    : new Array(vertexCount * 3).fill(0);
  const uvs = uvArray
    ? toNumberArray(uvArray, round4)
    : new Array(vertexCount * 2).fill(0);
  const indices = toNumberArray(indexArray);

  return {
    tetVerts: toNumberArray(tetVerts),
    tetIds: toNumberArray(tetIds),
    positions,
    indices,
    normals,
    uvs,
    attachedTets: toNumberArray(tetIdArray),
    baryCoords: toNumberArray(tetBaryCoordsArray, round4),
  };
}

export function buildChunkSoftbodyModel(geometry: GeometryLike): SoftbodyModel {
  const fan = centroidFanTets(geometry);
  return bindSurfaceBary(geometry, fan.tetVerts, fan.tetIds);
}

/** Keep at most `maxPoints` via coarse voxel bins so ConvexGeometry stays tiny. */
function downsamplePoints(points: T.Vector3[], maxPoints = 14): T.Vector3[] {
  if (points.length <= maxPoints) return points;
  const box = new T.Box3().setFromPoints(points);
  const size = box.getSize(new T.Vector3());
  const extent = Math.max(size.x, size.y, size.z, 1e-4);
  // ~2.5 cells per axis → ~8–16 occupied bins for a filled cloud.
  const cell = extent / 2.5;
  const bins = new Map<string, T.Vector3>();
  for (const p of points) {
    const ix = Math.floor((p.x - box.min.x) / cell);
    const iy = Math.floor((p.y - box.min.y) / cell);
    const iz = Math.floor((p.z - box.min.z) / cell);
    const key = `${ix},${iy},${iz}`;
    if (!bins.has(key)) bins.set(key, p.clone());
  }
  let out = [...bins.values()];
  if (out.length < 4) {
    // Degenerate flat cloud — fall back to bbox corners.
    const {min, max} = box;
    out = [
      new T.Vector3(min.x, min.y, min.z), new T.Vector3(max.x, min.y, min.z),
      new T.Vector3(min.x, max.y, min.z), new T.Vector3(max.x, max.y, min.z),
      new T.Vector3(min.x, min.y, max.z), new T.Vector3(max.x, min.y, max.z),
      new T.Vector3(min.x, max.y, max.z), new T.Vector3(max.x, max.y, max.z),
    ];
  }
  if (out.length > maxPoints) out = out.slice(0, maxPoints);
  return out;
}

/**
 * Preview-perf path: voxel-downsampled convex hull cage (tens of tets) instead of
 * raw dense shells (~1000 tris/chunk). Coplanar cut faces must be downsampled or
 * ConvexGeometry stays dense.
 */
export function buildChunkSoftbodyModelLite(geometry: GeometryLike): SoftbodyModel {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) throw new Error('buildChunkSoftbodyModelLite: missing position');
  const points: T.Vector3[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(new T.Vector3(x, y, z));
  }
  if (points.length < 4) {
    return buildChunkSoftbodyModel(geometry);
  }
  const hull = new ConvexGeometry(downsamplePoints(points, 14));
  hull.computeVertexNormals();
  const fan = centroidFanTets(hull);
  const model = bindSurfaceBary(hull, fan.tetVerts, fan.tetIds);
  hull.dispose();
  return model;
}
