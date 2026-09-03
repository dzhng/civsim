// BattleRenderer — the production battle rendering seam (slice 08b: the
// atomic substrate flip). The public API (setStatic / setTerrain / draw /
// drawTris / drawTacticalLines / stats / resize) is unchanged — scene.ts,
// input.ts, HUD, and every battle scene talk only to this class — but the
// internals render through PhotorealBattleWorld (three.js WebGPU + TSL,
// packages/photoreal-renderer) on this same canvas. One canvas, one device
// (three's own); the bespoke frame shell + battle pass instances are gone.
//
// What stays ABOVE the seam (production-only behavior, deliberately not in
// the world): frozen-frame caching (fixedTime snapshots skip identical
// redraws), frozen-cue filtering (frozenSelectionGroundCues +
// preserveFrozenEffects), the ?debug=blocks triangle builder, and the CPU
// frame-perf split. The world renders what it is handed.
import type { Camera } from "../shared/camera";
import { roundMs } from "@packages/game-renderer/src/math";
import type { BattleGroundCover } from "@packages/game-renderer/src/battle/terrainFeatures";
import {
  PhotorealBattleWorld,
  type BattleLakeSurfaceSpec,
  type BattleCameraSnapshot,
  type BattleVistaGrid,
} from "@packages/photoreal-renderer/src/battle/battleWorld";
import {
  postGradeUniformsFromParams,
  type BattlePostGradeUniforms,
} from "@packages/photoreal-renderer/src/post/postChain";
import {
  seaDisplacementSourceFromParam,
  type SeaDisplacementSourceId,
} from "@packages/photoreal-renderer/src/battle/seaLayer";
import {
  getGraphicsSettings,
  graphicsQueryOverrides,
  resolveGraphicsSettings,
  subscribeGraphicsSettings,
  type GraphicsSettings,
} from "../shared/graphicsSettings";
import type { BattleReadoutInstance } from "@packages/photoreal-renderer/src/battle/readoutLayer";
import type { BattleStandardInstance } from "@packages/photoreal-renderer/src/battle/standardLayer";
import {
  deriveBattleEdgeRoles,
  type BattleSlopeBands,
  type BattleTerrainGrid,
} from "@packages/game-renderer/src/battle/terrainFeatures";
import { battleMapByWasmId } from "@packages/game-renderer/src/battle/mapCatalog";
import type { BattleEnvironmentId } from "@packages/game-renderer/src/environment/environment";
import { fatalSurfaceFor, showFatalErrorSurface } from "../shared/fatalError";

export interface BattleRendererOptions {
  environment?: BattleEnvironmentId | string | null;
  shadows?: string | null;
  sea?: SeaDisplacementSourceId | null;
  post?: string | null;
  postGrade?: Partial<BattlePostGradeUniforms> | null;
  graphics?: GraphicsSettings;
}

export interface BattleRendererAudioSurface {
  kind: "lake" | "ocean";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BattleRendererAudioTerrain {
  w: number;
  h: number;
  cell: number;
  ox: number;
  oy: number;
  tint: Uint8Array;
  /** Ground-cover family for rustle scaling (sand/scrub maps rustle less). */
  groundCover: BattleGroundCover;
}

export interface BattleRendererDisposeHook {
  dispose(): void;
}

export class BattleRenderer {
  readonly ready: Promise<void>;
  fixedTime: number | null = null;
  preserveFrozenEffects = false;

  private world: PhotorealBattleWorld | null = null;
  private pendingStatic: { soldierUnit: Uint32Array; teams: number[]; classes: number[] } | null =
    null;
  private pendingTerrain: Parameters<PhotorealBattleWorld["setTerrain"]> | null = null;
  private staticSoldiers = 0;
  // Kept above the seam for the ?debug=blocks unit-bounds overlay.
  private soldierUnit = new Uint32Array(0);
  private unitTeam: number[] = [];
  private triangleVerts = new Float32Array();
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
  private readoutFrameKey = "";
  private readonly environmentRequest: string | null;
  private readonly shadowRequest: GraphicsSettings["shadows"];
  private readonly grassQualityRequest: GraphicsSettings["grassQuality"];
  private graphicsUnsubscribe: (() => void) | null = null;
  private battleAudio: BattleRendererDisposeHook | null = null;
  private audioTerrain: BattleRendererAudioTerrain | null = null;
  private audioWaterSurfaces: BattleRendererAudioSurface[] = [];
  private readonly onResize = () => this.resize();
  private disposed = false;
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

  constructor(
    private canvas: HTMLCanvasElement,
    private options: BattleRendererOptions = {},
  ) {
    const params = new URLSearchParams(location.search);
    this.environmentRequest = params.get("env") ?? options.environment ?? null;
    const settings = resolveGraphicsSettings(
      location.search,
      options.graphics ?? getGraphicsSettings(),
    );
    this.shadowRequest = settings.shadows;
    this.grassQualityRequest = settings.grassQuality;
    this.ready = this.init();
    window.addEventListener("resize", this.onResize);
  }

  usesEnvironment(environment: BattleRendererOptions["environment"]): boolean {
    const params = new URLSearchParams(location.search);
    return (params.get("env") ?? environment ?? null) === this.environmentRequest;
  }

  usesGraphicsSettings(settings: GraphicsSettings): boolean {
    const next = resolveGraphicsSettings(location.search, settings);
    return next.shadows === this.shadowRequest && next.grassQuality === this.grassQualityRequest;
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener("resize", this.onResize);
    this.graphicsUnsubscribe?.();
    this.graphicsUnsubscribe = null;
    this.battleAudio?.dispose();
    this.battleAudio = null;
    this.world?.dispose();
    this.world = null;
  }

  setBattleAudio(audio: BattleRendererDisposeHook | null): void {
    if (this.battleAudio && this.battleAudio !== audio) this.battleAudio.dispose();
    this.battleAudio = audio;
  }

  clearBattleAudio(audio: BattleRendererDisposeHook): void {
    if (this.battleAudio === audio) this.battleAudio = null;
  }

  resize() {
    if (!this.world) return;
    // Same sizing contract as the bespoke shell: CSS box × devicePixelRatio.
    this.world.resize(
      this.canvas.clientWidth || 1,
      this.canvas.clientHeight || 1,
      window.devicePixelRatio || 1,
    );
  }

  setStatic(soldierUnit: Uint32Array, teams: number[], classes: number[]) {
    this.staticSoldiers = soldierUnit.length;
    this.soldierUnit = new Uint32Array(soldierUnit);
    this.unitTeam = teams.map((team) => (team === 1 ? 1 : 0));
    this.frozenFrameKey = null;
    this.readoutFrameKey = "";
    this.triangleVerts = new Float32Array();
    if (this.world) {
      this.world.setStatic(soldierUnit, teams, classes);
    } else {
      // Copy: wasm memory may move before init resolves.
      this.pendingStatic = {
        soldierUnit: this.soldierUnit,
        teams: [...teams],
        classes: [...classes],
      };
    }
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
    slopeBands?: BattleSlopeBands | null,
    vista?: BattleVistaGrid | null,
    lakeSurfaces?: BattleLakeSurfaceSpec[] | null,
    rough?: Float32Array,
    speed?: Float32Array,
    groundCover: BattleGroundCover = "green-grass",
  ) {
    if (this.world) {
      this.world.setTerrain(
        w,
        h,
        cell,
        ox,
        oy,
        tint,
        height,
        wasmMapId,
        slopeBands,
        vista,
        lakeSurfaces,
        rough,
        speed,
      );
    } else {
      this.pendingTerrain = [
        w,
        h,
        cell,
        ox,
        oy,
        tint ? new Uint8Array(tint) : undefined,
        height ? new Float32Array(height) : undefined,
        wasmMapId,
        slopeBands ?? null,
        cloneVistaGrid(vista),
        cloneLakeSurfaces(lakeSurfaces),
        rough ? new Float32Array(rough) : undefined,
        speed ? new Float32Array(speed) : undefined,
      ];
    }
    this.audioTerrain = tint
      ? {
          w,
          h,
          cell,
          ox,
          oy,
          tint: new Uint8Array(tint),
          groundCover,
        }
      : null;
    this.audioWaterSurfaces = buildAudioWaterSurfaces(
      this.audioTerrain,
      wasmMapId,
      vista,
      lakeSurfaces,
    );
  }

  battleAudioTerrain(): BattleRendererAudioTerrain | null {
    return this.audioTerrain
      ? { ...this.audioTerrain, tint: new Uint8Array(this.audioTerrain.tint) }
      : null;
  }

  battleAudioWaterSurfaces(): BattleRendererAudioSurface[] {
    return this.audioWaterSurfaces.map((surface) => ({ ...surface }));
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
    frameDt = 0,
  ) {
    if (!this.world) return;
    const frameKey =
      this.fixedTime !== null
        ? `${frozenFrameKey(camera, count, this.staticSoldiers)}|effects=${this.preserveFrozenEffects ? 1 : 0}`
        : null;
    if (frameKey && frameKey === this.frozenFrameKey) {
      this.skipFrozenFrame = true;
      this.framePerf = { buildMs: 0, uploadMs: 0, drawMs: 0, frameCpuMs: 0 };
      return;
    }
    this.skipFrozenFrame = false;
    this.frameStart = performance.now();
    const seconds = this.fixedTime ?? performance.now() / 1000;
    this.world.setTime(seconds);
    this.lastCamera = cameraSnapshot(camera);
    const buildStart = performance.now();
    // Instance build + LOD split + seating + crowd/shadow/marker uploads all
    // live behind the seam.
    this.world.draw(
      positions,
      facings,
      frames,
      alive,
      count,
      this.lastCamera,
      renderClass,
      simTick ?? Math.floor(seconds * 30),
      frameDt,
    );
    const buildEnd = performance.now();
    if (this.blockMode) {
      this.world.uploadDebugBlocks(
        buildDebugBlockTriangles(positions, alive, this.soldierUnit, this.unitTeam, count),
      );
    }
    const uploadEnd = performance.now();
    this.framePerf = {
      buildMs: buildEnd - buildStart,
      uploadMs: uploadEnd - buildEnd,
      drawMs: 0,
      frameCpuMs: uploadEnd - this.frameStart,
    };
  }

  drawTris(verts: Float32Array, camera: Camera) {
    if (!this.world) return;
    this.frozenFrameKey = null;
    this.skipFrozenFrame = false;
    this.lastCamera = cameraSnapshot(camera);
    this.triangleVerts = new Float32Array(verts);
    const uploadStart = performance.now();
    this.world.drawTris(verts, this.lastCamera);
    this.framePerf.uploadMs += performance.now() - uploadStart;
  }

  drawTacticalLines(lines: BattleTacticalLineFrame, camera: Camera) {
    if (!this.world) return;
    if (this.skipFrozenFrame) return;
    this.lastCamera = cameraSnapshot(camera);
    if (this.frameStart === 0) this.frameStart = performance.now();
    this.world.setTime(this.fixedTime ?? performance.now() / 1000);
    const uploadStart = performance.now();
    // A frame without drawTris clears the previous frame's attack arcs.
    if (this.triangleVerts.length === 0) this.world.drawTris(this.triangleVerts, this.lastCamera);
    this.framePerf.uploadMs += performance.now() - uploadStart;
    const drawStart = performance.now();
    this.world.drawTacticalLines(
      {
        groundCues:
          this.fixedTime !== null ? frozenSelectionGroundCues(lines.groundCues) : lines.groundCues,
        // Selection rings are unit-anchored and deterministic — frozen frames
        // keep them, exactly like the short-segment selection cues.
        rings: lines.rings,
        effects:
          this.fixedTime !== null && !this.preserveFrozenEffects
            ? new Float32Array()
            : lines.effects,
      },
      this.lastCamera,
    );
    const done = performance.now();
    this.framePerf.drawMs = done - drawStart;
    this.framePerf.frameCpuMs = done - this.frameStart;
    this.triangleVerts = new Float32Array();
    if (this.fixedTime !== null) {
      this.frozenFrameKey = `${frozenFrameKey(camera, this.staticSoldiers, this.staticSoldiers)}|effects=${this.preserveFrozenEffects ? 1 : 0}`;
    } else {
      this.frozenFrameKey = null;
    }
  }

  /** True-projection pixels-per-world-meter at a point (see
   *  PhotorealBattleWorld.pxPerWorldAt) - the rig's chart worldToScreen lies
   *  in the swoop regime. */
  pxPerWorldAt(x: number, y: number, z: number): number {
    return this.world?.pxPerWorldAt(x, y, z) ?? 0;
  }

  setUnitReadouts(
    standards: readonly BattleStandardInstance[],
    readouts: readonly BattleReadoutInstance[],
  ) {
    if (!this.world) return;
    const key = readoutsKey(standards, readouts);
    if (key !== this.readoutFrameKey) {
      this.readoutFrameKey = key;
      this.frozenFrameKey = null;
      this.skipFrozenFrame = false;
    }
    this.world.uploadUnitReadouts(standards, readouts);
  }

  stats() {
    const ws = this.world?.stats() ?? null;
    return {
      renderer: "gpu" as const,
      ready: this.world !== null,
      // Photoreal ownership identity (README "Photoreal ladder invariants").
      substrate: ws?.substrate ?? "initializing",
      projection: ws?.projection ?? "initializing",
      environment: ws?.environment ?? "initializing",
      device: ws?.device ?? "initializing",
      depth: ws?.depth ?? null,
      // Slice 11 shadow-tier identity ({ mode, cascades, ... } — csm/single/off).
      shadows: ws?.shadows ?? null,
      // Slice 15 post-chain identity ({ owner, bloom, tonemap } — the ONE
      // bloom + tone-map owner over the production battle frame).
      post: ws?.post ?? null,
      width: ws?.width ?? 0,
      height: ws?.height ?? 0,
      soldiers: ws?.soldiers ?? 0,
      expectedSoldiers: ws?.expectedSoldiers ?? this.staticSoldiers,
      drawCalls: ws?.drawCalls ?? 0,
      triangles: ws?.triangles ?? 0,
      lod: ws?.lod ?? { skinned: 0, impostors: 0 },
      markerLayer: (ws?.lod.impostors ?? 0) > 0 ? ("far-lod-impostor" as const) : ("none" as const),
      camera: this.lastCamera,
      seating: ws?.seating ?? { checked: 0, matches: true, span: 0 },
      terrain: ws?.terrain ?? null,
      tacticalLines: ws?.tacticalLines ?? { groundCues: null, rings: null, effects: null },
      markers: ws?.markers ?? null,
      // Forward the standard/readout layer stats the world publishes — scenes
      // (battle-3d-standards, banner-gallery) read renderStats.standards, and
      // without this the wrapper dropped them so those waits never resolved.
      standards: ws?.standards ?? null,
      readouts: ws?.readouts ?? null,
      performance: {
        buildMs: roundMs(this.framePerf.buildMs),
        uploadMs: roundMs(this.framePerf.uploadMs),
        drawMs: roundMs(this.framePerf.drawMs),
        frameCpuMs: roundMs(this.framePerf.frameCpuMs),
        // Per-frame GPU render-pass time via three's trackTimestamp (null when
        // the adapter lacks timestamps). The battle-perf-30k gate reads this.
        gpuTimeMs: ws?.performance.gpuTimeMs ?? null,
      },
    };
  }

  /** Rendered surface height at a world point — playable terrain inside the
   *  field, generated vista apron/far-fog terrain outside it. This is the
   *  camera/anchor contract; soldier seating still uses the playable terrain
   *  sampler inside PhotorealBattleWorld. */
  heightAt(x: number, y: number): number {
    return this.surfaceHeightAt(x, y);
  }

  surfaceHeightAt(x: number, y: number): number {
    return this.world?.surfaceHeightAt(x, y) ?? 0;
  }

  debugSoldierAnim(index: number): { clip: string; phase: number; frame: number } | null {
    return this.world?.debugSoldierAnim(index) ?? null;
  }

  async settlePresentedFrame() {
    if (!this.world) return;
    await this.world.settlePresentedFrame();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await this.world.settlePresentedFrame();
  }

  private async init() {
    const params = new URLSearchParams(location.search);
    const settings = resolveGraphicsSettings(
      location.search,
      this.options.graphics ?? getGraphicsSettings(),
    );
    const world = await PhotorealBattleWorld.create(this.canvas, {
      environment: this.environmentRequest,
      shadows: params.get("shadows") ?? this.options.shadows ?? settings.shadows,
      sea: params.has("sea")
        ? seaDisplacementSourceFromParam(params.get("sea"))
        : (this.options.sea ?? undefined),
      post: params.get("post") ?? this.options.post,
      postGrade: postGradeUniformsFromParams(params) ?? this.options.postGrade ?? null,
      grassQuality: settings.grassQuality,
    });
    if (this.disposed) {
      world.dispose();
      return;
    }
    world.setGrassVisible(settings.grass);
    world.setFarGrassVisible(settings.farGrass);
    world.setBloomEnabled(settings.bloom);
    this.world = world;
    const overrides = graphicsQueryOverrides(location.search);
    this.graphicsUnsubscribe = subscribeGraphicsSettings((nextSettings) => {
      if (!this.world) return;
      const next = resolveGraphicsSettings(location.search, nextSettings);
      if (!overrides.grass) this.world.setGrassVisible(next.grass);
      if (!overrides.farGrass) this.world.setFarGrassVisible(next.farGrass);
      if (!overrides.bloom) this.world.setBloomEnabled(next.bloom);
    });
    // The bespoke shell's fatal surface, re-homed onto three's device.
    const device = (world.world.renderer.backend as unknown as { device?: GPUDevice }).device;
    void device?.lost?.then((info) =>
      showFatalErrorSurface(this.canvas, fatalSurfaceFor("device-lost", info.message)),
    );
    if (this.pendingStatic) {
      world.setStatic(
        this.pendingStatic.soldierUnit,
        this.pendingStatic.teams,
        this.pendingStatic.classes,
      );
      this.pendingStatic = null;
    }
    if (this.pendingTerrain) {
      world.setTerrain(...this.pendingTerrain);
      this.pendingTerrain = null;
    }
    this.resize();
  }
}

function cloneVistaGrid(vista?: BattleVistaGrid | null): BattleVistaGrid | null {
  if (!vista) return null;
  return {
    shape: vista.shape,
    bands: vista.bands.map((band) => ({
      ...band,
      height: new Float32Array(band.height),
    })),
  };
}

function cloneLakeSurfaces(
  lakeSurfaces?: BattleLakeSurfaceSpec[] | null,
): BattleLakeSurfaceSpec[] | null {
  return lakeSurfaces ? lakeSurfaces.map((surface) => ({ ...surface })) : null;
}

function buildAudioWaterSurfaces(
  grid: BattleTerrainGrid | null,
  wasmMapId: number | undefined,
  vista: BattleVistaGrid | null | undefined,
  lakeSurfaces?: BattleLakeSurfaceSpec[] | null,
): BattleRendererAudioSurface[] {
  const surfaces: BattleRendererAudioSurface[] = [];
  if (lakeSurfaces) {
    for (const lake of lakeSurfaces) {
      surfaces.push({
        kind: "lake",
        x0: lake.minX,
        y0: lake.minY,
        x1: lake.maxX,
        y1: lake.maxY,
      });
    }
  }
  if (!grid || vista) return surfaces;

  const roles = battleMapByWasmId(wasmMapId ?? -1)?.edges ?? deriveBattleEdgeRoles(grid);
  const worldX0 = grid.ox;
  const worldX1 = grid.ox + grid.w * grid.cell;
  const worldY0 = grid.oy;
  const worldY1 = grid.oy + grid.h * grid.cell;
  const y0 = worldY0 - 400;
  const y1 = worldY1 + 400;
  const oceanLap = 12;
  const oceanFar = 2600;
  if (roles.west === "ocean") {
    surfaces.push({
      kind: "ocean",
      x0: worldX0 - oceanFar,
      y0,
      x1: worldX0 + oceanLap,
      y1,
    });
  }
  if (roles.east === "ocean") {
    surfaces.push({
      kind: "ocean",
      x0: worldX1 - oceanLap,
      y0,
      x1: worldX1 + oceanFar,
      y1,
    });
  }
  return surfaces;
}

export interface BattleTacticalLineFrame {
  /** Ground cue lines, (x, y, r, g, b, a) per vertex. */
  groundCues: Float32Array;
  /** Per-soldier selection rings, (x, y, radius, r, g, b, a) per instance. */
  rings: Float32Array;
  effects: Float32Array;
}

/** Frozen snapshots keep short unit-anchored cue segments (facing ticks,
 *  queue diamonds, near path legs) but drop cross-field order lines, whose
 *  endpoints churn between runs. Selection rings travel in their own layer
 *  and pass through untouched. */
function frozenSelectionGroundCues(verts: Float32Array) {
  const stride = 6;
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

function readoutsKey(
  standards: readonly BattleStandardInstance[],
  readouts: readonly BattleReadoutInstance[],
) {
  let key = `${standards.length}/${readouts.length}`;
  for (const standard of standards) {
    key += `|${standard.unitId}:${Math.round(standard.x * 10)},${Math.round(standard.y * 10)},${Math.round(standard.z * 10)},${Math.round(standard.yaw * 100)},${Math.round(standard.scale * 100)},${standard.factionId},${standard.selected ? 1 : 0}`;
  }
  for (const readout of readouts) {
    key += `#${readout.unitId}:${Math.round(readout.x * 10)},${Math.round(readout.y * 10)},${Math.round(readout.z * 10)},${Math.round(readout.worldPerPx * 1000)},${readout.chips.map((c) => `${c.kind ?? ""}${c.text}`).join(",")}`;
  }
  return key;
}

function cameraSnapshot(camera: Camera): BattleCameraSnapshot {
  const [x, y] = camera.viewCenter();
  return {
    // Ground view centre → cam.focus (distance-keyed surface effects).
    x,
    y,
    // Detail-gate scalar (cam.zoom); zoomT drives the grass focus cache key.
    zoom: camera.zoom,
    zoomT: camera.zoomT,
    // The real 3D perspective camera — the one projection owner.
    camera3d: camera.params(),
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
    roundKey(camera.zoomT ?? 0),
    count,
    staticSoldiers,
  ].join(":");
}

function roundKey(value: number) {
  return Number.isFinite(value) ? value.toFixed(4) : "nan";
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
