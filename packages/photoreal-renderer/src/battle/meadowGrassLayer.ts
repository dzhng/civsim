import type * as THREE from "three/webgpu";

export interface MeadowGrassStats {
  layer: string;
  enabled: boolean;
  farTierVisible: boolean;
  recordCount: number;
  drawCalls: number;
  submittedTriangles: number;
  submittedVertices?: number;
  recordHash: string;
  gpuTimeMs?: number | null;
}

export interface MeadowGrassLayer {
  /** Packed records follow game-renderer grassField.ts: 16 floats / 64 bytes. */
  applyPackedRecords(records: Float32Array, visible?: boolean): void;
  routeGpu(
    renderer: THREE.WebGPURenderer,
    eye: readonly [number, number, number],
    anchor?: readonly [number, number],
  ): void;
  stats(): MeadowGrassStats;
  setVisible(visible: boolean): void;
  setFarTierVisible(visible: boolean): void;
}

export const MEADOW_GRASS_MESH_NAME_PREFIX = "battle-grass";
