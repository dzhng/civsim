import type { BattleRendererApi } from "./battleRendererApi";
import type { BattleBenchmarkScenario } from "./benchmark/benchmarkScenario";
import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import type {
  BattleEdgeRole,
  BattleGroundCover,
  BattleSlopeBands,
  BattleTerrainGrid,
} from "@packages/game-renderer/src/battle/terrainFeatures";
import type { BattleEnvironmentId } from "@packages/game-renderer/src/environment/environment";
import { Camera } from "../shared/camera";
import { getGraphicsSettings } from "../shared/graphicsSettings";
import { BattleAmbientAudio } from "./battleAudio";
import { battleCameraRig, type CameraRigRange } from "./cameraRig";
import { BattleRenderer } from "./renderer";
import { installViewportGate } from "./viewportGate";
import type { BattleSimClient } from "./sim/battleSimClient";
import type { BattleSimSetup } from "./sim/battleSetup";

export type BattleKind = "duel" | "5v5" | "surround" | "flank" | "mapA" | "mapB" | "gen";

export interface GeneratedBattleMapDescriptor {
  seed: number | string;
  defaultEnvironment?: BattleEnvironmentId;
  groundCover: BattleGroundCover;
  reliefScale: number;
  slopeBands: BattleSlopeBands;
  terrainHash: string;
  edgeSeals?: {
    expectedRoles?: {
      west?: BattleEdgeRole;
      east?: BattleEdgeRole;
    };
  };
  featureSummary?: {
    lakeCells?: number;
    passableForestCells?: number;
    streams?: number;
    streamCells?: number;
    mudCells?: number;
    screeCells?: number;
    roughFieldCells?: number;
  };
  lakeSurfaces?: Array<{
    id: number;
    level: number;
    minCellX: number;
    minCellY: number;
    maxCellX: number;
    maxCellY: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    cells: number;
  }>;
  vista?: {
    shape: string;
    bands: Array<{
      name: string;
      width: number;
      height: number;
      cell: number;
      originX: number;
      originY: number;
      innerHalfW: number;
      innerHalfH: number;
      outerHalfW: number;
      outerHalfH: number;
    }>;
  } | null;
}

export interface BattleConfig {
  /** How this battle begins. The authority builds the one `Game` from it. */
  setup: BattleSimSetup;
  kind: BattleKind;
  onExit: () => void;
  onLaunch: (kind: BattleKind) => void;
  wasmMapId?: number;
  environment?: BattleEnvironmentId;
  restart?: () => void;
  inCampaign?: boolean;
  benchmark?: BattleBenchmarkScenario;
}

export class BattleCameraRig {
  bounds = { width: 1, height: 1 };
  range: CameraRigRange = { min: 0.4, max: 8 };
  mapBounds = { width: 1, height: 1 };
  mapRange: CameraRigRange = { min: 0.4, max: 8 };
  private reviewRestore: {
    bounds: { width: number; height: number };
    range: CameraRigRange;
    pose: ReturnType<Camera["capturePose"]>;
  } | null = null;

  constructor(
    readonly camera: Camera,
    readonly canvas: HTMLCanvasElement,
  ) {}

  apply = () => {
    this.camera.setRig(this.range, this.bounds);
  };

  frameArmies(terrain: BattleTerrainGrid, info: Float32Array, units: number, stride: number): void {
    const mapW = terrain.w * terrain.cell;
    const mapH = terrain.h * terrain.cell;
    const ox = terrain.ox;
    const oy = terrain.oy;
    this.camera.bounds = [ox, oy, ox + mapW, oy + mapH];
    this.bounds = { width: mapW, height: mapH };
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let unit = 0; unit < units; unit++) {
      const offset = unit * stride;
      if (info[offset + UNIT_INFO.team] !== 0) continue;
      x0 = Math.min(x0, info[offset]);
      x1 = Math.max(x1, info[offset]);
      y0 = Math.min(y0, info[offset + UNIT_INFO.y]);
      y1 = Math.max(y1, info[offset + UNIT_INFO.y]);
    }
    const dpr = window.devicePixelRatio || 1;
    const topDownCos = 0.95;
    const tacticalZoom = Math.min(
      (this.canvas.clientWidth * dpr) / mapW,
      (this.canvas.clientHeight * dpr) / topDownCos / mapH,
    );
    this.range = { min: Math.max(0.4, tacticalZoom), max: Math.max(8, tacticalZoom * 6) };
    this.mapBounds = { ...this.bounds };
    this.mapRange = { ...this.range };
    const initialCenter: [number, number] = Number.isFinite(x0)
      ? [(x0 + x1) / 2, (y0 + y1) / 2]
      : [this.camera.x, -0.27 * mapH];
    this.camera.zoom = this.range.min;
    this.camera.yaw = -Math.PI / 2;
    this.apply();
    const far = battleCameraRig(this.range.min, this.range, this.bounds).distance;
    const near = battleCameraRig(this.range.max, this.range, this.bounds).distance;
    // Initial framing uses physical distance; the zoom dial is nonlinear.
    this.camera.zoomAt(
      this.canvas.width / 2,
      this.canvas.height / 2,
      far / Math.max(near, 0.49 * (near + 0.0375 * (far - near))),
    );
    this.camera.setViewCenter(initialCenter[0], initialCenter[1]);
    this.camera.clampView();
  }

  reviewFrame(
    minx: number,
    miny: number,
    maxx: number,
    maxy: number,
    opts: { margin?: number; pitch?: number; fill?: number } = {},
  ): void {
    if (![minx, miny, maxx, maxy].every(Number.isFinite)) return;
    if (!this.reviewRestore) {
      this.reviewRestore = {
        bounds: { ...this.bounds },
        range: { ...this.range },
        pose: this.camera.capturePose(),
      };
    }
    this.camera.yaw = -Math.PI / 2;
    const loX = Math.min(minx, maxx);
    const hiX = Math.max(minx, maxx);
    const loY = Math.min(miny, maxy);
    const hiY = Math.max(miny, maxy);
    const margin = Math.max(0, opts.margin ?? 12);
    const halfMargin = margin / 2;
    const fitMinX = loX - halfMargin;
    const fitMaxX = hiX + halfMargin;
    const fitMinY = loY - halfMargin;
    const fitMaxY = hiY + halfMargin;
    const centerX = (loX + hiX) / 2;
    const centerY = (loY + hiY) / 2;
    let spanX = Math.max(1, fitMaxX - fitMinX);
    let spanY = Math.max(1, fitMaxY - fitMinY);
    const targetFill = Math.max(0.01, opts.fill ?? 0.72);
    const setReviewRig = () => {
      this.range = { min: 2.5, max: 20 };
      this.bounds = { width: spanX, height: spanY };
      this.apply();
      this.camera.zoom = 2.5;
      this.camera.pitchBias = 0;
      this.camera.pitchBias = this.camera.pitch - (opts.pitch ?? 1.15);
      this.camera.setViewCenter(centerX, centerY);
    };
    const samplePoints: [number, number][] = [
      [fitMinX, fitMinY],
      [fitMaxX, fitMinY],
      [fitMaxX, fitMaxY],
      [fitMinX, fitMaxY],
      [centerX, fitMinY],
      [fitMaxX, centerY],
      [centerX, fitMaxY],
      [fitMinX, centerY],
    ];
    setReviewRig();
    const clientWidth = Math.max(
      1,
      this.canvas.clientWidth || this.canvas.width / (window.devicePixelRatio || 1),
    );
    const clientHeight = Math.max(
      1,
      this.canvas.clientHeight || this.canvas.height / (window.devicePixelRatio || 1),
    );
    for (let index = 0; index < 3; index++) {
      const projected = samplePoints.map(([x, y]) => this.camera.worldToScreen(x, y));
      const xs = projected.map((point) => point[0]);
      const ys = projected.map((point) => point[1]);
      const screenSpanX = Math.max(...xs) - Math.min(...xs);
      const screenSpanY = Math.max(...ys) - Math.min(...ys);
      const fill = Math.max(screenSpanX / clientWidth, screenSpanY / clientHeight);
      if (!Number.isFinite(fill) || fill <= 0) break;
      const scale = fill / targetFill;
      if (Math.abs(scale - 1) <= 0.05) break;
      spanX *= scale;
      spanY *= scale;
      setReviewRig();
    }
  }

  reviewFrameClear(): void {
    const restored = this.reviewRestore;
    this.bounds = restored ? { ...restored.bounds } : { ...this.mapBounds };
    this.range = restored ? { ...restored.range } : { ...this.mapRange };
    this.apply();
    if (restored) {
      this.camera.restorePose(restored.pose);
    }
    this.reviewRestore = null;
  }
}

/** The scene's view of one battle. Every record here is a copy of one completed
 * tick, rewritten in place when the next tick arrives, so a consumer reads it
 * within the frame that asked for it and copies anything it keeps. */
export interface BattleWorld {
  cfg: BattleConfig;
  sim: BattleSimClient;
  terrain: BattleTerrainGrid;
  generatedMap: GeneratedBattleMapDescriptor | null;
  wasmMapId: number | undefined;
  canvas: HTMLCanvasElement;
  camera: Camera;
  cameraRig: BattleCameraRig;
  renderer: BattleRendererApi;
  disposeRenderer(): void;
  audio: BattleAmbientAudio;
  signal: AbortSignal;
  stride: number;
  unitInfo(): Float32Array;
  positions(): Float32Array;
}

let sharedRenderer: BattleRendererApi | null = null;

function disposeSharedRenderer(renderer: BattleRendererApi): void {
  if (sharedRenderer !== renderer) return;
  renderer.dispose();
  sharedRenderer = null;
}

/** Built once the authority has answered with the battle's immutable identity:
 * the renderer's environment and terrain are decided by the map the sim actually
 * generated, so there is nothing to build before that reply. */
export function createBattleWorld(
  cfg: BattleConfig,
  sim: BattleSimClient,
  cleanups: (() => void)[],
  signal: AbortSignal,
): BattleWorld {
  const ui = document.getElementById("battle-ui")!;
  ui.style.display = "block";
  cleanups.push(() => {
    ui.style.display = "none";
  });
  cleanups.push(installViewportGate(document.getElementById("viewport-too-small")!));

  const identity = sim.identity;
  const canvas = document.getElementById("battlefield") as HTMLCanvasElement;
  const camera = new Camera(canvas);
  const defaultEnvironment = cfg.environment ?? identity.generatedMap?.defaultEnvironment ?? null;
  const graphics = getGraphicsSettings();
  if (
    sharedRenderer &&
    (!sharedRenderer.usesEnvironment(defaultEnvironment) ||
      !sharedRenderer.usesGraphicsSettings(graphics))
  ) {
    sharedRenderer.dispose();
    sharedRenderer = null;
  }
  const renderer = (sharedRenderer ??= new BattleRenderer(canvas, {
    environment: defaultEnvironment,
    graphics,
  }));
  const audio = new BattleAmbientAudio();
  audio.register();
  renderer.setBattleAudio(audio);
  cleanups.push(() => {
    renderer.clearBattleAudio(audio);
    audio.dispose();
  });
  audio.resume();
  camera.groundSurface = {
    heightAt: (x, y) => renderer.heightAt(x, y),
    raycast: (ray) => renderer.raycastGround(ray),
  };
  renderer.resize();

  const world: BattleWorld = {
    cfg,
    sim,
    terrain: identity.terrain,
    generatedMap: identity.generatedMap,
    wasmMapId: cfg.wasmMapId,
    canvas,
    camera,
    cameraRig: new BattleCameraRig(camera, canvas),
    renderer,
    disposeRenderer: () => disposeSharedRenderer(renderer),
    audio,
    signal,
    stride: identity.unitInfoStride,
    unitInfo: () => sim.unitInfo(),
    positions: () => sim.positions(),
  };
  world.cameraRig.frameArmies(world.terrain, sim.unitInfo(), sim.unitCount(), world.stride);
  return world;
}
