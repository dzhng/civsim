import type { WorldRay } from "../../renderer-core/src/camera3d";
export interface TerrainPickMesh {
  vertices: Float32Array;
  indices: Uint32Array | Uint16Array;
}
type V = [number, number, number];
type Triangle = { a: V; b: V; c: V; min: V; max: V; center: V };
type Node = { min: V; max: V; triangles?: Triangle[]; left?: Node; right?: Node };
/** CPU-only acceleration over the actual front-sided ground/apron triangles.
 * Water, scenery and horizon walls do not participate in source terrain picking. */
export function createTerrainPicking(meshes: readonly TerrainPickMesh[]) {
  const triangles: Triangle[] = [];
  for (const mesh of meshes)
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const point = (index: number): V => {
        const at = mesh.indices[index] * 10;
        return [mesh.vertices[at], mesh.vertices[at + 1], mesh.vertices[at + 2]];
      };
      const a = point(i),
        b = point(i + 1),
        c = point(i + 2);
      const min: V = [0, 0, 0],
        max: V = [0, 0, 0],
        center: V = [0, 0, 0];
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(a[axis], b[axis], c[axis]);
        max[axis] = Math.max(a[axis], b[axis], c[axis]);
        center[axis] = (min[axis] + max[axis]) / 2;
      }
      triangles.push({ a, b, c, min, max, center });
    }
  const build = (items: Triangle[]): Node => {
    const min: V = [Infinity, Infinity, Infinity],
      max: V = [-Infinity, -Infinity, -Infinity];
    for (const t of items)
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], t.min[axis]);
        max[axis] = Math.max(max[axis], t.max[axis]);
      }
    if (items.length <= 12) return { min, max, triangles: items };
    let axis = 0;
    for (let i = 1; i < 3; i++) if (max[i] - min[i] > max[axis] - min[axis]) axis = i;
    items.sort((a, b) => a.center[axis] - b.center[axis]);
    const split = items.length >> 1;
    return { min, max, left: build(items.slice(0, split)), right: build(items.slice(split)) };
  };
  const root = triangles.length ? build(triangles) : null;
  const intersects = (node: Node, ray: WorldRay, best: number) => {
    let near = 0,
      far = best;
    for (let axis = 0; axis < 3; axis++) {
      const origin = ray.origin[axis],
        direction = ray.dir[axis];
      if (direction === 0) {
        if (origin < node.min[axis] || origin > node.max[axis]) return false;
        continue;
      }
      const a = (node.min[axis] - origin) / direction,
        b = (node.max[axis] - origin) / direction;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near > far) return false;
    }
    return true;
  };
  const hitTriangle = (t: Triangle, ray: WorldRay) => {
    const [ax, ay, az] = t.a,
      bx = t.b[0] - ax,
      by = t.b[1] - ay,
      bz = t.b[2] - az,
      cx = t.c[0] - ax,
      cy = t.c[1] - ay,
      cz = t.c[2] - az;
    const [dx, dy, dz] = ray.dir,
      px = dy * cz - dz * cy,
      py = dz * cx - dx * cz,
      pz = dx * cy - dy * cx;
    const det = bx * px + by * py + bz * pz;
    if (det <= 0) return Infinity;
    const ox = ray.origin[0] - ax,
      oy = ray.origin[1] - ay,
      oz = ray.origin[2] - az;
    const u = (ox * px + oy * py + oz * pz) / det;
    if (u < 0 || u > 1) return Infinity;
    const qx = oy * bz - oz * by,
      qy = oz * bx - ox * bz,
      qz = ox * by - oy * bx;
    const v = (dx * qx + dy * qy + dz * qz) / det;
    if (v < 0 || u + v > 1) return Infinity;
    const distance = (cx * qx + cy * qy + cz * qz) / det;
    return distance >= 0 ? distance : Infinity;
  };
  const raycast = (ray: WorldRay): V | null => {
    if (!root) return null;
    let best = Infinity;
    const pending = [root];
    while (pending.length) {
      const n = pending.pop()!;
      if (!intersects(n, ray, best)) continue;
      if (n.triangles)
        for (const triangle of n.triangles) best = Math.min(best, hitTriangle(triangle, ray));
      else {
        pending.push(n.left!, n.right!);
      }
    }
    return Number.isFinite(best)
      ? [
          ray.origin[0] + ray.dir[0] * best,
          ray.origin[1] + ray.dir[1] * best,
          ray.origin[2] + ray.dir[2] * best,
        ]
      : null;
  };
  return {
    raycast,
    surfaceHeightAt: (x: number, y: number, fallback: (x: number, y: number) => number) =>
      raycast({ origin: [x, y, (root?.max[2] ?? 0) + 1], dir: [0, 0, -1] })?.[2] ?? fallback(x, y),
    triangles: triangles.length,
  };
}
