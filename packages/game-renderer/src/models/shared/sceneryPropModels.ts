import type { LeafStyle } from './leafAtlas';
import type { TreeOptions } from './tree/options';
import { TREE_PRESETS } from './tree/presets';
import { buildEzTreeMesh } from './ezTreeMesh';
import { MeshBuilder, type MeshData, type Rgb } from './meshBuilder';

// A broad rocky massif, not a single sharp pyramid: one wide low dome with a
// cluster of lower, offset shoulder-peaks of varied footprint and height. The
// overlapping humps break the silhouette so a range reads as ridged stone
// rather than a field of identical cones, and the low height-to-radius ratios
// keep it from towering over nearby cities, roads, and labels.
export function buildMountainMesh(): MeshData {
  const builder = new MeshBuilder();
  builder.shadow(1.18, 0.74, 0.22);
  // A cool blue-grey stone: the scenery shader warms lit faces, so the base
  // leans slightly cool to land on neutral grey rock rather than tan earth.
  const base: Rgb = [0.42, 0.44, 0.47];
  const top: Rgb = [0.57, 0.59, 0.62];
  const shade = (s: number): Rgb => [base[0] * s, base[1] * s, base[2] * s];
  builder.peak([0.0, 0.0, 0], 1.02, 0.60, 9, base, top, 11); // broad main body
  builder.peak([-0.46, 0.30, 0], 0.56, 0.74, 8, shade(0.93), top, 23); // taller shoulder
  builder.peak([0.52, -0.16, 0], 0.52, 0.56, 8, shade(0.97), top, 37);
  builder.peak([0.18, 0.54, 0], 0.42, 0.46, 7, shade(0.90), [0.56, 0.53, 0.46], 41);
  builder.peak([-0.62, -0.36, 0], 0.44, 0.50, 7, shade(0.92), top, 53);
  builder.peak([0.64, 0.40, 0], 0.34, 0.38, 7, shade(0.95), [0.56, 0.53, 0.46], 67);
  return builder.finish('mountain mesh');
}

export function buildRockMesh(): MeshData {
  const builder = new MeshBuilder();
  builder.shadow(0.86, 0.44, 0.18);
  // The same cool blue-grey stone as the mountain massif, so the two read as
  // one material and the rock reads as grey rock, not warm earth.
  builder.peak([-0.32, -0.08, 0], 0.58, 0.44, 6, [0.43, 0.45, 0.48], [0.57, 0.59, 0.62], 5);
  builder.peak([0.24, 0.10, 0], 0.50, 0.34, 6, [0.40, 0.42, 0.45], [0.54, 0.56, 0.59], 17);
  builder.peak([0.64, -0.20, 0], 0.30, 0.24, 5, [0.38, 0.40, 0.43], [0.51, 0.53, 0.56], 29);
  return builder.finish('rock mesh');
}

// A small ox-less trade cart, pointing +X (its travel direction): two round
// wheels per side on an axle, a plank bed, and a canvas-and-sacks load. The
// wheels are discs (not boxes) so the cart reads as wheeled, not as a four-leg
// table, at the game camera; kept low and stubby so it stays road life rather
// than competing with markers.
export function buildCartMesh(): MeshData {
  const builder = new MeshBuilder();
  builder.shadow(0.72, 0.40, 0.18);
  const wood: Rgb = [0.40, 0.27, 0.15];
  const darkWood: Rgb = [0.20, 0.14, 0.09];
  // Worn-wood wheels: light enough that the round rim catches the key light and
  // reads as a wheel rather than a near-black shadow lump.
  const wheelWood: Rgb = [0.33, 0.23, 0.13];
  const canvas: Rgb = [0.66, 0.58, 0.42];
  // Round wheels (vertical discs facing ±Y), seated just outboard of the bed.
  const wheelR = 0.21;
  for (const wx of [-0.30, 0.30]) {
    for (const wy of [-0.30, 0.30]) {
      builder.disc([wx, wy, wheelR], wheelR, 'y', wheelWood, 1, 14);
    }
    // axle across the wheel pair
    builder.box([wx, 0.0, wheelR], [0.07, 0.62, 0.07], darkWood, 1);
  }
  // plank bed sitting on the axles
  builder.box([0.0, 0.0, 0.46], [0.86, 0.52, 0.14], wood, 1);
  // shaft/pole out the front
  builder.box([0.62, 0.0, 0.40], [0.42, 0.08, 0.08], wood, 1);
  // canvas load
  builder.box([-0.04, 0.0, 0.64], [0.60, 0.44, 0.26], canvas, 1);
  return builder.finish('cart mesh');
}

// The tree species grow from the vendored ez-tree generator (see ./tree/),
// each tuned from its upstream preset. The preset shapes are kept — visible
// limb skeleton, many SMALL leaves along the outer branches — and only the
// child/section/segment/leaf counts are trimmed, because the campaign map
// instances thousands of trees off one mesh per species. Leaves stay near the
// upstream size ratio (~5-7% of tree height); the earlier huge-quad canopies
// read as slabs. Colors stay in the muted olive register.

export type TreeSpeciesId = 'conifer' | 'broadleaf' | 'ash' | 'aspen' | 'bush';

interface TreeSpecies {
  label: string;
  options: TreeOptions;
  leafStyle: LeafStyle;
  palette: { bark: Rgb; leafLow: Rgb; leafHigh: Rgb };
  height: number;
  shadowRadius: number;
}

type BranchTable = 'angle' | 'children' | 'gnarliness' | 'length' | 'radius' | 'sections' | 'segments' | 'start' | 'taper' | 'twist';

/** A preset with per-level branch tables and leaf fields selectively overridden. */
function tunePreset(
  preset: TreeOptions,
  branch: Partial<Record<BranchTable, Record<number, number>>> & { levels?: number },
  leaves: Partial<TreeOptions['leaves']> = {},
): TreeOptions {
  const tuned = { ...preset.branch, levels: branch.levels ?? preset.branch.levels };
  for (const key of ['angle', 'children', 'gnarliness', 'length', 'radius', 'sections', 'segments', 'start', 'taper', 'twist'] as const) {
    const override = branch[key];
    if (override) tuned[key] = { ...preset.branch[key], ...override };
  }
  return { ...preset, branch: tuned, leaves: { ...preset.leaves, ...leaves } };
}

const TREE_SPECIES: Record<TreeSpeciesId, TreeSpecies> = {
  conifer: {
    label: 'conifer tree mesh',
    options: tunePreset(
      TREE_PRESETS.pineMedium,
      {
        // Flatter branch pitch than the preset (95° vs 110°): the droop read
        // as a weeping willow, not an evergreen; denser children restore the
        // conical tier mass.
        angle: { 1: 95 },
        children: { 0: 48 },
        radius: { 0: 1.0 },
        sections: { 0: 8, 1: 4 },
        segments: { 0: 6, 1: 3 },
        start: { 1: 0.2 },
      },
      { count: 13, size: 2.9 },
    ),
    leafStyle: 'needle',
    palette: {
      // Darker than the deciduous barks so trunk and inner branches recede.
      bark: [0.24, 0.18, 0.12],
      leafLow: [0.1, 0.19, 0.12],
      leafHigh: [0.19, 0.31, 0.17],
    },
    height: 1.9,
    shadowRadius: 0.52,
  },
  broadleaf: {
    label: 'broadleaf tree mesh',
    options: tunePreset(
      TREE_PRESETS.oakMedium,
      {
        // Wider, longer limbs than the preset so the crown spreads into the
        // broad dome that separates the oak from the taller pointed ash.
        angle: { 1: 68 },
        children: { 0: 4, 1: 2, 2: 2 },
        length: { 1: 14 },
        radius: { 0: 2.0 },
        sections: { 0: 6, 1: 4, 2: 2, 3: 1 },
        segments: { 0: 6, 1: 4, 2: 3, 3: 3 },
      },
      { count: 12, size: 3.8 },
    ),
    leafStyle: 'cluster',
    palette: {
      bark: [0.32, 0.21, 0.12],
      leafLow: [0.14, 0.24, 0.1],
      leafHigh: [0.27, 0.36, 0.14],
    },
    height: 1.5,
    shadowRadius: 0.72,
  },
  ash: {
    label: 'ash tree mesh',
    options: tunePreset(
      TREE_PRESETS.ashMedium,
      {
        angle: { 1: 56 },
        children: { 0: 5, 1: 2, 2: 2 },
        radius: { 0: 2.6 },
        sections: { 0: 6, 1: 4, 2: 2, 3: 1 },
        segments: { 0: 6, 1: 4, 2: 3, 3: 3 },
      },
      { count: 12, size: 3.6 },
    ),
    leafStyle: 'cluster',
    palette: {
      // Cooler, deeper green and a grey-brown bark: reads as the tall shade
      // tree next to the warmer oak.
      bark: [0.3, 0.26, 0.2],
      leafLow: [0.13, 0.25, 0.15],
      leafHigh: [0.22, 0.36, 0.2],
    },
    height: 1.7,
    shadowRadius: 0.68,
  },
  aspen: {
    label: 'aspen tree mesh',
    options: tunePreset(
      TREE_PRESETS.aspenMedium,
      {
        children: { 0: 10 },
        radius: { 0: 1.8 },
        taper: { 0: 0.6 },
        sections: { 0: 6, 1: 4, 2: 2 },
        segments: { 0: 6, 1: 4, 2: 3 },
        // Crown starts lower than the preset so leaves swallow the trunk tip
        // instead of leaving a bare leader poking out the top.
        start: { 1: 0.5 },
      },
      { count: 16, size: 2.7 },
    ),
    leafStyle: 'cluster',
    palette: {
      // Pale birch-like bark under a light yellow-green crown.
      bark: [0.55, 0.53, 0.46],
      leafLow: [0.2, 0.3, 0.12],
      leafHigh: [0.36, 0.45, 0.18],
    },
    height: 1.6,
    shadowRadius: 0.58,
  },
  bush: {
    label: 'bush mesh',
    options: tunePreset(
      TREE_PRESETS.bush1,
      {
        children: { 0: 5, 1: 2, 2: 1 },
        sections: { 0: 2, 1: 3, 2: 2, 3: 1 },
        segments: { 0: 4, 1: 3, 2: 3, 3: 3 },
      },
      { count: 10, size: 3.2 },
    ),
    leafStyle: 'cluster',
    palette: {
      bark: [0.28, 0.2, 0.12],
      leafLow: [0.15, 0.26, 0.12],
      leafHigh: [0.27, 0.37, 0.16],
    },
    height: 0.55,
    shadowRadius: 0.5,
  },
};

export function buildTreeSpeciesMesh(id: TreeSpeciesId): MeshData {
  const species = TREE_SPECIES[id];
  return buildEzTreeMesh(species);
}
