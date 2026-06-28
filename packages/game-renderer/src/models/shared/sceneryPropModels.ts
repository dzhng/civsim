import { MeshBuilder, type MeshData } from './meshBuilder';

export function buildMountainMesh(): MeshData {
  const builder = new MeshBuilder();
  builder.shadow(1.0, 0.62, 0.22);
  builder.peak([-0.18, -0.02, 0], 0.80, 1.0, 7, [0.42, 0.38, 0.31], [0.62, 0.58, 0.50], 11);
  builder.peak([0.55, 0.22, 0], 0.48, 0.62, 6, [0.40, 0.36, 0.30], [0.57, 0.53, 0.46], 23);
  builder.peak([-0.70, -0.28, 0], 0.42, 0.50, 6, [0.36, 0.33, 0.28], [0.52, 0.49, 0.43], 37);
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
