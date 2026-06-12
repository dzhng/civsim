// Terrain field derived from the background raster. mapgen paints the bg PNG
// from a fixed palette (sea/land/mountain/lake/river — see crates/mapgen/src/raster.rs),
// so classifying pixels back into classes gives us a land mask and a stylized
// heightmap without touching the asset pipeline. Heights are visual relief
// (massively exaggerated, like every campaign map), not real elevation.

import type { CampaignData } from './data';

// Must match crates/mapgen/src/raster.rs. Mountain height is graded later by range
// size (interior of a broad mass climbs higher than a narrow ridge).
const PALETTE: { c: [number, number, number]; land: boolean; h: number }[] = [
  { c: [38, 60, 84], land: false, h: 0 }, // sea
  { c: [196, 178, 138], land: true, h: 2.2 }, // land
  { c: [142, 120, 96], land: true, h: 6 }, // mountain (base, graded below)
  { c: [52, 84, 110], land: false, h: 0 }, // lake
  { c: [60, 96, 124], land: true, h: 1.0 }, // river (still territory-worthy land)
];

/** The one campaign sun (normalized): the bake below and Terrain3D's
 * specular uniform must agree, or water glints contradict the relief. */
/** North of this y (km) the climate turns boreal: snowline, conifers,
 * moisture curve. The terrain3d fragment shader carries the literal 700.0
 * twice (GLSL can't import) — change one, change all three. */
export const TEMPERATE_Y_KM = 700;

export const SUN: [number, number, number] = (() => {
  const s = [-0.42, 0.4, 0.81];
  const l = Math.hypot(...s);
  return [s[0] / l, s[1] / l, s[2] / l];
})();

/** Deterministic [0,1) hash of a grid cell. */
export function hash2(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise over the cell grid, [0,1). */
function vnoise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const sx = (x - xi) ** 2 * (3 - 2 * (x - xi));
  const sy = (y - yi) ** 2 * (3 - 2 * (y - yi));
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function smooth01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Two-pass chamfer distance (in cells) to the nearest cell matching `isSrc`. */
function chamfer<T extends Uint8Array>(src: T, isSrc: (v: number) => boolean, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h).fill(1e9);
  for (let i = 0; i < w * h; i++) if (isSrc(src[i])) d[i] = 0;
  const D = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y > 0) d[i] = Math.min(d[i], d[i - w] + 1);
      if (x > 0 && y > 0) d[i] = Math.min(d[i], d[i - w - 1] + D);
      if (x < w - 1 && y > 0) d[i] = Math.min(d[i], d[i - w + 1] + D);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < h - 1) d[i] = Math.min(d[i], d[i + w] + 1);
      if (x < w - 1 && y < h - 1) d[i] = Math.min(d[i], d[i + w + 1] + D);
      if (x > 0 && y < h - 1) d[i] = Math.min(d[i], d[i + w - 1] + D);
    }
  }
  return d;
}

export class TerrainField {
  w: number;
  h: number;
  /** km per grid cell */
  cell: number;
  /** world coords of cell (0,0) center: north-west corner of the bg rect */
  minX: number;
  maxY: number;
  /** relief height in km, row 0 = north */
  height: Float32Array;
  /** 1 = land (territory-capable), 0 = water */
  land: Uint8Array;
  /** baked lambert light per cell, value = light * 128 (terrain is static) */
  light: Uint8Array;
  /** per-cell biome, RGBA: moisture, forest, rock, shore-distance (0=at water) */
  biome: Uint8Array;
  maxH = 0;

  constructor(data: CampaignData) {
    const r = data.bgRect;
    const spanX = r.max[0] - r.min[0];
    const spanY = r.max[1] - r.min[1];
    this.cell = 8; // km — bg is ~2 km/px; quarter res is plenty for relief
    this.w = Math.round(spanX / this.cell);
    this.h = Math.round(spanY / this.cell);
    this.minX = r.min[0];
    this.maxY = r.max[1];

    // Downsample the bg into the grid and classify by nearest palette color.
    const cv = new OffscreenCanvas(this.w, this.h);
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(data.bg, 0, 0, this.w, this.h);
    const px = ctx.getImageData(0, 0, this.w, this.h).data;
    const n = this.w * this.h;
    this.height = new Float32Array(n);
    this.land = new Uint8Array(n);
    const cls = new Uint8Array(n); // palette index, kept for the biome pass
    for (let i = 0; i < n; i++) {
      const [pr, pg, pb] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < PALETTE.length; k++) {
        const c = PALETTE[k].c;
        const d = (pr - c[0]) ** 2 + (pg - c[1]) ** 2 + (pb - c[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      cls[i] = best;
      this.height[i] = PALETTE[best].h;
      this.land[i] = PALETTE[best].land ? 1 : 0;
    }

    // Rivers are painted ~1 px wide at full bg resolution — the downsample
    // above blends them away. Re-scan the full-res raster and mark any cell
    // whose source block contains river pixels (the Nile must stay green).
    {
      const fcv = new OffscreenCanvas(data.bg.width, data.bg.height);
      const fctx = fcv.getContext('2d')!;
      fctx.drawImage(data.bg, 0, 0);
      const fpx = fctx.getImageData(0, 0, data.bg.width, data.bg.height).data;
      const rc = PALETTE[4].c;
      for (let sy = 0; sy < data.bg.height; sy++) {
        const gy = Math.min(this.h - 1, Math.floor((sy / data.bg.height) * this.h));
        for (let sx = 0; sx < data.bg.width; sx++) {
          const o = (sy * data.bg.width + sx) * 4;
          const d = (fpx[o] - rc[0]) ** 2 + (fpx[o + 1] - rc[1]) ** 2 + (fpx[o + 2] - rc[2]) ** 2;
          if (d < 900) {
            const gx = Math.min(this.w - 1, Math.floor((sx / data.bg.width) * this.w));
            const i = gy * this.w + gx;
            if (this.land[i]) cls[i] = 4;
          }
        }
      }
    }

    // Grade mountain height by how deep a cell sits inside its range — broad
    // masses (Alps) climb high, narrow ridges stay hills — then carve peaks
    // and valleys with ridged noise so a massif isn't a flat-topped plateau.
    const ridgeD = chamfer(cls, (v) => v !== 2, this.w, this.h);
    for (let gy = 0; gy < this.h; gy++) {
      for (let gx = 0; gx < this.w; gx++) {
        const i = gy * this.w + gx;
        if (cls[i] !== 2) continue;
        const crest = 1 - Math.abs(vnoise2(gx / 3.5 + 3.3, gy / 3.5 + 9.1) * 2 - 1);
        this.height[i] = 5 + Math.min(ridgeD[i], 6) * 3.9 * (0.35 + 0.95 * crest);
      }
    }

    // Smooth the class plateaus into slopes, roughen, smooth again lightly.
    this.blur(2);
    this.blur(2);
    this.blur(2);
    for (let i = 0; i < n; i++) {
      if (this.land[i]) {
        const x = i % this.w;
        const y = (i / this.w) | 0;
        this.height[i] += (hash2(x, y) - 0.5) * (0.6 + this.height[i] * 0.35);
      }
    }
    this.blur(1);
    // Water sits at (near) zero so the sea reads flat; coastal land keeps the
    // gentle rise the blur gave it.
    for (let i = 0; i < n; i++) {
      if (!this.land[i]) this.height[i] = 0;
      else if (this.height[i] < 0) this.height[i] = 0;
      if (this.height[i] > this.maxH) this.maxH = this.height[i];
    }

    // Bake the (static) sun lighting. Slopes are exaggerated a touch beyond
    // the geometry so relief reads even at gentle grades.
    this.light = new Uint8Array(n);
    const [sx2, sy2, sz2] = SUN;
    const { w, h, height, cell } = this;
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const i = gy * w + gx;
        const hx0 = height[gy * w + Math.max(0, gx - 1)];
        const hx1 = height[gy * w + Math.min(w - 1, gx + 1)];
        const hy0 = height[Math.max(0, gy - 1) * w + gx];
        const hy1 = height[Math.min(h - 1, gy + 1) * w + gx];
        const nx = ((hx0 - hx1) / (2 * cell)) * 1.6;
        const ny = ((hy1 - hy0) / (2 * cell)) * 1.6; // gy grows southward
        const inv = 1 / Math.hypot(nx, ny, 1);
        const lambert = Math.max(0, nx * inv * sx2 + ny * inv * sy2 + inv * sz2);
        this.light[i] = Math.min(255, (0.58 + 0.58 * lambert) * 128);
      }
    }

    // ---- Biome: moisture, forest, rock, shore distance --------------------
    // Moisture is a latitude gradient (Sahara dry, Gaul wet) lifted near
    // rivers (the Nile ribbon) and coasts, broken up by large-scale noise.
    const shoreD = chamfer(this.land, (v) => v === 0, w, h);
    const landD = chamfer(this.land, (v) => v === 1, w, h);
    const riverD = chamfer(cls, (v) => v === 4, w, h);
    this.biome = new Uint8Array(n * 4);
    for (let gy = 0; gy < h; gy++) {
      const wy = this.maxY - (gy + 0.5) * this.cell;
      // piecewise latitude base: desert south, temperate north
      const lat =
        wy < -400 ? 0.08 :
        wy < 100 ? 0.08 + ((wy + 400) / 500) * 0.3 :
        wy < TEMPERATE_Y_KM ? 0.38 + ((wy - 100) / 600) * 0.17 :
        Math.min(0.8, 0.55 + ((wy - TEMPERATE_Y_KM) / 1300) * 0.25);
      for (let gx = 0; gx < w; gx++) {
        const i = gy * w + gx;
        // A channel: SIGNED shore distance — 0.5 at the waterline, above on
        // land, below on water. The shader carves the coast from this; linear
        // filtering smooths it far beyond the 8 km cell grid.
        const signed = 0.5 + (this.land[i] ? shoreD[i] : -landD[i]) / 24;
        this.biome[i * 4 + 3] = Math.min(255, Math.max(0, signed * 255));
        if (!this.land[i]) continue;
        const river = Math.max(0, 1 - riverD[i] / 3);
        const coast = Math.max(0, 1 - shoreD[i] / 6);
        // noise matters less where the climate is decisively dry
        const moisture = Math.min(1, Math.max(0,
          lat + river * 0.55 + coast * 0.1 + (vnoise2(gx / 22, gy / 22) - 0.5) * 0.3 * (0.35 + lat)));
        const patch = vnoise2(gx / 16 + 31.7, gy / 16 + 11.3) * 0.7 + vnoise2(gx / 5 + 7.1, gy / 5 + 3.9) * 0.3;
        const forest = smooth01((moisture - 0.5) / 0.25) * smooth01((patch - 0.42) / 0.25);
        const rock = smooth01((this.height[i] - 6) / 16);
        this.biome[i * 4] = moisture * 255;
        this.biome[i * 4 + 1] = forest * (1 - rock * 0.7) * 255;
        this.biome[i * 4 + 2] = rock * 255;
      }
    }
  }

  private blur(radius: number) {
    const { w, h, height } = this;
    const tmp = new Float32Array(height.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let c = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w) {
            s += height[y * w + xx];
            c++;
          }
        }
        tmp[y * w + x] = s / c;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let s = 0;
        let c = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const yy = y + dy;
          if (yy >= 0 && yy < h) {
            s += tmp[yy * w + x];
            c++;
          }
        }
        height[y * w + x] = s / c;
      }
    }
  }

  /** Bilinear relief height (km) at a world point; 0 off-grid. */
  heightAt(wx: number, wy: number): number {
    const gx = (wx - this.minX) / this.cell - 0.5;
    const gy = (this.maxY - wy) / this.cell - 0.5;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    if (x0 < 0 || y0 < 0 || x0 >= this.w - 1 || y0 >= this.h - 1) return 0;
    const fx = gx - x0;
    const fy = gy - y0;
    const i = y0 * this.w + x0;
    const a = this.height[i];
    const b = this.height[i + 1];
    const c = this.height[i + this.w];
    const d = this.height[i + this.w + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
}
