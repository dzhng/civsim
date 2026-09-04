import {
  CampaignCloudPass,
  CampaignFogPass,
  type CampaignFogSource,
} from "@packages/game-renderer/src/campaign/atmospherePass";
import { CampaignEntityPass } from "@packages/game-renderer/src/campaign/entityPass";
import {
  CampaignLabelPass,
  type CampaignLabelPassStats,
  CampaignMapPass,
  CampaignMarkerPass,
  CampaignRoadPass,
  CampaignWorldLinePass,
  type CampaignLabel,
} from "@packages/game-renderer/src/campaign/mapPass";
import {
  buildCampaignMapDrawData,
  type CampaignMapStats,
} from "@packages/game-renderer/src/campaign/roadGeometry";
import type { ScreenRect } from "@packages/game-renderer/src/campaign/labelLayout";
import {
  CampaignSceneryPass,
  type CampaignSceneryInstance,
} from "@packages/game-renderer/src/campaign/sceneryPass";
import { CampaignSelectionPass } from "@packages/game-renderer/src/campaign/selectionPass";
import { SharedStandardPass } from "@packages/game-renderer/src/models/shared/standardPass";
import {
  campaignFactionBorderVertices,
  CampaignTerritoryPass,
} from "@packages/game-renderer/src/campaign/territoryPass";
import {
  createFrameShell,
  type FrameGraphPass,
  type RawFrameShell,
  type WorldRenderPass,
} from "@packages/renderer-core/src/frameShell";
import {
  screenToWorld,
  world3dToScreen,
  type CameraSnapshot,
} from "@packages/renderer-core/src/cameraUniform";
import { campaignCameraRig, type CameraRigRange } from "../battle/cameraRig";
import { chartCamera3d, type Camera3DParams } from "@packages/renderer-core/src/camera3d";
import { SkinnedCrowdPipeline } from "@packages/renderer-core/src/skinnedPipeline";
import { SoldierShadowDecalPass } from "@packages/renderer-core/src/soldierShadowPass";
import {
  loadPlaceholderKit,
  loadPlaceholderVat,
  mountedClassesFromKit,
} from "@packages/soldier-assets/src/placeholders";
import { createPlaceholderSoldierMeshes } from "@packages/soldier-assets/src/soldierMesh";
import type { CampaignData } from "./data";
import { isControlledStage } from "./data";
import type { CamView } from "./camera";
import {
  getGraphicsSettings,
  graphicsQueryOverrides,
  resolveGraphicsSettings,
  subscribeGraphicsSettings,
  type GraphicsSettings,
} from "../shared/graphicsSettings";
import { TEMPERATE_Y_KM, type TerrainField } from "./terrain";
import { campaignSurface, type CampaignSurface } from "./surface";
import { type FactionLabel, type Territory } from "./territory";
import type { ArmyView, CityView } from "@packages/game-renderer/src/campaign/entityFrame";
import {
  CAMPAIGN_FIGURE_SIZE,
  buildEntityFrame,
  campaignMapMarkers,
  campaignRoadCarts,
} from "@packages/game-renderer/src/campaign/entityFrame";
import {
  campaignArmyLabels,
  campaignCityLabels,
  campaignFactionLabels,
  cityMarkerRadiusPx,
} from "@packages/game-renderer/src/campaign/labels";
import {
  buildCampaignSceneryCandidates,
  campaignScenery,
  tallySceneryCandidates,
} from "@packages/game-renderer/src/campaign/scenery";
import { roundMs, smoothstep } from "@packages/renderer-core/src/math";
import { CAMPAIGN_ENVIRONMENT } from "@packages/game-renderer/src/campaign/environment";

export const MAX_CAMPAIGN_ZOOM = 8;

/** Zoom band of the camera tilt: pitch eases in from START and completes at
 * FULL (campaignPitch's smoothstep edges). FULL doubles as the card contract
 * boundary: once the camera rides fully tilted, every on-screen own-city card
 * must be visible (nudged on collision, never culled). */
export const CAMPAIGN_TILT_START_ZOOM = 0.62;
export const CAMPAIGN_FULL_TILT_ZOOM = 1.6;

export interface CampaignRendererOptions {
  graphics?: GraphicsSettings;
}

/** One visible DOM map card's screen rect (CSS px), reported per frame by the
 * scene's card loop after its card-vs-card pass. The label occupancy
 * arbitration treats these as pre-claimed ground (cards outrank labels). */
export interface CampaignCardRect {
  id: string;
  name: string;
  box: ScreenRect;
}

interface DrawOptions {
  cam: CamView;
  armies: ArmyView[];
  cities: Map<number, CityView>;
  selected: number;
  selectedCity: number;
  factionLabels: FactionLabel[];
  factionStatus: Int8Array;
  playerFaction: number;
  fogOfWar: boolean;
  visionSources: CampaignFogSource[];
  factionView: boolean;
  /** ARMY_STACK_UNIT_CAP — a full stack shows the max representative figures. */
  stackUnitCap: number;
  /** Cards report, never arbitrate labels privately: the visible
   * card rects this frame, blocking canvas label ground. */
  cardRects?: CampaignCardRect[];
  /** Cards the scene's card-vs-card pass hid this frame ("card:NAME") —
   * merged into the collision-cull stats so scenes assert one outcome list. */
  cardCollisionCulls?: string[];
}

interface CampaignPasses {
  shell: RawFrameShell;
  map: CampaignMapPass;
  clouds: CampaignCloudPass;
  fog: CampaignFogPass;
  territory: CampaignTerritoryPass;
  lines: CampaignWorldLinePass;
  roads: CampaignRoadPass;
  borders: CampaignWorldLinePass;
  markers: CampaignMarkerPass;
  scenery: CampaignSceneryPass;
  entities: CampaignEntityPass;
  standards: SharedStandardPass;
  soldierCrowd: SkinnedCrowdPipeline;
  soldierShadows: SoldierShadowDecalPass;
  selection: CampaignSelectionPass;
  labels: CampaignLabelPass;
}

export class CampaignRenderer {
  readonly ready: Promise<void>;
  fixedTime: number | null = null;

  private passes: CampaignPasses | null = null;
  private mountedClasses: number[] = [];
  private surface: CampaignSurface;
  private staticLabels: CampaignLabel[] = [];
  private sceneryCandidates: CampaignSceneryInstance[] = [];
  private labelStats: CampaignLabelPassStats = {
    labels: 0,
    visibleLabels: 0,
    visibleLabelNames: [],
    visibleSeaLabelRects: [],
    visibleCityLabelRects: [],
    visibleArmyLabelRects: [],
    visibleFactionLabelRects: [],
    collisionCulls: 0,
    collisionCulledLabels: [],
    atlasWidth: 0,
    atlasHeight: 0,
    vertices: 0,
    layer: "raw-gpu-glyph-atlas",
  };
  private lastCards: { rects: CampaignCardRect[]; culls: string[] } = { rects: [], culls: [] };
  private lastEntities = {
    cityEntities: 0,
    armyEntities: 0,
    cityEntityAnchors: [] as [number, number][],
  };
  private lastFog = { enabled: false, sources: [] as CampaignFogSource[] };
  private lastFactionView = false;
  private lastLabelComposition = { composedArmyCityLabels: 0 };
  private mapDrawStats: CampaignMapStats | null = null;
  private framePerf = {
    buildMs: 0,
    uploadMs: 0,
    drawMs: 0,
    frameCpuMs: 0,
  };
  private graphics: GraphicsSettings;
  private graphicsUnsubscribe: (() => void) | null = null;
  private readonly onResize = () => this.resize();

  constructor(
    private canvas: HTMLCanvasElement,
    private data: CampaignData,
    private field: TerrainField,
    territory: Territory,
    options: CampaignRendererOptions = {},
  ) {
    this.surface = campaignSurface(field);
    this.graphics = resolveGraphicsSettings(
      location.search,
      options.graphics ?? getGraphicsSettings(),
    );
    this.ready = this.init(territory);
    const overrides = graphicsQueryOverrides(location.search);
    this.graphicsUnsubscribe = subscribeGraphicsSettings((settings) => {
      if (!overrides.shadows) this.graphics = resolveGraphicsSettings(location.search, settings);
    });
    window.addEventListener("resize", this.onResize);
  }

  resize() {
    this.passes?.shell.resize();
  }

  clampCam(cam: CamView) {
    const rect = this.data.bgRect;
    const cssW = this.canvas.clientWidth || window.innerWidth || 1;
    const cssH = this.canvas.clientHeight || window.innerHeight || 1;
    const pitch = this.pitchForScale(cam.scale);
    const cosP = Math.max(0.2, Math.cos(pitch));
    const controlled = isControlledStage(this.data);
    const fillZoom = controlled
      ? Math.max(cssW / (rect.max[0] - rect.min[0]), cssH / (rect.max[1] - rect.min[1])) *
        (window.devicePixelRatio || 1)
      : Math.max(cssW / (rect.max[0] - rect.min[0]), cssH / ((rect.max[1] - rect.min[1]) * cosP)) *
        (window.devicePixelRatio || 1);
    let minZoom = controlled ? fillZoom * 0.78 : fillZoom;
    const maxZoom = controlled ? Math.max(MAX_CAMPAIGN_ZOOM, minZoom * 2.2) : MAX_CAMPAIGN_ZOOM;
    if (!controlled) {
      const mapW = rect.max[0] - rect.min[0];
      const mapH = rect.max[1] - rect.min[1];
      const fits = (scale: number) => {
        const fp = this.groundFootprintForScale(scale);
        return fp.halfW * 2 <= mapW && fp.dTop + fp.dBottom <= mapH;
      };
      if (fillZoom >= maxZoom) {
        minZoom = fillZoom;
      } else if (!fits(maxZoom)) {
        minZoom = maxZoom;
      } else {
        let lo = fillZoom;
        let hi = maxZoom;
        for (let i = 0; i < 24; i++) {
          const mid = (lo + hi) * 0.5;
          if (fits(mid)) hi = mid;
          else lo = mid;
        }
        minZoom = hi;
      }
    }
    cam.scale = Math.max(minZoom, Math.min(maxZoom, cam.scale));
    const halfW = (this.canvas.width || cssW) / (2 * cam.scale);
    const halfH = (this.canvas.height || cssH) / (2 * cam.scale * cosP);
    if (controlled) {
      cam.x = clampControlledAxis(cam.x, rect.min[0], rect.max[0], halfW);
      cam.y = clampControlledAxis(cam.y, rect.min[1], rect.max[1], halfH);
    } else {
      const fp = this.groundFootprintForScale(cam.scale);
      const minX = rect.min[0] + fp.halfW;
      const maxX = rect.max[0] - fp.halfW;
      const minY = rect.min[1] + fp.dBottom;
      const maxY = rect.max[1] - fp.dTop;
      cam.x = minX > maxX ? (rect.min[0] + rect.max[0]) * 0.5 : clamp(cam.x, minX, maxX);
      cam.y = minY > maxY ? (rect.min[1] + rect.max[1]) * 0.5 : clamp(cam.y, minY, maxY);
    }
  }

  private groundFootprintForScale(scale: number) {
    const rect = this.data.bgRect;
    const cx = (rect.min[0] + rect.max[0]) * 0.5;
    const cy = (rect.min[1] + rect.max[1]) * 0.5;
    const centeredCam: CamView = { x: cx, y: cy, scale };
    const stats = this.passes?.shell.stats();
    const width = stats?.width ?? this.canvas.width ?? 1;
    const height = Math.max(1, stats?.height ?? this.canvas.height ?? 1);
    const snapshot: CameraSnapshot = {
      x: cx,
      y: cy,
      zoom: scale,
      camera3d: this.cameraParamsFor(centeredCam),
      width,
      height,
    };
    const corners = [
      screenToWorld(snapshot, 0, 0),
      screenToWorld(snapshot, width, 0),
      screenToWorld(snapshot, 0, height),
      screenToWorld(snapshot, width, height),
    ];
    let halfW = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of corners) {
      halfW = Math.max(halfW, Math.abs(x - cx));
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return { halfW, dTop: maxY - cy, dBottom: cy - minY };
  }

  toScreen(wx: number, wy: number): [number, number] {
    const stats = this.passes?.shell.stats();
    return world3dToScreen(
      {
        ...this.currentCamera,
        width: stats?.width ?? this.canvas.width,
        height: stats?.height ?? this.canvas.height,
      },
      wx,
      wy,
      this.surface.heightAt(wx, wy),
    );
  }

  toWorld(sx: number, sy: number): [number, number] {
    const stats = this.passes?.shell.stats();
    return screenToWorld(
      {
        ...this.currentCamera,
        width: stats?.width ?? (this.canvas.width || 1),
        height: stats?.height ?? (this.canvas.height || 1),
      },
      sx,
      sy,
    );
  }

  updateTerritory(territory: Territory) {
    if (!this.passes) return;
    this.passes.territory.upload({
      width: this.field.w,
      height: this.field.h,
      rgba: territory.rgba,
      rect: this.data.bgRect,
    });
    this.passes.borders.upload(
      campaignFactionBorderVertices(territory.borders, (x, y) => this.field.heightAt(x, y)),
    );
  }

  draw(opts: DrawOptions) {
    const passes = this.passes;
    if (!passes) return;
    const frameStart = performance.now();
    this.lastFactionView = opts.factionView;
    this.lastCards = { rects: opts.cardRects ?? [], culls: opts.cardCollisionCulls ?? [] };
    this.setFrameCamera(opts.cam);
    passes.shell.setCamera(this.currentCamera);
    const buildStart = performance.now();
    const animTime = this.fixedTime ?? performance.now() / 1000;
    const buildOpts = { ...opts, controlledStage: isControlledStage(this.data) };
    const frame = buildEntityFrame(this.data, this.field, buildOpts, this.mountedClasses, animTime);
    const buildEnd = performance.now();
    this.lastEntities = {
      cityEntities: frame.cityEntities,
      armyEntities: frame.armyEntities,
      cityEntityAnchors: frame.cityEntityAnchors,
    };
    const uploadStart = performance.now();
    // One clock drives every animated surface: crawling scenery, the subtle sea
    // shimmer in mapPass (cam.time), and the soldier-crowd VAT phase. Frozen
    // snapshots pin fixedTime = 0, so the sea's cam.time term is 0 and the map
    // stays byte-identical; runtime advances it live.
    const sceneryTime = animTime;
    passes.shell.setTime(sceneryTime);
    // View cull for the instanced props: the ez-tree meshes run thousands of
    // triangles each, so offscreen forests must not reach the vertex shader.
    // Radial bound (screen diagonal in km, pitch-expanded) stays correct under
    // any camera yaw; the per-item margin covers footprint plus the screen
    // shift tall props get from elevation under tilt.
    const cosP = Math.max(0.2, Math.cos(this.pitchForScale(opts.cam.scale)));
    const sceneryView = {
      x: opts.cam.x,
      y: opts.cam.y,
      radiusKm: Math.hypot(
        (this.canvas.width || 1) / (2 * opts.cam.scale),
        (this.canvas.height || 1) / (2 * opts.cam.scale * cosP),
      ),
    };
    passes.scenery.upload(
      campaignScenery(
        this.sceneryCandidates,
        frame.sceneryReservations,
        opts.cam.scale,
        sceneryView,
      ).concat(campaignRoadCarts(this.data, this.field, sceneryTime, buildOpts)),
    );
    passes.entities.upload(frame.entities);
    passes.standards.upload(frame.standards);
    passes.soldierCrowd.upload(frame.crowd, { size: CAMPAIGN_FIGURE_SIZE });
    // The grounding shadow radius must track the figure size, or a 2.4x-scaled
    // soldier's default-radius shadow hides under its own body.
    passes.soldierShadows.upload(frame.crowd, { radius: 0.62 * CAMPAIGN_FIGURE_SIZE });
    passes.selection.upload(frame.selections, (x, y) => this.field.heightAt(x, y));
    passes.markers.upload(campaignMapMarkers(this.data, buildOpts));
    this.lastFog = { enabled: opts.fogOfWar, sources: opts.visionSources };
    passes.fog.upload(opts.visionSources, opts.fogOfWar);
    const staticLabels = opts.fogOfWar ? [] : this.staticLabels;
    const labelStats = passes.shell.stats();
    const labelCamera: CameraSnapshot = {
      ...this.currentCamera,
      width: labelStats.width,
      height: labelStats.height,
    };
    const cityLabels = campaignCityLabels(this.data, this.field, buildOpts, labelCamera);
    const armyLabels = campaignArmyLabels(this.data, buildOpts);
    const factionLabels = campaignFactionLabels(this.data, buildOpts);
    this.lastLabelComposition = {
      composedArmyCityLabels: armyLabels.filter((label) => label.subText).length,
    };
    this.labelStats = passes.labels.upload(
      staticLabels.concat(cityLabels, armyLabels, factionLabels),
      this.currentCamera,
      {
        // City-label anchor choice samples the same full-res land truth the
        // sea-label fitter fits against through the render-mask owner.
        renderSurfaceAt: (x, y) => (this.field.renderLandAt(x, y) ? "land" : "water"),
        // The scene-reported card rects: pre-claimed ground in the one
        // occupancy arbitration (cards outrank canvas labels).
        blockedRects: this.lastCards.rects.map((card) => card.box),
      },
    );
    const uploadEnd = performance.now();
    const drawStart = performance.now();
    const framePasses: FrameGraphPass[] = [
      {
        id: "campaign-map-surface",
        role: "world-depth-fill",
        phase: "world-depth",
        depth: "write",
        draw: (pass) => passes.map.draw(pass),
      },
      {
        id: "campaign-scenery-opaque",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => passes.scenery.drawOpaque(pass),
      },
      {
        id: "campaign-entities-opaque",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => passes.entities.drawOpaque(pass),
      },
      {
        id: "campaign-standards-opaque",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => passes.standards.drawOpaque(pass),
      },
      {
        id: "campaign-soldier-crowd",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => passes.soldierCrowd.draw(pass),
      },
      ...(opts.factionView
        ? [
            {
              id: "campaign-territory-wash",
              role: "world-decal" as const,
              phase: "world-depth" as const,
              depth: "read" as const,
              draw: (pass: WorldRenderPass) => passes.territory.draw(pass),
            },
          ]
        : []),
      ...(opts.factionView && !isControlledStage(this.data)
        ? [
            {
              id: "campaign-borders",
              role: "world-decal" as const,
              phase: "world-depth" as const,
              depth: "read" as const,
              draw: (pass: WorldRenderPass) => passes.borders.draw(pass),
            },
          ]
        : []),
      ...(this.graphics.shadows === "off"
        ? []
        : [
            {
              id: "campaign-scenery-shadows",
              role: "world-decal" as const,
              phase: "world-depth" as const,
              depth: "read" as const,
              draw: (pass: WorldRenderPass) => passes.scenery.drawShadows(pass),
            },
            {
              id: "campaign-entity-shadows",
              role: "world-decal" as const,
              phase: "world-depth" as const,
              depth: "read" as const,
              draw: (pass: WorldRenderPass) => passes.entities.drawShadows(pass),
            },
            {
              id: "campaign-standard-shadows",
              role: "world-decal" as const,
              phase: "world-depth" as const,
              depth: "read" as const,
              draw: (pass: WorldRenderPass) => passes.standards.drawShadows(pass),
            },
            {
              id: "campaign-soldier-shadows",
              role: "world-decal" as const,
              phase: "world-depth" as const,
              depth: "read" as const,
              draw: (pass: WorldRenderPass) => passes.soldierShadows.draw(pass),
            },
          ]),
      {
        id: "campaign-roads",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => passes.roads.draw(pass),
      },
      {
        id: "campaign-sea-lanes-depth",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => passes.lines.draw(pass),
      },
      {
        id: "campaign-ground-selection",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => passes.selection.draw(pass),
      },
      {
        id: "campaign-clouds",
        role: "overlay-effect",
        phase: "overlay",
        draw: (pass) => passes.clouds.draw(pass),
      },
      {
        id: "campaign-fog-of-war",
        role: "overlay-effect",
        phase: "overlay",
        draw: (pass) => passes.fog.draw(pass),
      },
      {
        id: "campaign-markers",
        role: "overlay-ui",
        phase: "overlay",
        draw: (pass) => passes.markers.draw(pass),
      },
      {
        id: "campaign-labels",
        role: "overlay-ui",
        phase: "overlay",
        draw: (pass) => passes.labels.draw(pass),
      },
    ];
    passes.shell.drawFrame({
      clear: { r: 0.06, g: 0.07, b: 0.075, a: 1 },
      passes: framePasses,
    });
    const done = performance.now();
    this.framePerf = {
      buildMs: roundMs(buildEnd - buildStart),
      uploadMs: roundMs(uploadEnd - uploadStart),
      drawMs: roundMs(done - drawStart),
      frameCpuMs: roundMs(done - frameStart),
    };
    publishStats(this.stats());
  }

  visibleAt(x: number, y: number) {
    if (!this.lastFog.enabled) return 1;
    let visible = 0;
    for (const source of this.lastFog.sources) {
      const d = Math.hypot(x - source.x, y - source.y);
      const sourceVisible = 1 - smoothstep(source.radius * 0.72, source.radius * 1.08, d);
      visible = Math.max(visible, sourceVisible);
    }
    return visible;
  }

  territoryAlpha(_scale: number) {
    return 1;
  }

  pitchForScale(scale: number) {
    return campaignPitch(scale);
  }

  /** Keyboard/edge pan speed, world km/s: the battle camera's curve
   *  (shared/camera.ts panSpeed) run against the campaign zoom range, so the
   *  two maps pan with one feel. */
  panSpeed(scale: number) {
    const { min, max } = this.campaignZoomRange();
    const z = Math.max(scale, min + 0.25 * (max - min));
    const t = Math.max(0, Math.min(1, (z - min) / Math.max(1e-6, max - min)));
    return (600 / z) * (12 - 11.5 * t);
  }

  /** Verification probe: the full static scenery candidate set (world km). */
  sceneryCandidateSnapshot(): CampaignSceneryInstance[] {
    return this.sceneryCandidates.map((item) => ({ ...item }));
  }

  destroy() {
    window.removeEventListener("resize", this.onResize);
    this.graphicsUnsubscribe?.();
    this.graphicsUnsubscribe = null;
    this.passes?.shell.destroy();
    this.passes = null;
    publishStats(this.stats());
  }

  stats() {
    const shell = this.passes?.shell.stats();
    const markerStats = this.passes?.markers.stats();
    return {
      renderer: "renderer-campaign",
      ready: this.passes !== null,
      width: shell?.width ?? 0,
      height: shell?.height ?? 0,
      device: shell?.device ?? "initializing",
      cameraContract: shell?.cameraContract ?? "initializing",
      ...this.lastEntities,
      labels: this.labelStats.labels,
      visibleLabels: this.labelStats.visibleLabels,
      visibleLabelNames: this.labelStats.visibleLabelNames,
      visibleSeaLabelRects: this.labelStats.visibleSeaLabelRects,
      visibleCityLabelRects: this.labelStats.visibleCityLabelRects,
      visibleArmyLabelRects: this.labelStats.visibleArmyLabelRects,
      visibleFactionLabelRects: this.labelStats.visibleFactionLabelRects,
      visibleCardRects: this.lastCards.rects,
      labelCollisionCulls: this.labelStats.collisionCulls + this.lastCards.culls.length,
      // One outcome list across the seam: canvas-label culls + card culls.
      labelCollisionCulledLabels: [
        ...this.labelStats.collisionCulledLabels,
        ...this.lastCards.culls,
      ],
      ...this.lastLabelComposition,
      labelLayer: this.labelStats.layer,
      labelAtlas: `${this.labelStats.atlasWidth}x${this.labelStats.atlasHeight}`,
      labelVertices: this.labelStats.vertices,
      waterFeatures: 0,
      waterLayer: "map-sea-mask",
      mapSurface: this.passes?.map.stats() ?? null,
      cloudQuads: this.passes?.clouds.stats().cloudQuads ?? 0,
      fogEnabled: this.passes?.fog.stats().fogEnabled ?? false,
      fogSources: this.passes?.fog.stats().fogSources ?? 0,
      factionView: this.lastFactionView,
      graphics: this.graphics,
      territoryPixels: this.passes?.territory.stats().pixels ?? 0,
      borderSegments: this.passes?.borders.stats().segments ?? 0,
      mapMarkers: markerStats?.markers ?? 0,
      cityMarkerRadiiPxByTier: {
        1: cityMarkerRadiusPx(1),
        2: cityMarkerRadiusPx(2),
        3: cityMarkerRadiusPx(3),
      },
      ...this.passes?.selection.stats(),
      standardStats: this.passes?.standards.stats() ?? null,
      scenery: this.passes?.scenery.stats().scenery ?? 0,
      sceneryQuads: this.passes?.scenery.stats().scenery ?? 0,
      sceneryStats: this.passes?.scenery.stats() ?? null,
      // Whole-map candidate density (pre LOD + view cull): what feature-density
      // gates should assert, since per-frame uploads now depend on the camera.
      sceneryCandidateStats: tallySceneryCandidates(this.sceneryCandidates),
      lineSegments: this.passes?.lines.stats().segments ?? 0,
      roadTriangles: this.passes?.roads.stats().triangles ?? 0,
      roadJunctionCaps: this.mapDrawStats?.roadJunctionCaps ?? 0,
      seaLabelFits: this.mapDrawStats?.seaLabelFits ?? [],
      seaLabelFitZoom: this.mapDrawStats?.seaLabelFitZoom ?? 0,
      roadEdgesCulled: this.mapDrawStats?.roadEdgesCulled ?? 0,
      roadWaterGaps: this.mapDrawStats?.roadWaterGaps ?? 0,
      seaLanes: this.mapDrawStats?.seaLanes ?? 0,
      phases: shell?.phases ?? [],
      depth: shell?.depth ?? null,
      postCutoverScreenshots: "renderer-only",
      performance: { ...this.framePerf },
    };
  }

  // Renderable before the first draw(): a whole-map chart framing stands in
  // until setFrameCamera derives the real camera from the live CamView.
  private currentCamera: Omit<CameraSnapshot, "width" | "height"> = {
    x: 0,
    y: 0,
    zoom: 0.18,
    camera3d: chartCamera3d({ x: 0, y: 0, zoom: 0.18 }, 800),
  };

  /** Pin this frame's camera pose. The scene calls this BEFORE its card loop
   * so toScreen/toWorld project through the pose draw() is about to render —
   * the card rects reported into the label arbitration are same-frame, never
   * one behind. draw() re-applies it, so calling
   * draw() alone stays correct. */
  setFrameCamera(cam: CamView) {
    this.currentCamera = {
      x: cam.x,
      y: cam.y,
      // cam.scale still feeds the map's sea-shimmer zoom gate (cam.zoom); the
      // tilt gate now derives from the camera3d pitch inside cameraUniformData.
      zoom: cam.scale,
      // The real 3D perspective camera — the one projection owner.
      camera3d: this.cameraParamsFor(cam),
    };
  }

  /** The playable field bounds (world km) that the zoom rig frames. */
  private campaignRigBounds() {
    const rect = this.data.bgRect;
    return {
      width: Math.max(1, rect.max[0] - rect.min[0]),
      height: Math.max(1, rect.max[1] - rect.min[1]),
    };
  }

  /** Zoom range fed to the rig curve (zoomT normalization). Mirrors clampCam's
   *  aspect-fill floor (with the near-top-down cosP ≈ 1) and its 8× ceiling so
   *  the framing curve spans the same scale band the camera actually reaches. */
  private campaignZoomRange(): CameraRigRange {
    const rect = this.data.bgRect;
    const cssW = this.canvas.clientWidth || window.innerWidth || 1;
    const cssH = this.canvas.clientHeight || window.innerHeight || 1;
    const dpr = window.devicePixelRatio || 1;
    const controlled = isControlledStage(this.data);
    const fillZoom =
      Math.max(cssW / (rect.max[0] - rect.min[0]), cssH / (rect.max[1] - rect.min[1])) * dpr;
    const min = controlled ? fillZoom * 0.78 : fillZoom;
    const max = controlled ? Math.max(MAX_CAMPAIGN_ZOOM, min * 2.2) : MAX_CAMPAIGN_ZOOM;
    return { min, max };
  }

  /** The real 3D perspective camera for the campaign this frame. yaw = −π/2 keeps
   *  the map's world orientation (east = +X → screen right, north = +Y → screen
   *  up) so the geography reads as it did under the 2.5D chart; the user's Q/E
   *  yaw (cam.yaw) rotates about that base. The rig curve owns
   *  pitch/fovY (near-top-down chart out, gentle tilt in); distance is derived
   *  from cam.scale so the vertical ground span at the look target stays exactly
   *  the chart scale (device px per world km) — labels, clampCam, and every scene
   *  gate keyed on scale keep their meaning under the real camera. Screen-centre
   *  ground hit = (cam.x, cam.y): the chart stays centred (no vista look-ahead). */
  private cameraParamsFor(cam: CamView): Camera3DParams {
    const rig = campaignCameraRig(cam.scale, this.campaignZoomRange(), this.campaignRigBounds());
    const stats = this.passes?.shell.stats();
    const width = stats?.width ?? this.canvas.width ?? 1;
    const height = Math.max(1, stats?.height ?? this.canvas.height ?? 1);
    const viewHeight = height / Math.max(0.0001, cam.scale);
    return {
      target: [cam.x, cam.y, 0],
      distance: viewHeight / (2 * Math.tan(rig.fovY / 2)),
      pitch: rig.pitch,
      yaw: -Math.PI / 2 + (cam.yaw ?? 0),
      fovY: rig.fovY,
      aspect: width / height,
      near: 1.0,
    };
  }

  private async init(territory: Territory) {
    // One projector engine-wide: every pass projects through camera3d's viewProj
    // and depth-tests reverse-Z against the shell's depth32float world buffer.
    const shell = await createFrameShell(this.canvas, { sun: CAMPAIGN_ENVIRONMENT });
    const controlledStage = isControlledStage(this.data);
    const map = new CampaignMapPass(
      shell,
      this.data.bg,
      this.data.bgRect,
      controlledStage
        ? undefined
        : {
            seaTintMix: 1,
            terrain: {
              width: this.field.w,
              height: this.field.h,
              biome: this.field.biome,
              light: this.field.light,
            },
          },
      this.surface.mesh,
    );
    const clouds = new CampaignCloudPass(shell, this.data.bgRect, controlledStage ? 0.75 : 2.05);
    const fog = new CampaignFogPass(shell, this.data.bgRect);
    const territoryPass = new CampaignTerritoryPass(
      shell,
      {
        width: this.field.w,
        height: this.field.h,
        rgba: territory.rgba,
        rect: this.data.bgRect,
      },
      map.drawnCoast,
      // EU4-political-strength wash (David, assets/faction-wash-target-eu4.png):
      // the faction color dominates while terrain relief still reads through.
      controlledStage ? undefined : { alpha: 0.62 },
      this.surface.mesh,
    );
    // Sea lanes drape over the height-mapped water surface (xyz), like the
    // borders — the flat z=0 variant was depth-buried under the surface mesh.
    const lines = new CampaignWorldLinePass(shell, "triangle-list", "xyz");
    const roads = new CampaignRoadPass(shell);
    const borders = new CampaignWorldLinePass(shell, "triangle-list", "xyz");
    const markers = new CampaignMarkerPass(shell);
    const scenery = new CampaignSceneryPass(shell);
    this.sceneryCandidates = buildCampaignSceneryCandidates(
      this.data,
      this.field,
      controlledStage,
      TEMPERATE_Y_KM,
    );
    const entities = new CampaignEntityPass(shell);
    const standards = new SharedStandardPass(shell);
    // The shared skinned soldier renderer. Army stacks draw a small
    // representative crowd through the SAME pipeline/meshes/VATs/shadow as
    // battle (buildStackCrowd feeds it per stack); the entity pass now only draws
    // city architecture, while standards are the shared 3D standard pass.
    const soldierKit = await loadPlaceholderKit();
    this.mountedClasses = mountedClassesFromKit(soldierKit);
    const soldierCrowd = new SkinnedCrowdPipeline(
      shell,
      createPlaceholderSoldierMeshes([0.3, 0.36, 0.74]),
      await loadPlaceholderVat(),
      soldierKit,
    );
    const soldierShadows = new SoldierShadowDecalPass(shell);
    const selection = new CampaignSelectionPass(shell);
    const labels = new CampaignLabelPass(shell);
    this.passes = {
      shell,
      map,
      clouds,
      fog,
      territory: territoryPass,
      lines,
      roads,
      borders,
      markers,
      scenery,
      entities,
      standards,
      soldierCrowd,
      soldierShadows,
      selection,
      labels,
    };
    // Sea labels are widest (in km) at the camera's zoom floor; probe the
    // clamp for it so the fitter judges placements at the whole-map framing
    // the player actually sees. clampCam works in device px per km, the
    // fitter in CSS px, hence the dpr divide.
    const zoomFloorProbe = { x: 0, y: 0, scale: 0 };
    this.clampCam(zoomFloorProbe);
    const drawData = buildCampaignMapDrawData(this.data, {
      roadScale: 1.0,
      // Two land samplers have one owner each: sea-label fitting wants an area
      // statistic, which
      // the 8 km grid + wide inland margin owns; roads want point truth
      // against the pixels the player sees, which the full-res render mask
      // owns. Feeding the labels' coarse sampler to the road cull was B7b —
      // whole coastal approach edges (Cosa, Tarracina) dropped silently.
      surfaceAt: (x, y) => (this.field.landAt(x, y, controlledStage ? 2.5 : 16) ? "land" : "water"),
      renderSurfaceAt: (x, y) => (this.field.renderLandAt(x, y) ? "land" : "water"),
      roadSurfaceAt: (x, y) => (this.field.renderLandAt(x, y) ? "land" : "water"),
      seaLabelFitZoom: zoomFloorProbe.scale / (window.devicePixelRatio || 1),
      heightAt: (x, y) => this.field.heightAt(x, y),
    });
    this.mapDrawStats = drawData.stats;
    this.staticLabels = drawData.labels;
    lines.upload(drawData.lineVertices);
    roads.upload(drawData.roadMeshVertices);
    borders.upload(
      controlledStage
        ? new Float32Array()
        : campaignFactionBorderVertices(territory.borders, (x, y) => this.field.heightAt(x, y)),
    );
    publishStats(this.stats());
  }
}

const CAMPAIGN_CLOSE_PITCH = 0.82;

function campaignPitch(zoom: number) {
  const t = smoothstep(CAMPAIGN_TILT_START_ZOOM, CAMPAIGN_FULL_TILT_ZOOM, zoom);
  return CAMPAIGN_CLOSE_PITCH * t;
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return (min + max) * 0.5;
  return Math.max(min, Math.min(max, value));
}

function clampControlledAxis(value: number, min: number, max: number, halfVisible: number) {
  const center = (min + max) * 0.5;
  const halfSpan = (max - min) * 0.5;
  if (halfVisible > halfSpan) {
    const overscan = (halfVisible - halfSpan) * 1.6;
    return clamp(value, center - overscan, center + overscan);
  }
  return clamp(value, min + halfVisible, max - halfVisible);
}

function publishStats(stats: ReturnType<CampaignRenderer["stats"]>) {
  (window as unknown as { __campaignGpuStats?: unknown }).__campaignGpuStats = stats;
}
