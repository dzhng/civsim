// PhotorealBattleWorld — slice 08a: the FULL battle world at parity look on
// the three.js WebGPU + TSL substrate, accepting the EXACT production inputs
// BattleRenderer holds (terrain grid + tint + heightfield from setTerrain,
// buildCrowdInstances soldier frames, drawTris/drawTacticalLines Float32Array
// contracts). The sim firewall does not move: soldiers seat via the same CPU
// terrainHeightAt sampling; the only sim→renderer bridges stay
// buildCrowdInstances + terrainHeightAt.
//
// Scaffolding ledger rows owned here (README "Photoreal ladder invariants"):
//   - THREE.Fog haze stand-in matched to hazeColor — dies at 10b.
//   - Blob-shadow decal replica (crowdLayer) — dies at 11.
//   - Parity Gerstner-family sea shading (seaLayer) — dies at 12b–d.
// 08b swaps BattleRenderer's internals onto this class on the same canvas.
import * as THREE from 'three/webgpu';
import { buildCrowdInstances, type CrowdInstance } from '../../../crowd-runtime/src/instanceData';
import {
  BATTLE_ENVIRONMENTS,
  battleEnvironmentStats,
  type BattleEnvironment,
} from '../../../game-renderer/src/environment/environment';
import {
  BATTLE_RELIEF_EXAGGERATION,
  deriveBattleEdgeRoles,
  type BattleGroundCover,
  type BattleTerrainGrid,
} from '../../../game-renderer/src/battle/terrainFeatures';
import { battleMapByWasmId, buildBattleTerrainPresentation } from '../../../game-renderer/src/battle/mapCatalog';
import { buildBattleGroundMesh } from '../../../game-renderer/src/battle/groundPass';
import { buildBattleHorizonLayout } from '../../../game-renderer/src/battle/horizonPass';
import { buildBattleTerrainGrass } from '../../../game-renderer/src/battle/grassPass';
import { featuresToBattleScenery } from '../../../game-renderer/src/battle/terrainScenery';
import { terrainHeightAt, type TerrainHeightField } from '../../../game-renderer/src/terrain/heightField';
import type { MarkerInstance } from '../../../renderer-core/src/frameShell';
import { eyePosition, type Camera3DParams } from '../../../renderer-core/src/camera3d';
import {
  loadClassVats,
  loadPlaceholderKit,
  mountedClassesFromKit,
} from '../../../soldier-assets/src/placeholders';
import { createPlaceholderSoldierMeshes } from '../../../soldier-assets/src/soldierMesh';
import { PhotorealWorld } from '../world';
import { applyCamera3d } from '../cameraBridge';
import { PHOTOREAL_PROJECTION, PHOTOREAL_SUBSTRATE } from '../stats';
import { createBattleFrameUniforms, type BattleFrameUniforms } from './battleTsl';
import {
  BattleBackgroundQuads,
  createGroundMesh,
  createHorizonBlockerMesh,
  RENDER_ORDER,
} from './terrainLayer';
import { createOceanPlaneMesh } from './seaLayer';
import { PhotorealGrassField, PhotorealScenery } from './foliageLayer';
import { PhotorealCrowd, PhotorealSoldierShadows } from './crowdLayer';
import { PhotorealLineLayer, PhotorealMarkerLayer, PhotorealTriangleLayer } from './overlayLayer';

/** The camera fields BattleRenderer snapshots from the shared Camera each
 *  frame (renderer.ts cameraSnapshot) — the whole camera contract. */
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
}

export class PhotorealBattleWorld {
  readonly world: PhotorealWorld;
  readonly camera = new THREE.PerspectiveCamera();
  private readonly environment: BattleEnvironment = BATTLE_ENVIRONMENTS['golden-hour'];
  private readonly frame: BattleFrameUniforms;
  private readonly background: BattleBackgroundQuads;
  private readonly grass: PhotorealGrassField;
  private readonly scenery: PhotorealScenery;
  private readonly crowd: PhotorealCrowd;
  private readonly soldierShadows: PhotorealSoldierShadows;
  private readonly groundCues: PhotorealLineLayer;
  private readonly effectLines: PhotorealLineLayer;
  private readonly debugTriangles: PhotorealTriangleLayer;
  private readonly debugBlocks: PhotorealTriangleLayer;
  private readonly markerLayer: PhotorealMarkerLayer;
  private readonly mountedClasses: number[];

  private ground: THREE.Mesh | null = null;
  private horizonBlockers: THREE.Mesh | null = null;
  private oceanPlanes: THREE.Mesh[] = [];
  private sealedEdges: string[] = [];
  private groundTriangles = 0;

  private soldierUnit = new Uint32Array(0);
  private unitTeam: number[] = [];
  private unitClass: number[] = [];
  private staticSoldiers = 0;
  private terrainRect: [number, number, number, number] = [-220, -180, 440, 360];
  private terrainGrid: BattleTerrainGrid | null = null;
  private heightField: TerrainHeightField | null = null;
  private groundCover: BattleGroundCover = 'green-grass';
  private grassTerrainKey: string | null = null;
  private grassWindPhase = 0;
  private instances: CrowdInstance[] = [];
  private markers: MarkerInstance[] = [];
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
    meshes: ReturnType<typeof createPlaceholderSoldierMeshes>,
    vats: Awaited<ReturnType<typeof loadClassVats>>,
    kit: Awaited<ReturnType<typeof loadPlaceholderKit>>,
  ) {
    this.world = world;
    this.frame = createBattleFrameUniforms();
    this.frame.time = world.uTime;
    const scene = world.scene;
    const env = this.environment;

    // Parity output: the bespoke frame writes display values straight to a
    // non-sRGB swapchain — no tone mapping, no output transform.
    world.renderer.toneMapping = THREE.NoToneMapping;
    world.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    // TSL/three@0.185 HAZARD (recorded in the slice file): with
    // `reversedDepthBuffer` three sorts its render lists then REVERSES them
    // wholesale (RenderList.sort → list.reverse()), inverting renderOrder
    // semantics — the -10 backdrop would draw LAST and cover the world. These
    // comparators pre-invert every axis so the post-reverse order is the
    // classic painter contract (renderOrder asc; opaque front-to-back,
    // transparent back-to-front) the frame-graph port layers by.
    interface SortItem { groupOrder: number | null; renderOrder: number | null; z: number | null; id: number | null }
    world.renderer.setOpaqueSort((a: SortItem, b: SortItem) =>
      ((b.groupOrder ?? 0) - (a.groupOrder ?? 0)) || ((b.renderOrder ?? 0) - (a.renderOrder ?? 0))
      || ((b.z ?? 0) - (a.z ?? 0)) || ((b.id ?? 0) - (a.id ?? 0)));
    world.renderer.setTransparentSort((a: SortItem, b: SortItem) =>
      ((b.groupOrder ?? 0) - (a.groupOrder ?? 0)) || ((b.renderOrder ?? 0) - (a.renderOrder ?? 0))
      || ((a.z ?? 0) - (b.z ?? 0)) || ((b.id ?? 0) - (a.id ?? 0)));
    // drawFrame's clear colour — visible only past the backdrop, like bespoke.
    scene.background = new THREE.Color(0.16, 0.24, 0.15);
    // THREE.Fog haze stand-in (ledger: dies at 10b) in the preset hazeColor,
    // covering the surfaces without a ported bespoke haze term (crowd,
    // scenery). Parity constraint: the bespoke frame applies NO fog to those
    // surfaces, and the top-down overview parks the eye ~3.2 km out (rig
    // distance 2×min(map w,h)), so the ramp starts past that — the stand-in
    // only ever touches beyond-battle distances until 10b replaces it with
    // the one aerial-perspective owner.
    const haze = env.environment.hazeColor;
    scene.fog = new THREE.Fog(new THREE.Color(haze[0], haze[1], haze[2]), 3400, 8200);
    // The stats identity field: this world is dressed from the ONE preset
    // owner (BATTLE_ENVIRONMENTS['golden-hour'] → CIVSIM_ENVIRONMENTS.golden).
    world.environmentId = env.environment.id;

    this.background = new BattleBackgroundQuads(scene, this.frame);
    this.grass = new PhotorealGrassField(scene, env, this.frame);
    this.scenery = new PhotorealScenery(scene);
    this.crowd = new PhotorealCrowd(scene, env, meshes, vats, kit);
    this.soldierShadows = new PhotorealSoldierShadows(scene);
    this.mountedClasses = mountedClassesFromKit(kit);
    this.groundCues = new PhotorealLineLayer(scene, 0.02, {
      alpha: 0.88,
      depthTest: true,
      renderOrder: RENDER_ORDER.groundCues,
    });
    this.effectLines = new PhotorealLineLayer(scene, 0.0, {
      alpha: 0.92,
      depthTest: false,
      renderOrder: RENDER_ORDER.effectLines,
    });
    this.debugBlocks = new PhotorealTriangleLayer(scene, RENDER_ORDER.debugBlocks);
    this.debugTriangles = new PhotorealTriangleLayer(scene, RENDER_ORDER.debugTriangles);
    this.markerLayer = new PhotorealMarkerLayer(scene);
  }

  static async create(canvas: HTMLCanvasElement): Promise<PhotorealBattleWorld> {
    const [world, kit] = await Promise.all([
      PhotorealWorld.create(canvas, { antialias: false }),
      loadPlaceholderKit(),
    ]);
    const vats = await loadClassVats(kit);
    return new PhotorealBattleWorld(world, createPlaceholderSoldierMeshes([0.2, 0.42, 0.88]), vats, kit);
  }

  setTime(seconds: number): void {
    this.world.setTime(seconds);
  }

  resize(width: number, height: number, pixelRatio = 1): void {
    this.world.resize(width, height, pixelRatio);
  }

  setStatic(soldierUnit: Uint32Array, teams: number[], classes: number[]): void {
    this.soldierUnit = new Uint32Array(soldierUnit);
    this.unitTeam = teams.map((team) => (team === 1 ? 1 : 0));
    this.unitClass = classes.map((cls) => Math.max(0, Math.floor(cls || 0)));
    this.staticSoldiers = soldierUnit.length;
    this.instances = [];
    this.markers = [];
    this.crowd.upload([]);
    this.soldierShadows.upload([]);
    this.markerLayer.upload([]);
    this.effectLines.upload(new Float32Array());
    this.debugTriangles.upload(new Float32Array());
    this.debugBlocks.upload(new Float32Array());
  }

  setTerrain(
    w: number,
    h: number,
    cell: number,
    ox: number,
    oy: number,
    tint?: Uint8Array,
    height?: Float32Array,
    wasmMapId?: number,
  ): void {
    this.terrainRect = [ox, oy, w * cell, h * cell];
    this.terrainGrid = tint
      ? {
          w,
          h,
          cell,
          ox,
          oy,
          tint: new Uint8Array(tint),
          height: height ? new Float32Array(height) : undefined,
        }
      : null;
    const catalog = wasmMapId !== undefined ? battleMapByWasmId(wasmMapId) : undefined;
    this.groundCover = catalog?.groundCover ?? 'green-grass';
    this.applyTerrain();
  }

  /** Mirror of BattleRenderer.applyTerrain: one height field (with the shared
   *  render exaggeration) feeds ground, scenery seats, horizon, and soldiers. */
  private applyTerrain(): void {
    const grid = this.terrainGrid;
    if (!grid) return;
    const field: TerrainHeightField = grid.height
      ? {
          w: grid.w,
          h: grid.h,
          cell: grid.cell,
          ox: grid.ox,
          oy: grid.oy,
          height: grid.height,
          units: 'meters',
          verticalScale: BATTLE_RELIEF_EXAGGERATION,
        }
      : {
          w: grid.w,
          h: grid.h,
          cell: grid.cell,
          ox: grid.ox,
          oy: grid.oy,
          height: new Float32Array(grid.w * grid.h),
          units: 'meters',
          verticalScale: 1,
        };
    this.heightField = field;
    const presentation = buildBattleTerrainPresentation(
      {
        id: 'live',
        edges: deriveBattleEdgeRoles(grid),
        groundCover: this.groundCover,
      },
      grid,
      0x5eed,
    );

    const scene = this.world.scene;
    if (this.ground) {
      scene.remove(this.ground);
      this.ground.geometry.dispose();
    }
    const groundMesh = buildBattleGroundMesh(grid, field, this.groundCover);
    this.groundTriangles = groundMesh.triangles;
    this.ground = createGroundMesh(this.environment, this.frame, groundMesh);
    scene.add(this.ground);

    if (this.horizonBlockers) {
      scene.remove(this.horizonBlockers);
      this.horizonBlockers.geometry.dispose();
    }
    for (const plane of this.oceanPlanes) {
      scene.remove(plane);
      plane.geometry.dispose();
    }
    const layout = buildBattleHorizonLayout(
      { ox: grid.ox, oy: grid.oy, w: grid.w, h: grid.h, cell: grid.cell },
      presentation.edges,
      field,
    );
    this.sealedEdges = layout.builtEdges.map((e) => `${e.side}:${e.role}`);
    this.horizonBlockers = createHorizonBlockerMesh(this.environment, layout);
    if (this.horizonBlockers) scene.add(this.horizonBlockers);
    this.oceanPlanes = layout.oceanPlanes.map((spec) => createOceanPlaneMesh(this.environment, this.frame, spec));
    for (const plane of this.oceanPlanes) scene.add(plane);

    this.scenery.upload(featuresToBattleScenery(presentation.features, field, 0x77));
    this.background.setRects(this.terrainRect, expandedTerrainRect(this.terrainRect));
    this.grassTerrainKey = null;
    this.updateGrassForCamera(this.lastCamera);
  }

  private terrainHeightSampler(): ((x: number, y: number) => number) | undefined {
    const field = this.heightField;
    return field ? (x, y) => terrainHeightAt(field, x, y) : undefined;
  }

  draw(
    positions: Float32Array,
    facings: Float32Array,
    frames: Float32Array,
    alive: Float32Array,
    count: number,
    camera: BattleCameraSnapshot,
    renderClass?: Uint8Array | number[] | null,
    simTick?: number,
  ): void {
    this.setCamera(camera);
    const built = buildCrowdInstances({
      positions,
      facings,
      frames,
      alive,
      soldierUnit: this.soldierUnit,
      unitTeam: this.unitTeam,
      unitClass: this.unitClass,
      renderClass: renderClass ?? undefined,
      mountedClasses: this.mountedClasses,
      terrainHeight: this.terrainHeightSampler(),
      simTick: simTick ?? 0,
      count,
    });
    if (camera.zoom < 1.2) {
      this.instances = [];
      this.markers = built.instances.map((inst) => ({
        x: inst.x,
        y: inst.y,
        facing: inst.facing,
        faction: inst.faction,
        size: inst.mounted ? 1.45 : 1.1,
        lod: 3,
      }));
    } else {
      this.instances = built.instances;
      this.markers = [];
    }
    this.updateSeating(built.instances);
    this.updateGrassWindPhase();
    this.updateGrassForCamera(camera);
    this.crowd.upload(this.instances);
    this.soldierShadows.upload(this.instances);
    this.markerLayer.upload(this.markers);
  }

  drawTris(verts: Float32Array, camera: BattleCameraSnapshot): void {
    this.setCamera(camera);
    this.debugTriangles.upload(verts);
  }

  /** Uploads debug block triangles (the ?debug=blocks surface). */
  uploadDebugBlocks(verts: Float32Array): void {
    this.debugBlocks.upload(verts);
  }

  /** The frame call: uploads the tactical-line decals/overlays and renders. */
  drawTacticalLines(lines: BattleTacticalLineFrame, camera: BattleCameraSnapshot): void {
    this.setCamera(camera);
    this.updateGrassWindPhase();
    this.updateGrassForCamera(camera);
    this.groundCues.upload(lines.groundCues);
    this.effectLines.upload(lines.effects);
    this.render();
  }

  /** Pose the three camera from camera3d (the ONLY way — cameraBridge) and
   *  render the scene. drawTacticalLines calls this; routes may call it
   *  directly when they draw a static world. */
  render(): void {
    applyCamera3d(this.camera, this.lastCamera.camera3d);
    this.markerLayer.setCameraBasis(this.camera);
    this.background.setStyle(this.lastCamera.zoom < 1.2 ? 'wide-detail' : 'default');
    this.world.render(this.camera);
  }

  private setCamera(camera: BattleCameraSnapshot): void {
    this.lastCamera = camera;
    this.frame.focus.value.set(camera.x, camera.y);
    const eye = eyePosition(camera.camera3d);
    this.frame.eyeXY.value.set(eye[0], eye[1]);
  }

  private updateSeating(instances: CrowdInstance[]): void {
    const sampler = this.terrainHeightSampler();
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

  /** Identical cache-key policy to BattleRenderer.updateGrassForCamera — same
   *  zoom buckets, same snapped focus, same production params. */
  private updateGrassForCamera(camera: BattleCameraSnapshot): void {
    if (!this.terrainGrid || !this.heightField) return;
    const zoomT = clampUnit(camera.zoomT);
    const radius = grassFocusRadius(zoomT, this.terrainRect);
    const step = Math.max(24, radius * 0.14);
    const focus = {
      x: Math.round(camera.x / step) * step,
      y: Math.round(camera.y / step) * step,
      radius,
    };
    const zoomBucket = Math.round(zoomT * 5);
    const key = [
      this.terrainGrid.w,
      this.terrainGrid.h,
      this.terrainGrid.cell,
      this.terrainGrid.ox,
      this.terrainGrid.oy,
      this.groundCover,
      zoomBucket,
      Math.round(focus.x),
      Math.round(focus.y),
      Math.round(focus.radius),
    ].join(':');
    if (key === this.grassTerrainKey) return;
    this.grassTerrainKey = key;
    this.grass.apply(buildBattleTerrainGrass(this.terrainGrid, this.heightField, this.groundCover, {
      seed: 0x7a55,
      density: 0.48,
      maxTufts: 4200,
      zoomT: zoomBucket / 5,
      focus,
      bladeHeight: 1.0,
      bladeWidth: 0.072,
      bend: 0.32,
      spread: 0.2,
      windPhase: this.grassWindPhase,
      windStrength: 0.075,
    }));
  }

  private updateGrassWindPhase(): void {
    this.grassWindPhase = this.world.time * 0.58;
    this.grass.setWindPhase(this.grassWindPhase);
  }

  stats() {
    const world = this.world.stats();
    const markerCount = this.markers.length;
    const skinnedCount = this.instances.length;
    return {
      renderer: 'gpu' as const,
      ready: true,
      substrate: PHOTOREAL_SUBSTRATE,
      projection: PHOTOREAL_PROJECTION,
      environment: this.environment.environment.id,
      width: this.world.renderer.domElement.width,
      height: this.world.renderer.domElement.height,
      soldiers: skinnedCount + markerCount,
      expectedSoldiers: this.staticSoldiers,
      drawCalls: world.drawCalls,
      triangles: world.triangles,
      lod: { skinned: skinnedCount, impostors: markerCount },
      camera: this.lastCamera,
      seating: { ...this.seating },
      terrain: this.ground
        ? {
            fixture: 'sim-tint' as const,
            layer: 'photoreal-battle-ground' as const,
            groundTriangles: this.groundTriangles,
            sealedEdges: [...this.sealedEdges],
            groundCover: this.groundCover,
            environment: battleEnvironmentStats(this.environment),
            scenery: this.scenery.stats().scenery,
            grass: this.grass.stats(),
          }
        : null,
      tacticalLines: {
        groundCues: this.groundCues.stats(),
        effects: this.effectLines.stats(),
      },
      markers: this.markerLayer.stats(),
      performance: {
        gpuTimeMs: world.gpuTimeMs,
      },
    };
  }

  async settlePresentedFrame(): Promise<void> {
    await this.world.settlePresentedFrame();
  }

  dispose(): void {
    this.world.dispose();
  }
}

/** BattleRenderer's expandedTerrainRect — the backdrop margin. */
function expandedTerrainRect([x, y, w, h]: [number, number, number, number]): [number, number, number, number] {
  const margin = Math.max(120, Math.max(w, h) * 0.22);
  return [x - margin, y - margin, w + margin * 2, h + margin * 2];
}

/** BattleRenderer's grassFocusRadius. */
function grassFocusRadius(zoomT: number, rect: [number, number, number, number]): number {
  const shortSide = Math.max(1, Math.min(rect[2], rect[3]));
  const longSide = Math.max(rect[2], rect[3]);
  return Math.min(longSide * 0.42, Math.max(120, shortSide * (0.34 - zoomT * 0.18)));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
