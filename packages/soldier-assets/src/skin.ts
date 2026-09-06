import type { SoldierMeshData } from "./mesh";

/** CPU counterpart of crowd skinning for baked far views and parity probes. */
export function poseSoldierMesh(
  mesh: Pick<SoldierMeshData, "positions" | "normals" | "joints" | "weights">,
  vat: { width: number; data: ArrayLike<number> },
  frame: number,
) {
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    const p = vertex * 3;
    let px = 0,
      py = 0,
      pz = 0,
      nx = 0,
      ny = 0,
      nz = 0;
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
    }
    positions.set([px, py, pz], p);
    const length = Math.hypot(nx, ny, nz) || 1;
    normals.set([nx / length, ny / length, nz / length], p);
  }
  return { positions, normals };
}
