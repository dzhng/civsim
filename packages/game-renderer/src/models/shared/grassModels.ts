import { MeshBuilder, type MeshData, type Rgb } from './meshBuilder';

export type GrassPaletteId = 'green-grass' | 'yellow-grass' | 'scrub-grass' | 'sand';

export interface GrassTuftOptions {
  seed?: number;
  blades?: number;
  height?: number;
  width?: number;
  bend?: number;
  spread?: number;
  palette?: GrassPaletteId;
}

export interface GrassTuftStats {
  blades: number;
  segments: number;
  opaqueVertices: number;
  opaqueTriangles: number;
  shadowVertices: number;
}

export const GRASS_TUFT_SEGMENTS = 2;
export const DEFAULT_GRASS_TUFT_BLADES = 9;
export const SLICE00_GRASS_ALBEDO: { root: Rgb; shadow: Rgb; near: Rgb; dry: Rgb } = {
  root: [0.42, 0.50, 0.24],
  shadow: [0.600, 0.627, 0.361],
  near: [0.753, 0.757, 0.471],
  dry: [0.68, 0.66, 0.40],
};

const PALETTES: Record<GrassPaletteId, { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb }> = {
  'green-grass': {
    root: SLICE00_GRASS_ALBEDO.root,
    mid: SLICE00_GRASS_ALBEDO.shadow,
    tip: SLICE00_GRASS_ALBEDO.near,
    dry: SLICE00_GRASS_ALBEDO.dry,
  },
  'yellow-grass': {
    root: [0.38, 0.40, 0.18],
    mid: [0.56, 0.53, 0.25],
    tip: [0.68, 0.62, 0.34],
    dry: [0.70, 0.61, 0.35],
  },
  'scrub-grass': {
    root: [0.31, 0.36, 0.18],
    mid: [0.47, 0.49, 0.25],
    tip: [0.60, 0.58, 0.33],
    dry: [0.66, 0.58, 0.34],
  },
  sand: {
    root: [0.42, 0.40, 0.24],
    mid: [0.59, 0.53, 0.31],
    tip: [0.70, 0.62, 0.38],
    dry: [0.72, 0.62, 0.39],
  },
};

// A small battlefield grass clump: crossed, bent, double-sided blade panels.
// The mesh is intentionally pure and deterministic so model sheets, battle
// scatter, and future terrain integration all review the same primitive.
export function buildGrassTuftMesh(options: GrassTuftOptions = {}): MeshData {
  const seed = options.seed ?? 0x6a55;
  const blades = clampInt(options.blades ?? DEFAULT_GRASS_TUFT_BLADES, 1, 96);
  const height = Math.max(0.05, options.height ?? 0.78);
  const width = Math.max(0.008, options.width ?? 0.060);
  const bend = Math.max(0, options.bend ?? 0.28);
  const spread = Math.max(0, options.spread ?? 0.18);
  const palette = PALETTES[options.palette ?? 'green-grass'];
  const builder = new MeshBuilder();

  for (let i = 0; i < blades; i++) {
    const rootYaw = (i / blades) * Math.PI * 2 + jitter(seed + i * 17, 1, 0.42);
    const rootRadius = spread * Math.sqrt(hash2(seed + i, 2)) * 0.82;
    const root: [number, number, number] = [
      Math.cos(rootYaw) * rootRadius,
      Math.sin(rootYaw) * rootRadius,
      0,
    ];
    const yaw = rootYaw + Math.PI * 0.5 + jitter(seed + i * 23, 3, 0.74);
    const bladeHeight = height * (0.78 + hash2(seed + i, 4) * 0.34);
    const bladeWidth = width * (0.72 + hash2(seed + i, 5) * 0.58);
    const bladeBend = bend * bladeHeight * (0.65 + hash2(seed + i, 6) * 0.55);
    const shade = 0.88 + hash2(seed + i, 7) * 0.18;
    const straw = hash2(seed + i, 8) > 0.78 ? 0.34 : hash2(seed + i, 9) * 0.12;
    addBlade(builder, {
      root,
      yaw,
      height: bladeHeight,
      width: bladeWidth,
      bend: bladeBend,
      lowerColor: scaleColor(mixColor(palette.root, palette.dry, straw * 0.45), shade),
      upperColor: scaleColor(mixColor(palette.mid, palette.tip, 0.42 + hash2(seed + i, 10) * 0.24), shade),
    });
  }

  return builder.finish('grass tuft mesh');
}

export function grassTuftStats(mesh: MeshData, blades = DEFAULT_GRASS_TUFT_BLADES): GrassTuftStats {
  return {
    blades,
    segments: GRASS_TUFT_SEGMENTS,
    opaqueVertices: mesh.opaque.vertices.length / 10,
    opaqueTriangles: mesh.opaque.indexCount / 3,
    shadowVertices: mesh.shadow.vertices.length / 10,
  };
}

function addBlade(
  builder: MeshBuilder,
  blade: {
    root: [number, number, number];
    yaw: number;
    height: number;
    width: number;
    bend: number;
    lowerColor: Rgb;
    upperColor: Rgb;
  },
) {
  const fx = Math.cos(blade.yaw);
  const fy = Math.sin(blade.yaw);
  const lx = -fy;
  const ly = fx;
  const h0 = blade.height * 0.52;
  const rootW = blade.width * 0.5;
  const midW = blade.width * 0.28;
  const tipW = blade.width * 0.055;
  const mid: [number, number, number] = [
    blade.root[0] + fx * blade.bend * 0.34,
    blade.root[1] + fy * blade.bend * 0.34,
    h0,
  ];
  const tip: [number, number, number] = [
    blade.root[0] + fx * blade.bend,
    blade.root[1] + fy * blade.bend,
    blade.height,
  ];
  const r0 = edge(blade.root, lx, ly, rootW);
  const r1 = edge(mid, lx, ly, midW);
  const r2 = edge(tip, lx, ly, tipW);
  builder.panel3d([r0[0], r0[1], r1[1], r1[0]], blade.lowerColor, 1);
  builder.panel3d([r1[0], r1[1], r2[1], r2[0]], blade.upperColor, 1);
}

function edge(center: [number, number, number], lx: number, ly: number, halfWidth: number): [[number, number, number], [number, number, number]] {
  return [
    [center[0] - lx * halfWidth, center[1] - ly * halfWidth, center[2]],
    [center[0] + lx * halfWidth, center[1] + ly * halfWidth, center[2]],
  ];
}

function mixColor(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function scaleColor(color: Rgb, scale: number): Rgb {
  return [clamp01(color[0] * scale), clamp01(color[1] * scale), clamp01(color[2] * scale)];
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

function jitter(seed: number, salt: number, radius: number): number {
  return (hash2(seed, salt) - 0.5) * radius * 2;
}

function hash2(x: number, y: number): number {
  let n = ((x * 374761393) | 0) + ((y * 668265263) | 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
