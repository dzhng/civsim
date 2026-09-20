/** Renderer-neutral battle shapes: the per-frame data a world reads, and the
 * verification results it publishes about what it admitted. These belong to
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

/** One re-measurement of an admitted crowd against an installed height field.
 * Every field is observed: `matches` is never assigned by construction from the
 * fact that a builder was handed a sampler. */
export interface AdmittedSeatingMeasurement {
  /** Instances actually re-sampled — the whole admitted population, not a slice. */
  checked: number;
  matches: boolean;
  /** Elevation range of the checked population, rounded as the source reports it. */
  span: number;
  /** Instances whose elevation or sampled height was not finite. They never match. */
  nonFinite: number;
  /** Largest finite |elevation - sampled height| observed. */
  worstDelta: number;
  /** Metres of agreement each instance was required to be within. */
  tolerance: number;
}

/** The admitted pose a seating measurement belongs to, and the terrain generation
 * it was seated against. Both counters belong to owners that already keep them;
 * the crowd epoch distinguishes two histories whose submissions both restart at 0. */
export interface AdmittedSeatingIdentity {
  crowdGeneration: number;
  submission: number;
  terrainGeneration: number;
}

/** A scene's answer to one explicit seating inspection. `measurement` is null
 * whenever the scene could not measure, with `unavailable` naming why: an
 * unavailable inspection is never reported as a match. `installed` is what the
 * scene had admitted at the moment it answered, which a consumer holding a
 * presented frame's identity compares against before trusting the measurement. */
export interface AdmittedSeatingVerification {
  measurement: AdmittedSeatingMeasurement | null;
  unavailable: string | null;
  installed: AdmittedSeatingIdentity | null;
}
