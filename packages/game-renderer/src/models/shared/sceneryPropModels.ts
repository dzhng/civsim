import { MeshBuilder, type MeshData, type Rgb } from './meshBuilder';

// A broad rocky massif, not a single sharp pyramid: one wide low dome with a
// cluster of lower, offset shoulder-peaks of varied footprint and height. The
// overlapping humps break the silhouette so a range reads as ridged stone
// rather than a field of identical cones, and the low height-to-radius ratios
// keep it from towering over nearby cities, roads, and labels.
export function buildMountainMesh(): MeshData {
  const builder = new MeshBuilder();
  builder.shadow(1.18, 0.74, 0.22);
  const base: Rgb = [0.45, 0.41, 0.35];
  const top: Rgb = [0.60, 0.57, 0.50];
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
  builder.peak([-0.32, -0.08, 0], 0.58, 0.44, 6, [0.39, 0.36, 0.30], [0.48, 0.44, 0.38], 5);
  builder.peak([0.24, 0.10, 0], 0.50, 0.34, 6, [0.34, 0.32, 0.27], [0.44, 0.41, 0.35], 17);
  builder.peak([0.64, -0.20, 0], 0.30, 0.24, 5, [0.30, 0.28, 0.24], [0.40, 0.38, 0.33], 29);
  return builder.finish('rock mesh');
}

// A small ox-less trade cart, pointing +X (its travel direction): four dark
// wheels, a plank bed, and a canvas-and-sacks load. Kept low and stubby so it
// reads as road life at the campaign camera without competing with markers.
export function buildCartMesh(): MeshData {
  const builder = new MeshBuilder();
  builder.shadow(0.72, 0.40, 0.18);
  const wood: Rgb = [0.40, 0.27, 0.15];
  const darkWood: Rgb = [0.22, 0.15, 0.10];
  const canvas: Rgb = [0.66, 0.58, 0.42];
  // wheels
  builder.box([-0.34, -0.30, 0.15], [0.22, 0.10, 0.30], darkWood, 1);
  builder.box([-0.34, 0.30, 0.15], [0.22, 0.10, 0.30], darkWood, 1);
  builder.box([0.34, -0.30, 0.15], [0.22, 0.10, 0.30], darkWood, 1);
  builder.box([0.34, 0.30, 0.15], [0.22, 0.10, 0.30], darkWood, 1);
  // plank bed
  builder.box([0.0, 0.0, 0.36], [0.86, 0.52, 0.16], wood, 1);
  // shaft/pole out the front
  builder.box([0.62, 0.0, 0.30], [0.42, 0.08, 0.08], wood, 1);
  // canvas load
  builder.box([-0.04, 0.0, 0.56], [0.60, 0.44, 0.26], canvas, 1);
  return builder.finish('cart mesh');
}

export function buildConiferTreeMesh(): MeshData {
  const builder = new MeshBuilder();
  builder.shadow(0.62, 0.44, 0.18);
  builder.box([0, 0, 0.36], [0.16, 0.16, 0.72], [0.32, 0.21, 0.12], 1);
  builder.cone([0, 0, 0.78], 0.58, 0.58, 7, [0.10, 0.18, 0.09], [0.20, 0.29, 0.15], 41);
  builder.cone([0, 0, 1.18], 0.46, 0.54, 7, [0.09, 0.17, 0.09], [0.22, 0.31, 0.16], 53);
  builder.cone([0, 0, 1.54], 0.34, 0.46, 7, [0.08, 0.15, 0.08], [0.24, 0.33, 0.17], 67);
  builder.box([-0.18, -0.08, 1.07], [0.38, 0.34, 0.28], [0.14, 0.24, 0.12], 1);
  builder.box([0.18, 0.10, 1.26], [0.34, 0.30, 0.26], [0.16, 0.27, 0.13], 1);
  return builder.finish('conifer tree mesh');
}

export function buildBroadleafTreeMesh(): MeshData {
  const builder = new MeshBuilder();
  builder.shadow(0.76, 0.46, 0.17);
  builder.box([0, 0, 0.34], [0.18, 0.18, 0.68], [0.34, 0.22, 0.12], 1);
  builder.blob([-0.22, -0.04, 1.06], [0.46, 0.38, 0.34], [0.15, 0.27, 0.13], 101);
  builder.blob([0.24, 0.02, 1.12], [0.50, 0.40, 0.38], [0.18, 0.31, 0.15], 113);
  builder.blob([0.02, 0.16, 1.36], [0.42, 0.34, 0.36], [0.21, 0.35, 0.17], 127);
  builder.blob([0.0, -0.16, 1.24], [0.38, 0.32, 0.30], [0.12, 0.23, 0.11], 139);
  return builder.finish('broadleaf tree mesh');
}
