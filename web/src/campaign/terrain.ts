// Terrain field derived from the background raster. mapgen paints the bg PNG
// from a fixed palette (sea/land/mountain/lake/river — see mapgen/raster.rs),
// so classifying pixels back into classes gives us a land mask and a stylized
// heightmap without touching the asset pipeline. Heights are visual relief
// (massively exaggerated, like every campaign map), not real elevation.

import type { CampaignData } from './data';

// Must match mapgen/src/raster.rs.
const PALETTE: { c: [number, number, number]; land: boolean; h: number }[] = [
  { c: [38, 60, 84], land: false, h: 0 }, // sea
  { c: [196, 178, 138], land: true, h: 2.2 }, // land
  { c: [142, 120, 96], land: true, h: 26 }, // mountain
  { c: [52, 84, 110], land: false, h: 0 }, // lake
  { c: [60, 96, 124], land: true, h: 1.0 }, // river (still territory-worthy land)
];

/** Deterministic [0,1) hash of a grid cell. */
function hash2(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
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
      this.height[i] = PALETTE[best].h;
      this.land[i] = PALETTE[best].land ? 1 : 0;
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
    const sun = [-0.42, 0.4, 0.81];
    const sl = Math.hypot(...sun);
    const [sx2, sy2, sz2] = [sun[0] / sl, sun[1] / sl, sun[2] / sl];
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
        this.light[i] = Math.min(255, (0.52 + 0.55 * lambert) * 128);
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
