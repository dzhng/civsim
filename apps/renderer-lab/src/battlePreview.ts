import { createTypegpuBattleScene } from "../../../packages/battle-renderer/src/battleScene";
import { TYPEGPU_BATTLE_IDENTITY } from "../../../packages/battle-renderer/src/world/identity";
import {
  loadAppearanceCatalog,
  type AppearanceBundle,
} from "../../../packages/soldier-assets/src/appearanceBundle";
import {
  loadImpostorAtlas,
  type ImpostorAtlasData,
} from "../../../packages/soldier-assets/src/impostorAtlas";
import { assertGameplayAppearances } from "../../../packages/crowd-runtime/src/animationState";
import {
  buildCrowdInstances,
  type CrowdInstance,
} from "../../../packages/crowd-runtime/src/instanceData";
import type { SoldierPlayback } from "../../../packages/crowd-runtime/src/actionTimeline";
import { resolveBattleEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import {
  battlePostGrade,
  type BattlePostGradeUniforms,
} from "../../../packages/game-renderer/src/environment/postParameters";
import { resolveSunShadowMode } from "../../../packages/game-renderer/src/battle/shadowPolicy";
import {
  productionBladeFieldProfile,
  type BladeFieldProfile,
} from "../../../packages/game-renderer/src/battle/battleGrassResidency";
import {
  resolveBattleTerrainOptions,
  type BattleTerrainOptions,
} from "../../../packages/game-renderer/src/battle/terrainOptions";
import type { BattleTerrainGrid } from "../../../packages/game-renderer/src/battle/terrainFeatures";
import type {
  BattleCameraSnapshot,
  BattleTacticalLineFrame,
} from "../../../packages/battle-renderer/src/types";
import {
  BATTLE_REVIEW_VISIBILITY,
  type BattleReviewVisibility,
} from "../../../packages/battle-renderer/src/sceneTypes";

type Scene = Awaited<ReturnType<typeof createTypegpuBattleScene>>;
export interface BattlePreviewOptions {
  soldierCatalogUrl?: string;
  gameplay?: boolean;
  environment?: string | null;
  shadows?: string | null;
  post?: string | null;
  postGrade?: Partial<BattlePostGradeUniforms> | null;
  grassProfile?: BladeFieldProfile;
  debugBlocks?: boolean;
  clay?: boolean;
}

/** Lab inputs and canvas lifetime only. Rendering and resources belong to the
 * same TypeGPU scene used by gameplay. Routes await each frame before advancing. */
export class BattlePreview {
  readonly soldierCatalogUrl: string;
  soldierAssets: Record<number, AppearanceBundle> = {};
  private atlases: Record<number, ImpostorAtlasData> | null = null;
  private scene: Scene | null = null;
  private camera: BattleCameraSnapshot | null = null;
  private time = 0;
  private disposed = false;
  private failure: Error | null = null;
  private soldierUnit = new Uint32Array();
  private teams: number[] = [];
  private instances: CrowdInstance[] = [];
  private visibility = { grass: true, farGrass: true, bloom: true, post: true };
  private review: BattleReviewVisibility = { ...BATTLE_REVIEW_VISIBILITY };
  private constructor(
    private canvas: HTMLCanvasElement,
    private device: GPUDevice,
    private context: GPUCanvasContext,
    private options: BattlePreviewOptions,
  ) {
    this.soldierCatalogUrl = options.soldierCatalogUrl ?? "/assets/soldiers/catalog.json";
    this.visibility.post = options.post !== "off";
    device.addEventListener("uncapturederror", (event) => {
      this.failure = new Error(event.error.message);
    });
    void device.lost.then((info) => {
      if (!this.disposed) this.failure = new Error(info.message);
    });
  }
  static async create(canvas: HTMLCanvasElement, options: BattlePreviewOptions = {}) {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw Error("WebGPU adapter unavailable");
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context) {
      device.destroy();
      throw Error("WebGPU canvas unavailable");
    }
    const preview = new BattlePreview(canvas, device, context, options);
    try {
      context.configure({
        device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: "opaque",
      });
      const loaded = await preview.loadAssets();
      preview.soldierAssets = loaded.assets;
      preview.atlases = loaded.atlases;
      return preview;
    } catch (error) {
      preview.dispose();
      throw error;
    }
  }
  private check() {
    if (this.failure) throw this.failure;
    if (this.disposed) throw Error("Battle preview disposed");
  }
  private async loadAssets() {
    this.check();
    const assets = await loadAppearanceCatalog(new URL(this.soldierCatalogUrl, location.href).href);
    this.check();
    if (this.options.gameplay === false) return { assets, atlases: null };
    assertGameplayAppearances(assets);
    const atlases = await this.loadAtlases(assets);
    return { assets, atlases };
  }
  private async loadAtlases(assets: Record<number, AppearanceBundle>) {
    const url = new URL("/assets/soldiers/impostors/catalog.json", location.href);
    const response = await fetch(url);
    if (!response.ok) throw Error(`Atlas catalog ${response.status}`);
    const catalog = await response.json();
    const atlases: Record<number, ImpostorAtlasData> = {};
    for (const id of Object.keys(assets).map(Number)) {
      this.check();
      if (typeof catalog.appearances?.[id] !== "string")
        throw Error(`Missing prepared atlas ${id}`);
      atlases[id] = await loadImpostorAtlas(new URL(catalog.appearances[id], url).href, assets[id]);
    }
    return atlases;
  }
  async loadPublishedAtlases() {
    this.check();
    const assets = this.soldierAssets;
    const atlases = await this.loadAtlases(assets);
    this.check();
    await this.requireScene().replaceCrowdAssets({ assets, atlases }, () => {
      this.check();
      if (assets !== this.soldierAssets)
        throw Error("Appearance generation changed while loading atlases");
    });
    this.atlases = atlases;
  }
  async reloadSoldierAssets(pose?: { classId: number; clip: string }) {
    const loaded = await this.loadAssets();
    this.check();
    const validate = () => {
      this.check();
      if (pose && !loaded.assets[pose.classId]?.animation.clips.some((c) => c.name === pose.clip))
        throw Error(`Reload does not contain appearance ${pose.classId} / clip ${pose.clip}`);
      for (const key of this.scene?.admittedCrowdPoses() ?? []) {
        const [id, clip] = key.split("\u0000");
        if (!loaded.assets[Number(id)]?.animation.clips.some((c) => c.name === clip))
          throw Error(`Reload does not contain active appearance ${id} / clip ${clip}`);
      }
    };
    validate();
    await this.scene?.replaceCrowdAssets(loaded, validate);
    this.check();
    this.soldierAssets = loaded.assets;
    this.atlases = loaded.atlases;
  }
  async resize(width: number, height: number, ratio: number) {
    this.check();
    this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.canvas.height = Math.max(1, Math.round(height * ratio));
    await this.scene?.resize(this.canvas.width, this.canvas.height);
  }
  setStatic(soldierUnit: Uint32Array, teams: number[], _classes: number[]) {
    this.soldierUnit = new Uint32Array(soldierUnit);
    this.teams = [...teams];
  }
  async setTerrain(grid: BattleTerrainGrid, options: BattleTerrainOptions = {}) {
    this.check();
    const terrain = { grid, ...resolveBattleTerrainOptions(options) };
    if (this.scene) {
      await this.scene.replaceTerrain(terrain);
      return;
    }
    const environment = resolveBattleEnvironment(this.options.environment).environment;
    const scene = await createTypegpuBattleScene(this.device, {
      assets: this.soldierAssets,
      atlases: this.atlases,
      terrain,
      environment,
      grassProfile: this.options.grassProfile ?? productionBladeFieldProfile(),
      width: this.canvas.width,
      height: this.canvas.height,
      samples: 1,
      outputFormat: navigator.gpu.getPreferredCanvasFormat(),
      shadows: resolveSunShadowMode("", this.options.shadows),
      debugBlocks: this.options.debugBlocks,
      reviewClay: this.options.clay,
      ...this.visibility,
      grade: battlePostGrade(environment.id, this.options.postGrade ?? {}),
    });
    if (this.disposed) {
      scene.dispose();
      throw Error("Battle preview disposed");
    }
    this.scene = scene;
    scene.setReviewVisibility(this.review);
  }
  setTime(seconds: number) {
    this.time = seconds;
  }
  setGrassVisible(visible: boolean) {
    this.visibility.grass = visible;
    this.scene?.setVisibility(this.visibility);
  }
  setBloomEnabled(visible: boolean) {
    this.visibility.bloom = visible;
    this.scene?.setVisibility(this.visibility);
  }
  setReviewVisibility(visibility: Partial<BattleReviewVisibility>) {
    this.review = { ...this.review, ...visibility };
    this.scene?.setReviewVisibility(this.review);
  }
  async draw(
    positions: Float32Array,
    facings: Float32Array,
    playback: readonly SoldierPlayback[],
    alive: Float32Array,
    count: number,
    camera: BattleCameraSnapshot,
  ) {
    const scene = this.requireScene();
    const built = buildCrowdInstances(
      {
        positions,
        facings,
        playback,
        alive,
        count,
        soldierUnit: this.soldierUnit,
        unitTeam: this.teams,
        mountedClasses: Object.entries(this.soldierAssets)
          .filter(([, a]) => a.manifest.mounted)
          .map(([id]) => Number(id)),
        terrainHeight: scene.seatingHeightAt,
      },
      this.instances,
    );
    this.instances = built.instances;
    await this.drawInstances(this.instances, camera);
  }
  async drawInstances(instances: readonly CrowdInstance[], camera: BattleCameraSnapshot) {
    this.camera = camera;
    await this.requireScene().uploadCrowd(instances, camera, this.time);
  }
  async drawTris(vertices: Float32Array, camera: BattleCameraSnapshot) {
    this.camera = camera;
    await this.requireScene().uploadTriangles(vertices);
  }
  async uploadDebugBlocks(vertices: Float32Array) {
    await this.requireScene().uploadDebugBlocks(vertices);
  }
  async drawTacticalLines(lines: BattleTacticalLineFrame, camera: BattleCameraSnapshot) {
    this.camera = camera;
    await this.requireScene().uploadTacticalLines(lines);
    await this.render();
  }
  async render() {
    const scene = this.requireScene();
    if (!this.camera) throw Error("Battle preview has no camera");
    await scene.prepare({ camera: this.camera, time: this.time });
    this.check();
    const encoder = scene.createCommandEncoder();
    scene.encode(encoder, this.context.getCurrentTexture().createView());
    encoder.submit();
    await this.device.queue.onSubmittedWorkDone();
    this.check();
  }
  debugSoldierAnim(index: number) {
    return this.scene?.debugSoldierAnim(index) ?? null;
  }
  stats() {
    return {
      ...TYPEGPU_BATTLE_IDENTITY,
      framebuffer: { width: this.canvas.width, height: this.canvas.height },
      ...this.requireScene().stats(),
      authoringMeshesOnly: this.atlases === null,
    };
  }
  private requireScene() {
    this.check();
    if (!this.scene) throw Error("Battle preview has no terrain");
    return this.scene;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.scene?.dispose();
    } finally {
      this.context.unconfigure();
      this.device.destroy();
    }
  }
}

/** One awaited frame at a time. Navigation waits for the active frame before
 * releasing GPU resources; a failed frame stops readiness and further work. */
export function startBattlePreviewLoop(
  world: BattlePreview,
  frame: (now: number) => Promise<void>,
  fail: (error: unknown) => void,
  cleanup: () => void = () => {},
) {
  let stopped = false,
    active = false,
    handle = 0;
  const release = () => {
    cleanup();
    world.dispose();
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(handle);
    window.removeEventListener("pagehide", stop);
    if (!active) release();
  };
  const run = async (now: number) => {
    if (stopped) return;
    active = true;
    try {
      await frame(now);
    } catch (error) {
      fail(error);
      stop();
    } finally {
      active = false;
      if (stopped) release();
      else handle = requestAnimationFrame(run);
    }
  };
  window.addEventListener("pagehide", stop);
  handle = requestAnimationFrame(run);
  return stop;
}

declare global {
  interface Window {
    __rendererLabReady: boolean;
    __rendererLabStats: unknown;
  }
}
