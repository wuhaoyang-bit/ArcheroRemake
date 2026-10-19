export const CHECKPOINT_RADIUS = 0.65;
export type TrainingMode = 'free' | 'obstacles' | 'locking';
export type RoutePoint = { x: number; z: number };
export type Obstacle = { x: number; z: number; radius: number };

/** Static practice targets, arranged around the room center, independent of player facing. */
export function lockingTargets(width: number, length: number) {
  // Leave extra space at the ends so the upper props clear the portrait HUD.
  const x = width / 2 - 2, z = length / 2 - Math.min(4, length / 4);
  return [
    { id: 'north', label: '正上方', x: 0, z: -z },
    { id: 'south', label: '正下方', x: 0, z },
    { id: 'west', label: '正左方', x: -x, z: 0 },
    { id: 'east', label: '正右方', x, z: 0 },
    { id: 'north-west', label: '左上方', x: -x, z: -z },
    { id: 'south-west', label: '左下方', x: -x, z },
    { id: 'south-east', label: '右下方', x, z },
    { id: 'north-east', label: '右上方', x, z: -z },
  ];
}

export function trainingCourse(width: number, length: number) {
  const startZ = length / 2 - 1.5, finishZ = -length / 2 + 1.5;
  const count = Math.max(1, Math.floor((length - 6) / 4.5));
  const obstacles: Obstacle[] = Array.from({ length: count }, (_, i) => ({
    x: 0, z: startZ - (i + 1) * (startZ - finishZ) / (count + 1), radius: .95,
  }));
  const reach = Math.min(width / 2 - 1, 2.4);
  const route = [{ x: 0, z: startZ }, ...obstacles.map((o, i) => ({x: (i % 2 ? 1 : -1) * reach, z: o.z})), {x: 0, z: finishZ}];
  // Equal cubic bends: vertical tangents at each outer checkpoint, broad crossovers in between.
  const segments = route.slice(1).map((b, i) => {
    const a = route[i], gap = a.z - b.z;
    const c1 = { x: a.x, z: a.z - gap * .85 }, c2 = { x: b.x, z: b.z + gap * .85 };
    return Array.from({length: 65}, (_, j) => {
      const t = j / 64, u = 1 - t;
      return {x: u*u*u*a.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*b.x,
        z: u*u*u*a.z + 3*u*u*t*c1.z + 3*u*t*t*c2.z + t*t*t*b.z};
    });
  });
  return { startZ, finishZ, obstacles, route, checkpoints: route.slice(1, -1), segments };
}

/** Short movement steps + circle projection allow sliding without tunnelling through obstacles. */
export function moveAroundObstacles(position: {x: number; z: number}, dx: number, dz: number, obstacles: Obstacle[], radius: number, onStep?: () => void) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * .5)));
  for (let i = 0; i < steps; i++) {
    position.x += dx / steps; position.z += dz / steps;
    for (const o of obstacles) {
      const x = position.x - o.x, z = position.z - o.z, d = Math.hypot(x, z), limit = radius + o.radius;
      if (d < limit) {
        position.x = o.x + (d > 1e-9 ? x / d : 1) * limit;
        position.z = o.z + (d > 1e-9 ? z / d : 0) * limit;
      }
    }
    onStep?.();
  }
}
