import {
  campaignPitch,
  campaignPhysicalViewWeight,
} from "@packages/game-renderer/src/campaign/cameraPolicy";
import { campaignFactionBorderVertices } from "@packages/game-renderer/src/campaign/borderGeometry";
import type { SceneryInstance } from "../../../packages/game-renderer/src/terrain/scenery";
import {
  fogVisibility,
  type CampaignFogSource,
} from "@packages/game-renderer/src/campaign/visibility";
import {
  PhotorealCampaignWorld,
  type CampaignTerritoryData,
} from "@packages/photoreal-renderer/src/campaign/campaignWorld";
import type { CampaignGeography } from "@packages/photoreal-renderer/src/campaign/geographicLayer";
import { snapshotCampaignLandscape } from "@packages/game-renderer/src/terrain/campaignSource";
import { PROJECTION_IDENTITY } from "@packages/renderer-core/src/cameraUniform";
import { screenRay } from "@packages/renderer-core/src/camera3d";
import {
  CampaignLabelFrame,
  type CampaignLabel,
} from "@packages/game-renderer/src/campaign/labelFrame";
import {
  buildCampaignMapDrawData,
  type CampaignMapStats,
} from "@packages/game-renderer/src/campaign/roadGeometry";
import type { ScreenRect } from "@packages/game-renderer/src/campaign/labelLayout";
import {
  screenToWorld,
  world3dToScreen,
  type CameraSnapshot,
} from "@packages/renderer-core/src/cameraUniform";
import { campaignCameraRig, type CameraRigRange } from "../battle/cameraRig";
import { chartCamera3d, type Camera3DParams } from "@packages/renderer-core/src/camera3d";
import { loadAppearanceCatalog } from "@packages/soldier-assets/src/appearanceBundle";
import { assertGameplayAppearances } from "@packages/crowd-runtime/src/animationState";
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
import { type FactionLabel, type Territory } from "./territory";
import type { ArmyView, CityView } from "@packages/game-renderer/src/campaign/entityFrame";
import {
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
import { roundMs } from "@packages/renderer-core/src/math";

/** CSS pixels per world kilometre; the frame camera stores backing-pixel scale. */
const MAX_CAMPAIGN_ZOOM = 8;

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

export class CampaignRenderer {
  readonly ready: Promise<void>;
  fixedTime: number | null = null;

  private world: PhotorealCampaignWorld | null = null;
  private geography: CampaignGeography = {
    roadMeshVertices: new Float32Array(),
    roadAnchors: new Float32Array(),
    lineVertices: new Float32Array(),
    borderVertices: new Float32Array(),
  };
  private territoryData: CampaignTerritoryData | null = null;
  private visibilityKey = "";

  private destroyed = false;
  private mountedClasses: number[] = [];
  private soldierClips: Record<number, { walk: string; atEase: string }> = {};
  private staticLabels: CampaignLabel[] = [];
  private sceneryCandidates: SceneryInstance[] = [];
  private labelStats = {
    ...new CampaignLabelFrame().stats(),
    layer: "physical-gpu-glyph-atlas" as const,
  };
  private lastCards: { rects: CampaignCardRect[]; culls: string[] } = { rects: [], culls: [] };
  private lastSelections = { selections: 0, garrisonedArmySelections: 0, maxSelectionRadius: 0 };
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
    this.world?.world.resize(
      this.canvas.clientWidth || 1,
      this.canvas.clientHeight || 1,
      window.devicePixelRatio || 1,
    );
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
    const maxZoom = this.campaignZoomRange().max;
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
    const width = Math.max(1, this.canvas.width);
    const height = Math.max(1, this.canvas.height);
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
    return world3dToScreen(
      {
        ...this.currentCamera,
        width: this.canvas.width,
        height: this.canvas.height,
      },
      wx,
      wy,
      this.world?.surface.sampleRendered(wx, wy)?.position[2] ?? 0,
    );
  }

  cityBodyBottomY(id: number) {
    return this.world?.cityScreenBounds(id)?.maxY;
  }

  toWorld(sx: number, sy: number): [number, number] {
    const ray = screenRay(
      this.currentCamera.camera3d,
      (sx / this.canvas.width) * 2 - 1,
      1 - (sy / this.canvas.height) * 2,
    );
    const hit = this.world?.surface.raycastRendered(ray);
    if (hit) return [hit.position[0], hit.position[1]];
    return screenToWorld(
      { ...this.currentCamera, width: this.canvas.width, height: this.canvas.height },
      sx,
      sy,
    );
  }

  updateTerritory(territory: Territory) {
    this.territoryData = {
      width: this.field.w,
      height: this.field.h,
      rgba: territory.rgba,
      rect: this.data.bgRect,
    };
    this.geography = {
      ...this.geography,
      borderVertices: isControlledStage(this.data)
        ? new Float32Array()
        : campaignFactionBorderVertices(territory.borders, undefined, {
            surfaceStep: 0.9,
            landAt: (x, y) => !this.field.renderWaterAt(x, y),
          }),
    };
    this.world?.setTerritory(this.territoryData, this.lastFactionView);
    this.world?.setGeography({
      ...this.geography,
      borderVertices: this.lastFactionView ? this.geography.borderVertices : new Float32Array(),
    });
  }

  prepareFrame(opts: DrawOptions) {
    const world = this.world;
    if (!world) return null;
    if (this.lastFactionView !== opts.factionView) {
      if (this.territoryData) world.setTerritory(this.territoryData, opts.factionView);
      world.setGeography({
        ...this.geography,
        borderVertices: opts.factionView ? this.geography.borderVertices : new Float32Array(),
      });
    }
    const frameStart = performance.now();
    this.lastFactionView = opts.factionView;
    this.setFrameCamera(opts.cam);
    const buildStart = performance.now();
    const animTime = this.fixedTime ?? performance.now() / 1000;
    const buildOpts = { ...opts, controlledStage: isControlledStage(this.data) };
    const frame = buildEntityFrame(
      this.data,
      this.field,
      buildOpts,
      this.mountedClasses,
      animTime,
      (id, marching) => this.soldierClips[id][marching ? "walk" : "atEase"],
    );
    const buildEnd = performance.now();
    this.lastEntities = {
      cityEntities: frame.cityEntities,
      armyEntities: frame.armyEntities,
      cityEntityAnchors: frame.cityEntityAnchors,
    };
    world.setEntityFrame(frame);
    this.lastSelections = {
      selections: frame.selections.length,
      garrisonedArmySelections: frame.selections.filter((s) => s.kind === "garrisoned-army").length,
      maxSelectionRadius: Math.max(0, ...frame.selections.map((s) => s.radius)),
    };
    world.setMarkers(campaignMapMarkers(this.data, buildOpts));
    this.lastFog = { enabled: opts.fogOfWar, sources: opts.visionSources };
    const visibilityKey = opts.fogOfWar
      ? `enabled:${opts.visionSources.map((source) => `${source.x}:${source.y}:${source.radius}`).join(";")}`
      : "disabled";
    if (visibilityKey !== this.visibilityKey) {
      this.visibilityKey = visibilityKey;
      world.setVisibility((x, y) => 1 - this.visibleAt(x, y), opts.fogOfWar);
    }
    return { frame, buildOpts, animTime, frameStart, buildStart, buildEnd };
  }

  draw(opts: DrawOptions, prepared = this.prepareFrame(opts)) {
    const world = this.world;
    if (!world || !prepared) return;
    const { frame, buildOpts, animTime, frameStart, buildStart, buildEnd } = prepared;
    this.lastCards = { rects: opts.cardRects ?? [], culls: opts.cardCollisionCulls ?? [] };
    const uploadStart = performance.now();
    // Scenery, terrain water and crowd clips share the campaign visual clock.
    // Frozen captures pin that clock while runtime advances it live.
    const sceneryTime = animTime;
    // View cull for instanced props: offscreen forests must not reach
    // the vertex shader.
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
    world.setScenery(
      campaignScenery(
        this.sceneryCandidates,
        frame.sceneryReservations,
        opts.cam.scale,
        sceneryView,
      ).concat(campaignRoadCarts(this.data, this.field, sceneryTime, buildOpts)),
    );
    const staticLabels = opts.fogOfWar ? [] : this.staticLabels;
    const labelCamera: CameraSnapshot = {
      ...this.currentCamera,
      width: this.canvas.width,
      height: this.canvas.height,
    };
    const heightAt = (x: number, y: number) => world.surface.sampleRendered(x, y)?.position[2] ?? 0;
    const cityLabels = campaignCityLabels(
      this.data,
      { heightAt },
      buildOpts,
      labelCamera,
      heightAt,
      (index) => world.cityScreenBounds(index)?.maxY,
    );
    const armyLabels = campaignArmyLabels(this.data, buildOpts);
    const factionLabels = campaignFactionLabels(this.data, buildOpts);
    this.lastLabelComposition = {
      composedArmyCityLabels: armyLabels.filter((label) => label.subText).length,
    };
    world.setLabels(
      staticLabels.concat(cityLabels, armyLabels, factionLabels),
      {
        // City-label anchor choice samples the same full-res land truth the
        // sea-label fitter fits against through the render-mask owner.
        renderSurfaceAt: (x, y) => (this.field.renderLandAt(x, y) ? "land" : "water"),
        // The scene-reported card rects: pre-claimed ground in the one
        // occupancy arbitration (cards outrank canvas labels).
        blockedRects: this.lastCards.rects.map((card) => card.box),
      },
      opts.cam.scale,
    );

    const uploadEnd = performance.now();
    const drawStart = performance.now();
    if (world.world.sunLight) world.world.sunLight.castShadow = this.graphics.shadows !== "off";
    world.render(
      this.currentCamera.camera3d,
      this.canvas.clientWidth,
      this.canvas.clientHeight,
      window.devicePixelRatio || 1,
      animTime,
    );
    this.labelStats = world.stats().labels;
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
    return fogVisibility(this.lastFog.sources, x, y);
  }

  territoryAlpha(_scale: number) {
    return 1;
  }

  pitchForScale(scale: number) {
    return campaignPitch(scale / (window.devicePixelRatio || 1));
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
  sceneryCandidateSnapshot(): SceneryInstance[] {
    return this.sceneryCandidates.map((item) => ({ ...item }));
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener("resize", this.onResize);
    this.graphicsUnsubscribe?.();
    this.graphicsUnsubscribe = null;
    this.world?.dispose();
    this.world = null;
    publishStats(this.stats());
  }

  stats() {
    const world = this.world?.stats();
    return {
      renderer: "renderer-campaign",
      substrate: world?.substrate,
      projection: world?.projection,
      environment: world?.environment,
      depth: world?.depth,
      drawCalls: world?.drawCalls ?? 0,
      ...this.lastSelections,
      ready: this.world !== null,
      width: this.canvas.width,
      height: this.canvas.height,
      device: world?.device ?? "initializing",
      cameraContract: PROJECTION_IDENTITY,
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
      labelCollisionCulledLabels: [
        ...this.labelStats.collisionCulledLabels,
        ...this.lastCards.culls,
      ],
      ...this.lastLabelComposition,
      labelLayer: this.labelStats.layer,
      labelAtlas: `${this.labelStats.atlasWidth}x${this.labelStats.atlasHeight}`,
      labelVertices: this.labelStats.vertices,
      fogEnabled: this.lastFog.enabled,
      fogSources: this.lastFog.sources.length,
      factionView: this.lastFactionView,
      graphics: this.graphics,
      territoryPixels: this.territoryData
        ? this.territoryData.width * this.territoryData.height
        : 0,
      physicalWorld: world,
      mapMarkers: world?.markers.markers ?? 0,
      residency: this.world?.residencyStats() ?? null,
      cityMarkerRadiiPxByTier: {
        1: cityMarkerRadiusPx(1),
        2: cityMarkerRadiusPx(2),
        3: cityMarkerRadiusPx(3),
      },
      standardStats: world?.standards ?? null,
      scenery: world?.scenery.scenery ?? 0,
      sceneryCandidateStats: tallySceneryCandidates(this.sceneryCandidates),
      lineSegments: this.geography.lineVertices.length / 42,
      roadTriangles: this.geography.roadMeshVertices.length / 30,
      roadJunctionCaps: this.mapDrawStats?.roadJunctionCaps ?? 0,
      seaLabelFits: this.mapDrawStats?.seaLabelFits ?? [],
      seaLabelFitZoom: this.mapDrawStats?.seaLabelFitZoom ?? 0,
      roadEdgesCulled: this.mapDrawStats?.roadEdgesCulled ?? 0,
      roadWaterGaps: this.mapDrawStats?.roadWaterGaps ?? 0,
      seaLanes: this.mapDrawStats?.seaLanes ?? 0,
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
   * one behind. Independent draw() callers prepare the frame on demand. */
  setFrameCamera(cam: CamView) {
    this.resize();
    this.world?.prepareTerrain({
      x: cam.x,
      y: cam.y,
      zoom: cam.scale / (window.devicePixelRatio || 1),
      width: this.canvas.clientWidth,
      height: this.canvas.clientHeight,
    });
    this.currentCamera = {
      x: cam.x,
      y: cam.y,
      // cam.scale still feeds the map's sea-shimmer zoom gate (cam.zoom); the
      // tilt gate now derives from the camera3d pitch inside cameraUniformData.
      zoom: cam.scale,
      // The real 3D perspective camera — the one projection owner.
      camera3d: this.cameraParamsFor(cam),
    };
    this.world?.setAerialStrength(
      campaignPhysicalViewWeight(cam.scale / (window.devicePixelRatio || 1)),
    );
    this.world?.setFrameCamera(
      this.currentCamera.camera3d,
      this.canvas.clientWidth,
      this.canvas.clientHeight,
      window.devicePixelRatio || 1,
    );
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
    const max = controlled ? Math.max(MAX_CAMPAIGN_ZOOM * dpr, min * 2.2) : MAX_CAMPAIGN_ZOOM * dpr;
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
    const width = Math.max(1, this.canvas.width);
    const height = Math.max(1, this.canvas.height);
    const viewHeight = height / Math.max(0.0001, cam.scale);
    return {
      target: [cam.x, cam.y, this.world?.surface.sampleRendered(cam.x, cam.y)?.position[2] ?? 0],
      distance: viewHeight / (2 * Math.tan(rig.fovY / 2)),
      pitch: rig.pitch,
      yaw: -Math.PI / 2 + (cam.yaw ?? 0),
      fovY: rig.fovY,
      aspect: width / height,
      near: 1.0,
    };
  }

  private async init(territory: Territory) {
    const appearances = await loadAppearanceCatalog(
      new URL("/assets/soldiers/catalog.json", location.href).href,
    );
    if (this.destroyed) return;
    assertGameplayAppearances(appearances);
    this.soldierClips = Object.fromEntries(
      Object.entries(appearances).map(([id, asset]) => [
        id,
        {
          walk: asset.manifest.presentation!.actions.walk!.clip,
          atEase: asset.manifest.presentation!.actions.atEase!.clip,
        },
      ]),
    );
    const controlledStage = isControlledStage(this.data);
    const world = await PhotorealCampaignWorld.createLandscape(
      this.canvas,
      snapshotCampaignLandscape(this.field),
      {
        appearances,
        objects: [],
        geography: this.geography,
        territory: [0.48, 0.48, 0.35],
        fogAt: () => 0,
        entityVisibleAt: (x, y) => this.visibleAt(x, y) >= 0.18,
      },
    );
    if (this.destroyed) {
      world.dispose();
      return;
    }
    this.world = world;
    this.resize();
    this.sceneryCandidates = buildCampaignSceneryCandidates(
      this.data,
      this.field,
      controlledStage,
      TEMPERATE_Y_KM,
    );
    this.mountedClasses = Object.entries(appearances)
      .filter(([, bundle]) => bundle.manifest.mounted)
      .map(([id]) => Number(id));
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
    });
    this.mapDrawStats = drawData.stats;
    this.staticLabels = drawData.labels;
    this.geography = { ...drawData, borderVertices: new Float32Array() };
    this.updateTerritory(territory);
    publishStats(this.stats());
  }
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
