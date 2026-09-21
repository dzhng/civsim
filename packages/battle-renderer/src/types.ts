/** Renderer-neutral battle shapes: the per-frame data a world reads, and the
 * verification results it publishes about what it admitted. These belong to
 * no backend: the frontend builds them, and whichever world is installed consumes
 * them unchanged. Terrain, water and environment inputs keep their own owners. */
import type {
  BattleGroundCover,
  BattleSlopeBands,
} from "../../game-renderer/src/battle/terrainFeatures";
import type { BattleVistaBand } from "../../game-renderer/src/battle/vistaSurface";
import type { Camera3DParams } from "../../renderer-core/src/camera3d";

export interface BattleWaterContent {
  draws: number;
  triangles: number;
  /** Surfaces with admitted vertex/index buffers; omitted geometries never appear. */
  surfaces: readonly {
    kind: "lake" | "ocean";
    level: number;
    surfaceLevel: number;
    triangles: number;
  }[];
}

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

/** The content one world reports about the terrain generation it has committed.
 * Every number belongs to an owner that already holds it, so a consumer may read
 * this without any owner rescanning its world. An uncommitted or disposed scene
 * reports `installed: false` with its counts unavailable, never zeros that read as
 * an empty map. Each world measures its own resources; this is the shape they must
 * agree on, so one check migrates between them unchanged. */
export interface BattleTerrainSceneContent {
  installed: boolean;
  /** Generations committed so far, including the one installed now. */
  generation: number;
  /** A staged generation is in flight over the one described here. */
  replacing: boolean;
  /** Triangles in the installed playable ground index buffer, excluding the vista. */
  groundTriangles: number | null;
  scenery: number | null;
  /** Opaque and transparent vista rings together. */
  vistaBands: number | null;
  groundCover: BattleGroundCover | null;
  groundStyle: "clay" | "beauty" | null;
  slopeBands: BattleSlopeBands | null;
  vista: { shape: string; bands: Omit<BattleVistaBand, "height" | "shoreDistance">[] } | null;
  water: BattleWaterContent | null;
}

/** What each tactical-cue owner reports about its own last upload. `debugBlocks`
 * is null wherever no formation-debug layer is installed. Same agreement as
 * `BattleTerrainSceneContent`: the counts are each owner's, the shape is shared. */
export interface BattleTacticalLineContent {
  groundCues: { count: number };
  rings: { count: number };
  effects: { count: number };
  triangles: { count: number };
  debugBlocks: { count: number } | null;
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
