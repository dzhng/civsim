/** Renderer-neutral per-frame data the battle world reads. These shapes belong to
 * no backend: the frontend builds them, and whichever world is installed consumes
 * them unchanged. Terrain, water and environment inputs keep their own owners. */
import type { Camera3DParams } from "../../renderer-core/src/camera3d";

/** Immutable per-frame battle camera: chart zoom plus the canonical 3D params. */
export interface BattleCameraSnapshot {
  x: number;
  y: number;
  zoom: number;
  zoomT: number;
  camera3d: Camera3DParams;
}

export interface BattleTacticalLineFrame {
  /** Ground cue lines, (x, y, r, g, b, a) per vertex. */
  groundCues: Float32Array;
  /** Per-soldier selection rings, (x, y, radius, r, g, b, a) per instance. */
  rings: Float32Array;
  effects: Float32Array;
}
