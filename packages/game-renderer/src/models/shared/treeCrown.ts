import { buildLeafAtlas } from "./leafAtlas";
import { MeshBuilder, type MeshData, type Rgb } from "./meshBuilder";

/** A continuous lobed crown over the shared tree trunk. The
 * closed inner volume retains coverage when leaf cards become subpixel. */
export function buildTreeCrown(
  high: number,
  bark: Rgb,
  color: Rgb,
  shadowRadius: number,
  species: string,
  seed: number,
  detailed: boolean,
): MeshData {
  const trunk = new MeshBuilder();
  trunk.cone([0, 0, high * 0.31], high * 0.035, high * 0.62, 7, bark, bark, seed);
  trunk.shadow(shadowRadius);
  const source = trunk.finish("tree trunk");
  const vertices = Array.from(source.opaque.vertices),
    indices = Array.from(source.opaque.indices);
  const uvs = Array.from({ length: vertices.length / 5 }, () => -1);
  const conifer = species === "conifer";
  const low =
    high *
    (species === "bush"
      ? 0.06
      : species === "broadleaf"
        ? 0.46
        : species === "conifer"
          ? 0.32
          : 0.4);
  const height = high - low;
  const wide =
    high *
    (species === "bush"
      ? 0.62
      : species === "broadleaf"
        ? 0.42
        : species === "ash"
          ? 0.34
          : species === "aspen"
            ? 0.25
            : 0.34);
  const lobes: number[][] = [];
  const lobeCount = species === "aspen" ? 8 : 6;
  for (let i = 0; i < lobeCount; i++) {
    const angle = i * 2.39996 + seed * 0.7;
    const z = -0.5 + i / (lobeCount - 1) + Math.sin(seed * 3 + i * 1.7) * 0.08;
    const xy = Math.sqrt(1 - z * z);
    lobes.push([
      Math.cos(angle) * xy * 0.68,
      Math.sin(angle) * xy * 0.68,
      z * 0.68,
      0.44 + Math.sin(seed * 4 + i * 3) * 0.04,
    ]);
  }
  const sides = 20,
    rings = 14;
  const base = vertices.length / 10;
  for (let row = 0; row <= rings; row++) {
    const t = row / rings;
    const latitude = (t - 0.5) * Math.PI;
    for (let col = 0; col < sides; col++) {
      const angle = (col / sides) * Math.PI * 2;
      const dx = Math.cos(latitude) * Math.cos(angle),
        dy = Math.cos(latitude) * Math.sin(angle),
        dz = Math.sin(latitude);
      let radial = 0.65;
      for (const lobe of lobes) {
        const along = dx * lobe[0] + dy * lobe[1] + dz * lobe[2];
        const discriminant = lobe[3] ** 2 - (0.68 ** 2 - along ** 2);
        if (discriminant > 0) radial = Math.max(radial, along + Math.sqrt(discriminant));
      }
      let x = dx * radial * wide,
        y = dy * radial * wide,
        z = low + height * (0.5 + dz * radial * 0.5);
      if (conifer) {
        const profile = Math.pow(1 - t, 0.85) * Math.min(1, t * 7);
        const needles = 1 + 0.07 * Math.sin(angle * 7 + seed) + 0.055 * Math.cos(t * 38);
        x = Math.cos(angle) * wide * profile * needles;
        y = Math.sin(angle) * wide * profile * needles;
        z = low + height * t;
      }
      vertices.push(x, y, z, 0, 0, 0, ...color, 1);
      uvs.push(-1, -1);
    }
  }
  const crownStart = indices.length;
  for (let row = 0; row < rings; row++)
    for (let col = 0; col < sides; col++) {
      const a = base + row * sides + col,
        b = base + row * sides + ((col + 1) % sides);
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  for (let i = crownStart; i < indices.length; i += 3) {
    const a = indices[i] * 10,
      b = indices[i + 1] * 10,
      c = indices[i + 2] * 10;
    const ux = vertices[b] - vertices[a],
      uy = vertices[b + 1] - vertices[a + 1],
      uz = vertices[b + 2] - vertices[a + 2];
    const vx = vertices[c] - vertices[a],
      vy = vertices[c + 1] - vertices[a + 1],
      vz = vertices[c + 2] - vertices[a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const v of [a, b, c])
      for (let axis = 0; axis < 3; axis++) vertices[v + 3 + axis] += n[axis];
  }
  for (let i = base * 10; i < vertices.length; i += 10) {
    const length = Math.hypot(vertices[i + 3], vertices[i + 4], vertices[i + 5]) || 1;
    for (let axis = 3; axis < 6; axis++) vertices[i + axis] /= length;
  }
  if (detailed) {
    const region = buildLeafAtlas().regions[conifer ? "needle" : "cluster"];
    const crownEnd = vertices.length;
    for (let i = base * 10 + sides * 10; i < crownEnd - sides * 10; i += 10) {
      for (let leaf = 0; leaf < 4; leaf++) {
        const sample = i + leaf * 97;
        const column = (i / 10 - base) % sides;
        const neighbor = column === sides - 1 ? i - (sides - 1) * 10 : i + 10;
        const blend = (leaf % 2) * 0.5;
        const anchor = [0, 1, 2, 3, 4, 5].map(
          (axis) => vertices[i + axis] * (1 - blend) + vertices[neighbor + axis] * blend,
        );
        const n = [
          anchor[3] + Math.sin(sample * 3.1 + seed) * 0.65,
          anchor[4] + Math.sin(sample * 7.7 + seed) * 0.65,
          anchor[5] + Math.sin(sample * 11.3 + seed) * 0.65,
        ];
        const magnitude = Math.hypot(...n) || 1;
        const [nx, ny, nz] = n.map((v) => v / magnitude);
        const length = Math.hypot(nx, ny) || 1;
        const tx = -ny / length,
          ty = nx / length;
        const bx = -nz * ty,
          by = nz * tx,
          bz = nx * ty - ny * tx;
        const leafSize = high * (0.055 + 0.015 * Math.sin(sample + seed));
        const angle = sample * 2.39996 + seed;
        const ca = Math.cos(angle),
          sa = Math.sin(angle);
        const jitterU = Math.sin(sample * 1.7 + seed) * 0.25,
          jitterV = Math.sin(sample * 2.9 + seed) * 0.25;
        const start = vertices.length / 10;
        for (const [u, v] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const du = u * ca - v * sa + jitterU,
            dv = u * sa + v * ca + jitterV;
          // Shade the foliage as part of the crown, not as disconnected flat cards.
          vertices.push(
            anchor[0] - anchor[3] * leafSize * 0.2 + (tx * du + bx * dv) * leafSize,
            anchor[1] - anchor[4] * leafSize * 0.2 + (ty * du + by * dv) * leafSize,
            anchor[2] - anchor[5] * leafSize * 0.2 + bz * dv * leafSize,
            anchor[3],
            anchor[4],
            anchor[5],
            ...color,
            1,
          );
          uvs.push(u < 0 ? region.u0 : region.u1, v < 0 ? region.v0 : region.v1);
        }
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      }
    }
  }

  return {
    opaque: {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      indexCount: indices.length,
      uvs: new Float32Array(uvs),
    },
    shadow: source.shadow,
  };
}
