import type { BattleTerrainGrid } from "./terrainFeatures";

export interface ReferenceHighlandGridOptions {
  meadowMicrorelief?: boolean;
}

export function buildReferenceHighlandGrid(
  options: ReferenceHighlandGridOptions = {},
): BattleTerrainGrid {
  const w = 360;
  const h = 250;
  const cell = 6;
  const ox = -1080;
  const oy = -930;
  const tint = new Uint8Array(w * h);
  const speed = new Float32Array(w * h);
  const height = new Float32Array(w * h);

  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      const x = ox + (cx + 0.5) * cell;
      const y = oy + (cy + 0.5) * cell;
      const nx = (cx + 0.5) / w;
      const ny = (cy + 0.5) / h;

      const leftWall = Math.pow(clampUnit((0.24 - nx) / 0.24), 1.55) * (6.0 + 1.8 * ny);
      const leftToe = 2.2 * gaussian2(x, y, -700, -220, 300, 570);
      const valleyFloor =
        -4.8 * gaussian2(x, y, -20, -105, 760, 560) -
        2.8 * gaussian2(x, y, 260, 220, 780, 520) -
        1.4 * smoothUnit((ny - 0.43) / 0.42);
      const nearHummock =
        4.1 * gaussian2(x, y, 360, -710, 560, 170) +
        2.2 * gaussian2(x, y, -210, -760, 470, 125) +
        3.4 * gaussian2(x, y, -260, -835, 780, 120) -
        2.2 * gaussian2(x, y, -260, -620, 760, 100) +
        3.0 * gaussian2(x, y, -360, -420, 560, 48);
      const midHummock =
        2.7 * gaussian2(x, y, 150, -420, 310, 135) + 1.8 * gaussian2(x, y, 520, -485, 290, 175);
      const midValleyBands =
        4.2 * gaussian2(x, y, -500, -160, 410, 58) -
        4.0 * gaussian2(x, y, -430, -245, 430, 62) +
        2.2 * gaussian2(x, y, -355, -325, 360, 48) +
        1.25 * gaussian2(x, y, -90, 75, 760, 58) +
        0.9 * gaussian2(x - (y + 245) * 0.62, y, -505, -215, 210, 120) -
        0.65 * gaussian2(x - (y + 260) * 0.74, y, -395, -285, 190, 110);
      const distantShelves = 0.9 * smoothUnit((ny - 0.54) / 0.34);
      const roll = 0.42 * Math.sin(x * 0.006 + y * 0.003) + 0.33 * Math.sin(x * 0.013 - y * 0.005);
      let z =
        leftWall +
        leftToe +
        valleyFloor +
        nearHummock +
        midHummock +
        midValleyBands +
        distantShelves +
        roll -
        0.8;

      let t = 0;
      const westCliff = x < -905 + Math.sin(y * 0.009) * 36 + Math.sin(y * 0.021) * 18;
      const shore = 450 + Math.sin(y * 0.004) * 80 - smoothUnit((y + 80) / 620) * 170;
      const inletMouth =
        gaussian2(x, y, 690, 20, 360, 280) > 0.4 || gaussian2(x, y, 860, 360, 420, 330) > 0.5;
      const eastWater = y > -260 && x > shore && inletMouth;
      const darkDrain = y > -500 && y < 160 && Math.abs(x + 190 - (y + 340) * 0.36) < 11;
      const screeToe = !westCliff && x < -650 + Math.sin(y * 0.006) * 50 && y > -650;
      const rockOutcrop =
        gaussian2(x, y, -520, -390, 78, 100) > 0.62 ||
        gaussian2(x, y, -80, -210, 64, 66) > 0.66 ||
        gaussian2(x, y, 180, -315, 70, 64) > 0.66 ||
        gaussian2(x, y, 520, -620, 58, 52) > 0.68;

      if (westCliff) {
        t = 2;
      } else if (eastWater) {
        t = 1;
        z = -2.35 + ny * 0.32;
      } else if (rockOutcrop) {
        t = 2;
        z += 0.55;
      } else if (screeToe) {
        t = 6;
      } else if (darkDrain) {
        t = 5;
        z -= 0.45;
      } else if (options.meadowMicrorelief) {
        z += meadowMicrorelief(x, y, nx, ny);
      }

      tint[i] = t;
      speed[i] = t === 1 || t === 2 ? 0 : t === 5 ? 0.72 : t === 6 ? 0.82 : 1;
      height[i] = z;
    }
  }

  return { w, h, cell, ox, oy, tint, speed, height };
}

function meadowMicrorelief(x: number, y: number, nx: number, ny: number): number {
  const foreground = smoothUnit((0.62 - ny) / 0.34);
  const eastFade = 1 - smoothUnit((nx - 0.78) / 0.12);
  const westFade = smoothUnit((nx - 0.23) / 0.12);
  const mask = foreground * eastFade * westFade;
  const warpX = gradientNoise(x, y, 210, 11) * 70;
  const warpY = gradientNoise(x + 91, y - 37, 190, 23) * 62;
  const wx = x + warpX;
  const wy = y + warpY;
  const broad = gradientNoise(wx, wy, 145, 31);
  const mid = gradientNoise(wx - 43, wy + 19, 78, 47);
  const local = gradientNoise(wx + 77, wy - 101, 44, 59);
  const trough = gradientNoise(wx * 0.88 + 40, wy * 1.08 - 62, 58, 71);
  const nested = broad * 0.26 + mid * 0.34 + local * 0.24 + trough * 0.16;
  return nested * 0.46 * mask;
}

function gradientNoise(x: number, y: number, scale: number, salt: number): number {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const tx = smoother(gx - x0);
  const ty = smoother(gy - y0);
  const a = gradientDot(x0, y0, salt, fx, fy);
  const b = gradientDot(x0 + 1, y0, salt, fx - 1, fy);
  const c = gradientDot(x0, y0 + 1, salt, fx, fy - 1);
  const d = gradientDot(x0 + 1, y0 + 1, salt, fx - 1, fy - 1);
  return mixNumber(mixNumber(a, b, tx), mixNumber(c, d, tx), ty);
}

function gradientDot(ix: number, iy: number, salt: number, dx: number, dy: number): number {
  const angle = hash2(ix, iy, salt) * Math.PI * 2;
  return (Math.cos(angle) * dx + Math.sin(angle) * dy) * 1.75;
}

function hash2(x: number, y: number, salt: number): number {
  let n =
    Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(y + 0xc2b2ae35, 0x27d4eb2d) ^
    Math.imul(salt, 0x165667b1);
  n ^= n >>> 15;
  n = Math.imul(n, 0x2c1b3c6d);
  n ^= n >>> 12;
  n = Math.imul(n, 0x297a2d39);
  n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}

function smoother(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function gaussian2(x: number, y: number, cx: number, cy: number, sx: number, sy: number): number {
  const dx = (x - cx) / sx;
  const dy = (y - cy) / sy;
  return Math.exp(-(dx * dx + dy * dy));
}

function smoothUnit(t: number): number {
  const u = clampUnit(t);
  return u * u * (3 - 2 * u);
}

function mixNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clampUnit(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
