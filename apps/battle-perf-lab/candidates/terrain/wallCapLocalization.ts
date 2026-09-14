import { Ray, Vector3 } from "three/webgpu";
import { screenRay, type Camera3DParams } from "../../../../packages/renderer-core/src/camera3d";
import type { BattleHorizonLayout } from "../../../../packages/game-renderer/src/battle/horizonPass";

/** Geometry classification only, never a tolerance mask or alternate shader oracle.
 * Find both source wall-end/bottom triangles under this pixel: their planes differ only by float rounding
 * and their authored colors have the base-course/body ratio of 0.66. */
export function coplanarWallCapAt(
  horizon: BattleHorizonLayout,
  camera: Camera3DParams,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const r = screenRay(camera, (2 * (x + 0.5)) / width - 1, 1 - (2 * (y + 0.5)) / height),
    ray = new Ray(new Vector3(...r.origin), new Vector3(...r.dir));
  const { vertices, indices } = horizon.mesh;
  const hits: { triangle: number; point: number[]; color: number[] }[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const offsets = [indices[i] * 10, indices[i + 1] * 10, indices[i + 2] * 10];
    const axis = [1, 2].find(
      (axis) =>
        offsets.every((o) => Math.abs(vertices[o + 3 + axis]) > 0.9999) &&
        offsets.every((o) => Math.abs(vertices[o + axis] - vertices[offsets[0] + axis]) < 1e-5),
    );
    if (axis === undefined) continue;
    const p = offsets.map((o) => new Vector3(vertices[o], vertices[o + 1], vertices[o + 2]));
    const hit = ray.intersectTriangle(p[0], p[1], p[2], false, new Vector3());
    if (hit)
      hits.push({
        triangle: i / 3,
        point: hit.toArray(),
        color: Array.from(vertices.slice(offsets[0] + 6, offsets[0] + 9)),
      });
  }
  for (const a of hits)
    for (const b of hits) {
      if (a.triangle === b.triangle || Math.hypot(...a.point.map((v, i) => v - b.point[i])) > 1e-3)
        continue;
      if (a.color.every((v, i) => Math.abs(v - b.color[i] * 0.66) < 1e-6))
        return {
          world: a.point,
          baseTriangle: a.triangle,
          bodyTriangle: b.triangle,
          baseColor: a.color,
          bodyColor: b.color,
        };
    }
  return null;
}
