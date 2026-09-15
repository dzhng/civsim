/**
 * The single spatial rule that splits the ground between the two grass fields.
 *
 * Both fields are sampled from the same world, so every cell has to belong to
 * exactly one of them: a cell both fields draw carries double the authored
 * density, a cell neither draws goes bald. The focus field's unit of residency
 * is a whole tile, so the rule is quantised to tiles - a tile belongs to the
 * focus field when the published coverage disc reaches any part of it, and to
 * the base field otherwise. Testing a record's own position against the disc
 * instead disagrees with the tile set by up to a tile diagonal, and that
 * disagreement is precisely the overlap crescent this quantisation removes.
 *
 * The same formula is evaluated in three more places, and all four must agree:
 * the TSL route pass in `bladeFieldLayer.ts`, the WGSL route pass in
 * `apps/battle-perf-lab/src/shaders/grass.ts`, and the layer's CPU tier mirror.
 */
export interface GrassRouteMask {
  center: readonly [number, number];
  radiusSq: number;
  /** Residency tile edge in metres. 0 tests the record position directly. */
  tileM: number;
  /** true keeps the records the coverage owns (the focus field); false keeps
   *  everything it does not (the base field). The two senses of one mask are
   *  what makes the split a partition rather than two independent tests. */
  keepInside: boolean;
  enabled: boolean;
}

/**
 * How far inside the resident tile set the published mask sits. The GPU
 * evaluates the coverage test in f32 and the sampler chose its tiles in f64, so
 * a tile sitting exactly on the radius could be claimed by the GPU and never
 * have been sampled - a hole. A margin far larger than f32's error at this
 * radius, and far smaller than anything visible, removes that case.
 */
export const GRASS_COVERAGE_MARGIN_M = 0.0625;

/** Squared distance from a disc centre to the nearest point of tile `tx, ty`. */
export function tileCentreDistanceSq(
  centerX: number,
  centerY: number,
  tileM: number,
  tx: number,
  ty: number,
): number {
  const nx = Math.max(tx * tileM, Math.min(centerX, (tx + 1) * tileM));
  const ny = Math.max(ty * tileM, Math.min(centerY, (ty + 1) * tileM));
  return (nx - centerX) * (nx - centerX) + (ny - centerY) * (ny - centerY);
}

/** Whether the coverage owns the ground under `x, y`, tile-quantised. */
export function routeMaskCovers(mask: GrassRouteMask, x: number, y: number): boolean {
  if (mask.tileM <= 0) {
    const dx = x - mask.center[0];
    const dy = y - mask.center[1];
    return dx * dx + dy * dy <= mask.radiusSq;
  }
  const distanceSq = tileCentreDistanceSq(
    mask.center[0],
    mask.center[1],
    mask.tileM,
    Math.floor(x / mask.tileM),
    Math.floor(y / mask.tileM),
  );
  return distanceSq <= mask.radiusSq;
}

/** The route-pass admission test both fields share. */
export function recordSurvivesRouteMask(
  mask: GrassRouteMask | null,
  x: number,
  y: number,
): boolean {
  if (!mask || !mask.enabled) return true;
  return routeMaskCovers(mask, x, y) === mask.keepInside;
}
