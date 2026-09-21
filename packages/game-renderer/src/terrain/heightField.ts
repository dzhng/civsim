// The shared terrain-surface sampler. Battle reads it from the sim terrain
// (meters), campaign adapts its stylized relief (kilometers); both speak the
// same small contract so soldiers, shadows, props, roads, and — later — vision
// and projectiles can sit on the ground through one bilinear sampler instead of
// a per-surface guess. This is a typed VIEW over height data the canonical
// terrain owns, never the authoritative store.

type TerrainHeightUnits = 'meters' | 'kilometers' | 'visual';

export interface TerrainHeightField {
  w: number;
  h: number;
  /** World size of one cell, in the field's native units. */
  cell: number;
  /** World position of the grid's (0,0) CORNER. Cell c is centered at ox + (c+0.5)*cell. */
  ox: number;
  oy: number;
  /** Row-major (`row * w + col`), length `w*h`, in native `units`. */
  height: Float32Array;
  units: TerrainHeightUnits;
  /** Multiplier from native height units to rendered world Z. */
  verticalScale: number;
}

/** A dead-flat field over a world rect — for maps/fixtures declared flat. */
export function flatHeightField(
  ox: number,
  oy: number,
  w: number,
  h: number,
  cell: number,
  units: TerrainHeightUnits = 'meters',
): TerrainHeightField {
  return { w, h, cell, ox, oy, height: new Float32Array(Math.max(1, w * h)), units, verticalScale: 1 };
}

/**
 * Rendered ground elevation (world Z) at world (x,y): bilinear between the four
 * surrounding cell centers, with sample coordinates clamped to the edge cells so
 * a point just off the field seats at the nearest edge height rather than
 * dropping to zero. Matches `sim::Terrain::height_at` so the renderer and the
 * sim agree on where the ground is.
 */
export function terrainHeightAt(field: TerrainHeightField, x: number, y: number): number {
  const { w, h, cell, ox, oy, height, verticalScale } = field;
  if (w === 0 || h === 0) return 0;
  const gx = clamp((x - ox) / cell - 0.5, 0, w - 1);
  const gy = clamp((y - oy) / cell - 0.5, 0, h - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const top = lerp(height[y0 * w + x0], height[y0 * w + x1], tx);
  const bot = lerp(height[y1 * w + x0], height[y1 * w + x1], tx);
  return lerp(top, bot, ty) * verticalScale;
}

/** Unit surface normal at world (x,y), derived from the shared height sampler. */
export function terrainNormalAt(field: TerrainHeightField, x: number, y: number, sampleDistance = field.cell): [number, number, number] {
  const d = Math.max(0.001, sampleDistance);
  // At an edge, clamping samples shortens their separation. Dividing by 2d
  // would flatten steep boundary cells and admit vegetation onto those faces.
  const x0 = Math.max(field.ox + field.cell * 0.5, x - d);
  const x1 = Math.min(field.ox + (field.w - 0.5) * field.cell, x + d);
  const y0 = Math.max(field.oy + field.cell * 0.5, y - d);
  const y1 = Math.min(field.oy + (field.h - 0.5) * field.cell, y + d);
  const nx = x1 > x0 ? -(terrainHeightAt(field, x1, y) - terrainHeightAt(field, x0, y)) / (x1 - x0) : 0;
  const ny = y1 > y0 ? -(terrainHeightAt(field, x, y1) - terrainHeightAt(field, x, y0)) / (y1 - y0) : 0;
  const nz = 1;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/** Lowest and highest rendered ground Z across the field. Shadow fitting needs
 * the datum, not just the relief: a light-space volume has to enclose the ground
 * it shades, wherever that ground sits. */
export function heightFieldRange(field: TerrainHeightField): [number, number] {
  if (field.height.length === 0) return [0, 0];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < field.height.length; i++) {
    const v = field.height[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo * field.verticalScale, hi * field.verticalScale];
}

/** Peak-to-trough relief across the field, in rendered world Z. */
export function heightSpan(field: TerrainHeightField): number {
  const [lo, hi] = heightFieldRange(field);
  return hi - lo;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
