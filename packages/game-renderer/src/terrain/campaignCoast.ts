import { distanceTo } from "./distanceField";

import type { RenderMaskData } from "./campaignSource";

/** Never sample more coarsely than the supplied geography's narrowest pixel. */
export function campaignCoastCell(mask: RenderMaskData) {
  return Math.min(
    2,
    (mask.rect.max[0] - mask.rect.min[0]) / mask.width,
    (mask.rect.max[1] - mask.rect.min[1]) / mask.height,
  );
}

/** Extra endpoint covers alignment when geometry spacing is not a multiple of
 * the coast lattice. Geography signals do not change with mesh resolution. */
export function campaignCoastSize(meshSize: number, meshCell: number, coastCell = 2) {
  return Math.ceil(((meshSize - 1) * meshCell) / coastCell) + 2;
}

export function buildCampaignCoast(
  landAt: (x: number, y: number) => boolean,
  minX: number,
  minY: number,
  meshSize: number,
  meshCell: number,
  coastCell = 2,
) {
  const size = campaignCoastSize(meshSize, meshCell, coastCell);
  const ox = Math.floor(minX / coastCell) * coastCell,
    oy = Math.floor(minY / coastCell) * coastCell;
  const land = new Uint8Array(size * size);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++)
      land[j * size + i] = landAt(ox + i * coastCell, oy + j * coastCell) ? 1 : 0;
  const inland = distanceTo(land, size, size, 0, coastCell);
  const offshore = distanceTo(land, size, size, 1, coastCell);
  const sample = (values: Float32Array, x: number, y: number) => {
    const gx = (x - ox) / coastCell,
      gy = (y - oy) / coastCell;
    const i = Math.floor(gx),
      j = Math.floor(gy),
      u = gx - i,
      v = gy - j,
      k = j * size + i;
    return (
      (values[k] * (1 - u) + values[k + 1] * u) * (1 - v) +
      (values[k + size] * (1 - u) + values[k + size + 1] * u) * v
    );
  };
  return {
    inlandAt: (x: number, y: number) => sample(inland, x, y),
    offshoreAt: (x: number, y: number) => sample(offshore, x, y),
  };
}
