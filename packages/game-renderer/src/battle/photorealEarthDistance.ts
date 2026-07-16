import type { BattleTerrainGrid } from './terrainFeatures';

export interface PhotorealEarthDistanceField {
  data: Uint8Array;
  width: number;
  height: number;
  cell: number;
  ox: number;
  oy: number;
  rangeMeters: number;
}

const ROAD_CLASSIFIER_EPSILON = 1e-6;
const EARTH_DISTANCE_RANGE_METERS = 32;
const DISTANCE_SCALE = 2;

/** Tint 6 is shared by cosmetic roads and scree; only passable, smooth cells are roads. */
export function isBattleRoadSurface(tint: number, rough: number | undefined, speed: number | undefined): boolean {
  return (
    tint === 6 &&
    rough !== undefined &&
    speed !== undefined &&
    Number.isFinite(rough) &&
    Number.isFinite(speed) &&
    rough <= 0.05 + ROAD_CLASSIFIER_EPSILON &&
    speed >= 0.95 - ROAD_CLASSIFIER_EPSILON
  );
}

/** Bake the photoreal-only earth union and classified-road SDF into one filterable RG8 field. */
export function buildPhotorealEarthDistance(grid: BattleTerrainGrid): PhotorealEarthDistanceField {
  const earth = new Uint8Array(grid.w * grid.h);
  const road = new Uint8Array(grid.w * grid.h);
  for (let i = 0; i < earth.length; i++) {
    road[i] = isBattleRoadSurface(grid.tint[i], grid.rough?.[i], grid.speed?.[i]) ? 1 : 0;
    earth[i] = grid.tint[i] === 5 || road[i] === 1 ? 1 : 0;
  }
  const earthDistance = refinedDistance(earth, grid.w, grid.h, grid.cell, DISTANCE_SCALE);
  const roadDistance = refinedDistance(road, grid.w, grid.h, grid.cell, DISTANCE_SCALE);
  const width = grid.w * DISTANCE_SCALE;
  const height = grid.h * DISTANCE_SCALE;
  const data = new Uint8Array(width * height * 2);
  for (let i = 0; i < earthDistance.length; i++) {
    data[i * 2] = encodeDistance(earthDistance[i]);
    data[i * 2 + 1] = encodeDistance(roadDistance[i]);
  }
  return {
    data,
    width,
    height,
    cell: grid.cell / DISTANCE_SCALE,
    ox: grid.ox,
    oy: grid.oy,
    rangeMeters: EARTH_DISTANCE_RANGE_METERS,
  };
}

function encodeDistance(distanceMeters: number): number {
  const normalized = Math.max(-1, Math.min(1, distanceMeters / EARTH_DISTANCE_RANGE_METERS));
  return Math.round((normalized * 0.5 + 0.5) * 255);
}

function refinedDistance(
  mask: Uint8Array,
  width: number,
  height: number,
  cellMeters: number,
  scale: number,
): Float32Array {
  if (!mask.some(Boolean)) {
    return new Float32Array(width * scale * height * scale).fill(-EARTH_DISTANCE_RANGE_METERS);
  }
  const exact = signedDistance(mask, width, height, cellMeters);
  const occupancy = gaussianBlur(Float32Array.from(mask), width, height);
  const smoothOccupancy = bicubicResample(occupancy, width, height, scale);
  const result = bicubicResample(exact, width, height, scale);
  const outputWidth = width * scale;
  const outputHeight = height * scale;
  const outputCell = cellMeters / scale;
  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      const index = y * outputWidth + x;
      const value = smoothOccupancy[index];
      if (value <= 0 || value >= 1) continue;
      const left = smoothOccupancy[y * outputWidth + Math.max(0, x - 1)];
      const right = smoothOccupancy[y * outputWidth + Math.min(outputWidth - 1, x + 1)];
      const below = smoothOccupancy[Math.max(0, y - 1) * outputWidth + x];
      const above = smoothOccupancy[Math.min(outputHeight - 1, y + 1) * outputWidth + x];
      const gradient = Math.hypot(right - left, above - below) / (2 * outputCell);
      if (gradient <= 1e-4) continue;
      const refined = Math.max(-12, Math.min(12, (value - 0.5) / gradient));
      // Low-pass occupancy improves large contours, but a small authored island
      // may never reach 50%. It may refine the exact SDF, never invert ownership.
      if ((refined >= 0) === (result[index] >= 0)) result[index] = refined;
    }
  }
  return result;
}

function signedDistance(mask: Uint8Array, width: number, height: number, cellMeters: number): Float32Array {
  const paddedWidth = width + 2;
  const paddedHeight = height + 2;
  const padded = new Uint8Array(paddedWidth * paddedHeight);
  for (let y = 0; y < height; y++) {
    padded.set(mask.subarray(y * width, (y + 1) * width), (y + 1) * paddedWidth + 1);
  }
  const toInside = distanceTransform(padded, paddedWidth, paddedHeight, true);
  const toOutside = distanceTransform(padded, paddedWidth, paddedHeight, false);
  const result = new Float32Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const paddedIndex = (y + 1) * paddedWidth + x + 1;
      const cells = Math.sqrt(mask[index] ? toOutside[paddedIndex] : toInside[paddedIndex]);
      const meters = Math.max(0, cells * cellMeters - cellMeters * 0.5);
      result[index] = (mask[index] ? 1 : -1) * meters;
    }
  }
  return result;
}

function distanceTransform(mask: Uint8Array, width: number, height: number, target: boolean): Float64Array {
  const infinity = 1e20;
  if (!mask.some((value) => Boolean(value) === target)) {
    return new Float64Array(width * height).fill(infinity);
  }
  const intermediate = new Float64Array(width * height);
  const result = new Float64Array(width * height);
  const f = new Float64Array(Math.max(width, height));
  const d = new Float64Array(Math.max(width, height));
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      f[y] = Boolean(mask[y * width + x]) === target ? 0 : infinity;
    }
    distanceTransform1d(f, d, height);
    for (let y = 0; y < height; y++) intermediate[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = intermediate[y * width + x];
    distanceTransform1d(f, d, width);
    for (let x = 0; x < width; x++) result[y * width + x] = d[x];
  }
  return result;
}

/** Felzenszwalb/Huttenlocher squared Euclidean distance transform. */
function distanceTransform1d(f: Float64Array, d: Float64Array, length: number): void {
  const sites = new Int32Array(length);
  const boundaries = new Float64Array(length + 1);
  let k = 0;
  sites[0] = 0;
  boundaries[0] = Number.NEGATIVE_INFINITY;
  boundaries[1] = Number.POSITIVE_INFINITY;
  for (let q = 1; q < length; q++) {
    let intersection = (f[q] + q * q - (f[sites[k]] + sites[k] * sites[k])) / (2 * q - 2 * sites[k]);
    while (intersection <= boundaries[k]) {
      k--;
      intersection = (f[q] + q * q - (f[sites[k]] + sites[k] * sites[k])) / (2 * q - 2 * sites[k]);
    }
    k++;
    sites[k] = q;
    boundaries[k] = intersection;
    boundaries[k + 1] = Number.POSITIVE_INFINITY;
  }
  k = 0;
  for (let q = 0; q < length; q++) {
    while (boundaries[k + 1] < q) k++;
    const delta = q - sites[k];
    d[q] = delta * delta + f[sites[k]];
  }
}

function gaussianBlur(source: Float32Array, width: number, height: number): Float32Array {
  const weights = [1, 4, 6, 4, 1] as const;
  const horizontal = new Float32Array(source.length);
  const result = new Float32Array(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) {
        const sx = Math.max(0, Math.min(width - 1, x + k));
        sum += source[y * width + sx] * weights[k + 2];
      }
      horizontal[y * width + x] = sum / 16;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) {
        const sy = Math.max(0, Math.min(height - 1, y + k));
        sum += horizontal[sy * width + x] * weights[k + 2];
      }
      result[y * width + x] = sum / 16;
    }
  }
  return result;
}

function bicubicResample(source: Float32Array, width: number, height: number, scale: number): Float32Array {
  const outputWidth = width * scale;
  const result = new Float32Array(outputWidth * height * scale);
  for (let y = 0; y < height * scale; y++) {
    const sourceY = (y + 0.5) / scale - 0.5;
    const iy = Math.floor(sourceY);
    const ty = sourceY - iy;
    for (let x = 0; x < outputWidth; x++) {
      const sourceX = (x + 0.5) / scale - 0.5;
      const ix = Math.floor(sourceX);
      const tx = sourceX - ix;
      const rows: number[] = [];
      for (let ky = -1; ky <= 2; ky++) {
        const sy = Math.max(0, Math.min(height - 1, iy + ky));
        const samples: number[] = [];
        for (let kx = -1; kx <= 2; kx++) {
          const sx = Math.max(0, Math.min(width - 1, ix + kx));
          samples.push(source[sy * width + sx]);
        }
        rows.push(cubic(samples[0], samples[1], samples[2], samples[3], tx));
      }
      result[y * outputWidth + x] = cubic(rows[0], rows[1], rows[2], rows[3], ty);
    }
  }
  return result;
}

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const p = d - c - (a - b);
  const q = a - b - p;
  const r = c - a;
  return p * t * t * t + q * t * t + r * t + b;
}
