import { MAX_BLADES_PER_RECORD } from "./bladeFieldPolicy";
export function bladeGeometryData(segments: number, bladesPerRecord: number) {
  const bladeCopies = Math.max(1, Math.min(MAX_BLADES_PER_RECORD, Math.floor(bladesPerRecord)));
  const vertexCount = (segments + 1) * 2 * bladeCopies;
  const indexCount = segments * 6 * bladeCopies;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(indexCount);
  let vp = 0;
  let np = 0;
  let up = 0;
  let ip = 0;
  for (let copy = 0; copy < bladeCopies; copy++) {
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      for (const side of [-0.5, 0.5]) {
        positions[vp++] = s === segments ? 0 : side;
        positions[vp++] = t;
        positions[vp++] = copy;
        normals[np++] = 0;
        normals[np++] = 0;
        normals[np++] = 1;
        uvs[up++] = side + 0.5;
        uvs[up++] = t;
      }
    }
    const base = copy * (segments + 1) * 2;
    for (let s = 0; s < segments; s++) {
      const a = base + s * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices[ip++] = a;
      indices[ip++] = c;
      indices[ip++] = b;
      indices[ip++] = b;
      indices[ip++] = c;
      indices[ip++] = d;
    }
  }
  return { positions, normals, uvs, indices };
}
