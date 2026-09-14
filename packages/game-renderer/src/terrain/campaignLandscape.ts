import type { CampaignTerrainField } from "../campaign/entityFrame";
import type { CampaignSceneryInstance } from "../campaign/sceneryPass";
import { createRenderedSurface, type LandscapeMesh } from "./surface";
import { hash2, smoothstep } from "../../../renderer-core/src/math";

let nextRevision = 0;
const coastRange = 18;

/** Explicit typed-array allocation sizes; excludes source, JS objects and GPU resources. */
export function campaignLandscapeAllocation(radius: number, cell: number) {
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(cell) || cell <= 0)
    throw new Error("Landscape radius and cell must be positive and finite");
  const size = Math.ceil((radius * 2) / cell) + 1;
  const halo = Math.ceil(coastRange / cell) + 2;
  const paddedSize = size + halo * 2;
  // Packed vertex (10), color (3), tint (1), shore (1), plus six indices per cell.
  const outputBytes = size * size * (10 + 3 + 1 + 1) * 4 + (size - 1) ** 2 * 6 * 4;
  // Height and both distance fields are Float32; land coverage is Uint8.
  const scratchBytes = paddedSize * paddedSize * (4 + 4 + 4 + 1);
  return {
    size,
    halo,
    paddedSize,
    outputBytes,
    scratchBytes,
    typedArrayBytes: outputBytes + scratchBytes,
  };
}

/** World-aligned presentation window over strategic geography, in kilometres.
 * The halo exceeds every coast/material influence plus one normal sample. */
export function buildCampaignLandscape(
  source: Pick<
    CampaignTerrainField,
    "w" | "h" | "cell" | "minX" | "maxY" | "height" | "biome" | "renderLandAt"
  >,
  center: [number, number],
  radius = 360,
  cell = 2,
) {
  const { size, halo, paddedSize } = campaignLandscapeAllocation(radius, cell);
  const ox = Math.floor((center[0] - radius) / cell) * cell;
  const oy = Math.floor((center[1] - radius) / cell) * cell;
  const count = paddedSize * paddedSize;
  const heights = new Float32Array(count);
  const land = new Uint8Array(count);
  const world = (i: number, j: number): [number, number] => [
    ox + (i - halo) * cell,
    oy + (j - halo) * cell,
  ];
  for (let j = 0; j < paddedSize; j++)
    for (let i = 0; i < paddedSize; i++)
      land[j * paddedSize + i] = source.renderLandAt(...world(i, j)) ? 1 : 0;
  const inland = distanceTo(land, paddedSize, 0, cell);
  const offshore = distanceTo(land, paddedSize, 1, cell);
  const sample = (
    values: ArrayLike<number>,
    stride: number,
    channel: number,
    x: number,
    y: number,
  ) => {
    const gx = Math.max(0, Math.min(source.w - 1, (x - source.minX) / source.cell - 0.5));
    const gy = Math.max(0, Math.min(source.h - 1, (source.maxY - y) / source.cell - 0.5));
    const ix = Math.floor(gx),
      iy = Math.floor(gy);
    const jx = Math.min(ix + 1, source.w - 1),
      jy = Math.min(iy + 1, source.h - 1);
    const get = (i: number, j: number) => values[(j * source.w + i) * stride + channel];
    return mix(
      mix(get(ix, iy), get(jx, iy), gx - ix),
      mix(get(ix, jy), get(jx, jy), gx - ix),
      gy - iy,
    );
  };
  for (let j = 0; j < paddedSize; j++)
    for (let i = 0; i < paddedSize; i++) {
      const k = j * paddedSize + i,
        [x, y] = world(i, j);
      const envelope = Math.max(0, sample(source.height, 1, 0, x, y) - 2.2);
      const wx = x + (noise(x / 75, y / 75) - 0.5) * 30;
      const wy = y + (noise(x / 75 + 13, y / 75 + 7) - 0.5) * 30;
      const ridge = (scale: number) => 1 - Math.abs(2 * noise(wx / scale, wy / scale) - 1);
      const folds = 0.24 + 0.52 * ridge(60) ** 2 + 0.18 * ridge(28) ** 2 + 0.06 * ridge(13);
      const foothill = 0.5 + noise(x / 18, y / 18) * 1.1;
      heights[k] = (foothill + envelope * 2.5 * folds) * land[k] * smoothstep(0, 6, inland[k]);
    }
  const vertices = new Float32Array(size * size * 10);
  const surfaceColor = new Float32Array(size * size * 3),
    tint = new Float32Array(size * size);
  const indices = new Uint32Array((size - 1) ** 2 * 6);
  const shoreDistance = new Float32Array(size * size);
  const scenery: CampaignSceneryInstance[] = [];
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const k = j * size + i,
        p = (j + halo) * paddedSize + i + halo;
      const x = ox + i * cell,
        y = oy + j * cell;
      const dx = (heights[p + 1] - heights[p - 1]) / (2 * cell);
      const dy = (heights[p + paddedSize] - heights[p - paddedSize]) / (2 * cell);
      const length = Math.hypot(dx, dy, 1);
      const wet = (1 - land[p]) * (0.15 + 0.85 * smoothstep(0, 18, offshore[p]));
      shoreDistance[k] = land[p]
        ? Math.min(coastRange, inland[p])
        : -Math.min(coastRange, offshore[p]);
      const moisture = sample(source.biome, 4, 0, x, y) / 255;
      const meadow = noise(x / 24 + 5, y / 24 - 11);
      const green = smoothstep(0.15, 0.65, moisture) * (0.45 + 0.55 * meadow);
      const sand = 1 - smoothstep(0, 8, inland[p]);
      const color = [mix(0.65, 0.46, green), mix(0.61, 0.55, green), mix(0.3, 0.23, green)];
      for (let c = 0; c < 3; c++) color[c] = mix(color[c], [0.72, 0.65, 0.45][c], sand);
      vertices.set(
        [x, y, heights[p], -dx / length, -dy / length, 1 / length, ...color, wet],
        k * 10,
      );
      surfaceColor.set(color, k * 3);
      if (i < size - 1 && j < size - 1)
        indices.set([k, k + size, k + 1, k + 1, k + size, k + size + 1], (j * (size - 1) + i) * 6);
      const forest = sample(source.biome, 4, 1, x, y) / 255;
      const groves = smoothstep(0.38, 0.7, noise(x / 29 + 8, y / 29 + 3));
      const suitable =
        (0.012 + forest * 0.055) * groves * (1 - smoothstep(0.25, 0.75, Math.hypot(dx, dy)));
      // Identity comes from the world lattice, never the loaded window's indices.
      const wi = Math.round(x / cell),
        wj = Math.round(y / cell);
      if (wet < 0.01 && sand < 0.4 && hash2(wi * 7, wj * 13) < suitable) {
        const tx = x + (hash2(wi + 3, wj) - 0.5) * cell,
          ty = y + (hash2(wi, wj + 5) - 0.5) * cell;
        if (
          tx < ox ||
          ty < oy ||
          tx >= ox + (size - 1) * cell ||
          ty >= oy + (size - 1) * cell ||
          !source.renderLandAt(tx, ty, 1)
        )
          continue;
        scenery.push({
          x: tx,
          y: ty,
          z: 0,
          kind: "broadleaf",
          size: 7 + hash2(wi, wj) * 3,
          height: 5 + hash2(wj, wi) * 2.5,
          yaw: hash2(wi + 1, wj) * Math.PI * 2,
          shade: 0.5,
        });
      }
    }
  const mesh: LandscapeMesh = {
    vertices,
    surfaceColor,
    tint,
    indices,
    triangles: indices.length / 3,
  };
  const surface = createRenderedSurface(
    mesh,
    { ox, oy, columns: size, rows: size, cell, units: "kilometers" },
    `campaign:${nextRevision++}`,
  );
  for (const tree of scenery) tree.z = surface.sampleRendered(tree.x, tree.y)!.position[2];
  return { surface, scenery, shoreDistance };
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function noise(x: number, y: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    tx = x - ix,
    ty = y - iy;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const gradient = (gx: number, gy: number, dx: number, dy: number) => {
    const angle = hash2(gx, gy) * Math.PI * 2;
    return Math.cos(angle) * dx + Math.sin(angle) * dy;
  };
  return (
    0.5 +
    0.7 *
      mix(
        mix(gradient(ix, iy, tx, ty), gradient(ix + 1, iy, tx - 1, ty), fade(tx)),
        mix(gradient(ix, iy + 1, tx, ty - 1), gradient(ix + 1, iy + 1, tx - 1, ty - 1), fade(tx)),
        fade(ty),
      )
  );
}

function distanceTo(mask: Uint8Array, size: number, target: number, cell: number): Float32Array {
  const distance = Float32Array.from(mask, (value) => (value === target ? 0 : size * cell));
  for (const direction of [1, -1]) {
    for (let row = 0; row < size; row++) {
      const y = direction === 1 ? row : size - 1 - row;
      for (let col = 0; col < size; col++) {
        const x = direction === 1 ? col : size - 1 - col;
        const k = y * size + x;
        for (const [dx, dy] of [
          [-direction, 0],
          [0, -direction],
          [-direction, -direction],
          [direction, -direction],
        ]) {
          const nx = x + dx,
            ny = y + dy;
          if (nx >= 0 && nx < size && ny >= 0 && ny < size)
            distance[k] = Math.min(
              distance[k],
              distance[ny * size + nx] + cell * Math.hypot(dx, dy),
            );
        }
      }
    }
  }
  return distance;
}
