import { poseSoldierMesh } from '../src/skin.ts';

/** The box encloses every baked pose; its circumsphere also survives instance yaw. */
export function deriveAnimatedBounds(tiers, animation) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of tiers) {
    for (let frame = 0; frame < animation.width; frame++) {
      const { positions } = poseSoldierMesh(mesh, animation, frame);
      for (let i = 0; i < positions.length; i++) {
        const axis = i % 3;
        min[axis] = Math.min(min[axis], positions[i]);
        max[axis] = Math.max(max[axis], positions[i]);
      }
    }
  }
  const center = min.map((v, axis) => (v + max[axis]) / 2);
  return { center, radius: Math.hypot(...max.map((v, axis) => v - center[axis])) };
}
