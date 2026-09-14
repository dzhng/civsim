import { buildTreeCrown } from "./treeCrown";
import { MeshBuilder, type MeshData, type Rgb } from "./meshBuilder";

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

export type TreeDetail = "leaves" | "canopy";
export const TREE_VARIANTS = 3;
type TreeSpeciesId = "conifer" | "broadleaf" | "ash" | "aspen" | "bush";

const TREE_SPECIES: Record<TreeSpeciesId, { height: number; bark: Rgb; leaf: Rgb; radius: number }> = {
  conifer: { height: 1.9, bark: [0.32, 0.23, 0.14], leaf: [0.19, 0.31, 0.17], radius: 0.52 },
  broadleaf: { height: 1.5, bark: [0.32, 0.21, 0.12], leaf: [0.27, 0.36, 0.14], radius: 0.72 },
  ash: { height: 1.7, bark: [0.30, 0.26, 0.20], leaf: [0.22, 0.36, 0.20], radius: 0.68 },
  aspen: { height: 1.6, bark: [0.55, 0.53, 0.46], leaf: [0.36, 0.45, 0.18], radius: 0.58 },
  bush: { height: 0.55, bark: [0.28, 0.20, 0.12], leaf: [0.27, 0.37, 0.16], radius: 0.50 },
};

export function buildTreeSpeciesMesh(id: TreeSpeciesId, detail: TreeDetail = "leaves", variant = 0): MeshData {
  const species = TREE_SPECIES[id];
  return buildTreeCrown(species.height, species.bark, species.leaf, species.radius, id, variant % TREE_VARIANTS, detail === "leaves");
}
