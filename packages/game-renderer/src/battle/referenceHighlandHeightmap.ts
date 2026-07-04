import type { BattleTerrainGrid } from './terrainFeatures';

export const REFERENCE_HIGHLAND_HEIGHTMAP_SOURCE_ID = 'heightmap-layout';
export const REFERENCE_HIGHLAND_LAYOUT_VERTICAL_SCALE = 2.35;

export interface ReferenceHighlandHeightmapStats {
  sourceId: typeof REFERENCE_HIGHLAND_HEIGHTMAP_SOURCE_ID;
  sourceKind: 'continuous-field';
  sourceRows: number;
  sourceColumns: number;
  gridRows: number;
  gridColumns: number;
  outputCellsPerSourceCell: null | {
    x: number;
    y: number;
  };
  worldBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  cellSize: number;
  heightSpan: {
    min: number;
    max: number;
    span: number;
  };
  cameraHillAnchor: {
    sourceColumn: number;
    sourceRow: number;
    worldX: number;
    worldY: number;
    height: number;
    valleyFloorHeight: number;
  };
  slopeHistogram: {
    flat: number;
    rolling: number;
    steep: number;
    cliff: number;
  };
  passability: {
    source: 'heightfield-slope-cap';
    cliffSlopeThreshold: number;
    slowSlopeThreshold: number;
    passableRatio: number;
    slowScreeRatio: number;
    cliffMaskRatio: number;
    valleyFloorPassableRatio: number;
    visualMaskSource: 'grid.speed';
    pathChecks: {
      valleyCorridorReachable: boolean;
      westCliffBandIsolatesValley: boolean;
      eastCliffBandIsolatesValley: boolean;
    };
  };
  cliffSilhouette: {
    source: 'heightfield-background-band';
    backgroundBand: {
      vMin: number;
      vMax: number;
    };
    maxHeight: number;
    p90Height: number;
    p98Height: number;
    relief: number;
    cliffMaskRatio: number;
    impassableRatio: number;
    valleyFloorPassableRatio: number;
  };
  lakeMaskRatio: number;
  impassableRatio: number;
}

export interface ReferenceHighlandHeightmapBuild {
  grid: BattleTerrainGrid;
  stats: ReferenceHighlandHeightmapStats;
}

const WORLD = {
  w: 360,
  h: 620,
  cell: 6,
  ox: -1080,
  oy: -1644,
};

const SOURCE = {
  w: WORLD.w,
  h: WORLD.h,
};

const SEA_LEVEL = -1.05;

const CAMERA_HILL = {
  u: 0.415,
  v: 0.168,
};

const NORTH_VALLEY_PROBE = {
  u: 0.515,
  v: 0.730,
};

const SLOPE_BANDS = {
  flatMax: 0.045,
  rollingMax: 0.16,
  steepMax: 0.34,
  slowMin: 0.18,
  cliffMin: 0.30,
} as const;

// Above the camera hill and below the mountain massifs, so only edge-connected highlands are capped.
const EDGE_HIGHLAND_CAP_MIN_HEIGHT = 8.5;
const BACKGROUND_CLIFF_BAND = {
  vMin: 0.48,
  vMax: 1.0,
} as const;

export function buildReferenceHighlandHeightmapGrid(): ReferenceHighlandHeightmapBuild {
  const { w, h, cell, ox, oy } = WORLD;
  const tint = new Uint8Array(w * h);
  const speed = new Float32Array(w * h);
  const height = new Float32Array(w * h);
  let waterCells = 0;
  let impassableCells = 0;

  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      const u = (cx + 0.5) / w;
      const v = (cy + 0.5) / h;
      const sample = sampleMacroHeight(u, v);
      height[i] = sample.height;
      tint[i] = sample.height <= SEA_LEVEL ? 1 : sample.drainage > 0.44 && sample.height < 1.15 ? 5 : 0;
    }
  }

  const slopeHistogram = { flat: 0, rolling: 0, steep: 0, cliff: 0 };
  const slopeField = new Float32Array(w * h);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      const slope = localSlope(height, cx, cy, w, h, cell) * REFERENCE_HIGHLAND_LAYOUT_VERTICAL_SCALE;
      slopeField[i] = slope;
      if (slope < SLOPE_BANDS.flatMax) slopeHistogram.flat++;
      else if (slope < SLOPE_BANDS.rollingMax) slopeHistogram.rolling++;
      else if (slope < SLOPE_BANDS.steepMax) slopeHistogram.steep++;
      else slopeHistogram.cliff++;
    }
  }

  const cliffMask = buildCliffMask(height, slopeField);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      const slope = slopeField[i];
      if (tint[i] !== 1 && cliffMask[i]) tint[i] = 2;
      const blocked = tint[i] === 1 || tint[i] === 2;
      speed[i] = blocked ? 0 : tint[i] === 5 ? 0.72 : slope > SLOPE_BANDS.slowMin ? 0.62 : 1;
      if (tint[i] === 1) waterCells++;
      if (blocked) impassableCells++;
    }
  }

  const stats = buildStats(height, tint, speed, slopeHistogram, waterCells, impassableCells);
  return { grid: { w, h, cell, ox, oy, tint, speed, height }, stats };
}

function buildStats(
  height: Float32Array,
  tint: Uint8Array,
  speed: Float32Array,
  slopeHistogram: ReferenceHighlandHeightmapStats['slopeHistogram'],
  waterCells: number,
  impassableCells: number,
): ReferenceHighlandHeightmapStats {
  const { w, h, cell, ox, oy } = WORLD;
  let min = Infinity;
  let max = -Infinity;
  let valleyFloorHeight = Infinity;
  let passableCells = 0;
  let slowCells = 0;
  let cliffCells = 0;
  let valleyFloorCells = 0;
  let valleyFloorPassableCells = 0;
  let backgroundCells = 0;
  let backgroundCliffCells = 0;
  let backgroundImpassableCells = 0;
  const backgroundHeights: number[] = [];
  for (let i = 0; i < height.length; i++) {
    const z = height[i];
    const cy = Math.floor(i / w);
    const v = (cy + 0.5) / h;
    if (z < min) min = z;
    if (z > max) max = z;
    if (z > -1.8 && z < valleyFloorHeight) valleyFloorHeight = z;
    if (speed[i] > 0) passableCells++;
    if (speed[i] > 0 && speed[i] < 0.9) slowCells++;
    if (tint[i] === 2 && speed[i] <= 0) cliffCells++;
    if (tint[i] !== 1 && z > -1.8 && z < 4.75) {
      valleyFloorCells++;
      if (speed[i] > 0) valleyFloorPassableCells++;
    }
    if (v >= BACKGROUND_CLIFF_BAND.vMin && v <= BACKGROUND_CLIFF_BAND.vMax && tint[i] !== 1) {
      backgroundCells++;
      backgroundHeights.push(z);
      if (tint[i] === 2 && speed[i] <= 0) backgroundCliffCells++;
      if (speed[i] <= 0) backgroundImpassableCells++;
    }
  }
  const { x: cx, y: cy } = normalizedToGridCell(CAMERA_HILL.u, CAMERA_HILL.v);
  const worldX = gridCellWorldX(cx);
  const worldY = gridCellWorldY(cy);
  const cameraHeight = height[cy * w + cx];
  return {
    sourceId: REFERENCE_HIGHLAND_HEIGHTMAP_SOURCE_ID,
    sourceKind: 'continuous-field',
    sourceRows: SOURCE.h,
    sourceColumns: SOURCE.w,
    gridRows: WORLD.h,
    gridColumns: WORLD.w,
    outputCellsPerSourceCell: null,
    worldBounds: { minX: ox, maxX: ox + w * cell, minY: oy, maxY: oy + h * cell },
    cellSize: cell,
    heightSpan: {
      min: round3(min),
      max: round3(max),
      span: round3(max - min),
    },
    cameraHillAnchor: {
      sourceColumn: Math.round(CAMERA_HILL.u * (SOURCE.w - 1)),
      sourceRow: Math.round((1 - CAMERA_HILL.v) * (SOURCE.h - 1)),
      worldX: round3(worldX),
      worldY: round3(worldY),
      height: round3(cameraHeight),
      valleyFloorHeight: round3(valleyFloorHeight),
    },
    slopeHistogram,
    passability: {
      source: 'heightfield-slope-cap',
      cliffSlopeThreshold: SLOPE_BANDS.cliffMin,
      slowSlopeThreshold: SLOPE_BANDS.slowMin,
      passableRatio: round4(passableCells / height.length),
      slowScreeRatio: round4(slowCells / height.length),
      cliffMaskRatio: round4(cliffCells / height.length),
      valleyFloorPassableRatio: round4(valleyFloorPassableCells / Math.max(1, valleyFloorCells)),
      visualMaskSource: 'grid.speed',
      pathChecks: buildPathChecks(speed),
    },
    cliffSilhouette: {
      source: 'heightfield-background-band',
      backgroundBand: BACKGROUND_CLIFF_BAND,
      maxHeight: round3(percentile(backgroundHeights, 1.0)),
      p90Height: round3(percentile(backgroundHeights, 0.90)),
      p98Height: round3(percentile(backgroundHeights, 0.98)),
      relief: round3(percentile(backgroundHeights, 0.98) - percentile(backgroundHeights, 0.10)),
      cliffMaskRatio: round4(backgroundCliffCells / Math.max(1, backgroundCells)),
      impassableRatio: round4(backgroundImpassableCells / Math.max(1, backgroundCells)),
      valleyFloorPassableRatio: round4(valleyFloorPassableCells / Math.max(1, valleyFloorCells)),
    },
    lakeMaskRatio: round4(waterCells / height.length),
    impassableRatio: round4(impassableCells / height.length),
  };
}

function sampleMacroHeight(u: number, v: number): { height: number; drainage: number } {
  const mountain = macroMountainMask(u, v);
  const drainage = drainageField(u, v);
  const lake = lakeBasin(u, v);
  const hill = gaussian2(u, v, CAMERA_HILL.u, CAMERA_HILL.v, 0.085, 0.070);
  const valleyNoise =
    (fbm(u * 5.2 + 17.1, v * 7.0 - 4.4, 23, 4) - 0.5) * 0.82 +
    Math.sin(u * 9.0 + v * 8.4) * 0.18;
  const valleyHeight =
    1.35 +
    valleyNoise +
    hill * 7.0 -
    drainage * 2.45 +
    rollingValleyRelief(u, v, mountain) +
    broadValleyLift(u, v);
  const highlandHeight =
    13.2 +
    mountain * 18.4 +
    backgroundCliffUplift(u, v, mountain) +
    mountainRidgeRelief(u, v, mountain) +
    mountainSummitBreakup(u, v, mountain) +
    (fbm(u * 9.0, v * 13.0, 71, 4) - 0.5) * 2.1;
  const height = mixNumber(valleyHeight, highlandHeight, smoothstep(0.22, 0.82, mountain)) - lake * 13.0;
  return { height, drainage };
}

function macroMountainMask(u: number, v: number): number {
  const westBoundary =
    0.205 +
    Math.sin(v * 13.0 + 0.8) * 0.034 +
    Math.sin(v * 31.0 + 2.2) * 0.014 +
    smoothstep(0.62, 1.0, v) * 0.050;
  const eastBoundary =
    0.805 +
    Math.sin(v * 11.0 + 2.6) * 0.030 +
    Math.sin(v * 29.0 + 0.5) * 0.015 -
    smoothstep(0.24, 0.60, v) * smoothstep(0.86, 0.60, v) * 0.060;
  const west = smoothstep(westBoundary + 0.055, westBoundary - 0.010, u);
  const east = smoothstep(eastBoundary - 0.055, eastBoundary + 0.010, u);
  const northShoulder = smoothstep(0.76, 0.56, v) * smoothstep(0.18, 0.34, u) * smoothstep(0.80, 0.62, u) * 0.38;
  const farCentralRidge =
    smoothstep(0.72, 0.94, v) *
    smoothstep(0.25, 0.43, u) *
    smoothstep(0.82, 0.57, u) *
    (0.96 + fbm(u * 7.5 + 2.0, v * 5.0 - 1.0, 263, 3) * 0.28);
  const southShoulder = smoothstep(0.70, 0.96, v) * smoothstep(0.28, 0.43, u) * smoothstep(0.92, 0.74, u) * 0.24;
  const islandMass = gaussian2(u, v, 0.705, 0.590, 0.095, 0.145) * 0.40;
  return clamp(Math.max(west, east, northShoulder, farCentralRidge, southShoulder, islandMass), 0, 1);
}

function lakeBasin(u: number, v: number): number {
  const dx = (u - 0.810) / 0.105;
  const dy = (v - 0.545) / 0.220;
  const edge = fbm(u * 17.0 + 3.1, v * 20.0 - 2.0, 101, 3) * 0.22;
  return smoothstep(1.16, 0.70, dx * dx + dy * dy + edge);
}

function drainageField(u: number, v: number): number {
  const center =
    0.500 +
    Math.sin(v * 8.6 + 0.4) * 0.035 +
    Math.sin(v * 21.0 + 1.7) * 0.012;
  const main = channel(u, center, 0.010 + smoothstep(0.25, 0.86, v) * 0.006);
  const westBraid = channel(u, center - 0.040 - Math.sin(v * 10.0) * 0.012, 0.006) * smoothstep(0.18, 0.40, v) * smoothstep(0.72, 0.45, v);
  const eastBraid = channel(u, center + 0.050 + Math.sin(v * 9.0 + 2.4) * 0.012, 0.006) * smoothstep(0.36, 0.58, v) * smoothstep(0.92, 0.66, v);
  const lowerWash = channel(u, 0.430 + Math.sin(v * 16.0) * 0.018, 0.018) * smoothstep(0.10, 0.26, v) * smoothstep(0.42, 0.24, v);
  return clamp(Math.max(main, westBraid, eastBraid, lowerWash), 0, 1);
}

function channel(u: number, center: number, width: number): number {
  const d = Math.abs(u - center) / width;
  return Math.exp(-d * d);
}

function gaussian2(u: number, v: number, cu: number, cv: number, ru: number, rv: number): number {
  const x = (u - cu) / ru;
  const y = (v - cv) / rv;
  return Math.exp(-(x * x + y * y));
}

function broadValleyLift(u: number, v: number): number {
  const lowerApron = smoothstep(0.0, 0.30, v) * 0.45;
  const northLift = smoothstep(0.62, 1.0, v) * 1.20;
  const sideLift = (smoothstep(0.34, 0.18, u) + smoothstep(0.66, 0.82, u)) * 0.65;
  return lowerApron + northLift + sideLift;
}

function rollingValleyRelief(u: number, v: number, mountainMask: number): number {
  const valley = 1 - smoothstep(0.18, 0.68, mountainMask);
  const westFalloff = smoothstep(0.22, 0.36, u);
  const eastFalloff = smoothstep(0.78, 0.62, u);
  const centerWeight = valley * westFalloff * eastFalloff;
  const foreShoulder = transverseValleyBand(u, v, 0.232, 0.028, 2.0, 0.5);
  const nearCrest = transverseValleyBand(u, v, 0.258, 0.010, 15.0, 1.2);
  const nearTrough = transverseValleyBand(u, v, 0.284, 0.018, 5.8, 2.6);
  const midCrest = transverseValleyBand(u, v, 0.318, 0.011, 18.0, 4.0);
  const midTrough = transverseValleyBand(u, v, 0.354, 0.022, 6.4, 5.1);
  const farCrest = transverseValleyBand(u, v, 0.432, 0.024, 7.0, 6.2);
  const farShoulder = transverseValleyBand(u, v, 0.565, 0.055, 4.2, 8.0);
  const centralFold =
    gaussian2(u, v, 0.515, 0.246, 0.110, 0.011) * 5.2 -
    gaussian2(u, v, 0.510, 0.282, 0.145, 0.020) * 2.4;
  const foregroundTexture =
    gaussian2(u, v, 0.470, 0.180, 0.270, 0.090) *
    ((fbm(u * 17.0 + 4.0, v * 15.0 - 1.0, 181, 4) - 0.5) * 0.9 + Math.sin(u * 24.0 + v * 11.0) * 0.22);
  const oblique = Math.sin(u * 8.0 + v * 18.0 + fbm(u * 4.0, v * 5.0, 137, 3) * 1.8) * 0.26;
  return centerWeight * (foreShoulder + nearCrest - nearTrough + midCrest - midTrough + farCrest + farShoulder + centralFold + foregroundTexture + oblique);
}

function transverseValleyBand(u: number, v: number, centerV: number, widthV: number, amplitude: number, phase: number): number {
  const skew = (u - 0.52) * Math.sin(phase * 1.31) * 0.038;
  const bend = skew + Math.sin(u * 8.5 + phase) * 0.010 + (fbm(u * 6.0, centerV * 11.0 + phase, 149, 3) - 0.5) * 0.010;
  const d = (v - centerV - bend) / widthV;
  const centralSpan = smoothstep(0.24, 0.38, u) * smoothstep(0.80, 0.62, u);
  const lobeA = Math.exp(-Math.pow((u - 0.39) / 0.135, 2));
  const lobeB = Math.exp(-Math.pow((u - 0.56) / 0.155, 2));
  const lobeC = Math.exp(-Math.pow((u - 0.705) / 0.125, 2));
  const notch = Math.exp(-Math.pow((u - 0.50 - Math.sin(phase) * 0.035) / 0.055, 2));
  const lobeMask = clamp(0.10 + lobeA * 0.30 + lobeB * 0.46 + lobeC * 0.24 - notch * 0.22, 0.05, 0.92);
  const lateralBreakup = 0.78 + Math.sin(u * 15.0 + phase * 1.7) * 0.10 + (fbm(u * 9.0 + phase, v * 7.0, 157, 3) - 0.5) * 0.20;
  return Math.exp(-(d * d)) * centralSpan * lobeMask * lateralBreakup * amplitude;
}

function mountainRidgeRelief(u: number, v: number, mountainMask: number): number {
  const edgeRamp = smoothstep(0.30, 0.92, mountainMask);
  const side = Math.tanh((u - 0.5) * 4.6);
  const spineA = orientedRidge(u, v, 18.0, 0.72 * side + 0.18, 0.34, v * 9.7);
  const spineB = orientedRidge(u, v, 31.0, 0.54 * side - 0.12, -0.50, u * 8.0 + 2.1);
  const spur = orientedRidge(u, v, 50.0, 0.25 * side + 0.22, 0.95, u * 11.0 + v * 4.0);
  const ravine = orientedRidge(u, v, 72.0, -0.26 * side + 0.08, 1.0, u * 13.5 + 4.7);
  const ridgeStack = spineA * 0.42 + spineB * 0.30 + spur * 0.20 + ravine * 0.08;
  const terrace = Math.sin(u * 18.0 + v * 8.5) * 0.22 + Math.sin(v * 22.0 - u * 7.0) * 0.15;
  return edgeRamp * ((ridgeStack - 0.42) * 10.2 + terrace * 1.50);
}

function backgroundCliffUplift(u: number, v: number, mountainMask: number): number {
  const edgeMass = smoothstep(0.28, 0.88, mountainMask);
  const farField = smoothstep(0.34, 0.82, v);
  const sideWalls = smoothstep(0.34, 0.20, u) + smoothstep(0.66, 0.80, u);
  const leftBackMass = gaussian2(u, v, 0.185, 0.660, 0.090, 0.300);
  const rightBackMass = gaussian2(u, v, 0.835, 0.575, 0.095, 0.255);
  const northCrown =
    smoothstep(0.50, 0.78, v) *
    smoothstep(0.18, 0.34, u) *
    smoothstep(0.82, 0.66, u);
  const centerRidge =
    smoothstep(0.74, 0.94, v) *
    smoothstep(0.27, 0.44, u) *
    smoothstep(0.79, 0.57, u);
  const mass = clamp(
    edgeMass * (farField * 0.66 + sideWalls * 0.36) +
    leftBackMass * 0.48 +
    rightBackMass * 0.48 +
    northCrown * 0.36 +
    centerRidge * 1.42,
    0,
    1.18,
  );
  const fracture =
    0.86 +
    (fbm(u * 19.3 + 8.4, v * 23.1 - 2.0, 211, 4) - 0.5) * 0.28 +
    Math.sin(u * 37.0 + v * 11.0) * 0.08;
  return mass * fracture * 72.0;
}

function mountainSummitBreakup(u: number, v: number, mountainMask: number): number {
  const highland = smoothstep(0.44, 0.92, mountainMask);
  const far = smoothstep(0.44, 0.86, v);
  const serration =
    orientedRidge(u, v, 24.0, 0.64, 0.44, v * 10.0 + 0.7) * 0.46 +
    orientedRidge(u, v, 43.0, -0.38, 0.92, u * 9.0 + 1.5) * 0.34 +
    (fbm(u * 31.0 - 2.0, v * 27.0 + 5.0, 307, 4) - 0.5) * 0.40;
  const shoulderNotches =
    gaussian2(u, v, 0.205, 0.760, 0.070, 0.085) * -8.0 +
    gaussian2(u, v, 0.785, 0.650, 0.080, 0.095) * -6.8 +
    gaussian2(u, v, 0.475, 0.850, 0.085, 0.065) * 9.8 +
    gaussian2(u, v, 0.610, 0.840, 0.080, 0.060) * 8.6 -
    gaussian2(u, v, 0.545, 0.825, 0.055, 0.055) * 4.2;
  return highland * far * (serration * 13.0 + shoulderNotches);
}

function orientedRidge(u: number, v: number, frequency: number, ax: number, ay: number, phase: number): number {
  const len = Math.hypot(ax, ay) || 1;
  const ux = ax / len;
  const uy = ay / len;
  const along = u * ux + v * uy;
  const across = u * -uy + v * ux;
  const warped = along * frequency + Math.sin(across * frequency * 0.72 + phase * 1.7) * 0.38 + phase;
  const ridge = 1 - Math.abs(Math.sin(warped));
  return ridge * ridge;
}

function buildCliffMask(height: Float32Array, slope: Float32Array): Uint8Array {
  const { w, h } = WORLD;
  const seed = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < slope.length; i++) {
    if (slope[i] >= SLOPE_BANDS.cliffMin) {
      seed[i] = 1;
      out[i] = 1;
    }
  }
  const radius = 7;
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      if (out[i] || height[i] < 4.8) continue;
      const localSlope = slope[i];
      if (localSlope < SLOPE_BANDS.slowMin && height[i] < EDGE_HIGHLAND_CAP_MIN_HEIGHT) continue;
      if (hasCliffSeedNear(seed, cx, cy, radius)) out[i] = 1;
    }
  }
  addEdgeConnectedHighlandCap(height, out);
  return out;
}

function addEdgeConnectedHighlandCap(height: Float32Array, mask: Uint8Array): void {
  const { w, h } = WORLD;
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (visited[i] || height[i] < EDGE_HIGHLAND_CAP_MIN_HEIGHT) return;
    visited[i] = 1;
    mask[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
}

function hasCliffSeedNear(seed: Uint8Array, cx: number, cy: number, radius: number): boolean {
  const { w, h } = WORLD;
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= h) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = cx + dx;
      if (x < 0 || x >= w) continue;
      if (seed[y * w + x]) return true;
    }
  }
  return false;
}

function buildPathChecks(speed: Float32Array): ReferenceHighlandHeightmapStats['passability']['pathChecks'] {
  const camera = normalizedToGridCell(CAMERA_HILL.u, CAMERA_HILL.v);
  const northValley = normalizedToGridCell(NORTH_VALLEY_PROBE.u, NORTH_VALLEY_PROBE.v);
  return {
    valleyCorridorReachable: hasPassablePath(speed, camera, northValley),
    westCliffBandIsolatesValley: !reachablePassableBand(speed, camera, { xMin: 0, xMax: Math.floor(WORLD.w * 0.12) }),
    eastCliffBandIsolatesValley: !reachablePassableBand(speed, camera, { xMin: Math.ceil(WORLD.w * 0.88), xMax: WORLD.w - 1 }),
  };
}

function normalizedToGridCell(u: number, v: number): { x: number; y: number } {
  const x = clamp(Math.round(u * WORLD.w - 0.5), 0, WORLD.w - 1);
  const y = clamp(Math.round(v * WORLD.h - 0.5), 0, WORLD.h - 1);
  return { x, y };
}

function gridCellWorldX(cx: number): number {
  return WORLD.ox + (cx + 0.5) * WORLD.cell;
}

function gridCellWorldY(cy: number): number {
  return WORLD.oy + (cy + 0.5) * WORLD.cell;
}

function hasPassablePath(speed: Float32Array, start: { x: number; y: number }, end: { x: number; y: number }): boolean {
  const { w, h } = WORLD;
  if (!isPassable(speed, start.x, start.y) || !isPassable(speed, end.x, end.y)) return false;
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const startIndex = start.y * w + start.x;
  const endIndex = end.y * w + end.x;
  queue[tail++] = startIndex;
  visited[startIndex] = 1;
  while (head < tail) {
    const i = queue[head++];
    if (i === endIndex) return true;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) tail = pushPassable(speed, visited, queue, tail, i - 1);
    if (x < w - 1) tail = pushPassable(speed, visited, queue, tail, i + 1);
    if (y > 0) tail = pushPassable(speed, visited, queue, tail, i - w);
    if (y < h - 1) tail = pushPassable(speed, visited, queue, tail, i + w);
  }
  return false;
}

function pushPassable(speed: Float32Array, visited: Uint8Array, queue: Int32Array, tail: number, index: number): number {
  if (visited[index] || speed[index] <= 0) return tail;
  visited[index] = 1;
  queue[tail] = index;
  return tail + 1;
}

function reachablePassableBand(
  speed: Float32Array,
  start: { x: number; y: number },
  band: { xMin: number; xMax: number },
): boolean {
  const { w, h } = WORLD;
  if (!isPassable(speed, start.x, start.y)) return false;
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const startIndex = start.y * w + start.x;
  queue[tail++] = startIndex;
  visited[startIndex] = 1;
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    if (x >= band.xMin && x <= band.xMax) return true;
    const y = (i / w) | 0;
    if (x > 0) tail = pushPassable(speed, visited, queue, tail, i - 1);
    if (x < w - 1) tail = pushPassable(speed, visited, queue, tail, i + 1);
    if (y > 0) tail = pushPassable(speed, visited, queue, tail, i - w);
    if (y < h - 1) tail = pushPassable(speed, visited, queue, tail, i + w);
  }
  return false;
}

function isPassable(speed: Float32Array, x: number, y: number): boolean {
  return speed[y * WORLD.w + x] > 0;
}

function localSlope(height: Float32Array, cx: number, cy: number, w: number, h: number, cell: number): number {
  const left = height[cy * w + Math.max(0, cx - 1)];
  const right = height[cy * w + Math.min(w - 1, cx + 1)];
  const down = height[Math.max(0, cy - 1) * w + cx];
  const up = height[Math.min(h - 1, cy + 1) * w + cx];
  return Math.hypot((right - left) / (2 * cell), (up - down) / (2 * cell));
}

function hash2(x: number, y: number, salt: number): number {
  let n = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0xc2b2ae35, 0x27d4eb2d) ^ Math.imul(salt, 0x165667b1);
  n ^= n >>> 15;
  n = Math.imul(n, 0x2c1b3c6d);
  n ^= n >>> 12;
  n = Math.imul(n, 0x297a2d39);
  n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}

function fbm(x: number, y: number, salt: number, octaves: number): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * freq, y * freq, salt + i * 29) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return value / Math.max(1e-6, norm);
}

function valueNoise(x: number, y: number, salt: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep01(x - x0);
  const ty = smoothstep01(y - y0);
  const a = hash2(x0, y0, salt);
  const b = hash2(x0 + 1, y0, salt);
  const c = hash2(x0, y0 + 1, salt);
  const d = hash2(x0 + 1, y0 + 1, salt);
  return mixNumber(mixNumber(a, b, tx), mixNumber(c, d, tx), ty);
}

function mixNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, v: number): number {
  if (edge0 === edge1) return v < edge0 ? 0 : 1;
  if (edge0 < edge1) return smoothstep01((v - edge0) / (edge1 - edge0));
  return 1 - smoothstep01((v - edge1) / (edge0 - edge1));
}

function smoothstep01(v: number): number {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = clamp(ratio, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}
