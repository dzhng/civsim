/** The wire contract between the battle authority (one `Game` in a worker) and the
 * main-thread client. Everything the battle used to ask a synchronous `Game` for is
 * one of three shapes here: a completed-tick publication, an ordered command, or a
 * point query. There is no `Game`-shaped proxy and no second action timeline. */
import type { GeneratedBattleMapDescriptor } from "../battleWorld";
import type { BattleVistaGrid } from "@packages/game-renderer/src/battle/vistaSurface";
import type { BattleTerrainGrid } from "@packages/game-renderer/src/battle/terrainFeatures";
import type { PublicationCounts } from "./publicationLayout";
import type { BattleSimSetup } from "./battleSetup";

/** A player or harness intent, in the sim's own vocabulary. The authority applies
 * these in sequence at a tick boundary and acknowledges the tick they landed on. */
export type BattleCommand =
  | { kind: "attack"; unit: number; target: number }
  | { kind: "move"; unit: number; x: number; y: number; facing: number | null }
  | { kind: "disengage"; unit: number; x: number; y: number }
  | { kind: "attackMove"; unit: number; x: number; y: number }
  | { kind: "pace"; unit: number; pace: number }
  | { kind: "reform"; unit: number }
  | { kind: "pursue"; unit: number; on: boolean }
  | { kind: "fireAtWill"; unit: number; on: boolean }
  | { kind: "evadeAuto"; unit: number; on: boolean }
  | { kind: "files"; unit: number; files: number }
  | {
      kind: "enqueue";
      unit: number;
      mode: number;
      x: number;
      y: number;
      facing: number;
      hasFacing: number;
    }
  | {
      kind: "formationLine";
      units: readonly number[];
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      queued: boolean;
    }
  | {
      kind: "spawnUnit";
      x: number;
      y: number;
      facing: number;
      count: number;
      files: number;
      team: number;
    }
  | {
      kind: "spawnClass";
      x: number;
      y: number;
      facing: number;
      count: number;
      files: number;
      classId: number;
      team: number;
    };

export interface SequencedCommand {
  seq: number;
  command: BattleCommand;
}

/** Which tick a command reached the sim on. Rides the publication of that tick. */
export interface CommandAck {
  seq: number;
  appliedTick: number;
}

/** Overlay records the sim exports as copies. A consumer asks for them only while
 * it is actually drawing them, so an idle battle publishes none. */
export interface OverlayRequest {
  queuedOrders: boolean;
  preview: { units: readonly number[]; x0: number; y0: number; x1: number; y1: number } | null;
}

export const NO_OVERLAYS: OverlayRequest = { queuedOrders: false, preview: null };

/** Immutable facts about one battle, answered once when the authority is ready. */
export interface BattleSimIdentity {
  classSpecs: string;
  releaseDuration: number;
  unitInfoStride: number;
  soldiers: number;
  units: number;
  terrain: BattleTerrainGrid;
  vista: BattleVistaGrid | null;
  generatedMap: GeneratedBattleMapDescriptor | null;
  generatedMapManifest: string | null;
  generatedMapCertificates: string | null;
  initialStateHash: string;
  publicationCapacityBytes: number;
}

/** What one completed tick is, apart from its bytes. Every array in the buffer
 * belongs to this tick and this soldier/unit/projectile count. */
export interface PublicationHeader {
  tick: number;
  counts: PublicationCounts;
  bytes: number;
  victor: number;
  stateHash: string;
  /** Worker-clock instant the tick finished, taken before any copying. */
  completedAtMs: number;
  /** Worker-clock instant the message was posted. */
  postedAtMs: number;
  tickMs: number;
  copyMs: number;
  acks: CommandAck[];
  /** Ticks of wall-clock debt the authority abandoned rather than chasing. */
  droppedCatchupTicks: number;
  /** Worker time since the previous publication spent with no free buffer. */
  starvedMs: number;
  /** Set when this publication completes a scripted advance; the client resolves
   * that request only when this tick has been ingested, so a scripted caller can
   * never read state from before the advance it asked for. */
  scriptId: number | null;
  scriptCancelled: boolean;
  /** True while the authority is running a scripted advance. */
  preparing: boolean;
}

export type BattleSimRequest =
  | { type: "start"; setup: BattleSimSetup; capacityHintBytes: number }
  | { type: "credit"; buffer: ArrayBuffer }
  | { type: "commands"; commands: SequencedCommand[] }
  | { type: "overlays"; request: OverlayRequest }
  | { type: "control"; paused?: boolean; timeScale?: number; suspended?: boolean }
  | { type: "script"; id: number; ticks: number; toTick: number | null; yieldBatch: number }
  | { type: "cancelScript" }
  | { type: "pick"; id: number; x: number; y: number; radius: number }
  | { type: "result"; id: number }
  | { type: "clockProbe"; id: number; t0: number }
  | { type: "dispose" };

export type BattleSimReply =
  | { type: "ready"; identity: BattleSimIdentity }
  | { type: "snapshot"; header: PublicationHeader; buffer: ArrayBuffer }
  | { type: "pick"; id: number; unit: number }
  | { type: "result"; id: number; result: string | null }
  | { type: "clockProbe"; id: number; t0: number; t1: number }
  /** `result` is the outcome the `Game` could still state as it went down, so a
   * campaign encounter is not stranded by a fault in this transport; null when even
   * that could not be read. */
  | {
      type: "failure";
      message: string;
      stack: string | null;
      tick: number;
      result: string | null;
    }
  | { type: "disposed"; liveGames: number; retainedBuffers: number; tick: number };
