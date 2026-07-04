import { MeshBuilder, type MeshData, type Rgb } from './meshBuilder';

export type GrassPaletteId = 'green-grass' | 'yellow-grass' | 'scrub-grass' | 'sand';
export type GrassAccentStyle =
  | 'tuft'
  | 'root-shadow'
  | 'soft-root-mass'
  | 'soft-root-fiber'
  | 'field-fiber-shell'
  | 'field-fiber-shell-visibility'
  | 'field-fiber-body'
  | 'field-fiber-bundle'
  | 'field-strand-mat'
  | 'field-woven-mat'
  | 'field-domain-shell'
  | 'field-domain-micro-strand'
  | 'alpha-impostor'
  | 'billboard-cluster'
  | 'volume-card'
  | 'fiber-ribbon'
  | 'hybrid-root-fiber';

export interface GrassTuftOptions {
  seed?: number;
  blades?: number;
  height?: number;
  width?: number;
  bend?: number;
  spread?: number;
  palette?: GrassPaletteId;
  accentStyle?: GrassAccentStyle;
}

export interface GrassTuftStats {
  blades: number;
  segments: number;
  opaqueVertices: number;
  opaqueTriangles: number;
  shadowVertices: number;
}

export interface FieldDomainSilhouetteScale {
  widthMin: number;
  widthMax: number;
  heightMin: number;
  heightMax: number;
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
  const accentStyle = options.accentStyle ?? 'tuft';
  if (accentStyle === 'root-shadow') return buildRootShadowAccentMesh(seed, blades, height, width, bend, spread, palette);
  if (accentStyle === 'soft-root-mass') return buildSoftRootMassAccentMesh(seed, blades, height, width, bend, spread, palette);
  if (accentStyle === 'soft-root-fiber') return buildSoftRootFiberAccentMesh(seed, blades, height, width, bend, spread, palette);
  if (accentStyle === 'field-fiber-shell') return buildFieldFiberShellAccentMesh(seed, blades, height, width, bend, spread, palette, false);
  if (accentStyle === 'field-fiber-shell-visibility') return buildFieldFiberShellAccentMesh(seed, blades, height, width, bend, spread, palette, true);
  if (accentStyle === 'field-fiber-body') return buildFieldFiberBodyMesh(seed, blades, height, width, bend, spread, palette, false);
  if (accentStyle === 'field-fiber-bundle') return buildFieldFiberBodyMesh(seed, blades, height, width, bend, spread, palette, true);
  if (accentStyle === 'field-strand-mat') return buildContinuousStrandBodyMesh(seed, blades, height, width, bend, spread, palette, false);
  if (accentStyle === 'field-woven-mat') return buildContinuousStrandBodyMesh(seed, blades, height, width, bend, spread, palette, true);
  if (accentStyle === 'field-domain-shell') return buildFieldDomainShellMesh(seed, blades, height, width, bend, spread, palette);
  if (accentStyle === 'field-domain-micro-strand') return buildFieldDomainMicroStrandMesh(seed, blades, height, width, bend, spread, palette);
  if (accentStyle === 'alpha-impostor') return buildAlphaImpostorPatchMesh(seed, blades, height, width, bend, spread, palette);
  if (accentStyle === 'billboard-cluster') return buildBillboardClusterMesh(seed, blades, height, width, bend, spread, palette);
  if (accentStyle === 'volume-card') return buildNearGrassVolumeCardMesh(seed, blades, height, width, bend, spread, palette);
  if (accentStyle === 'fiber-ribbon') return buildFiberRibbonAccentMesh(seed, blades, height, width, bend, spread, palette);
  if (accentStyle === 'hybrid-root-fiber') return buildHybridRootFiberAccentMesh(seed, blades, height, width, bend, spread, palette);
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

export function fieldDomainSilhouetteStrandsPerCell(style: GrassAccentStyle, blades: number): number {
  if (style === 'field-domain-micro-strand') return Math.max(26, Math.min(40, clampInt(blades, 0, 96) + 14));
  if (style === 'field-domain-shell') return Math.max(5, Math.min(7, Math.ceil(clampInt(blades, 0, 96) * 0.5) + 1));
  return 0;
}

export function fieldStrandMatStrokeCount(style: GrassAccentStyle, blades: number): number {
  const clampedBlades = clampInt(blades, 0, 96);
  if (style === 'field-woven-mat') return Math.max(22, Math.min(28, clampedBlades + 18));
  if (style === 'field-strand-mat') return Math.max(18, Math.min(40, clampedBlades + 12));
  return 0;
}

export function fieldDomainSilhouetteScale(style: GrassAccentStyle, width: number, height: number): FieldDomainSilhouetteScale {
  if (style === 'field-domain-micro-strand') {
    return {
      widthMin: width * 0.16,
      widthMax: width * 0.38,
      heightMin: height * 0.18,
      heightMax: height * 0.46,
    };
  }
  if (style === 'field-domain-shell') {
    return {
      widthMin: width * 2.50,
      widthMax: width * 4.15,
      heightMin: height * 0.32,
      heightMax: height * 0.58,
    };
  }
  return { widthMin: 0, widthMax: 0, heightMin: 0, heightMax: 0 };
}

function buildRootShadowAccentMesh(
  seed: number,
  blades: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
): MeshData {
  const builder = new MeshBuilder();
  addRootShadowAccents(builder, seed, 1, height, width, bend, spread, palette);
  addRootMatFibers(builder, seed + 0x4a1, Math.max(4, Math.min(6, blades + 1)), height, width, bend, spread, palette);
  return builder.finish('grass root-shadow accent mesh');
}

function buildSoftRootMassAccentMesh(
  seed: number,
  blades: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
): MeshData {
  const builder = new MeshBuilder();
  addRootMatFibers(builder, seed + 0x5f37, Math.max(3, Math.min(5, blades + 1)), height * 0.82, width * 1.12, bend * 0.72, spread * 0.68, palette);
  return builder.finish('grass soft-root-mass accent mesh');
}

function buildSoftRootFiberAccentMesh(
  seed: number,
  blades: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
): MeshData {
  const builder = new MeshBuilder();
  addRootMatFibers(builder, seed + 0x5f37, 3, height * 0.72, width * 1.08, bend * 0.64, spread * 0.60, palette);
  addSoftRootFiberFans(builder, seed + 0x7289, softRootFiberRibbonCount(blades), height, width, bend, spread, palette);
  return builder.finish('grass soft-root-fiber accent mesh');
}

function buildFieldFiberShellAccentMesh(
  seed: number,
  blades: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
  visibility: boolean,
): MeshData {
  const builder = new MeshBuilder();
  addFieldFiberShellPanels(builder, seed + 0x51e11, fieldFiberShellRibbonCount(blades), height, width, bend, spread, palette, visibility);
  return builder.finish('grass field-fiber-shell accent mesh');
}

function buildFieldFiberBodyMesh(
  seed: number,
  blades: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
  bundled: boolean,
): MeshData {
  const builder = new MeshBuilder();
  const fibers = bundled
    ? Math.max(10, Math.min(14, blades + 4))
    : Math.max(12, Math.min(18, blades * 2));
  const lowerTone = scaleColor(mixColor(palette.root, palette.mid, 0.18), bundled ? 0.68 : 0.72);
  const upperTone = scaleColor(mixColor(palette.mid, palette.tip, 0.28), bundled ? 0.78 : 0.82);
  for (let i = 0; i < fibers; i++) {
    const ringT = fibers <= 1 ? 0 : i / (fibers - 1);
    const rootYaw = (i / fibers) * Math.PI * 2 + jitter(seed + i * 37, 1, bundled ? 0.30 : 0.44);
    const rootRadius = spread * Math.sqrt(hash2(seed + i, 2)) * (bundled ? 0.34 : 0.62);
    const root: [number, number, number] = [
      Math.cos(rootYaw) * rootRadius,
      Math.sin(rootYaw) * rootRadius,
      height * (0.008 + hash2(seed + i, 3) * 0.016),
    ];
    const yaw = rootYaw + Math.PI * 0.5 + jitter(seed + i * 41, 4, bundled ? 0.34 : 0.62);
    const heightJitter = 0.58 + hash2(seed + i, 5) * (bundled ? 0.28 : 0.40);
    const fiberHeight = height * heightJitter * (bundled ? 0.82 : 0.92);
    const fiberWidth = width * (bundled
      ? 1.05 + hash2(seed + i, 6) * 0.50
      : 0.58 + hash2(seed + i, 6) * 0.44);
    const fiberBend = bend * fiberHeight * (bundled ? 0.08 + ringT * 0.10 : 0.12 + hash2(seed + i, 7) * 0.24);
    const shade = 0.84 + hash2(seed + i, 8) * 0.20;
    addTaperedPanel(builder, {
      root,
      yaw,
      height: fiberHeight,
      width: fiberWidth,
      bend: fiberBend,
      lowerColor: scaleColor(lowerTone, shade),
      upperColor: scaleColor(upperTone, shade),
      tipScale: bundled ? 0.12 : 0.060,
    });
  }
  return builder.finish(bundled ? 'grass field-fiber-bundle body mesh' : 'grass field-fiber body mesh');
}

function buildContinuousStrandBodyMesh(
  seed: number,
  blades: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
  woven: boolean,
): MeshData {
  const builder = new MeshBuilder();
  const strands = fieldStrandMatStrokeCount(woven ? 'field-woven-mat' : 'field-strand-mat', blades);
  const baseTone = scaleColor(mixColor(palette.root, palette.mid, woven ? 0.26 : 0.22), woven ? 0.84 : 0.88);
  const highTone = scaleColor(mixColor(palette.mid, palette.tip, woven ? 0.34 : 0.30), woven ? 0.92 : 0.96);
  const shadowTone = scaleColor(mixColor(palette.root, palette.mid, 0.18), woven ? 0.76 : 0.80);
  const mainYaw = jitter(seed, 17, 0.16);
  const crossYaw = mainYaw + Math.PI * 0.5 + jitter(seed, 23, 0.10);
  for (let i = 0; i < strands; i++) {
    const t = strands <= 1 ? 0 : i / (strands - 1);
    const crossLayer = woven && i % 3 === 1;
    const rootYaw = (i / strands) * Math.PI * 2 + jitter(seed + i * 29, 1, woven ? 0.26 : 0.36);
    const lateral = (t - 0.5) * spread * (woven ? 1.15 : 0.92) + jitter(seed + i * 31, 2, spread * 0.18);
    const along = jitter(seed + i * 37, 3, spread * (woven ? 0.42 : 0.34));
    const yaw = (crossLayer ? crossYaw : mainYaw)
      + jitter(seed + i * 41, 4, woven ? 0.42 : 0.56)
      + (hash2(seed + i, 5) > 0.54 ? Math.PI : 0);
    const lx = -Math.sin(yaw);
    const ly = Math.cos(yaw);
    const fx = Math.cos(yaw);
    const fy = Math.sin(yaw);
    const root: [number, number, number] = [
      lx * lateral + fx * along,
      ly * lateral + fy * along,
      height * (0.010 + hash2(seed + i, 6) * 0.020),
    ];
    const strandLength = width * (woven ? 3.2 : 2.8) + spread * (woven ? 0.18 : 0.14);
    const strandWidth = width * (woven ? 0.78 : 0.66) * (0.72 + hash2(seed + i, 7) * 0.34);
    const lift = height * (woven ? 0.060 : 0.085) * (0.62 + hash2(seed + i, 8) * 0.42);
    const curve = bend * (woven ? 0.035 : 0.055) + jitter(seed + i * 43, 9, spread * 0.025);
    const shade = 0.86 + hash2(seed + i, 10) * 0.18;
    addGroundStrandStroke(builder, {
      root,
      yaw,
      length: strandLength,
      width: strandWidth,
      lift,
      curve,
      lowerColor: scaleColor(i % 4 === 0 ? shadowTone : baseTone, shade),
      upperColor: scaleColor(highTone, shade),
      tipScale: woven ? 0.32 : 0.22,
    });
  }
  return builder.finish(woven ? 'grass field-woven-mat body mesh' : 'grass field-strand-mat body mesh');
}

function buildFieldDomainShellMesh(
  seed: number,
  blades: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
): MeshData {
  const builder = new MeshBuilder();
  const shells = fieldDomainSilhouetteStrandsPerCell('field-domain-shell', blades);
  const strokeTone = scaleColor(mixColor(palette.root, palette.mid, 0.24), 0.82);
  const liftTone = scaleColor(mixColor(palette.mid, palette.tip, 0.28), 0.88);
  const shadowTone = scaleColor(mixColor(palette.root, palette.mid, 0.08), 0.64);
  for (let i = 0; i < shells; i++) {
    const t = shells <= 1 ? 0 : i / (shells - 1);
    const yaw = jitter(seed + i * 53, 1, 0.34) + (i % 2 === 0 ? 0 : Math.PI * 0.5);
    const root: [number, number, number] = [
      jitter(seed + i * 59, 2, spread * 0.40),
      jitter(seed + i * 61, 3, spread * 0.28),
      height * (0.012 + t * 0.018),
    ];
    addTaperedPanel(builder, {
      root,
      yaw,
      height: height * (0.32 + t * 0.18 + hash2(seed + i, 4) * 0.08),
      width: width * (3.6 - t * 1.1 + hash2(seed + i, 5) * 0.55),
      bend: bend * height * (0.06 + t * 0.10),
      lowerColor: scaleColor(i % 3 === 0 ? shadowTone : strokeTone, 0.86 + hash2(seed + i, 6) * 0.14),
      upperColor: scaleColor(liftTone, 0.88 + hash2(seed + i, 7) * 0.12),
      tipScale: 0.44 - t * 0.10,
    });
  }
  return builder.finish('grass field-domain-shell mesh');
}

function buildFieldDomainMicroStrandMesh(
  seed: number,
  blades: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
): MeshData {
  const builder = new MeshBuilder();
  const strands = fieldDomainSilhouetteStrandsPerCell('field-domain-micro-strand', blades);
  const baseTone = scaleColor(mixColor(palette.root, palette.mid, 0.16), 0.70);
  const midTone = scaleColor(mixColor(palette.root, palette.mid, 0.34), 0.82);
  const tipTone = scaleColor(mixColor(palette.mid, palette.tip, 0.22), 0.84);
  const yawBase = jitter(seed, 1, 0.18);
  for (let i = 0; i < strands; i++) {
    const t = strands <= 1 ? 0 : i / (strands - 1);
    const lane = (i % 9) - 4;
    const root: [number, number, number] = [
      (t - 0.5) * spread * 0.82 + jitter(seed + i * 31, 2, spread * 0.08),
      lane * spread * 0.030 + jitter(seed + i * 37, 3, spread * 0.13),
      height * (0.006 + hash2(seed + i, 4) * 0.012),
    ];
    addTaperedPanel(builder, {
      root,
      yaw: yawBase + lane * 0.020 + jitter(seed + i * 41, 5, 0.16),
      height: height * (0.18 + hash2(seed + i, 6) * 0.26 + (1 - t) * 0.020),
      width: width * (0.16 + hash2(seed + i, 7) * 0.22),
      bend: bend * height * (0.026 + hash2(seed + i, 8) * 0.052),
      lowerColor: scaleColor(i % 5 === 0 ? baseTone : midTone, 0.84 + hash2(seed + i, 9) * 0.16),
      upperColor: scaleColor(tipTone, 0.88 + hash2(seed + i, 10) * 0.14),
      tipScale: 0.030,
    });
  }
  return builder.finish('grass field-domain-micro-strand mesh');
}

function buildAlphaImpostorPatchMesh(
  seed: number,
  blades: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
): MeshData {
  const builder = new MeshBuilder();
  const baseTone = scaleColor(mixColor(palette.root, palette.mid, 0.18), 0.58);
  const strokeLower = scaleColor(mixColor(palette.root, palette.mid, 0.10), 0.70);
  const strokeUpper = scaleColor(mixColor(palette.mid, palette.tip, 0.24), 0.72);
  addOvalPatch(builder, [0, 0, height * 0.012], width * 5.2 + spread * 0.18, width * 2.9 + spread * 0.08, jitter(seed, 2, 0.28), baseTone, seed ^ 0x13a7);
  const strokes = Math.max(4, Math.min(5, blades + 1));
  for (let i = 0; i < strokes; i++) {
    const yaw = (i / strokes) * Math.PI * 2 + jitter(seed + i * 17, 1, 0.38);
    const rootRadius = spread * Math.sqrt(hash2(seed + i, 2)) * 0.34;
    const root: [number, number, number] = [
      Math.cos(yaw) * rootRadius,
      Math.sin(yaw) * rootRadius,
      height * (0.030 + hash2(seed + i, 3) * 0.018),
    ];
    addTaperedPanel(builder, {
      root,
      yaw: yaw + Math.PI * 0.5 + jitter(seed + i * 23, 4, 0.30),
      height: height * (0.22 + hash2(seed + i, 5) * 0.13),
      width: width * (2.8 + hash2(seed + i, 6) * 1.0),
      bend: bend * height * (0.10 + hash2(seed + i, 7) * 0.10),
      lowerColor: scaleColor(strokeLower, 0.88 + hash2(seed + i, 8) * 0.14),
      upperColor: scaleColor(strokeUpper, 0.92 + hash2(seed + i, 9) * 0.12),
      tipScale: 0.42,
    });
  }
  return builder.finish('grass alpha-impostor patch mesh');
}

function buildBillboardClusterMesh(
  seed: number,
  blades: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
): MeshData {
  const builder = new MeshBuilder();
  const baseTone = scaleColor(mixColor(palette.root, palette.mid, 0.08), 0.48);
  const upperTone = scaleColor(mixColor(palette.mid, palette.tip, 0.28), 0.72);
  const cards = Math.max(4, Math.min(7, blades + 2));
  for (let i = 0; i < cards; i++) {
    const cardT = cards <= 1 ? 0 : i / (cards - 1);
    const rootYaw = (i / cards) * Math.PI * 2 + jitter(seed + i * 29, 1, 0.24);
    const rootRadius = spread * Math.sqrt(hash2(seed + i, 2)) * 0.28;
    const root: [number, number, number] = [
      Math.cos(rootYaw) * rootRadius,
      Math.sin(rootYaw) * rootRadius,
      height * (0.012 + hash2(seed + i, 3) * 0.016),
    ];
    addTaperedPanel(builder, {
      root,
      yaw: rootYaw + Math.PI * 0.5 + (cardT - 0.5) * 1.24 + jitter(seed + i * 31, 4, 0.20),
      height: height * (0.64 + hash2(seed + i, 5) * 0.22),
      width: width * (2.4 + hash2(seed + i, 6) * 0.90),
      bend: bend * height * (0.08 + hash2(seed + i, 7) * 0.16),
      lowerColor: scaleColor(baseTone, 0.86 + hash2(seed + i, 8) * 0.12),
      upperColor: scaleColor(upperTone, 0.88 + hash2(seed + i, 9) * 0.16),
      tipScale: 0.24,
    });
  }
  return builder.finish('grass billboard-cluster mesh');
}

function buildNearGrassVolumeCardMesh(
  seed: number,
  blades: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
): MeshData {
  const builder = new MeshBuilder();
  const layers = Math.max(5, Math.min(8, blades + 3));
  const rootTone = scaleColor(mixColor(palette.root, palette.mid, 0.04), 0.50);
  const midTone = scaleColor(mixColor(palette.root, palette.mid, 0.34), 0.70);
  for (let i = 0; i < layers; i++) {
    const t = layers <= 1 ? 0 : i / (layers - 1);
    const yaw = (t - 0.5) * 1.08 + jitter(seed + i * 43, 1, 0.12);
    const root: [number, number, number] = [
      jitter(seed + i, 2, spread * 0.18),
      jitter(seed + i, 3, spread * 0.10),
      height * (0.018 + t * 0.020),
    ];
    addTaperedPanel(builder, {
      root,
      yaw,
      height: height * (0.42 + t * 0.28 + hash2(seed + i, 4) * 0.08),
      width: width * (3.8 - t * 1.2 + hash2(seed + i, 5) * 0.65),
      bend: bend * height * (0.05 + t * 0.10),
      lowerColor: scaleColor(rootTone, 0.86 + hash2(seed + i, 6) * 0.10),
      upperColor: scaleColor(midTone, 0.90 + hash2(seed + i, 7) * 0.12),
      tipScale: 0.62 - t * 0.18,
    });
  }
  return builder.finish('grass near volume-card mesh');
}

function buildFiberRibbonAccentMesh(
  seed: number,
  blades: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
): MeshData {
  const builder = new MeshBuilder();
  addFiberRibbons(builder, seed, Math.max(2, Math.min(blades, 8)), height, width, bend, spread, palette);
  return builder.finish('grass fiber-ribbon accent mesh');
}

function buildHybridRootFiberAccentMesh(
  seed: number,
  blades: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
): MeshData {
  const builder = new MeshBuilder();
  addRootShadowAccents(builder, seed, Math.max(2, Math.min(3, Math.ceil(blades * 0.45))), height, width, bend, spread, palette);
  addFiberRibbons(builder, seed + 421, Math.max(2, Math.min(4, Math.ceil(blades * 0.55))), height * 0.76, width * 1.55, bend * 0.58, spread * 0.72, palette);
  return builder.finish('grass hybrid root-fiber accent mesh');
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

function addRootShadowAccents(
  builder: MeshBuilder,
  seed: number,
  count: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
) {
  const rootColor = scaleColor(mixColor(palette.root, palette.mid, 0.16), 0.64);
  for (let i = 0; i < count; i++) {
    const yaw = (i / count) * Math.PI + jitter(seed + i * 29, 1, 0.64);
    const rootRadius = spread * (0.06 + hash2(seed + i, 2) * 0.22);
    const center: [number, number, number] = [
      Math.cos(yaw + jitter(seed + i, 3, 0.5)) * rootRadius,
      Math.sin(yaw + jitter(seed + i, 4, 0.5)) * rootRadius,
      height * (0.010 + hash2(seed + i, 5) * 0.016),
    ];
    const rx = width * (5.60 + hash2(seed + i, 6) * 2.10) + bend * height * 0.08;
    const ry = width * (2.80 + hash2(seed + i, 7) * 1.25);
    addOvalPatch(builder, center, rx, ry, yaw, rootColor, seed + i * 97);
  }
}

function addLowCrownAccents(
  builder: MeshBuilder,
  seed: number,
  count: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
) {
  const crownColor = scaleColor(mixColor(palette.root, palette.mid, 0.36), 0.68);
  for (let i = 0; i < count; i++) {
    const yaw = (i / Math.max(1, count)) * Math.PI + jitter(seed + i * 31, 1, 0.70);
    const rootRadius = spread * (0.08 + hash2(seed + i, 2) * 0.30);
    const root: [number, number, number] = [
      Math.cos(yaw) * rootRadius,
      Math.sin(yaw) * rootRadius,
      height * 0.050,
    ];
    addTaperedPanel(builder, {
      root,
      yaw,
      height: height * (0.20 + hash2(seed + i, 3) * 0.13),
      width: width * (4.2 + hash2(seed + i, 4) * 1.6),
      bend: bend * height * (0.12 + hash2(seed + i, 5) * 0.16),
      lowerColor: scaleColor(crownColor, 0.76),
      upperColor: crownColor,
      tipScale: 0.50,
    });
  }
}

function addRootMatFibers(
  builder: MeshBuilder,
  seed: number,
  count: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
) {
  const lowerTone = scaleColor(mixColor(palette.root, palette.mid, 0.10), 0.70);
  const upperTone = scaleColor(mixColor(palette.root, palette.mid, 0.32), 0.72);
  for (let i = 0; i < count; i++) {
    const rootYaw = (i / count) * Math.PI * 2 + jitter(seed + i * 23, 1, 0.46);
    const rootRadius = spread * Math.sqrt(hash2(seed + i, 2)) * 0.58;
    const root: [number, number, number] = [
      Math.cos(rootYaw) * rootRadius,
      Math.sin(rootYaw) * rootRadius,
      height * (0.006 + hash2(seed + i, 3) * 0.010),
    ];
    const yaw = rootYaw + Math.PI * 0.5 + jitter(seed + i * 31, 4, 0.62);
    const fiberHeight = height * (0.08 + hash2(seed + i, 5) * 0.055);
    const fiberWidth = width * (0.86 + hash2(seed + i, 6) * 0.58);
    const fiberBend = bend * fiberHeight * (0.14 + hash2(seed + i, 7) * 0.22);
    const shade = 0.82 + hash2(seed + i, 8) * 0.18;
    addTaperedPanel(builder, {
      root,
      yaw,
      height: fiberHeight,
      width: fiberWidth,
      bend: fiberBend,
      lowerColor: scaleColor(lowerTone, shade),
      upperColor: scaleColor(upperTone, shade),
      tipScale: 0.24,
    });
  }
}

function addSoftRootFiberFans(
  builder: MeshBuilder,
  seed: number,
  count: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
) {
  const baseTone = scaleColor(mixColor(palette.root, palette.mid, 0.08), 0.62);
  const upperTone = scaleColor(mixColor(palette.root, palette.mid, 0.26), 0.66);
  for (let i = 0; i < count; i++) {
    const fanT = count <= 1 ? 0 : i / (count - 1);
    const rootYaw = (i / count) * Math.PI * 2 + jitter(seed + i * 19, 1, 0.34);
    const yaw = rootYaw + (fanT - 0.5) * 0.92 + jitter(seed + i * 23, 2, 0.22);
    const rootRadius = spread * Math.sqrt(hash2(seed + i, 3)) * 0.34;
    const root: [number, number, number] = [
      Math.cos(rootYaw) * rootRadius,
      Math.sin(rootYaw) * rootRadius,
      height * (0.010 + hash2(seed + i, 4) * 0.014),
    ];
    const fiberHeight = height * (0.40 + hash2(seed + i, 5) * 0.16);
    const fiberWidth = width * (3.20 + hash2(seed + i, 6) * 1.20);
    const fiberBend = bend * fiberHeight * (0.16 + hash2(seed + i, 7) * 0.22);
    const shade = 0.82 + hash2(seed + i, 8) * 0.16;
    addTaperedPanel(builder, {
      root,
      yaw,
      height: fiberHeight,
      width: fiberWidth,
      bend: fiberBend,
      lowerColor: scaleColor(baseTone, shade),
      upperColor: scaleColor(upperTone, shade),
      tipScale: 0.26,
    });
  }
}

function softRootFiberRibbonCount(blades: number): number {
  return Math.max(4, Math.min(5, clampInt(blades, 0, 96) + 1));
}

function addFieldFiberShellPanels(
  builder: MeshBuilder,
  seed: number,
  count: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
  visibility = false,
) {
  const baseTone = visibility
    ? scaleColor(mixColor(palette.root, palette.mid, 0.02), 0.38)
    : scaleColor(mixColor(palette.root, palette.mid, 0.05), 0.58);
  const upperTone = visibility
    ? scaleColor(mixColor(palette.root, palette.mid, 0.42), 0.74)
    : scaleColor(mixColor(palette.root, palette.mid, 0.30), 0.64);
  for (let i = 0; i < count; i++) {
    const cross = count <= 1 ? 0 : i - (count - 1) * 0.5;
    const rootYaw = (i / Math.max(1, count)) * Math.PI + jitter(seed + i * 29, 1, 0.22);
    const yaw = rootYaw + cross * 1.08 + jitter(seed + i * 31, 2, 0.18);
    const rootRadius = spread * Math.sqrt(hash2(seed + i, 3)) * 0.22;
    const root: [number, number, number] = [
      Math.cos(rootYaw) * rootRadius,
      Math.sin(rootYaw) * rootRadius,
      height * (0.006 + hash2(seed + i, 4) * 0.010),
    ];
    const fiberHeight = height * (visibility ? 0.86 + hash2(seed + i, 5) * 0.12 : 0.56 + hash2(seed + i, 5) * 0.18);
    const fiberWidth = width * (visibility ? 1.48 + hash2(seed + i, 6) * 0.36 : 0.76 + hash2(seed + i, 6) * 0.28);
    const fiberBend = bend * fiberHeight * (visibility ? 0.08 + hash2(seed + i, 7) * 0.10 : 0.18 + hash2(seed + i, 7) * 0.18);
    const shade = visibility ? 0.92 + hash2(seed + i, 8) * 0.10 : 0.84 + hash2(seed + i, 8) * 0.12;
    addTaperedPanel(builder, {
      root,
      yaw,
      height: fiberHeight,
      width: fiberWidth,
      bend: fiberBend,
      lowerColor: scaleColor(baseTone, shade),
      upperColor: scaleColor(upperTone, shade),
      tipScale: visibility ? 0.24 : 0.16,
    });
  }
}

function fieldFiberShellRibbonCount(blades: number): number {
  return Math.max(1, Math.min(2, clampInt(blades, 0, 96)));
}

function addFiberRibbons(
  builder: MeshBuilder,
  seed: number,
  count: number,
  height: number,
  width: number,
  bend: number,
  spread: number,
  palette: { root: Rgb; mid: Rgb; tip: Rgb; dry: Rgb },
) {
  const lowerTone = mixColor(palette.root, palette.mid, 0.24);
  const upperTone = mixColor(palette.root, palette.mid, 0.50);
  for (let i = 0; i < count; i++) {
    const rootYaw = (i / count) * Math.PI * 2 + jitter(seed + i * 19, 1, 0.38);
    const rootRadius = spread * Math.sqrt(hash2(seed + i, 2)) * 0.56;
    const root: [number, number, number] = [
      Math.cos(rootYaw) * rootRadius,
      Math.sin(rootYaw) * rootRadius,
      0,
    ];
    const yaw = rootYaw + Math.PI * 0.5 + jitter(seed + i * 23, 3, 0.48);
    const ribbonHeight = height * (0.70 + hash2(seed + i, 4) * 0.26);
    const ribbonWidth = width * (1.55 + hash2(seed + i, 5) * 0.95);
    const ribbonBend = bend * ribbonHeight * (0.36 + hash2(seed + i, 6) * 0.42);
    const shade = 0.70 + hash2(seed + i, 7) * 0.14;
    addTaperedPanel(builder, {
      root,
      yaw,
      height: ribbonHeight,
      width: ribbonWidth,
      bend: ribbonBend,
      lowerColor: scaleColor(lowerTone, shade * 0.88),
      upperColor: scaleColor(upperTone, shade),
      tipScale: 0.18,
    });
  }
}

function addDiamondPatch(builder: MeshBuilder, center: [number, number, number], rx: number, ry: number, yaw: number, color: Rgb) {
  const fx = Math.cos(yaw);
  const fy = Math.sin(yaw);
  const lx = -fy;
  const ly = fx;
  builder.panel3d([
    [center[0] + fx * rx, center[1] + fy * rx, center[2]],
    [center[0] + lx * ry, center[1] + ly * ry, center[2] + 0.001],
    [center[0] - fx * rx, center[1] - fy * rx, center[2]],
    [center[0] - lx * ry, center[1] - ly * ry, center[2] + 0.001],
  ], color, 1);
}

function addOvalPatch(builder: MeshBuilder, center: [number, number, number], rx: number, ry: number, yaw: number, color: Rgb, seed: number) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const points: [number, number, number][] = [];
  const sides = 10;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const px = Math.cos(a) * rx * (0.90 + hash2(seed + i, 11) * 0.18);
    const py = Math.sin(a) * ry * (0.88 + hash2(seed + i, 17) * 0.20);
    points.push([
      center[0] + px * cy - py * sy,
      center[1] + px * sy + py * cy,
      center[2] + (i % 2) * 0.0005,
    ]);
  }
  builder.panel3d(points, color, 1);
}

function addTaperedPanel(
  builder: MeshBuilder,
  blade: {
    root: [number, number, number];
    yaw: number;
    height: number;
    width: number;
    bend: number;
    lowerColor: Rgb;
    upperColor: Rgb;
    tipScale: number;
  },
) {
  const fx = Math.cos(blade.yaw);
  const fy = Math.sin(blade.yaw);
  const lx = -fy;
  const ly = fx;
  const h0 = blade.height * 0.58;
  const rootW = blade.width * 0.5;
  const midW = blade.width * 0.34;
  const tipW = blade.width * blade.tipScale;
  const mid: [number, number, number] = [
    blade.root[0] + fx * blade.bend * 0.32,
    blade.root[1] + fy * blade.bend * 0.32,
    blade.root[2] + h0,
  ];
  const tip: [number, number, number] = [
    blade.root[0] + fx * blade.bend,
    blade.root[1] + fy * blade.bend,
    blade.root[2] + blade.height,
  ];
  const r0 = edge(blade.root, lx, ly, rootW);
  const r1 = edge(mid, lx, ly, midW);
  const r2 = edge(tip, lx, ly, tipW);
  builder.panel3d([r0[0], r0[1], r1[1], r1[0]], blade.lowerColor, 1);
  builder.panel3d([r1[0], r1[1], r2[1], r2[0]], blade.upperColor, 1);
}

function addGroundStrandStroke(
  builder: MeshBuilder,
  strand: {
    root: [number, number, number];
    yaw: number;
    length: number;
    width: number;
    lift: number;
    curve: number;
    lowerColor: Rgb;
    upperColor: Rgb;
    tipScale: number;
  },
) {
  const fx = Math.cos(strand.yaw);
  const fy = Math.sin(strand.yaw);
  const lx = -fy;
  const ly = fx;
  const startW = strand.width * 0.48;
  const midW = strand.width * 0.36;
  const endW = strand.width * strand.tipScale;
  const mid: [number, number, number] = [
    strand.root[0] + fx * strand.length * 0.54 + lx * strand.curve * 0.45,
    strand.root[1] + fy * strand.length * 0.54 + ly * strand.curve * 0.45,
    strand.root[2] + strand.lift * 0.55,
  ];
  const end: [number, number, number] = [
    strand.root[0] + fx * strand.length + lx * strand.curve,
    strand.root[1] + fy * strand.length + ly * strand.curve,
    strand.root[2] + strand.lift,
  ];
  const p0 = edge(strand.root, lx, ly, startW);
  const p1 = edge(mid, lx, ly, midW);
  const p2 = edge(end, lx, ly, endW);
  builder.groundPanel([p0[0], p0[1], p1[1], p1[0]], strand.lowerColor, 1);
  builder.groundPanel([p1[0], p1[1], p2[1], p2[0]], strand.upperColor, 1);
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
