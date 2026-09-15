import type { SurfaceDomain } from "../../../game-renderer/src/terrain/surface";
import type { TerrainTileRequest } from "./terrainTiles";

export const TERRAIN_DETAIL_LIMIT = 16;

/** The world overview aligns with detail regions and covers the complete source rectangle. */
export function campaignOverviewRequest(rect: {
  min: [number, number];
  max: [number, number];
}): TerrainTileRequest {
  const minX = Math.floor(rect.min[0] / 128) * 128;
  const minY = Math.floor(rect.min[1] / 128) * 128;
  const size = Math.ceil(Math.max(rect.max[0] - minX, rect.max[1] - minY) / 128) * 128;
  return { key: "overview", minX, minY, size, cell: 32 };
}

/** Stable world-grid identities survive camera motion. The bounded nearest
 * visible set refines the focus; every other location retains coarse coverage. */
export function terrainViewRequests(
  view: { x: number; y: number; zoom: number; width: number; height: number },
  coarse: SurfaceDomain,
): TerrainTileRequest[] {
  if (view.zoom < 0.8) return [];
  const size = 128,
    cell = 2;
  const rx = Math.min(4, Math.ceil(view.width / view.zoom / size / 2));
  const ry = Math.min(4, Math.ceil(view.height / view.zoom / size));
  const cx = Math.floor(view.x / size),
    cy = Math.floor(view.y / size);
  const result: TerrainTileRequest[] = [];
  for (let y = cy - ry; y <= cy + ry; y++)
    for (let x = cx - rx; x <= cx + rx; x++) {
      const minX = x * size,
        minY = y * size;
      if (
        minX < coarse.ox ||
        minY < coarse.oy ||
        minX + size > coarse.ox + (coarse.columns - 1) * coarse.cell ||
        minY + size > coarse.oy + (coarse.rows - 1) * coarse.cell
      )
        continue;
      result.push({ key: `${x}:${y}:${cell}`, minX, minY, size, cell });
    }
  const distance = (r: TerrainTileRequest) =>
    (r.minX + size / 2 - view.x) ** 2 + (r.minY + size / 2 - view.y) ** 2;
  return result.sort((a, b) => distance(a) - distance(b)).slice(0, TERRAIN_DETAIL_LIMIT);
}
