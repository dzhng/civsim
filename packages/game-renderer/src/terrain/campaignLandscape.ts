import type { SceneryInstance } from "./scenery";
import { buildCampaignCoast, campaignCoastSize } from "./campaignCoast";
import { campaignRelief, campaignNoise } from "./campaignRelief";
import type { CampaignTerrainField } from "../campaign/entityFrame";

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
  // Geometry height/land plus a resolution-independent coast land/two-distance grid.
  const coastSize = campaignCoastSize(paddedSize, cell);
  const scratchBytes = paddedSize * paddedSize * 5 + coastSize * coastSize * 9;
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
  const coast = buildCampaignCoast(
    (x, y) => source.renderLandAt(x, y),
    ox - halo * cell,
    oy - halo * cell,
    paddedSize,
    cell,
  );
  const { sample, heightAt: reliefHeight } = campaignRelief(source, cell);
  for (let j = 0; j < paddedSize; j++)
    for (let i = 0; i < paddedSize; i++) {
      const k = j * paddedSize + i,
        [x, y] = world(i, j);
      const height = reliefHeight(x, y, coast.inlandAt(x, y));
      heights[k] = land[k] ? height : 0;
    }
  const vertices = new Float32Array(size * size * 10);
  const surfaceColor = new Float32Array(size * size * 3),
    tint = new Float32Array(size * size);
  const indices = new Uint32Array((size - 1) ** 2 * 6);
  const shoreDistance = new Float32Array(size * size);
  const scenery: SceneryInstance[] = [];
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const k = j * size + i,
        p = (j + halo) * paddedSize + i + halo;
      const x = ox + i * cell,
        y = oy + j * cell;
      const dx = (heights[p + 1] - heights[p - 1]) / (2 * cell);
      const dy = (heights[p + paddedSize] - heights[p - paddedSize]) / (2 * cell);
      const length = Math.hypot(dx, dy, 1);
      const wet = (1 - land[p]) * (0.15 + 0.85 * smoothstep(0, 18, coast.offshoreAt(x, y)));
      shoreDistance[k] = land[p]
        ? Math.min(coastRange, coast.inlandAt(x, y))
        : -Math.min(coastRange, coast.offshoreAt(x, y));
      const moisture = sample(source.biome, 4, 0, x, y) / 255;
      const meadow = campaignNoise(x / 24 + 5, y / 24 - 11);
      const green = smoothstep(0.15, 0.65, moisture) * (0.45 + 0.55 * meadow);
      const sand = 1 - smoothstep(0, 8, coast.inlandAt(x, y));
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
      const groves = smoothstep(0.38, 0.7, campaignNoise(x / 29 + 8, y / 29 + 3));
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
