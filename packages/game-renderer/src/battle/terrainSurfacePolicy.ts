import { terrainHeightAt, type TerrainHeightField } from "../terrain/heightField";
import { vistaSurfaceHeightAt, type BattleVistaGrid } from "./vistaSurface";
/** Cues use the union of playable and vista heights; soldier seating uses the playable field alone. */
export function battleTerrainHeightAt(
  field: TerrainHeightField | null,
  vista: BattleVistaGrid | null,
  rect: readonly [number, number, number, number],
  x: number,
  y: number,
): number {
  const playable = field ? terrainHeightAt(field, x, y) : 0;
  const distant = vista ? vistaSurfaceHeightAt(vista, x, y) : null;
  const [x0, y0, w, h] = rect;
  const inside = x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;
  return inside
    ? distant === null
      ? playable
      : Math.max(playable, distant)
    : (distant ?? playable);
}
export function expandedBattleTerrainRect([x, y, w, h]: readonly [
  number,
  number,
  number,
  number,
]): [number, number, number, number] {
  const margin = Math.max(120, Math.max(w, h) * 0.22);
  return [x - margin, y - margin, w + margin * 2, h + margin * 2];
}
