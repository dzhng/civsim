import { distanceTo } from "./distanceField";

const COAST_CELL = 2;

/** Extra endpoint covers alignment when geometry spacing is not a multiple of
 * the coast lattice. Geography signals do not change with mesh resolution. */
export function campaignCoastSize(meshSize: number, meshCell: number) {
  return Math.ceil(((meshSize - 1) * meshCell) / COAST_CELL) + 2;
}

export function buildCampaignCoast(
  landAt: (x: number, y: number) => boolean,
  minX: number,
  minY: number,
  meshSize: number,
  meshCell: number,
) {
  const size = campaignCoastSize(meshSize, meshCell);
  const ox = Math.floor(minX / COAST_CELL) * COAST_CELL,
    oy = Math.floor(minY / COAST_CELL) * COAST_CELL;
  const land = new Uint8Array(size * size);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++)
      land[j * size + i] = landAt(ox + i * COAST_CELL, oy + j * COAST_CELL) ? 1 : 0;
  const inland = distanceTo(land, size, size, 0, COAST_CELL);
  const offshore = distanceTo(land, size, size, 1, COAST_CELL);
  const sample = (values: Float32Array, x: number, y: number) => {
    const gx = (x - ox) / COAST_CELL,
      gy = (y - oy) / COAST_CELL;
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
