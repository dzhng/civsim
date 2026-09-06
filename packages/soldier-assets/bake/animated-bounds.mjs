import { poseSoldierMesh, assertMappedTangentFrames } from '../src/skin.ts';

/** The box encloses every baked pose; its circumsphere also survives instance yaw. */
export function deriveAnimatedBounds(tiers, animation, materials) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of tiers) {
    assertMappedTangentFrames(mesh, materials);
    for (let frame = 0; frame < animation.width; frame++) {
      const posed = poseSoldierMesh(mesh, animation, frame);
      assertMappedTangentFrames({ ...posed, materialIds: mesh.materialIds }, materials);
      const { positions } = posed;
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
