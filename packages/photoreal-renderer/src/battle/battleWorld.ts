import {
  resolveBattleTerrainOptions,
  type BattleTerrainOptions,
} from "../../../game-renderer/src/battle/terrainOptions";
export type { BattleTerrainOptions } from "../../../game-renderer/src/battle/terrainOptions";
import { expandedBattleTerrainRect } from "../../../game-renderer/src/battle/terrainSurfacePolicy";
import { terrainBackdropStyleForZoom } from "../../../game-renderer/src/battle/terrainBackdropPolicy";
import {
  resolveSunShadowMode,
  type SunShadowMode,
} from "../../../game-renderer/src/battle/shadowPolicy";
import {
  initialBladeFieldTransition,
  productionBladeFieldProfile,
  type BattleGrassQuality,
  type BladeFieldProfile,
} from "../../../game-renderer/src/battle/battleGrassResidency";
import type { WorldRay } from "../../../renderer-core/src/camera3d";
import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { buildCrowdInstances, type CrowdInstance } from "../../../crowd-runtime/src/instanceData";
import { assertGameplayAppearances } from "../../../crowd-runtime/src/animationState";
import { IMPOSTOR_LEVEL, LOD_COUNT_KEYS } from "../../../crowd-runtime/src/lod";
import type { SoldierPlayback } from "../../../crowd-runtime/src/actionTimeline";
import {
  battleEnvironmentStats,
  resolveBattleEnvironment,
  type BattleEnvironment,
} from "../../../game-renderer/src/environment/environment";
import type {
  BattleGroundCover,
  BattleSlopeBands,
  BattleTerrainGrid,
} from "../../../game-renderer/src/battle/terrainFeatures";
import { eyePosition, projectionFootprint } from "../../../renderer-core/src/camera3d";
import {
  heightFieldRange,
  terrainHeightAt,
  type TerrainHeightField,
} from "../../../game-renderer/src/terrain/heightField";
import type { Camera3DParams } from "../../../renderer-core/src/camera3d";
import {
  loadAppearanceCatalog,
  type AppearanceBundle,
} from "../../../soldier-assets/src/appearanceBundle";
import { PhotorealWorld } from "../world";
import { applyCivsimEnvironment } from "../environment";
import { applyCamera3d } from "../cameraBridge";
import { PHOTOREAL_PROJECTION, PHOTOREAL_SUBSTRATE } from "../stats";
import { createBattleFrameUniforms, type BattleFrameUniforms } from "./battleTsl";
import { BattleBackgroundQuads, RENDER_ORDER } from "./terrainLayer";
import type { BattleVistaGrid } from "../../../game-renderer/src/battle/vistaSurface";
import { createSeaDisplacementSource, type BattleLakeSurfaceSpec } from "./seaLayer";
import {
  createBladeFieldWindUniforms,
  createBladeFieldTransitionUniforms,
  type BladeFieldWindUniforms,
  type BladeFieldTransitionUniforms,
} from "./bladeFieldLayer";
import { BattleGrassField } from "./battleGrassField";
import { BattleTerrainSurface, buildBattleTerrain } from "./battleTerrainBuild";
import { updateWindUniforms } from "../../../game-renderer/src/battle/windSignal";
import { PhotorealScenery } from "./foliageLayer";
import { PhotorealCrowd, type CrowdVisibilityScope } from "./crowdLayer";
import { configureSunShadows, type SunShadowRig } from "./shadowRig";
import { PhotorealLineLayer, PhotorealRingLayer, PhotorealTriangleLayer } from "./overlayLayer";
import { PhotorealReadoutLayer } from "./readoutLayer";
import type { BattleReadoutInstance } from "../../../game-renderer/src/battle/readoutData";
import { PhotorealStandardLayer } from "./standardLayer";
import type { BattleStandardInstance } from "../../../game-renderer/src/models/shared/battleStandardData";
import { BattlePostChain } from "../post/postChain";
import type { BattlePostGradeUniforms } from "../../../game-renderer/src/environment/postParameters";

export type { BattleLakeSurfaceSpec } from "./seaLayer";

export interface BattleCameraSnapshot {
  x: number;
  y: number;
  zoom: number;
  zoomT: number;
  camera3d: Camera3DParams;
}

export interface BattleTacticalLineFrame {
  groundCues: Float32Array;
  effects: Float32Array;
  rings: Float32Array;
}

export class PhotorealBattleWorld {
  readonly world: PhotorealWorld;
  readonly camera = new THREE.PerspectiveCamera();
  private readonly environment: BattleEnvironment;
  private readonly frame: BattleFrameUniforms;
  private readonly sunDirectionScratch = new THREE.Vector3(0, 0, 1);
  private readonly background: BattleBackgroundQuads;
  private readonly grass: BattleGrassField;
  private readonly terrainSurface: BattleTerrainSurface;
  private readonly scenery: PhotorealScenery;
  private crowd: PhotorealCrowd;
  private readonly shadowRig: SunShadowRig;
  private readonly groundCues: PhotorealLineLayer;
  private readonly selectionRings: PhotorealRingLayer;
  private readonly effectLines: PhotorealLineLayer;
  private readonly debugTriangles: PhotorealTriangleLayer;
  private readonly debugBlocks: PhotorealTriangleLayer;
  private readonly standardLayer: PhotorealStandardLayer;
  private readonly readoutLayer: PhotorealReadoutLayer;
  private mountedClasses: number[];
  private readonly sea: ReturnType<typeof createSeaDisplacementSource>;
  private readonly post: BattlePostChain;
  private disposed = false;

  private lakeSurfaces: BattleLakeSurfaceSpec[] = [];

  private soldierUnit = new Uint32Array(0);
  private unitTeam: number[] = [];
  private unitClass: number[] = [];
  private staticSoldiers = 0;
  private terrainRect: [number, number, number, number] = [-220, -180, 440, 360];
  private terrainGrid: BattleTerrainGrid | null = null;
  private vistaGrid: BattleVistaGrid | null = null;
  private viewportHeight = 800;
  private groundCover: BattleGroundCover = "green-grass";
  private slopeBands: BattleSlopeBands | null = null;
  private readonly grassTransition: BladeFieldTransitionUniforms;
  private readonly wind: BladeFieldWindUniforms = createBladeFieldWindUniforms();
  private cameraInitialized = false;
  private instances: CrowdInstance[] = [];
  private readonly instancePool: CrowdInstance[] = [];
  private seating = { checked: 0, matches: true, span: 0 };
  private lastCamera: BattleCameraSnapshot = {
    x: 0,
    y: 0,
    zoom: 0,
    zoomT: 0,
    camera3d: {
      target: [0, 0, 0],
      distance: 100,
      pitch: Math.PI / 2 - 0.02,
      yaw: 0,
      fovY: 0.6,
      aspect: 1,
      near: 1,
    },
  };

  private constructor(
    world: PhotorealWorld,
    environment: BattleEnvironment,
    sea: ReturnType<typeof createSeaDisplacementSource>,
    public soldierAssets: Record<number, AppearanceBundle>,
    readonly soldierCatalogUrl: string,
    shadowMode: SunShadowMode,
    postEnabled: boolean,
    postGrade: Partial<BattlePostGradeUniforms> | null,
    grassProfile: BladeFieldProfile,
    private readonly gameplay: boolean,
    crowd: PhotorealCrowd,
  ) {
    this.world = world;
    this.environment = environment;
    this.sea = sea;
    this.grassTransition = createBladeFieldTransitionUniforms(
      initialBladeFieldTransition(grassProfile),
    );
    this.frame = createBattleFrameUniforms();
    this.frame.time = world.uTime;
    const scene = world.scene;
    const env = this.environment;

    applyCivsimEnvironment(world, env.environment, {
      aerialObserver: vec3(this.frame.focus, 0.0),
    });

    this.shadowRig = configureSunShadows(
      world.renderer,
      world.sunLight!,
      env.environment,
      shadowMode,
    );

    this.background = new BattleBackgroundQuads(scene, this.frame);
    this.terrainSurface = new BattleTerrainSurface(scene);
    this.grass = new BattleGrassField(scene, grassProfile, this.grassTransition, this.wind);
    this.scenery = new PhotorealScenery(scene);
    this.crowd = crowd;
    this.mountedClasses = Object.entries(soldierAssets)
      .filter(([, bundle]) => bundle.manifest.mounted)
      .map(([id]) => Number(id));
    this.groundCues = new PhotorealLineLayer(scene, 0.25, {
      alpha: 0.98, // the selection-ring weight — cues and rings are one style
      depthTest: true,
      renderOrder: RENDER_ORDER.groundCues,
      drape: { heightAt: (x, y) => this.heightAt(x, y), step: 4 },
    });
    this.selectionRings = new PhotorealRingLayer(scene, (x, y) => this.heightAt(x, y), 0.12);
    this.effectLines = new PhotorealLineLayer(scene, 0.0, {
      alpha: 0.92,
      depthTest: false,
      renderOrder: RENDER_ORDER.effectLines,
      perVertexZ: true,
    });
    this.debugBlocks = new PhotorealTriangleLayer(scene, RENDER_ORDER.debugBlocks);
    this.debugTriangles = new PhotorealTriangleLayer(scene, RENDER_ORDER.debugTriangles);
    this.standardLayer = new PhotorealStandardLayer(scene, world.uTime);
    this.readoutLayer = new PhotorealReadoutLayer(scene);

    this.post = new BattlePostChain(world.renderer, scene, this.camera, env.environment.id);
    this.post.enabled = postEnabled;
    if (postGrade) this.post.setGradeUniforms(postGrade);
    world.post = this.post;
  }

  static async create(
    canvas: HTMLCanvasElement,
    options: {
      environment?: string | null;
      shadows?: string | null;
      post?: string | null;
      grassQuality?: BattleGrassQuality;
      soldierCatalogUrl?: string;
      /** Manual asset inspection does not require gameplay action bindings. */
      gameplay?: boolean;
      postGrade?: Partial<BattlePostGradeUniforms> | null;
    } = {},
  ): Promise<PhotorealBattleWorld> {
    const environment = resolveBattleEnvironment(options.environment);
    const grassProfile = productionBladeFieldProfile(options.grassQuality);
    const soldierCatalogUrl = new URL(
      options.soldierCatalogUrl ?? "/assets/soldiers/catalog.json",
      window.location.href,
    ).href;
    const gameplay = options.gameplay ?? true;
    const assets = await loadAppearanceCatalog(soldierCatalogUrl);
    if (gameplay) assertGameplayAppearances(assets);
    const world = await PhotorealWorld.create(canvas, { antialias: false });
    let crowd: PhotorealCrowd;
    try {
      crowd = await PhotorealCrowd.create(world.renderer, world.scene, assets);
    } catch (error) {
      world.dispose();
      throw error;
    }
    const sea = createSeaDisplacementSource();
    const shadowMode = resolveSunShadowMode(world.stats().device, options.shadows);
    const postEnabled = options.post !== "off";
    return new PhotorealBattleWorld(
      world,
      environment,
      sea,
      assets,
      soldierCatalogUrl,
      shadowMode,
      postEnabled,
      options.postGrade ?? null,
      grassProfile,
      gameplay,
      crowd,
    );
  }

  setTime(seconds: number): void {
    this.world.setTime(seconds);
  }

  /** Reload the production bundle after a local bake, retaining the last good crowd on load failure. */
  async reloadSoldierAssets(activePose?: Pick<CrowdInstance, "classId" | "clip">): Promise<void> {
    this.assertReloadable();
    const assets = await loadAppearanceCatalog(this.soldierCatalogUrl);
    this.assertReloadable();
    const assertActivePose = () => {
      if (
        activePose &&
        !assets[activePose.classId]?.animation.clips.some((clip) => clip.name === activePose.clip)
      ) {
        throw new Error(
          `Reload does not contain active appearance ${activePose.classId} / clip ${activePose.clip}`,
        );
      }
    };
    assertActivePose();
    if (this.gameplay) assertGameplayAppearances(assets);
    const replacement = await PhotorealCrowd.create(
      this.world.renderer,
      this.world.scene,
      assets,
      () => this.assertReloadable(),
    );
    try {
      this.assertReloadable();
      // The author may select another valid old pose while GPU admission waits.
      assertActivePose();
    } catch (error) {
      replacement.dispose();
      throw error;
    }
    this.crowd.dispose();
    this.crowd = replacement;
    this.soldierAssets = assets;
    this.mountedClasses = Object.entries(assets)
      .filter(([, bundle]) => bundle.manifest.mounted)
      .map(([id]) => Number(id));
  }

  private assertReloadable(): void {
    if (this.disposed) throw new Error("Cannot reload soldiers into a disposed battle world");
  }

  setBloomEnabled(on: boolean): void {
    this.post.setBloomEnabled(on);
  }

  setPostGrade(uniforms: Partial<BattlePostGradeUniforms>): void {
    this.post.setGradeUniforms(uniforms);
  }

  setGrassVisible(visible: boolean): void {
    this.grass.setVisible(visible);
  }

  setFarGrassVisible(visible: boolean): void {
    this.grass.setFarVisible(visible);
  }

  resize(width: number, height: number, pixelRatio = 1): void {
    this.viewportHeight = height;
    this.world.resize(width, height, pixelRatio);
  }

  pxPerWorldAt(x: number, y: number, z: number): number {
    const dx = this.camera.position.x - x;
    const dy = this.camera.position.y - y;
    const dz = this.camera.position.z - z;
    const dist = Math.max(0.001, Math.hypot(dx, dy, dz));
    const fovRad = (this.camera.fov * Math.PI) / 180;
    return this.viewportHeight / (2 * dist * Math.tan(fovRad / 2));
  }

  setStatic(soldierUnit: Uint32Array, teams: number[], classes: number[]): void {
    this.soldierUnit = new Uint32Array(soldierUnit);
    this.unitTeam = teams.map((team) => (team === 1 ? 1 : 0));
    this.unitClass = classes.map((cls) => Math.max(0, Math.floor(cls || 0)));
    this.staticSoldiers = soldierUnit.length;
    this.instances = [];
    this.crowd.upload([]);
    this.standardLayer.upload([]);
    this.readoutLayer.upload([]);
    this.selectionRings.upload(new Float32Array());
    this.effectLines.upload(new Float32Array());
    this.debugTriangles.upload(new Float32Array());
    this.debugBlocks.upload(new Float32Array());
  }

  setTerrain(grid: BattleTerrainGrid, options: BattleTerrainOptions = {}): void {
    this.terrainRect = [grid.ox, grid.oy, grid.w * grid.cell, grid.h * grid.cell];
    this.terrainGrid = {
      ...grid,
      tint: new Uint8Array(grid.tint),
      height: grid.height ? new Float32Array(grid.height) : undefined,
      rough: grid.rough ? new Float32Array(grid.rough) : undefined,
      speed: grid.speed ? new Float32Array(grid.speed) : undefined,
    };
    const resolved = resolveBattleTerrainOptions(options);
    this.groundCover = resolved.cover;
    this.slopeBands = resolved.slopeBands;
    this.vistaGrid = resolved.vista;
    this.lakeSurfaces = resolved.lakes;
    this.applyTerrain();
  }

  private applyTerrain(): void {
    const grid = this.terrainGrid;
    if (!grid) return;
    const built = buildBattleTerrain({
      grid,
      cover: this.groundCover,
      slopeBands: this.slopeBands,
      vista: this.vistaGrid,
      lakeSurfaces: this.lakeSurfaces,
      frame: this.frame,
      grassTransition: this.grassTransition,
      sea: this.sea,
    });
    this.terrainSurface.replace(built);
    this.scenery.upload(built.scenery);
    this.shadowRig.setWorldRect(this.terrainRect, heightFieldRange(built.field));
    this.background.setRects(this.terrainRect, expandedBattleTerrainRect(this.terrainRect));
    this.grass.setTerrain(grid, built.field, this.groundCover);
    this.updateGrass();
  }

  heightAt(x: number, y: number): number {
    return this.terrainSurface.heightAt(x, y);
  }

  raycastGround(ray: WorldRay): [number, number, number] | null {
    return this.terrainSurface.raycast(ray);
  }

  surfaceHeightAt(x: number, y: number): number {
    return this.terrainSurface.surfaceHeightAt(x, y);
  }

  draw(
    positions: Float32Array,
    facings: Float32Array,
    playback: readonly SoldierPlayback[],
    alive: Float32Array,
    count: number,
    camera: BattleCameraSnapshot,
    frameDt = 0,
  ): void {
    const terrainHeight = this.terrainSurface.heightSampler();
    const built = buildCrowdInstances(
      {
        positions,
        facings,
        playback,
        alive,
        soldierUnit: this.soldierUnit,
        unitTeam: this.unitTeam,
        mountedClasses: this.mountedClasses,
        terrainHeight,
        count,
      },
      this.instancePool,
    );
    // The builder just assigned these elevations from the same immutable field.
    this.seating = {
      checked: terrainHeight ? built.instances.length : 0,
      matches: true,
      span: Number(built.elevationSpan.toFixed(3)),
    };
    this.submitInstances(built.instances, camera, frameDt);
  }

  /** Explicit poses and battle observations share the exact same production submission path. */
  drawInstances(instances: CrowdInstance[], camera: BattleCameraSnapshot, frameDt = 0): void {
    this.updateSeating(instances);
    this.submitInstances(instances, camera, frameDt);
  }

  private submitInstances(
    instances: CrowdInstance[],
    camera: BattleCameraSnapshot,
    frameDt: number,
  ): void {
    this.world.gpuTelemetry.beginSubmission(this.camera, "battle-draw");
    this.frame.dt.value = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
    this.setCamera(camera);
    this.instances = instances;
    this.updateGrass();
    applyCamera3d(this.camera, this.lastCamera.camera3d);
    this.shadowRig.update(this.lastCamera.camera3d);
    this.world.gpuTelemetry.withScope("pose", () =>
      this.crowd.upload(this.instances, this.crowdVisibilityScope()),
    );
  }

  debugSoldierAnim(index: number) {
    return this.crowd.debugSoldierAnim(index);
  }

  uploadUnitReadouts(
    standards: readonly BattleStandardInstance[],
    readouts: readonly BattleReadoutInstance[],
  ): void {
    this.standardLayer.upload(standards);
    this.readoutLayer.upload(readouts);
    this.lastStandards = standards.map((s) => ({ unitId: s.unitId, x: s.x, y: s.y, z: s.z }));
  }
  private lastStandards: { unitId: number; x: number; y: number; z: number }[] = [];

  drawTris(verts: Float32Array, camera: BattleCameraSnapshot): void {
    this.setCamera(camera);
    this.debugTriangles.upload(verts);
  }

  uploadDebugBlocks(verts: Float32Array): void {
    this.debugBlocks.upload(verts);
  }

  debugBlockTriangles(positions: Float32Array, alive: Float32Array, count: number): Float32Array {
    const bounds = new Map<
      number,
      { x0: number; y0: number; x1: number; y1: number; team: number }
    >();
    for (let i = 0; i < count; i++) {
      if ((alive[i] ?? 0) <= 0.5) continue;
      const unit = this.soldierUnit[i] ?? 0;
      const x = positions[i * 2];
      const y = positions[i * 2 + 1];
      const prev = bounds.get(unit);
      if (prev) {
        prev.x0 = Math.min(prev.x0, x);
        prev.y0 = Math.min(prev.y0, y);
        prev.x1 = Math.max(prev.x1, x);
        prev.y1 = Math.max(prev.y1, y);
      } else {
        bounds.set(unit, {
          x0: x,
          y0: y,
          x1: x,
          y1: y,
          team: this.unitTeam[unit] ?? 0,
        });
      }
    }
    const verts: number[] = [];
    for (const bound of bounds.values()) {
      const pad = 2.4;
      const x0 = bound.x0 - pad;
      const y0 = bound.y0 - pad;
      const x1 = bound.x1 + pad;
      const y1 = bound.y1 + pad;
      const color: [number, number, number, number] =
        bound.team === 1 ? [0.88, 0.2, 0.16, 0.88] : [0.18, 0.44, 1.0, 0.88];
      pushTriangle(verts, x0, y0, x1, y0, x1, y1, color);
      pushTriangle(verts, x0, y0, x1, y1, x0, y1, color);
    }
    return new Float32Array(verts);
  }

  drawTacticalLines(lines: BattleTacticalLineFrame, camera: BattleCameraSnapshot): void {
    this.setCamera(camera);
    this.groundCues.upload(lines.groundCues);
    this.selectionRings.upload(lines.rings);
    this.effectLines.upload(lines.effects);
    this.render();
  }

  render(): void {
    if (!this.world.gpuTelemetry.hasActiveSubmission)
      this.world.gpuTelemetry.beginSubmission(this.camera);
    applyCamera3d(this.camera, this.lastCamera.camera3d);
    this.shadowRig.update(this.lastCamera.camera3d);
    if (this.world.sunLight) {
      this.sunDirectionScratch
        .copy(this.world.sunLight.position)
        .sub(this.world.sunLight.target.position)
        .normalize();
      this.grass.setSunDirection(this.sunDirectionScratch);
    }
    updateWindUniforms(this.wind, this.world.time);
    this.world.gpuTelemetry.withScope("grass", () =>
      this.grass.prepareRender(this.world.renderer, this.lastCamera.camera3d),
    );
    this.world.gpuTelemetry.withScope("pose", () =>
      this.crowd.reproject(this.crowdVisibilityScope()),
    );
    this.crowd.refreshCamera(this.camera);
    this.readoutLayer.setCameraBasis(this.camera);
    this.background.setStyle(terrainBackdropStyleForZoom(this.lastCamera.zoom));
    this.world.render(this.camera);
  }

  private setCamera(camera: BattleCameraSnapshot): void {
    this.lastCamera = camera;
    this.cameraInitialized = true;
    this.frame.focus.value.set(camera.x, camera.y);
  }

  private updateGrass(): void {
    const camera = this.lastCamera.camera3d;
    this.grass.update(camera, this.world.renderer.domElement.height);
  }

  private crowdVisibilityScope(): CrowdVisibilityScope {
    const view = new THREE.Frustum();
    const mat = new THREE.Matrix4().multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    view.setFromProjectionMatrix(mat, this.camera.coordinateSystem, this.camera.reversedDepth);
    return {
      camera: this.camera,
      views: [
        {
          frustum: view,
          projection: projectionFootprint(
            this.camera.matrixWorldInverse.elements,
            this.camera.projectionMatrix.elements,
            this.world.renderer.domElement.height,
            this.camera.near,
          ),
          shadow: false,
        },
        ...this.shadowRig.cullingViews(),
      ],
    };
  }

  private updateSeating(instances: CrowdInstance[]): void {
    const sampler = this.terrainSurface.heightSampler();
    if (!sampler || instances.length === 0) {
      this.seating = { checked: 0, matches: true, span: 0 };
      return;
    }
    let matches = true;
    let lo = Infinity;
    let hi = -Infinity;
    for (const inst of instances) {
      const z = inst.elevation ?? 0;
      if (Math.abs(z - sampler(inst.x, inst.y)) > 1e-3) matches = false;
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
    this.seating = { checked: instances.length, matches, span: Number((hi - lo).toFixed(3)) };
  }

  stats() {
    const world = this.world.stats();
    const crowdStats = this.crowd.stats();
    const visibleTierHistogram = crowdStats.visibleTierHistogram;
    const markerCount = visibleTierHistogram[LOD_COUNT_KEYS[IMPOSTOR_LEVEL]];
    const skinnedCount = LOD_COUNT_KEYS.slice(0, IMPOSTOR_LEVEL).reduce(
      (sum, key) => sum + visibleTierHistogram[key],
      0,
    );
    const sea = this.sea.stats();
    return {
      renderer: "gpu" as const,
      ready: true,
      substrate: PHOTOREAL_SUBSTRATE,
      projection: PHOTOREAL_PROJECTION,
      environment: this.environment.environment.id,
      width: this.world.renderer.domElement.width,
      height: this.world.renderer.domElement.height,
      soldiers: this.instances.length,
      expectedSoldiers: this.staticSoldiers,
      drawCalls: world.drawCalls,
      triangles: world.triangles,
      crowd: crowdStats,
      lod: { skinned: skinnedCount, impostors: markerCount },
      markerLayer: markerCount > 0 ? ("far-lod-impostor" as const) : ("none" as const),
      device: world.device,
      groundDetail: {
        earthEdges: this.terrainSurface.ground?.userData.earthDistance ?? null,
      },
      depth: {
        owner: "three-webgpu" as const,
        reversed: this.world.renderer.reversedDepthBuffer === true,
      },
      atmosphere: this.world.atmosphere,
      shadows: this.shadowRig.identity(),
      post: this.post.stats(),
      sea,
      camera: this.lastCamera,
      seating: { ...this.seating },
      terrain: this.terrainSurface.ground
        ? this.terrainSurface.stats({
            vista: this.vistaGrid,
            standards: this.lastStandards,
            sea,
            lakeSurfaces: this.lakeSurfaces,
            groundCover: this.groundCover,
            slopeBands: this.slopeBands,
            environment: battleEnvironmentStats(this.environment),
            scenery: this.scenery.stats().scenery,
            grass: this.grass.stats(),
          })
        : null,
      tacticalLines: {
        groundCues: this.groundCues.stats(),
        rings: this.selectionRings.stats(),
        effects: this.effectLines.stats(),
      },
      standards: { ...this.standardLayer.stats(), timeSeconds: this.world.time },
      readouts: this.readoutLayer.stats(),
      gpuTelemetry: this.world.gpuTelemetry.snapshot(),
      performance: {
        gpuTimeMs: world.gpuTimeMs,
      },
    };
  }

  gpuEventsSince(afterSequence: number) {
    return this.world.gpuTelemetry.eventsSince(afterSequence);
  }

  /** Capture alongside CPU frame metrics; asynchronous query results retain this identity. */
  gpuSubmissionIdentity() {
    return this.world.gpuTelemetry.latestSubmissionIdentity();
  }

  async settlePresentedFrame(): Promise<void> {
    if (this.cameraInitialized) this.updateGrass();
    this.grass.settle(this.world.renderer);
    // Settling can replace grass buffers while the frozen-frame cache skips normal draws.
    if (this.cameraInitialized) this.render();
    await this.world.settlePresentedFrame();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.post.dispose();
    this.background.dispose();
    this.terrainSurface.dispose();
    this.grass.dispose();
    this.scenery.dispose();
    this.crowd.dispose();
    this.shadowRig.dispose();
    this.groundCues.dispose();
    this.selectionRings.dispose();
    this.effectLines.dispose();
    this.debugTriangles.dispose();
    this.debugBlocks.dispose();
    this.standardLayer.dispose();
    this.readoutLayer.dispose();
    this.world.dispose();
  }
}

function pushTriangle(
  verts: number[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  color: [number, number, number, number],
): void {
  verts.push(ax, ay, ...color, bx, by, ...color, cx, cy, ...color);
}
