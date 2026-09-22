import type { BenchmarkStatus } from "./benchmark/benchmarkRun";
import { eyePosition } from "@packages/renderer-core/src/camera3d";
import {
  UNIT_INFO,
  currentUnitFiles,
  currentUnitRanks,
} from "@packages/game-renderer/src/battle/unitInfoLayout";
import {
  vistaSurfaceHeightAt,
  type BattleVistaGrid,
} from "@packages/game-renderer/src/battle/vistaSurface";
import type { Camera } from "../shared/camera";
import type { BattleRendererApi, BattleRendererFrameMetrics } from "./battleRendererApi";
import type { BattleAmbientAudio } from "./battleAudio";
import type { BattleSimClient, BattleSimTelemetry } from "./sim/battleSimClient";

/** Latest completed loop iteration, with raw CPU durations in milliseconds.
 * intervalMs is unclamped rAF cadence, not proof of a presented frame.
 * renderCpuMs includes crowd observation/preparation through submission;
 * renderer.frameCpuMs is nested within it and must not be added to it.
 * simCpuMs is the authority's own tick cost for the newest completed tick, which
 * this frame did not spend: it is reported, not paid, on this thread. */
export interface BattleLoopFrameMetrics {
  frameId: number;
  timestampMs: number;
  intervalMs: number;
  ready: boolean;
  simTick: number;
  ticksAdvanced: number;
  simCpuMs: number;
  renderCpuMs: number;
  renderAwaitMs: number;
  renderWallMs: number;
  loopCpuMs: number;
  renderer: BattleRendererFrameMetrics;
}

interface DebugOwners {
  benchmark?: { status(): BenchmarkStatus; cancel(): void; report(): unknown };
  advance(n: number): Promise<void>;
  freeze(on?: boolean): void;
  freezeAtTick(target: number, options?: { effects?: boolean }): Promise<void>;
  groupAttack(units: number[], target: number): void;
  groupMove(units: number[], x: number, y: number): void;
  previewDebug(unit: number): unknown;
  reviewFrame(
    minx: number,
    miny: number,
    maxx: number,
    maxy: number,
    opts?: { margin?: number; pitch?: number; fill?: number },
  ): void;
  reviewFrameClear(): void;
  select(unit: number): void;
  selected(): number[];
  soldierStartOf(unit: number): number;
  terrainDebug(options?: { includeTint?: boolean }): unknown;
  disposeRenderer(): void;
}

export function installBattleDebugApi({
  audio,
  camera,
  generatedVista,
  frameMetrics,
  metrics,
  owners,
  renderer,
  sim,
}: {
  audio: BattleAmbientAudio;
  camera: Camera;
  generatedVista: BattleVistaGrid | null;
  frameMetrics: () => BattleLoopFrameMetrics | null;
  metrics: () => {
    tickMs: number;
    audioUpdateMs: number;
    fps: number;
    clock: { alpha: number; paused: boolean; frozen: boolean };
  };
  owners: DebugOwners;
  renderer: BattleRendererApi;
  sim: BattleSimClient;
}): void {
  const stride = sim.stride;
  const unitInfo = () => sim.unitInfo();
  window.__game = {
    benchmark: owners.benchmark,
    frameMetrics: () => {
      const sample = frameMetrics();
      return sample
        ? {
            ...sample,
            renderer: {
              ...sample.renderer,
              gpuSubmission: sample.renderer.gpuSubmission
                ? { ...sample.renderer.gpuSubmission }
                : null,
            },
          }
        : null;
    },
    stateHash: () => sim.stateHash(),
    stats: () => ({
      soldiers: sim.soldierCount(),
      units: sim.unitCount(),
      ...metrics(),
      victor: sim.victor(),
      renderer: "gpu",
      renderStats: renderer.stats(),
    }),
    /** How the battle authority is actually behaving: published cadence, how old
     * the shown state is, and what the seam is holding. */
    simTelemetry: (): BattleSimTelemetry => sim.telemetry(performance.now()),
    setOrder: (u: number, x: number, y: number) =>
      sim.send({ kind: "move", unit: u, x, y, facing: null }),
    select: owners.select,
    selected: owners.selected,
    generatedManifest: () => JSON.parse(sim.identity.generatedMapManifest ?? "null"),
    setPace: (u: number, pace: number) => sim.send({ kind: "pace", unit: u, pace }),
    attackOrder: (u: number, enemy: number) => sim.send({ kind: "attack", unit: u, target: enemy }),
    attackMove: (u: number, x: number, y: number) =>
      sim.send({ kind: "attackMove", unit: u, x, y }),
    disengage: (u: number, x: number, y: number) => sim.send({ kind: "disengage", unit: u, x, y }),
    enqueue: (u: number, mode: number, x: number, y: number, facing: number, hasFacing: number) =>
      sim.send({ kind: "enqueue", unit: u, mode, x, y, facing, hasFacing }),
    /** Answers from the newest publication that carried the queued-order overlay,
     * which the battle only asks for while it is drawing the path chain. */
    queuedOrders: (u: number) => Array.from(sim.queuedOrders(u)),
    previewDebug: owners.previewDebug,
    formationDebug: (u: number) => {
      const info = unitInfo();
      const o = u * stride;
      return {
        files: currentUnitFiles(info, o),
        ranks: currentUnitRanks(info, o),
        total: Math.max(0, Math.floor(info[o + UNIT_INFO.total])),
        centerX: info[o + UNIT_INFO.centerX],
        centerY: info[o + UNIT_INFO.centerY],
      };
    },
    terrainDebug: owners.terrainDebug,
    /** Resolves once the requested ticks have run in the authority AND the
     * resulting tick has been consumed here, so a caller that awaits it reads the
     * state it asked for. */
    advance: owners.advance,
    projectileCount: () => sim.projectileCount(),
    tickCount: () => Math.max(0, sim.tick()),
    freezeAtTick: owners.freezeAtTick,
    freezeAtTickWithEffects: (target: number) => owners.freezeAtTick(target, { effects: true }),
    freeze: owners.freeze,
    reviewFrame: owners.reviewFrame,
    reviewFrameClear: owners.reviewFrameClear,
    groupMove: owners.groupMove,
    setFiles: (u: number, files: number) => sim.send({ kind: "files", unit: u, files }),
    spawnUnit: (x: number, y: number, facing: number, count: number, files: number, team: number) =>
      sim.send({ kind: "spawnUnit", x, y, facing, count, files, team }),
    spawnClass: (
      x: number,
      y: number,
      facing: number,
      count: number,
      files: number,
      cls: number,
      team: number,
    ) => sim.send({ kind: "spawnClass", x, y, facing, count, files, classId: cls, team }),
    groupAttack: owners.groupAttack,
    unitInfo: (u: number) => Array.from(unitInfo().slice(u * stride, u * stride + stride)),
    soldierStartOf: owners.soldierStartOf,
    soldierPos: (i: number) => {
      const pos = sim.positions();
      return [pos[2 * i], pos[2 * i + 1]];
    },
    soldierAlive: (i: number) => sim.alive()[i] ?? 0,
    debugSoldierAnim: (i: number) => renderer.debugSoldierAnim(i),
    soldierMotorPath: (i: number) => sim.motorPath(i),
    reloadSoldierAssets: () => renderer.reloadSoldierAssets(),
    /** Explicit whole-population seating verification, asked for by a caller and
     * answered once: no frame or stats read scans the population. Null from a
     * renderer that owns no such measurement, never another backend's assignment. */
    verifySeating: async () => (await renderer.verifySeating?.()) ?? null,
    rendererMemoryInfo: () => {
      const memory = renderer.memoryInfo();
      if (!memory) return null;
      return {
        ...memory,
        // The battle's WASM heap now lives in the authority worker. What this thread
        // owns of the simulation is the publication seam, so that is what it reports.
        publicationCapacityBytes: sim.identity.publicationCapacityBytes,
        publicationPool: sim.telemetry(performance.now()).publicationPool,
      };
    },
    disposeRenderer: owners.disposeRenderer,
    audio: () => audio.inspect(),
    heightAt: (x: number, y: number) => renderer.heightAt(x, y),
    vistaHeightAt: (x: number, y: number) =>
      generatedVista ? vistaSurfaceHeightAt(generatedVista, x, y) : null,
    cameraSurfaceDebug: () => {
      const params = camera.params();
      const eye = eyePosition(params);
      const height = renderer.heightAt(eye[0], eye[1]);
      const vista = generatedVista ? vistaSurfaceHeightAt(generatedVista, eye[0], eye[1]) : null;
      return {
        eye,
        heightAt: height,
        vistaHeightAt: vista,
        renderedSurfaceHeightAt: height,
        clearance: eye[2] - height,
        camera3d: params,
      };
    },
    setCamera: (x: number, y: number, zoom: number, yaw = camera.yaw, pitch = camera.pitch) => {
      camera.zoom = zoom;
      camera.yaw = yaw;
      camera.pitchBias = 0;
      camera.pitchBias = camera.pitch - pitch;
      camera.setViewCenter(x, y);
      camera.clampView();
    },
  };
  window.__cam = camera;
}

declare global {
  interface Window {
    __game: unknown;
    __cam: unknown;
    __ready: boolean;
  }
}
