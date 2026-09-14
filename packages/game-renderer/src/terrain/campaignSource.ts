// Must match crates/mapgen/src/raster.rs. Mountain height is graded later by range
// size (interior of a broad mass climbs higher than a narrow ridge).
export const PALETTE: { c: [number, number, number]; land: boolean; h: number }[] = [
  { c: [38, 60, 84], land: false, h: 0 }, // sea
  { c: [196, 178, 138], land: true, h: 2.2 }, // land
  { c: [142, 120, 96], land: true, h: 6 }, // mountain (base, graded below)
  { c: [52, 84, 110], land: false, h: 0 }, // lake
  { c: [60, 96, 124], land: true, h: 1.0 }, // river (still territory-worthy land)
];

// The committed bake probe stores grid coordinates rounded to 0.001 km after
// sampling the unrounded point; keep edge samples stable across that loss.
const PROBE_COORD_EPSILON_KM = 0.0005;

export interface BgWorldRect {
  min: [number, number];
  max: [number, number];
}

export function nearestPaletteIndex(r: number, g: number, b: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < PALETTE.length; k++) {
    const c = PALETTE[k].c;
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

export class RenderMask {
  readonly width: number;
  readonly height: number;
  readonly rect: BgWorldRect;
  readonly land: Uint8Array;

  constructor(rgba: ArrayLike<number>, width: number, height: number, rect: BgWorldRect) {
    const n = width * height;
    if (rgba.length < n * 4) {
      throw new Error(`RenderMask needs ${n * 4} RGBA bytes, got ${rgba.length}`);
    }
    this.width = width;
    this.height = height;
    this.rect = { min: [rect.min[0], rect.min[1]], max: [rect.max[0], rect.max[1]] };
    this.land = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const best = nearestPaletteIndex(rgba[o], rgba[o + 1], rgba[o + 2]);
      this.land[i] = PALETTE[best].land ? 1 : 0;
    }
  }

  landAt(wx: number, wy: number, marginKm = 0): boolean {
    return renderMaskLandAt(this, wx, wy, marginKm);
  }
}

export interface RenderMaskData {
  width: number;
  height: number;
  rect: BgWorldRect;
  land: Uint8Array;
}

export function renderMaskLandAt(
  mask: RenderMaskData,
  wx: number,
  wy: number,
  marginKm = 0,
): boolean {
  if (marginKm > 0) {
    const samples: [number, number][] = [
      [0, 0],
      [-marginKm, 0],
      [marginKm, 0],
      [0, -marginKm],
      [0, marginKm],
    ];
    return samples.every(([dx, dy]) => renderMaskLandAt(mask, wx + dx, wy + dy));
  }
  const p = renderMaskPixelOf(mask, wx, wy);
  if (p === null) return false;
  return mask.land[p.y * mask.width + p.x] === 1;
}

function renderMaskPixelOf(
  mask: RenderMaskData,
  wx: number,
  wy: number,
): { x: number; y: number } | null {
  const {
    min: [minX, minY],
    max: [maxX, maxY],
  } = mask.rect;
  if (
    wx < minX - PROBE_COORD_EPSILON_KM ||
    wx > maxX + PROBE_COORD_EPSILON_KM ||
    wy < minY - PROBE_COORD_EPSILON_KM ||
    wy > maxY + PROBE_COORD_EPSILON_KM
  ) {
    return null;
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const x = Math.min(mask.width - 1, Math.max(0, Math.floor(((wx - minX) * mask.width) / spanX)));
  const y = Math.min(mask.height - 1, Math.max(0, Math.floor(((maxY - wy) * mask.height) / spanY)));
  return { x, y };
}

/** Structured-clone data; classification is performed once by the input adapter. */
export interface CampaignLandscapeSnapshot {
  w: number;
  h: number;
  cell: number;
  minX: number;
  maxY: number;
  height: Float32Array;
  biome: Uint8Array;
  renderMask: RenderMaskData;
}

export function snapshotCampaignLandscape(
  source: CampaignLandscapeSnapshot,
): CampaignLandscapeSnapshot {
  const { w, h, cell, minX, maxY, height, biome, renderMask } = source;
  return {
    w,
    h,
    cell,
    minX,
    maxY,
    height: height.slice(),
    biome: biome.slice(),
    renderMask: {
      width: renderMask.width,
      height: renderMask.height,
      rect: { min: [...renderMask.rect.min], max: [...renderMask.rect.max] },
      land: renderMask.land.slice(),
    },
  };
}

export function campaignLandscapeSource(snapshot: CampaignLandscapeSnapshot) {
  return {
    ...snapshot,
    renderLandAt: (x: number, y: number, margin = 0) =>
      renderMaskLandAt(snapshot.renderMask, x, y, margin),
  };
}
