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
} from "@packages/photoreal-renderer/src/battle/battleWorld";
import type { Game, InitOutput } from "../wasm/game_wasm.js";
import type { Camera } from "../shared/camera";
import type { BattleRenderer } from "./renderer";
import type { BattleAmbientAudio } from "./battleAudio";
import type { SimClock } from "../shared/simClock";
import { createBattleViews, MOTOR_TRAVEL } from "./battleViews";

/** Latest completed loop iteration, with raw CPU durations in milliseconds.
 * intervalMs is unclamped rAF cadence, not proof of a presented frame.
 * renderCpuMs includes crowd observation/preparation through submission;
 * renderer.frameCpuMs is nested within it and must not be added to it. */
export interface BattleLoopFrameMetrics {
  frameId: number;
  timestampMs: number;
  intervalMs: number;
  ready: boolean;
  simTick: number;
  ticksAdvanced: number;
  simCpuMs: number;
  renderCpuMs: number;
  loopCpuMs: number;
  renderer: ReturnType<BattleRenderer["frameMetrics"]>;
}

interface DebugOwners {
  benchmark?: { status(): BenchmarkStatus; cancel(): void };
  advance(n: number): void;
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
  terrainDebug(): unknown;
  tickCount(): number;
  disposeRenderer(): void;
}

export function installBattleDebugApi({
  audio,
  camera,
  game,
  generatedVista,
  frameMetrics,
  metrics,
  owners,
  renderer,
  stride,
  unitInfo,
  wasm,
}: {
  audio: BattleAmbientAudio;
  camera: Camera;
  game: Game;
  generatedVista: BattleVistaGrid | null;
  frameMetrics: () => BattleLoopFrameMetrics | null;
  metrics: () => {
    tickMs: number;
    audioUpdateMs: number;
    fps: number;
    clock: Pick<SimClock, "alpha" | "paused" | "frozen">;
  };
  owners: DebugOwners;
  renderer: BattleRenderer;
  stride: number;
  unitInfo: () => Float32Array;
  wasm: InitOutput;
}): void {
  const positions = () =>
    new Float32Array(wasm.memory.buffer, game.positions_ptr(), game.soldier_count() * 2);
  const views = createBattleViews(game, wasm.memory);
  window.__game = {
    benchmark: owners.benchmark,
    frameMetrics: () => {
      const sample = frameMetrics();
      return sample ? { ...sample, renderer: { ...sample.renderer } } : null;
    },
    stateHash: () => game.state_hash().toString(),
    stats: () => ({
      soldiers: game.soldier_count(),
      units: game.unit_count(),
      ...metrics(),
      victor: game.victor(),
      renderer: "gpu",
      renderStats: renderer.stats(),
    }),
    setOrder: (u: number, x: number, y: number) => game.set_move_order(u, x, y),
    select: owners.select,
    selected: owners.selected,
    generatedManifest: () => JSON.parse(game.generated_map_manifest()),
    setPace: (u: number, pace: number) => game.set_pace(u, pace),
    attackOrder: (u: number, enemy: number) => game.set_attack_order(u, enemy),
    attackMove: (u: number, x: number, y: number) => game.set_attack_move_order(u, x, y),
    disengage: (u: number, x: number, y: number) => game.set_disengage_order(u, x, y),
    enqueue: (u: number, mode: number, x: number, y: number, facing: number, hasFacing: number) =>
      game.enqueue(u, mode, x, y, facing, hasFacing),
    queuedOrders: (u: number) => Array.from(game.queued_orders(u)),
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
    advance: owners.advance,
    projectileCount: () => game.projectile_count(),
    tickCount: owners.tickCount,
    freezeAtTick: owners.freezeAtTick,
    freezeAtTickWithEffects: (target: number) => owners.freezeAtTick(target, { effects: true }),
    freeze: owners.freeze,
    reviewFrame: owners.reviewFrame,
    reviewFrameClear: owners.reviewFrameClear,
    groupMove: owners.groupMove,
    setFiles: (u: number, files: number) => game.set_files(u, files),
    spawnUnit: (x: number, y: number, facing: number, count: number, files: number, team: number) =>
      game.spawn_unit(x, y, facing, count, files, 1.0, 1.2, team, 0.7),
    spawnClass: (
      x: number,
      y: number,
      facing: number,
      count: number,
      files: number,
      cls: number,
      team: number,
    ) => game.spawn_class(x, y, facing, count, files, cls, team),
    groupAttack: owners.groupAttack,
    unitInfo: (u: number) => Array.from(unitInfo().slice(u * stride, u * stride + stride)),
    soldierStartOf: owners.soldierStartOf,
    soldierPos: (i: number) => {
      const pos = positions();
      return [pos[2 * i], pos[2 * i + 1]];
    },
    soldierAlive: (i: number) => {
      const alive = new Uint8Array(wasm.memory.buffer, game.alive_ptr(), game.soldier_count());
      return alive[i] ?? 0;
    },
    debugSoldierAnim: (i: number) => renderer.debugSoldierAnim(i),
    soldierMotorPath: (i: number) =>
      views.motorTravel()[i * MOTOR_TRAVEL.stride + MOTOR_TRAVEL.path],
    reloadSoldierAssets: () => renderer.reloadSoldierAssets(),
    rendererMemoryInfo: () => ({
      ...renderer.memoryInfo(),
      wasmMemoryBytes: wasm.memory.buffer.byteLength,
    }),
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
