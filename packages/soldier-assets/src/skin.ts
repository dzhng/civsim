import type { SoldierMeshData } from "./mesh";
import type { SoldierMaterial } from "./material";

/** Relative squared cross-product floor for normalized normal/tangent directions. */
export const TANGENT_FRAME_EPSILON_SQUARED = 1e-12;

/** CPU counterpart of crowd skinning for baked far views and parity probes. */
export function poseSoldierMesh(
  mesh: Pick<SoldierMeshData, "positions" | "normals" | "tangents" | "joints" | "weights">,
  vat: { width: number; data: ArrayLike<number> },
  frame: number,
) {
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  const tangents = new Float32Array(mesh.tangents.length);
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    const p = vertex * 3;
    let px = 0,
      py = 0,
      pz = 0,
      nx = 0,
      ny = 0,
      nz = 0,
      tx = 0,
      ty = 0,
      tz = 0;
    for (let influence = 0; influence < 4; influence++) {
      const weight = mesh.weights[vertex * 4 + influence];
      if (weight === 0) continue;
      const bone = mesh.joints[vertex * 4 + influence];
      const c0 = (bone * 4 * vat.width + frame) * 4;
      const c1 = c0 + vat.width * 4;
      const c2 = c1 + vat.width * 4;
      const c3 = c2 + vat.width * 4;
      const d = vat.data;
      const x = mesh.positions[p],
        y = mesh.positions[p + 1],
        z = mesh.positions[p + 2];
      const a = mesh.normals[p],
        b = mesh.normals[p + 1],
        c = mesh.normals[p + 2];
      px += weight * (d[c0] * x + d[c1] * y + d[c2] * z + d[c3]);
      py += weight * (d[c0 + 1] * x + d[c1 + 1] * y + d[c2 + 1] * z + d[c3 + 1]);
      pz += weight * (d[c0 + 2] * x + d[c1 + 2] * y + d[c2 + 2] * z + d[c3 + 2]);
      nx += weight * (d[c0] * a + d[c1] * b + d[c2] * c);
      ny += weight * (d[c0 + 1] * a + d[c1 + 1] * b + d[c2 + 1] * c);
      nz += weight * (d[c0 + 2] * a + d[c1 + 2] * b + d[c2 + 2] * c);
      const u = mesh.tangents[vertex * 4],
        v = mesh.tangents[vertex * 4 + 1],
        w = mesh.tangents[vertex * 4 + 2];
      tx += weight * (d[c0] * u + d[c1] * v + d[c2] * w);
      ty += weight * (d[c0 + 1] * u + d[c1 + 1] * v + d[c2 + 1] * w);
      tz += weight * (d[c0 + 2] * u + d[c1 + 2] * v + d[c2 + 2] * w);
    }
    positions.set([px, py, pz], p);
    const length = Math.hypot(nx, ny, nz) || 1;
    normals.set([nx / length, ny / length, nz / length], p);
    const tangentLength = Math.hypot(tx, ty, tz) || 1;
    tangents.set(
      [tx / tangentLength, ty / tangentLength, tz / tangentLength, mesh.tangents[vertex * 4 + 3]],
      vertex * 4,
    );
  }
  return { positions, normals, tangents };
}

/** Normal maps require a directional frame; unrelated untextured slots do not. */
export function assertMappedTangentFrames(
  mesh: Pick<SoldierMeshData, "normals" | "tangents" | "materialIds">,
  materials: readonly SoldierMaterial[],
): void {
  for (let vertex = 0; vertex < mesh.materialIds.length; vertex++) {
    if (!materials[mesh.materialIds[vertex]].textures?.normal) continue;
    const p = vertex * 3,
      t = vertex * 4;
    const nx = mesh.normals[p],
      ny = mesh.normals[p + 1],
      nz = mesh.normals[p + 2];
    const tx = mesh.tangents[t],
      ty = mesh.tangents[t + 1],
      tz = mesh.tangents[t + 2],
      sign = mesh.tangents[t + 3];
    const normalLength = Math.hypot(nx, ny, nz),
      tangentLength = Math.hypot(tx, ty, tz);
    const crossX =
      (ny / normalLength) * (tz / tangentLength) - (nz / normalLength) * (ty / tangentLength);
    const crossY =
      (nz / normalLength) * (tx / tangentLength) - (nx / normalLength) * (tz / tangentLength);
    const crossZ =
      (nx / normalLength) * (ty / tangentLength) - (ny / normalLength) * (tx / tangentLength);
    if (
      ![nx, ny, nz, tx, ty, tz].every(Number.isFinite) ||
      normalLength === 0 ||
      tangentLength === 0 ||
      crossX * crossX + crossY * crossY + crossZ * crossZ <= TANGENT_FRAME_EPSILON_SQUARED ||
      (sign !== -1 && sign !== 1)
    ) {
      throw new Error(
        `normal-mapped vertex ${vertex} requires a nonzero, nonparallel tangent frame and handedness +/-1`,
      );
    }
  }
}
