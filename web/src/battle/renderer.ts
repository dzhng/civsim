import type { Camera } from "../shared/camera";
import {
  buildCrowdInstances,
  type CrowdInstance,
} from "../../../packages/crowd-runtime/src/instanceData";
import { BattleEffectLinePass } from "../../../packages/game-renderer/src/battle/effectLinePass";
import { BattleGrassPass } from "../../../packages/game-renderer/src/battle/grassPass";
import { BattleGroundCuePass } from "../../../packages/game-renderer/src/battle/groundCuePass";
import { BattleGroundPass } from "../../../packages/game-renderer/src/battle/groundPass";
import { BattleHorizonPass } from "../../../packages/game-renderer/src/battle/horizonPass";
import { CampaignSceneryPass } from "../../../packages/game-renderer/src/campaign/sceneryPass";
import {
  buildBattleTerrainPresentation,
  battleMapByWasmId,
} from "../../../packages/game-renderer/src/battle/mapCatalog";
import {
  deriveBattleEdgeRoles,
  type BattleGroundCover,
  type BattleTerrainGrid,
} from "../../../packages/game-renderer/src/battle/terrainFeatures";
import { featuresToBattleScenery } from "../../../packages/game-renderer/src/battle/terrainScenery";
import {
  terrainHeightAt,
  type TerrainHeightField,
} from "../../../packages/game-renderer/src/terrain/heightField";
import {
  createFrameShell,
  type MarkerInstance,
  type OverlayRenderPass,
  type RawFrameShell,
  type WorldRenderPass,
} from "../../../packages/renderer-core/src/frameShell";
import { compileShader } from "../../../packages/renderer-core/src/compileShader";
import { gpuMultisample } from "../../../packages/renderer-core/src/pipelineContracts";
import { fatalSurfaceFor, showFatalErrorSurface } from "../shared/fatalError";
import { WORLD_CAMERA_WGSL } from "../../../packages/renderer-core/src/cameraWgsl";
import { SkinnedCrowdPipeline } from "../../../packages/renderer-core/src/skinnedPipeline";
import { SoldierShadowDecalPass } from "../../../packages/renderer-core/src/soldierShadowPass";
import {
  loadClassVats,
  loadPlaceholderKit,
  mountedClassesFromKit,
} from "../../../packages/soldier-assets/src/placeholders";
import { createPlaceholderSoldierMeshes } from "../../../packages/soldier-assets/src/soldierMesh";

export class BattleRenderer {
  readonly ready: Promise<void>;
  fixedTime: number | null = null;
  preserveFrozenEffects = false;

  // Render exaggeration for the gentle metre-scale relief at the gameplay
  // camera; the sim height stays plausible. Modest for live play (vs the lab
  // review value) so soldiers don't visibly stair-step.
  private static readonly RELIEF_EXAGGERATION = 1.6;

  private shell: RawFrameShell | null = null;
  private ground: BattleGroundPass | null = null;
  private grass: BattleGrassPass | null = null;
  private scenery: CampaignSceneryPass | null = null;
  private horizon: BattleHorizonPass | null = null;
  private heightField: TerrainHeightField | null = null;
  private crowd: SkinnedCrowdPipeline | null = null;
  private soldierShadows: SoldierShadowDecalPass | null = null;
  private groundCues: BattleGroundCuePass | null = null;
  private effectLines: BattleEffectLinePass | null = null;
  private tris: BattleTrianglePass | null = null;
  private debugBlocks: BattleTrianglePass | null = null;
  private soldierUnit = new Uint32Array(0);
  private mountedClasses: number[] = [];
  private unitTeam: number[] = [];
  private unitClass: number[] = [];
  private terrainRect: [number, number, number, number] = [-220, -180, 440, 360];
  private terrainGrid: BattleTerrainGrid | null = null;
  private groundCover: BattleGroundCover = "green-grass";
  private grassTerrainKey: string | null = null;
  private grassWindPhase = 0;
  private instances: CrowdInstance[] = [];
  private markers: MarkerInstance[] = [];
  private triangleVerts = new Float32Array();
  private staticSoldiers = 0;
  private frozenFrameKey: string | null = null;
  private skipFrozenFrame = false;
  private blockMode = new URLSearchParams(location.search).get("debug") === "blocks";
  private framePerf = {
    buildMs: 0,
    uploadMs: 0,
    drawMs: 0,
    frameCpuMs: 0,
  };
  private frameStart = 0;
  private lastCamera = {
    x: 0,
    y: 0,
    zoom: 0,
    pitch: 0,
    yaw: 0,
    zoomT: 0,
    targetOffset: 0,
    perspective: 0,
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.ready = this.init();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    this.shell?.resize();
  }

  setStatic(soldierUnit: Uint32Array, teams: number[], classes: number[]) {
    this.soldierUnit = new Uint32Array(soldierUnit);
    this.unitTeam = teams.map((team) => (team === 1 ? 1 : 0));
    this.unitClass = classes.map((cls) => Math.max(0, Math.floor(cls || 0)));
    this.staticSoldiers = soldierUnit.length;
    this.frozenFrameKey = null;
    this.instances = [];
    this.markers = [];
    this.triangleVerts = new Float32Array();
    this.crowd?.upload([]);
    this.soldierShadows?.upload([]);
    this.effectLines?.upload(this.triangleVerts);
    this.tris?.upload(this.triangleVerts);
    this.debugBlocks?.upload(this.triangleVerts);
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
  ) {
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
    this.groundCover = catalog?.groundCover ?? "green-grass";
    this.applyTerrain();
  }

  /** Build the height field + scenery from the stored grid and push them to the
   *  passes. Safe to call before init (passes apply it themselves once ready). */
  private applyTerrain() {
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
          units: "meters",
          verticalScale: BattleRenderer.RELIEF_EXAGGERATION,
        }
      : {
          w: grid.w,
          h: grid.h,
          cell: grid.cell,
          ox: grid.ox,
          oy: grid.oy,
          height: new Float32Array(grid.w * grid.h),
          units: "meters",
          verticalScale: 1,
        };
    this.heightField = field;
    const presentation = buildBattleTerrainPresentation(
      {
        id: "live",
        edges: deriveBattleEdgeRoles(grid),
        groundCover: this.groundCover,
      },
      grid,
      0x5eed,
    );
    this.ground?.setTerrain(grid, field, this.groundCover);
    this.scenery?.upload(featuresToBattleScenery(presentation.features, field, 0x77));
    this.horizon?.setEdges(
      { ox: grid.ox, oy: grid.oy, w: grid.w, h: grid.h, cell: grid.cell },
      presentation.edges,
      field,
    );
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
    camera: Camera,
    renderClass?: Uint8Array | number[] | null,
    simTick?: number,
  ) {
    if (!this.shell || !this.crowd) return;
    const frameKey =
      this.fixedTime !== null
        ? `${frozenFrameKey(camera, count, this.soldierUnit.length)}|effects=${this.preserveFrozenEffects ? 1 : 0}`
        : null;
    if (frameKey && frameKey === this.frozenFrameKey) {
      this.skipFrozenFrame = true;
      this.framePerf = { buildMs: 0, uploadMs: 0, drawMs: 0, frameCpuMs: 0 };
      return;
    }
    this.skipFrozenFrame = false;
    this.frameStart = performance.now();
    this.lastCamera = cameraSnapshot(camera);
    this.shell.setCamera(this.lastCamera);
    const buildStart = performance.now();
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
      simTick: simTick ?? Math.floor((this.fixedTime ?? performance.now() / 1000) * 30),
      count,
    });
    const buildEnd = performance.now();
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
    const uploadStart = performance.now();
    this.updateGrassWindPhase();
    this.updateGrassForCamera(this.lastCamera);
    this.crowd.upload(this.instances);
    this.soldierShadows?.upload(this.instances);
    this.debugBlocks?.upload(
      this.blockMode
        ? buildDebugBlockTriangles(positions, alive, this.soldierUnit, this.unitTeam, count)
        : new Float32Array(),
    );
    const uploadEnd = performance.now();
    this.framePerf = {
      buildMs: buildEnd - buildStart,
      uploadMs: uploadEnd - uploadStart,
      drawMs: 0,
      frameCpuMs: uploadEnd - this.frameStart,
    };
  }

  drawTris(verts: Float32Array, camera: Camera) {
    if (!this.shell || !this.tris) return;
    this.frozenFrameKey = null;
    this.skipFrozenFrame = false;
    this.lastCamera = cameraSnapshot(camera);
    this.shell.setCamera(this.lastCamera);
    this.triangleVerts = new Float32Array(verts);
    const uploadStart = performance.now();
    this.tris.upload(verts);
    this.framePerf.uploadMs += performance.now() - uploadStart;
  }

  drawTacticalLines(lines: BattleTacticalLineFrame, camera: Camera) {
    if (
      !this.shell ||
      !this.ground ||
      !this.grass ||
      !this.crowd ||
      !this.soldierShadows ||
      !this.groundCues ||
      !this.effectLines ||
      !this.tris ||
      !this.debugBlocks
    )
      return;
    if (this.skipFrozenFrame) return;
    this.lastCamera = cameraSnapshot(camera);
    this.shell.setCamera(this.lastCamera);
    if (this.frameStart === 0) this.frameStart = performance.now();
    const uploadStart = performance.now();
    this.updateGrassWindPhase();
    this.updateGrassForCamera(this.lastCamera);
    this.groundCues.upload(
      this.fixedTime !== null ? frozenSelectionGroundCues(lines.groundCues) : lines.groundCues,
    );
    this.effectLines.upload(
      this.fixedTime !== null && !this.preserveFrozenEffects ? new Float32Array() : lines.effects,
    );
    if (this.triangleVerts.length === 0) this.tris.upload(this.triangleVerts);
    this.framePerf.uploadMs += performance.now() - uploadStart;
    const drawStart = performance.now();
    this.shell.drawFrame({
      clear: { r: 0.16, g: 0.24, b: 0.15, a: 1 },
      terrainBackdropRect: expandedTerrainRect(this.terrainRect),
      terrainRect: this.terrainRect,
      terrainStyle: camera.zoom < 1.2 ? "wide-detail" : "default",
      markers: this.markers,
      markerLayer: this.markers.length > 0 ? "far-lod-impostor" : undefined,
      passes: [
        {
          id: "battle-horizon",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass: WorldRenderPass) => this.horizon!.draw(pass),
        },
        {
          id: "battle-ground",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass: WorldRenderPass) => this.ground!.draw(pass),
        },
        {
          id: "battle-terrain-scenery",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass: WorldRenderPass) => this.scenery!.drawOpaque(pass),
        },
        {
          id: "battle-grass",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass: WorldRenderPass) => this.grass!.draw(pass),
        },
        {
          id: "battle-skinned-crowd",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass) => this.crowd!.draw(pass),
        },
        {
          id: "battle-terrain-scenery-shadow",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass: WorldRenderPass) => this.scenery!.drawShadows(pass),
        },
        {
          id: "battle-soldier-shadows",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass: WorldRenderPass) => this.soldierShadows!.draw(pass),
        },
        {
          id: "battle-ground-cues",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass) => this.groundCues!.draw(pass),
        },
        {
          id: "battle-effect-lines",
          role: "overlay-effect",
          phase: "overlay",
          draw: (pass) => this.effectLines!.draw(pass),
        },
        {
          id: "battle-debug-blocks",
          role: "overlay-debug",
          phase: "overlay",
          draw: (pass) => this.debugBlocks!.draw(pass),
        },
        {
          id: "battle-debug-triangles",
          role: "overlay-debug",
          phase: "overlay",
          draw: (pass) => this.tris!.draw(pass),
        },
      ],
    });
    const done = performance.now();
    this.framePerf.drawMs = done - drawStart;
    this.framePerf.frameCpuMs = done - this.frameStart;
    this.triangleVerts = new Float32Array();
    if (this.fixedTime !== null) {
      this.frozenFrameKey = `${frozenFrameKey(camera, this.staticSoldiers, this.soldierUnit.length)}|effects=${this.preserveFrozenEffects ? 1 : 0}`;
    } else {
      this.frozenFrameKey = null;
    }
  }

  stats() {
    const shell = this.shell?.stats();
    const crowd = this.crowd?.stats();
    const markerCount = shell?.markerCount ?? this.markers.length;
    const skinnedCount = crowd?.instances ?? this.instances.length;
    return {
      renderer: "gpu",
      ready: this.shell !== null,
      width: shell?.width ?? 0,
      height: shell?.height ?? 0,
      soldiers: skinnedCount + markerCount,
      expectedSoldiers: this.staticSoldiers,
      drawCalls: (crowd?.drawCalls ?? 0) + (markerCount > 0 ? 1 : 0),
      lod: {
        skinned: skinnedCount,
        impostors: markerCount,
      },
      device: shell?.device ?? "initializing",
      atmosphere: shell?.atmosphere ?? "initializing",
      cameraContract: shell?.cameraContract ?? "initializing",
      skinnedCameraContract: crowd?.cameraContract ?? "initializing",
      camera: this.lastCamera,
      markerLayer: shell?.markerLayer ?? (markerCount > 0 ? "far-lod-impostor" : "none"),
      phases: shell?.phases ?? [],
      depth: shell?.depth ?? null,
      terrain: this.ground
        ? {
            fixture: "sim-tint",
            layer: this.ground.stats().layer,
            groundTriangles: this.ground.stats().triangles,
            sealedEdges: this.horizon?.stats().sealedEdges ?? [],
            groundCover: this.groundCover,
            scenery: this.scenery?.stats().scenery ?? 0,
            grass: this.grass?.stats() ?? null,
          }
        : null,
      tacticalLines: {
        groundCues: this.groundCues?.stats() ?? null,
        effects: this.effectLines?.stats() ?? null,
      },
      performance: {
        buildMs: roundMs(this.framePerf.buildMs),
        uploadMs: roundMs(this.framePerf.uploadMs),
        drawMs: roundMs(this.framePerf.drawMs),
        frameCpuMs: roundMs(this.framePerf.frameCpuMs),
      },
    };
  }

  async settlePresentedFrame() {
    if (!this.shell) return;
    await this.shell.device.queue.onSubmittedWorkDone();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await this.shell.device.queue.onSubmittedWorkDone();
  }

  private async init() {
    this.shell = await createFrameShell(this.canvas, {
      onFatalError: (report) =>
        showFatalErrorSurface(
          this.canvas,
          fatalSurfaceFor(
            report.phase === "device-lost" ? "device-lost" : "submission",
            report.message,
          ),
        ),
    });
    this.ground = new BattleGroundPass(this.shell);
    this.grass = new BattleGrassPass(this.shell);
    this.scenery = new CampaignSceneryPass(this.shell, "battle");
    this.horizon = new BattleHorizonPass(this.shell);
    this.applyTerrain();
    this.groundCues = new BattleGroundCuePass(this.shell);
    this.effectLines = new BattleEffectLinePass(this.shell);
    this.tris = new BattleTrianglePass(this.shell);
    this.debugBlocks = new BattleTrianglePass(this.shell);
    const kit = await loadPlaceholderKit();
    this.mountedClasses = mountedClassesFromKit(kit);
    this.crowd = new SkinnedCrowdPipeline(
      this.shell,
      createPlaceholderSoldierMeshes([0.2, 0.42, 0.88]),
      await loadClassVats(kit),
      kit,
    );
    this.soldierShadows = new SoldierShadowDecalPass(this.shell);
  }

  private updateGrassForCamera(camera: typeof this.lastCamera) {
    if (!this.grass || !this.terrainGrid || !this.heightField) return;
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
    ].join(":");
    if (key === this.grassTerrainKey) return;
    this.grassTerrainKey = key;
    this.grass.setTerrain(this.terrainGrid, this.heightField, this.groundCover, {
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
    });
  }

  private updateGrassWindPhase() {
    const seconds = this.fixedTime ?? performance.now() / 1000;
    this.grassWindPhase = seconds * 0.58;
    this.grass?.setWindPhase(this.grassWindPhase);
  }
}

export interface BattleTacticalLineFrame {
  groundCues: Float32Array;
  effects: Float32Array;
}

function frozenSelectionGroundCues(verts: Float32Array) {
  const stride = 5;
  const maxSegmentLength = 12;
  const out: number[] = [];
  for (let i = 0; i + stride * 2 <= verts.length; i += stride * 2) {
    const x0 = verts[i];
    const y0 = verts[i + 1];
    const x1 = verts[i + stride];
    const y1 = verts[i + stride + 1];
    if (Math.hypot(x1 - x0, y1 - y0) > maxSegmentLength) continue;
    for (let k = 0; k < stride * 2; k++) out.push(verts[i + k]);
  }
  return new Float32Array(out);
}

function roundMs(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}

function cameraSnapshot(camera: Camera) {
  const [x, y] = camera.viewCenter();
  return {
    x,
    y,
    zoom: camera.zoom,
    pitch: camera.pitch,
    yaw: camera.yaw,
    zoomT: camera.zoomT,
    targetOffset: camera.targetOffset,
    perspective: camera.perspective,
  };
}

function frozenFrameKey(camera: Camera, count: number, staticSoldiers: number) {
  const [x, y] = camera.viewCenter();
  return [
    roundKey(x),
    roundKey(y),
    roundKey(camera.zoom),
    roundKey(camera.pitch ?? 0),
    roundKey(camera.yaw ?? 0),
    roundKey(camera.perspective ?? 0),
    count,
    staticSoldiers,
  ].join(":");
}

function roundKey(value: number) {
  return Number.isFinite(value) ? value.toFixed(4) : "nan";
}

function expandedTerrainRect([x, y, w, h]: [number, number, number, number]): [
  number,
  number,
  number,
  number,
] {
  const margin = Math.max(120, Math.max(w, h) * 0.22);
  return [x - margin, y - margin, w + margin * 2, h + margin * 2];
}

function grassFocusRadius(zoomT: number, rect: [number, number, number, number]) {
  const shortSide = Math.max(1, Math.min(rect[2], rect[3]));
  const longSide = Math.max(rect[2], rect[3]);
  return Math.min(longSide * 0.42, Math.max(120, shortSide * (0.34 - zoomT * 0.18)));
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function buildDebugBlockTriangles(
  positions: Float32Array,
  alive: Float32Array,
  soldierUnit: Uint32Array,
  unitTeam: number[],
  count: number,
) {
  const bounds = new Map<
    number,
    { x0: number; y0: number; x1: number; y1: number; team: number }
  >();
  for (let i = 0; i < count; i++) {
    if ((alive[i] ?? 0) <= 0.5) continue;
    const unit = soldierUnit[i] ?? 0;
    const x = positions[i * 2];
    const y = positions[i * 2 + 1];
    const prev = bounds.get(unit);
    if (prev) {
      prev.x0 = Math.min(prev.x0, x);
      prev.y0 = Math.min(prev.y0, y);
      prev.x1 = Math.max(prev.x1, x);
      prev.y1 = Math.max(prev.y1, y);
    } else {
      bounds.set(unit, { x0: x, y0: y, x1: x, y1: y, team: unitTeam[unit] ?? 0 });
    }
  }
  const verts: number[] = [];
  for (const b of bounds.values()) {
    const pad = 2.4;
    const x0 = b.x0 - pad;
    const y0 = b.y0 - pad;
    const x1 = b.x1 + pad;
    const y1 = b.y1 + pad;
    const color: [number, number, number, number] =
      b.team === 1 ? [0.88, 0.2, 0.16, 0.88] : [0.18, 0.44, 1.0, 0.88];
    pushTri(verts, x0, y0, x1, y0, x1, y1, color);
    pushTri(verts, x0, y0, x1, y1, x0, y1, color);
  }
  return new Float32Array(verts);
}

function pushTri(
  verts: number[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  color: [number, number, number, number],
) {
  verts.push(ax, ay, ...color, bx, by, ...color, cx, cy, ...color);
}

class BattleTrianglePass {
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GPUBuffer;
  private capacity = 0;
  private vertexCount = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = compileShader(device, TRIANGLE_WGSL, "battle-triangle");
    this.pipeline = device.createRenderPipeline({
      label: "battle-triangle-pipeline",
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: "vs",
        buffers: [
          {
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [
          {
            format: shell.info.format,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
      multisample: gpuMultisample(this.shell.sampleCount),
    });
    this.vertexBuffer = device.createBuffer({
      label: "battle-triangle-empty",
      size: 6 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(vertices: Float32Array) {
    this.vertexCount = Math.floor(vertices.length / 6);
    if (this.vertexCount > this.capacity) {
      this.capacity = Math.max(this.vertexCount, this.capacity * 2, 128);
      this.vertexBuffer = this.shell.device.createBuffer({
        label: "battle-triangle-vertices",
        size: this.capacity * 6 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (vertices.length > 0) this.shell.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
  }

  draw(pass: OverlayRenderPass) {
    if (this.vertexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount);
  }
}

const TRIANGLE_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vs(@location(0) world: vec2f, @location(1) color: vec4f) -> VsOut {
  var out: VsOut;
  out.pos = projectGround(world, 0.0);
  out.color = color;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  return in.color;
}`;
