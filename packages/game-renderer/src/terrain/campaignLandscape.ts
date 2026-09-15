import { buildCampaignCoast, campaignCoastSize, campaignCoastCell } from "./campaignCoast";
import { campaignRelief, campaignNoise } from "./campaignRelief";
import { conformShoreline } from "./shorelineMesh";
import type { RenderMaskData } from "./campaignSource";
import type { CampaignTerrainField } from "../campaign/entityFrame";

import { createRenderedSurface, type LandscapeMesh } from "./surface";
import { smoothstep } from "../../../renderer-core/src/math";

let nextRevision = 0;
const coastRange = 18;

/** Regular build and coast scratch only; final shoreline allocation is counted during generation.
 * Excludes shared source, JS objects and GPU resources. */
export function campaignLandscapeAllocation(radius: number, cell: number, coastCell = 2) {
  if (
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isFinite(cell) ||
    cell <= 0 ||
    !Number.isFinite(coastCell) ||
    coastCell <= 0
  )
    throw new Error("Landscape radius and cell must be positive and finite");
  const size = Math.ceil((radius * 2) / cell) + 1;
  const halo = Math.ceil(coastRange / cell) + 2;
  const paddedSize = size + halo * 2;
  // Regular packed vertex plus six indices per cell.
  const outputBytes = size * size * 10 * 4 + (size - 1) ** 2 * 6 * 4;
  // Resolution-independent coast land/two-distance grid.
  const coastSize = campaignCoastSize(paddedSize, cell, coastCell);
  const scratchBytes = coastSize * coastSize * 9;
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
    "w" | "h" | "cell" | "minX" | "maxY" | "height" | "biome" | "renderWaterAt"
  > & { renderMask: RenderMaskData },
  center: [number, number],
  radius = 360,
  cell = 2,
  maxBytes = 128 * 1024 * 1024,
) {
  const coastCell = campaignCoastCell(source.renderMask);
  const allocation = campaignLandscapeAllocation(radius, cell, coastCell);
  const { size, halo, paddedSize } = allocation;
  if (
    !Number.isFinite(maxBytes) ||
    maxBytes > 128 * 1024 * 1024 ||
    maxBytes <= allocation.typedArrayBytes
  )
    throw new Error("Campaign landscape generation exceeds its typed-array allowance");
  const ox = Math.floor((center[0] - radius) / cell) * cell;
  const oy = Math.floor((center[1] - radius) / cell) * cell;
  const coast = buildCampaignCoast(
    (x, y) => !source.renderWaterAt(x, y),
    ox - halo * cell,
    oy - halo * cell,
    paddedSize,
    cell,
    coastCell,
  );
  const { sample, heightAt: reliefHeight } = campaignRelief(source, 2);
  const colorAt = (x: number, y: number) => {
    const moisture = sample(source.biome, 4, 0, x, y) / 255;
    const meadow = campaignNoise(x / 24 + 5, y / 24 - 11);
    const green = smoothstep(0.15, 0.65, moisture) * (0.45 + 0.55 * meadow);
    const sand = 1 - smoothstep(0, 8, coast.inlandAt(x, y));
    const color = [mix(0.65, 0.46, green), mix(0.61, 0.55, green), mix(0.3, 0.23, green)];
    for (let c = 0; c < 3; c++) color[c] = mix(color[c], [0.72, 0.65, 0.45][c], sand);
    return color;
  };
  const vertices = new Float32Array(size * size * 10);
  const indices = new Uint32Array((size - 1) ** 2 * 6);

  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      // The regular cells supply bounded XY lookup; conformation owns final
      // heights, normals, coverage and world-sampled albedo.
      vertices.set([ox + i * cell, oy + j * cell, 0, 0, 0, 1], k * 10);
      if (i < size - 1 && j < size - 1)
        indices.set([k, k + size, k + 1, k + 1, k + size, k + size + 1], (j * (size - 1) + i) * 6);
    }
  const mesh: LandscapeMesh = {
    vertices,
    indices,
    triangles: indices.length / 3,
  };
  const surface = createRenderedSurface(
    mesh,
    { ox, oy, columns: size, rows: size, cell, units: "kilometers" },
    `campaign:${nextRevision++}`,
  );
  // The old regular surface and coast scratch remain live during conformation.
  // Reserve the final per-vertex shore array alongside the topology count.
  const conformed = conformShoreline(
    surface,
    source.renderMask,
    maxBytes - allocation.typedArrayBytes,
    (x, y) => reliefHeight(x, y, coast.inlandAt(x, y)),
    4,
  );
  const shoreDistance = new Float32Array(conformed.mesh.vertices.length / 10);
  for (let k = 0; k < shoreDistance.length; k++) {
    const x = conformed.mesh.vertices[k * 10],
      y = conformed.mesh.vertices[k * 10 + 1];
    const color = colorAt(x, y);
    conformed.mesh.vertices.set(color, k * 10 + 6);
    shoreDistance[k] = conformed.mesh.waterCoverage![k]
      ? -Math.min(coastRange, coast.offshoreAt(x, y))
      : Math.min(coastRange, coast.inlandAt(x, y));
  }
  return {
    surface: createRenderedSurface(
      { ...conformed.mesh, shoreDistance },
      surface.domain,
      surface.revision,
    ),
    generationBytes: allocation.typedArrayBytes + conformed.typedBytes + shoreDistance.byteLength,
  };
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
