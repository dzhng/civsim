import {
  CampaignCloudPass,
  CampaignFogPass,
  type CampaignFogSource,
} from "../../../packages/game-renderer/src/campaign/atmospherePass";
import {
  CampaignEntityPass,
  type CampaignEntityInstance,
} from "../../../packages/game-renderer/src/campaign/entityPass";
import {
  buildCampaignMapDrawData,
  CampaignLabelPass,
  type CampaignLabelPassStats,
  CampaignMapPass,
  CampaignMarkerPass,
  CampaignRoadPass,
  CampaignWorldLinePass,
  drawnRoadRuns,
  type CampaignLabel,
  type CampaignLabelAnchor,
  type CampaignMapStats,
  type CampaignMarker,
} from "../../../packages/game-renderer/src/campaign/mapPass";
import {
  CampaignSceneryPass,
  type CampaignSceneryInstance,
} from "../../../packages/game-renderer/src/campaign/sceneryPass";
import {
  CampaignSelectionPass,
  type CampaignSelectionInstance,
} from "../../../packages/game-renderer/src/campaign/selectionPass";
import {
  campaignFactionBorderVertices,
  CampaignTerritoryPass,
} from "../../../packages/game-renderer/src/campaign/territoryPass";
import {
  createFrameShell,
  type FrameGraphPass,
  type RawFrameShell,
  type WorldRenderPass,
} from "../../../packages/renderer-core/src/frameShell";
import {
  screenToWorld,
  world3dToScreen,
  type CameraSnapshot,
} from "../../../packages/renderer-core/src/cameraUniform";
import { campaignCameraRig, type CameraRigRange } from "../battle/cameraRig";
import { chartCamera3d, type Camera3DParams } from "../../../packages/renderer-core/src/camera3d";
import { SkinnedCrowdPipeline } from "../../../packages/renderer-core/src/skinnedPipeline";
import { SoldierShadowDecalPass } from "../../../packages/renderer-core/src/soldierShadowPass";
import { buildStackCrowd } from "../../../packages/crowd-runtime/src/stackCrowd";
import type { CrowdInstance } from "../../../packages/crowd-runtime/src/instanceData";
import {
  loadPlaceholderKit,
  loadPlaceholderVat,
  mountedClassesFromKit,
} from "../../../packages/soldier-assets/src/placeholders";
import { createPlaceholderSoldierMeshes } from "../../../packages/soldier-assets/src/soldierMesh";
import type { CampaignData, MapNode } from "./data";
import { isControlledStage } from "./data";
import type { CamView } from "./camera";
import { SELECTION_GREEN } from "../shared/overlays";
import { Allegiance } from "./status";
import { TEMPERATE_Y_KM, type TerrainField } from "./terrain";
import { campaignSurface, type CampaignSurface } from "./surface";
import { type FactionLabel, type Territory } from "./territory";
import type { ArmyView, CityView } from "./views";

export const MAX_CAMPAIGN_ZOOM = 8;

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
}

export class CampaignRenderer {
  readonly ready: Promise<void>;
  fixedTime: number | null = null;

  private shell: RawFrameShell | null = null;
  private map: CampaignMapPass | null = null;
  private clouds: CampaignCloudPass | null = null;
  private fog: CampaignFogPass | null = null;
  private territoryPass: CampaignTerritoryPass | null = null;
  private lines: CampaignWorldLinePass | null = null;
  private roads: CampaignRoadPass | null = null;
  private borders: CampaignWorldLinePass | null = null;
  private markers: CampaignMarkerPass | null = null;
  private scenery: CampaignSceneryPass | null = null;
  private entities: CampaignEntityPass | null = null;
  private soldierCrowd: SkinnedCrowdPipeline | null = null;
  private soldierShadows: SoldierShadowDecalPass | null = null;
  private mountedClasses: number[] = [];
  private selection: CampaignSelectionPass | null = null;
  private labels: CampaignLabelPass | null = null;
  private surface: CampaignSurface;
  private staticLabels: CampaignLabel[] = [];
  private sceneryCandidates: CampaignSceneryInstance[] = [];
  private labelStats: CampaignLabelPassStats = {
    labels: 0,
    visibleLabels: 0,
    visibleLabelNames: [],
    visibleSeaLabelRects: [],
    visibleCityLabelRects: [],
    collisionCulls: 0,
    collisionCulledLabels: [],
    atlasWidth: 0,
    atlasHeight: 0,
    vertices: 0,
    layer: "raw-gpu-glyph-atlas",
  };
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
  private readonly onResize = () => this.resize();

  constructor(
    private canvas: HTMLCanvasElement,
    private data: CampaignData,
    private field: TerrainField,
    territory: Territory,
  ) {
    this.surface = campaignSurface(field);
    this.ready = this.init(territory);
    window.addEventListener("resize", this.onResize);
  }

  resize() {
    this.shell?.resize();
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
    const stats = this.shell?.stats();
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
    const stats = this.shell?.stats();
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
    const stats = this.shell?.stats();
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
    if (!this.territoryPass || !this.borders) return;
    this.territoryPass.upload({
      width: this.field.w,
      height: this.field.h,
      rgba: territory.rgba,
      rect: this.data.bgRect,
    });
    this.borders.upload(
      campaignFactionBorderVertices(territory.borders, (x, y) => this.field.heightAt(x, y)),
    );
  }

  draw(opts: DrawOptions) {
    if (
      !this.shell ||
      !this.map ||
      !this.clouds ||
      !this.fog ||
      !this.territoryPass ||
      !this.lines ||
      !this.roads ||
      !this.borders ||
      !this.markers ||
      !this.scenery ||
      !this.entities ||
      !this.soldierCrowd ||
      !this.soldierShadows ||
      !this.selection ||
      !this.labels
    )
      return;
    const frameStart = performance.now();
    this.lastFactionView = opts.factionView;
    this.currentCamera = {
      x: opts.cam.x,
      y: opts.cam.y,
      // cam.scale still feeds the map's sea-shimmer zoom gate (cam.zoom); the
      // tilt gate now derives from the camera3d pitch inside cameraUniformData.
      zoom: opts.cam.scale,
      // The real 3D perspective camera — the one projection owner.
      camera3d: this.cameraParamsFor(opts.cam),
    };
    this.shell.setCamera(this.currentCamera);
    const buildStart = performance.now();
    const animTime = this.fixedTime ?? performance.now() / 1000;
    const frame = buildEntityFrame(this.data, this.field, opts, this.mountedClasses, animTime);
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
    this.shell.setTime(sceneryTime);
    this.scenery.upload(
      campaignScenery(
        this.sceneryCandidates,
        campaignSceneryReservations(frame.entities),
        opts.cam.scale,
      ).concat(campaignRoadCarts(this.data, this.field, sceneryTime, opts)),
    );
    this.entities.upload(frame.entities);
    this.soldierCrowd.upload(frame.crowd, { size: CAMPAIGN_FIGURE_SIZE });
    // The grounding shadow radius must track the figure size, or a 2.4x-scaled
    // soldier's default-radius shadow hides under its own body.
    this.soldierShadows.upload(frame.crowd, { radius: 0.62 * CAMPAIGN_FIGURE_SIZE });
    this.selection.upload(frame.selections);
    this.markers.upload(campaignMapMarkers(this.data, opts));
    this.lastFog = { enabled: opts.fogOfWar, sources: opts.visionSources };
    this.fog.upload(opts.visionSources, opts.fogOfWar);
    const staticLabels = opts.fogOfWar ? [] : this.staticLabels;
    const labelStats = this.shell.stats();
    const labelCamera: CameraSnapshot = {
      ...this.currentCamera,
      width: labelStats.width,
      height: labelStats.height,
    };
    const cityLabels = campaignCityLabels(this.data, this.field, opts, labelCamera);
    const armyLabels = campaignArmyLabels(this.data, opts);
    const factionLabels = campaignFactionLabels(this.data, opts);
    this.lastLabelComposition = {
      composedArmyCityLabels: armyLabels.filter((label) => label.subText).length,
    };
    this.labelStats = this.labels.upload(
      staticLabels.concat(cityLabels, armyLabels, factionLabels),
      this.currentCamera,
      // City-label anchor choice samples the same full-res land truth the
      // sea-label fitter fits against (slice 00's render mask owner).
      { renderSurfaceAt: (x, y) => (this.field.renderLandAt(x, y) ? "land" : "water") },
    );
    const uploadEnd = performance.now();
    const drawStart = performance.now();
    const passes: FrameGraphPass[] = [
      {
        id: "campaign-map-surface",
        role: "world-depth-fill",
        phase: "world-depth",
        depth: "write",
        draw: (pass) => this.map!.draw(pass),
      },
      {
        id: "campaign-scenery-opaque",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => this.scenery!.drawOpaque(pass),
      },
      {
        id: "campaign-entities-opaque",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => this.entities!.drawOpaque(pass),
      },
      {
        id: "campaign-soldier-crowd",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => this.soldierCrowd!.draw(pass),
      },
      ...(opts.factionView
        ? [
            {
              id: "campaign-territory-wash",
              role: "world-decal" as const,
              phase: "world-depth" as const,
              depth: "read" as const,
              draw: (pass: WorldRenderPass) => this.territoryPass!.draw(pass),
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
              draw: (pass: WorldRenderPass) => this.borders!.draw(pass),
            },
          ]
        : []),
      {
        id: "campaign-scenery-shadows",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => this.scenery!.drawShadows(pass),
      },
      {
        id: "campaign-entity-shadows",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => this.entities!.drawShadows(pass),
      },
      {
        id: "campaign-soldier-shadows",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => this.soldierShadows!.draw(pass),
      },
      {
        id: "campaign-roads",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => this.roads!.draw(pass),
      },
      {
        id: "campaign-sea-lanes-depth",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => this.lines!.draw(pass),
      },
      {
        id: "campaign-ground-selection",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => this.selection!.draw(pass),
      },
      {
        id: "campaign-clouds",
        role: "overlay-effect",
        phase: "overlay",
        draw: (pass) => this.clouds!.draw(pass),
      },
      {
        id: "campaign-fog-of-war",
        role: "overlay-effect",
        phase: "overlay",
        draw: (pass) => this.fog!.draw(pass),
      },
      {
        id: "campaign-markers",
        role: "overlay-ui",
        phase: "overlay",
        draw: (pass) => this.markers!.draw(pass),
      },
      {
        id: "campaign-labels",
        role: "overlay-ui",
        phase: "overlay",
        draw: (pass) => this.labels!.draw(pass),
      },
    ];
    this.shell.drawFrame({
      clear: { r: 0.06, g: 0.07, b: 0.075, a: 1 },
      terrainRect: [0, 0, 0, 0],
      passes,
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

  /** Verification probe: the full static scenery candidate set (world km). */
  sceneryCandidateSnapshot(): CampaignSceneryInstance[] {
    return this.sceneryCandidates.map((item) => ({ ...item }));
  }

  destroy() {
    window.removeEventListener("resize", this.onResize);
    this.shell?.destroy();
    this.shell = null;
    publishStats(this.stats());
  }

  stats() {
    const shell = this.shell?.stats();
    const markerStats = this.markers?.stats();
    return {
      renderer: "renderer-campaign",
      ready: this.shell !== null,
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
      labelCollisionCulls: this.labelStats.collisionCulls,
      labelCollisionCulledLabels: this.labelStats.collisionCulledLabels,
      ...this.lastLabelComposition,
      labelLayer: this.labelStats.layer,
      labelAtlas: `${this.labelStats.atlasWidth}x${this.labelStats.atlasHeight}`,
      labelVertices: this.labelStats.vertices,
      waterFeatures: 0,
      waterLayer: "map-sea-mask",
      mapSurface: this.map?.stats() ?? null,
      cloudQuads: this.clouds?.stats().cloudQuads ?? 0,
      fogEnabled: this.fog?.stats().fogEnabled ?? false,
      fogSources: this.fog?.stats().fogSources ?? 0,
      factionView: this.lastFactionView,
      territoryPixels: this.territoryPass?.stats().pixels ?? 0,
      borderSegments: this.borders?.stats().segments ?? 0,
      mapMarkers: markerStats?.markers ?? 0,
      markerRadiusPx: markerStats?.cityMarkerRadiusPx ?? 0,
      cityMarkerRadiiPx: markerStats?.cityMarkerRadiiPx ?? [],
      cityMarkerRadiiPxByTier: {
        1: cityMarkerRadiusPx(1),
        2: cityMarkerRadiusPx(2),
        3: cityMarkerRadiusPx(3),
      },
      ...this.selection?.stats(),
      scenery: this.scenery?.stats().scenery ?? 0,
      sceneryStats: this.scenery?.stats() ?? null,
      lineSegments: this.lines?.stats().segments ?? 0,
      roadTriangles: this.roads?.stats().triangles ?? 0,
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
  // until draw() derives the real camera from the live CamView.
  private currentCamera: Omit<CameraSnapshot, "width" | "height"> = {
    x: 0,
    y: 0,
    zoom: 0.18,
    camera3d: chartCamera3d({ x: 0, y: 0, zoom: 0.18 }, 800),
  };

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
   *  up) so the geography reads as it did under the 2.5D chart. The rig curve owns
   *  pitch/fovY (near-top-down chart out, gentle tilt in); distance is derived
   *  from cam.scale so the vertical ground span at the look target stays exactly
   *  the chart scale (device px per world km) — labels, clampCam, and every scene
   *  gate keyed on scale keep their meaning under the real camera. Screen-centre
   *  ground hit = (cam.x, cam.y): the chart stays centred (no vista look-ahead). */
  private cameraParamsFor(cam: CamView): Camera3DParams {
    const rig = campaignCameraRig(cam.scale, this.campaignZoomRange(), this.campaignRigBounds());
    const stats = this.shell?.stats();
    const width = stats?.width ?? this.canvas.width ?? 1;
    const height = Math.max(1, stats?.height ?? this.canvas.height ?? 1);
    const viewHeight = height / Math.max(0.0001, cam.scale);
    return {
      target: [cam.x, cam.y, 0],
      distance: viewHeight / (2 * Math.tan(rig.fovY / 2)),
      pitch: rig.pitch,
      yaw: -Math.PI / 2,
      fovY: rig.fovY,
      aspect: width / height,
      near: 1.0,
    };
  }

  private async init(territory: Territory) {
    // One projector engine-wide: every pass projects through camera3d's viewProj
    // and depth-tests reverse-Z against the shell's depth32float world buffer.
    this.shell = await createFrameShell(this.canvas);
    const controlledStage = isControlledStage(this.data);
    this.map = new CampaignMapPass(
      this.shell,
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
    this.clouds = new CampaignCloudPass(
      this.shell,
      this.data.bgRect,
      controlledStage ? 0.75 : 2.05,
    );
    this.fog = new CampaignFogPass(this.shell, this.data.bgRect);
    this.territoryPass = new CampaignTerritoryPass(
      this.shell,
      {
        width: this.field.w,
        height: this.field.h,
        rgba: territory.rgba,
        rect: this.data.bgRect,
      },
      this.map.drawnCoast,
      // EU4-political-strength wash (David, assets/faction-wash-target-eu4.png):
      // the faction color dominates while terrain relief still reads through.
      controlledStage ? undefined : { alpha: 0.62 },
      this.surface.mesh,
    );
    this.lines = new CampaignWorldLinePass(this.shell, "triangle-list");
    this.roads = new CampaignRoadPass(this.shell);
    this.borders = new CampaignWorldLinePass(this.shell, "triangle-list", "xyz");
    this.markers = new CampaignMarkerPass(this.shell);
    this.scenery = new CampaignSceneryPass(this.shell);
    this.sceneryCandidates = buildCampaignSceneryCandidates(this.data, this.field);
    this.entities = new CampaignEntityPass(this.shell);
    // The shared skinned soldier renderer. Army stacks draw a small
    // representative crowd through the SAME pipeline/meshes/VATs/shadow as
    // battle (buildStackCrowd feeds it per stack); the entity pass now only draws
    // the city and the army's standard banner.
    const soldierKit = await loadPlaceholderKit();
    this.mountedClasses = mountedClassesFromKit(soldierKit);
    this.soldierCrowd = new SkinnedCrowdPipeline(
      this.shell,
      createPlaceholderSoldierMeshes([0.3, 0.36, 0.74]),
      await loadPlaceholderVat(),
      soldierKit,
    );
    this.soldierShadows = new SoldierShadowDecalPass(this.shell);
    this.selection = new CampaignSelectionPass(this.shell);
    this.labels = new CampaignLabelPass(this.shell);
    // Sea labels are widest (in km) at the camera's zoom floor; probe the
    // clamp for it so the fitter judges placements at the whole-map framing
    // the player actually sees. clampCam works in device px per km, the
    // fitter in CSS px, hence the dpr divide.
    const zoomFloorProbe = { x: 0, y: 0, scale: 0 };
    this.clampCam(zoomFloorProbe);
    const drawData = buildCampaignMapDrawData(this.data, {
      roadScale: 1.0,
      // Two land samplers, one owner each (spec campaign-map-bugs, slice 00
      // division of labor): sea-label fitting wants an area statistic, which
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
    this.lines.upload(drawData.lineVertices);
    this.roads.upload(drawData.roadMeshVertices);
    this.borders.upload(
      controlledStage
        ? new Float32Array()
        : campaignFactionBorderVertices(territory.borders, (x, y) => this.field.heightAt(x, y)),
    );
    publishStats(this.stats());
  }
}

function roundMs(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}

const CAMPAIGN_CLOSE_PITCH = 0.82;

// Representative figures are drawn larger than battle soldiers (size 1) so they
// read at the strategic camera; tuned against the campaign-models 'army' zoom.
// Exported so the renderer-lab 'army' review surface tracks production by
// construction instead of re-hardcoding the size/spacing/shadow-radius.
export const CAMPAIGN_FIGURE_SIZE = 2.4;

// Zoom LOD for the army-stack figures. Below FIGURE_FAR_ZOOM the stack shows the
// standard banner alone (figures would be sub-readable and cost draw calls over
// the whole map); the figure count ramps to CAMPAIGN_MAX_FIGURES as the camera
// closes past FIGURE_NEAR_ZOOM. (Campaign zoom runs ~0.16 whole-map to ~6 close.)
const CAMPAIGN_MAX_FIGURES = 6;
const FIGURE_FAR_ZOOM = 1.4;
const FIGURE_NEAR_ZOOM = 3.6;

// Allegiance → the crowd shader's faction accent slot: friend=0 (blue), foe=1
// (red), neutral=2 (amber). Note this is NOT the raw Allegiance enum order
// (Neutral=1, Foe=2), so a neutral stack reads amber, not enemy-red.
function allegianceCrowdFaction(allegiance: Allegiance): 0 | 1 | 2 {
  return allegiance === Allegiance.Friend ? 0 : allegiance === Allegiance.Foe ? 1 : 2;
}

function campaignPitch(zoom: number) {
  const t = smoothstep(0.62, 1.6, zoom);
  return CAMPAIGN_CLOSE_PITCH * t;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function buildEntityFrame(
  data: CampaignData,
  field: TerrainField,
  opts: DrawOptions,
  mountedClasses: number[],
  animTime: number,
) {
  const entities: CampaignEntityInstance[] = [];
  const selections: CampaignSelectionInstance[] = [];
  const crowd: CrowdInstance[] = [];
  const cityEntityAnchors: [number, number][] = [];
  let cityEntities = 0;
  let armyEntities = 0;
  const fixtureScale = isControlledStage(data) ? 1.82 : 1;
  for (let node = 0; node < data.map.nodes.length; node++) {
    const mapNode = data.map.nodes[node];
    if (mapNode.kind !== "city") continue;
    if (!fogVisible(opts, mapNode.pos[0], mapNode.pos[1], 0.18)) continue;
    const city = opts.cities.get(node);
    const owner =
      city?.owner ??
      Math.max(
        0,
        data.map.factions.findIndex((faction) => faction.id === mapNode.owner),
      );
    const allegiance = statusOf(opts.factionStatus, owner);
    entities.push({
      x: mapNode.pos[0],
      y: mapNode.pos[1],
      z: field.heightAt(mapNode.pos[0], mapNode.pos[1]),
      radius: cityModelRadius(mapNode.tier) * fixtureScale,
      faction: factionColor(data, owner),
      allegiance: allegianceColor(allegiance),
      kind: "city",
      strength: Math.min(1, (city?.garrison ?? 600) / 1200),
    });
    cityEntities++;
    cityEntityAnchors.push([mapNode.pos[0], mapNode.pos[1]]);
    if (node === opts.selectedCity) {
      selections.push({
        x: mapNode.pos[0],
        y: mapNode.pos[1],
        z: field.heightAt(mapNode.pos[0], mapNode.pos[1]),
        radius: citySelectionRadius(mapNode.tier) * fixtureScale,
        color: SELECTION_GREEN,
        kind: "city",
      });
    }
  }
  // Zoom LOD, computed once per frame: figures fade in as the camera closes on a
  // stack and drop to zero (the standard banner alone) over the whole map, so the
  // strategic view stays readable and the draw cost stays bounded.
  const zoomFigures = Math.round(
    CAMPAIGN_MAX_FIGURES * smoothstep(FIGURE_FAR_ZOOM, FIGURE_NEAR_ZOOM, opts.cam.scale),
  );
  for (const army of opts.armies) {
    // Cull by fog visibility, matching visibleCampaignArmies (labels/markers) —
    // not by allegiance. A neutral or allied army standing in the player's
    // vision must keep its close-zoom model and selection, not just its label.
    if (opts.fogOfWar && !army.mine && !fogVisible(opts, army.x, army.y, 0.18)) continue;
    const allegiance =
      army.mine || army.faction === opts.playerFaction
        ? Allegiance.Friend
        : statusOf(opts.factionStatus, army.faction);
    const occupiedCity = occupiedCityForArmy(data, army);
    const display = occupiedCity
      ? garrisonDisplayAnchor(data.map.nodes[occupiedCity.index])
      : { x: army.x, y: army.y };
    entities.push({
      x: display.x,
      y: display.y,
      z: field.heightAt(display.x, display.y),
      radius: 6.4 * fixtureScale,
      faction: factionColor(data, army.faction),
      allegiance: allegianceColor(allegiance),
      kind: "army",
      strength: Math.min(1, Math.max(0.25, army.soldiers / 2600)),
    });
    // Representative figures for this stack, through the shared skinned crowd.
    // Which classes appear is sampled from the live roster; the count scales to
    // the stack cap. Figures are tinted by allegiance (friend blue / foe red /
    // neutral amber); the standard banner above carries the true faction livery.
    const roster = army.unitsByClass.some((n) => n > 0) ? army.unitsByClass : army.roster;
    if (zoomFigures > 0) {
      crowd.push(
        ...buildStackCrowd(roster, {
          unitCount: army.unitCount,
          stackUnitCap: opts.stackUnitCap,
          maxFigures: zoomFigures,
          x: display.x,
          y: display.y,
          faction: allegianceCrowdFaction(allegiance),
          seed: army.id,
          clip: army.marching ? "march" : "idle",
          phase: animTime,
          mountedClasses,
          // Space figures by their rendered footprint so they read as individuals,
          // not one merged blob, at CAMPAIGN_FIGURE_SIZE.
          spacing: CAMPAIGN_FIGURE_SIZE * 1.1,
          terrainHeight: (x, y) => field.heightAt(x, y),
        }),
      );
    }
    armyEntities++;
    if (army.id === opts.selected) {
      const controlledStage = isControlledStage(data);
      const selectionRadius = occupiedCity
        ? 11.8 * fixtureScale
        : controlledStage
          ? 8.4 * fixtureScale
          : 12.6 * fixtureScale;
      selections.push({
        x: display.x,
        y: display.y,
        z: field.heightAt(display.x, display.y),
        radius: selectionRadius,
        color: SELECTION_GREEN,
        kind: occupiedCity ? "garrisoned-army" : "army",
      });
    }
  }
  return { entities, selections, crowd, cityEntities, armyEntities, cityEntityAnchors };
}

const CITY_MARKER_BASE_RADIUS_PX = 3.8;
const CITY_MARKER_TIER_RADIUS_PX = 0.7;

function campaignMapMarkers(data: CampaignData, opts: DrawOptions): CampaignMarker[] {
  if (isControlledStage(data) || opts.cam.scale >= 0.5) return [];
  const markers: CampaignMarker[] = [];
  data.map.nodes.forEach((node, index) => {
    if (node.kind !== "city") return;
    const minTier = opts.cam.scale < 0.6 ? 3 : opts.cam.scale < 0.85 ? 2 : 1;
    if (node.tier < minTier) return;
    if (!fogVisible(opts, node.pos[0], node.pos[1], 0.18)) return;
    const city = opts.cities.get(index);
    const owner =
      city?.owner ??
      Math.max(
        0,
        data.map.factions.findIndex((faction) => faction.id === node.owner),
      );
    if (owner === opts.playerFaction) return;
    markers.push({
      x: node.pos[0],
      y: node.pos[1],
      radius: cityMarkerRadiusPx(node.tier),
      faction: factionColor(data, owner),
      allegiance: factionColor(data, owner),
      kind: "city",
      selected: index === opts.selectedCity,
    });
  });
  for (const army of visibleCampaignArmies(opts)) {
    if (army.mine || army.faction === opts.playerFaction) continue;
    markers.push({
      x: army.x,
      y: army.y,
      radius: army.id === opts.selected ? 10.5 : 9,
      faction: factionColor(data, army.faction),
      allegiance: factionColor(data, army.faction),
      kind: "army",
      selected: army.id === opts.selected,
    });
  }
  return markers;
}

function statusOf(status: Int8Array, faction: number): Allegiance {
  return faction >= 0 && faction < status.length
    ? (status[faction] as Allegiance)
    : Allegiance.Neutral;
}

function factionColor(data: CampaignData, faction: number): [number, number, number] {
  const color = data.map.factions[faction]?.color ?? [146, 126, 92];
  return [color[0] / 255, color[1] / 255, color[2] / 255];
}

function allegianceColor(allegiance: Allegiance): [number, number, number] {
  if (allegiance === Allegiance.Friend) return SELECTION_GREEN;
  if (allegiance === Allegiance.Foe) return [0.88, 0.27, 0.23];
  return [0.93, 0.78, 0.3];
}

function campaignCityLabels(
  data: CampaignData,
  field: TerrainField,
  opts: DrawOptions,
  cam: CameraSnapshot,
): CampaignLabel[] {
  const edge = mapEdgeProjector(data);
  const labels: CampaignLabel[] = [];
  data.map.nodes.forEach((node, index) => {
    if (node.kind !== "city") return;
    if (!fogVisible(opts, node.pos[0], node.pos[1], 0.18)) return;
    const city = opts.cities.get(index);
    const owner =
      city?.owner ??
      Math.max(
        0,
        data.map.factions.findIndex((faction) => faction.id === node.owner),
      );
    if (owner === opts.playerFaction) return;
    const allegiance = statusOf(opts.factionStatus, owner);
    const baseSize = Math.min(15, 9.5 + opts.cam.scale) * (node.tier >= 3 ? 1.15 : 1);
    const overviewMarkerLabel = opts.cam.scale < 0.6;
    const edgeX = horizontalEdgeOffset(edge.x(node.pos[0]));
    const edgeY = verticalEdgeOffset(edge.y(node.pos[1]));
    const reliefPx = cityReliefRisePx(field, opts, node.pos, cam);
    // Anchor placement is land-aware (B2/B8): the emitter only authors the
    // preference-ordered candidates; the label pass scores their measured
    // rects against the render mask and keeps the first mostly-land one.
    const anchors = overviewMarkerLabel
      ? overviewCityLabelAnchors(node.tier, edgeX, edgeY)
      : closeupCityLabelAnchors(
          edgeX,
          cityLabelOffset(opts, baseSize, reliefPx) + edgeY,
          -(reliefPx + baseSize * 1.9) + edgeY,
        );
    labels.push({
      text: node.name.toUpperCase(),
      x: node.pos[0],
      y: node.pos[1],
      kind: "city",
      size: baseSize,
      priority: node.tier,
      icon: "city",
      iconColor: factionColor(data, owner),
      rightIcon: allegiance === Allegiance.Foe ? "sword" : undefined,
      rightIconColor: allegiance === Allegiance.Foe ? [0.83, 0.2, 0.15] : undefined,
      collisionGroup: cityCollisionGroup(index),
      ...anchors[0],
      placementCandidates: anchors,
    });
  });
  return labels;
}

// Marker-clearance rings for overview anchor candidates, in units of the
// marker's outer-edge clearance. Ring 1 is the classic attached look; the
// outer rings only win when no ring-1 placement is clean (a whole-map label
// box spans hundreds of km — isthmus cities like Corinthus have no clean
// adjacent spot), trading a little detachment for ink on land.
const OVERVIEW_LABEL_RING_SCALES = [1, 2.2, 3.6];

/** Overview (marker-attached) city-label anchor candidates: the classic
 * below-right of the square marker first (the tiebreak — inland labels never
 * move), then its mirrors around the marker, ring by ring. Edge offsets shift
 * every candidate alike so map-border labels stay inside the frame. */
function overviewCityLabelAnchors(
  tier: number,
  edgeX: number,
  edgeY: number,
): CampaignLabelAnchor[] {
  const anchors: CampaignLabelAnchor[] = [];
  for (const ring of OVERVIEW_LABEL_RING_SCALES) {
    const d = cityMarkerOuterEdgePlusSidePx(tier) * ring;
    anchors.push(
      {
        screenOffsetX: d + edgeX,
        screenOffsetY: d + edgeY,
        screenAnchorX: "left",
        screenAnchorY: "top",
      },
      {
        screenOffsetX: -d + edgeX,
        screenOffsetY: d + edgeY,
        screenAnchorX: "right",
        screenAnchorY: "top",
      },
      {
        screenOffsetX: d + edgeX,
        screenOffsetY: -d + edgeY,
        screenAnchorX: "left",
        screenAnchorY: "bottom",
      },
      {
        screenOffsetX: -d + edgeX,
        screenOffsetY: -d + edgeY,
        screenAnchorX: "right",
        screenAnchorY: "bottom",
      },
      {
        screenOffsetX: d + edgeX,
        screenOffsetY: edgeY,
        screenAnchorX: "left",
        screenAnchorY: "center",
      },
      {
        screenOffsetX: -d + edgeX,
        screenOffsetY: edgeY,
        screenAnchorX: "right",
        screenAnchorY: "center",
      },
      {
        screenOffsetX: edgeX,
        screenOffsetY: d + edgeY,
        screenAnchorX: "center",
        screenAnchorY: "top",
      },
      {
        screenOffsetX: edgeX,
        screenOffsetY: -d + edgeY,
        screenAnchorX: "center",
        screenAnchorY: "bottom",
      },
    );
  }
  return anchors;
}

// A slid closeup label keeps this much overlap with the marker column so it
// still reads as attached to its city rather than floating beside it.
const CLOSEUP_LABEL_MARKER_TIE_PX = 14;

/** Closeup city labels sit centered under the model; when a long coastal
 * name's centered box runs into the sea (B8), slide it sideways at the same
 * relief-aware height so the seaward edge pulls back ashore. Above the model
 * (centered, then slid) is the last resort. */
function closeupCityLabelAnchors(
  edgeX: number,
  belowY: number,
  aboveY: number,
): CampaignLabelAnchor[] {
  const slid = (offsetY: number): CampaignLabelAnchor[] => [
    {
      screenOffsetX: edgeX,
      screenOffsetY: offsetY,
      screenAnchorX: "center",
      screenAnchorY: "center",
    },
    {
      screenOffsetX: edgeX + CLOSEUP_LABEL_MARKER_TIE_PX,
      screenOffsetY: offsetY,
      screenAnchorX: "right",
      screenAnchorY: "center",
    },
    {
      screenOffsetX: edgeX - CLOSEUP_LABEL_MARKER_TIE_PX,
      screenOffsetY: offsetY,
      screenAnchorX: "left",
      screenAnchorY: "center",
    },
  ];
  return [...slid(belowY), ...slid(aboveY)];
}

function campaignArmyLabels(data: CampaignData, opts: DrawOptions): CampaignLabel[] {
  const ordinalOf = new Map<number, number>();
  const byFaction = new Map<number, number[]>();
  for (const army of visibleCampaignArmies(opts)) {
    const ids = byFaction.get(army.faction) ?? [];
    ids.push(army.id);
    byFaction.set(army.faction, ids);
  }
  for (const ids of byFaction.values()) {
    ids.sort((a, b) => a - b);
    ids.forEach((id, index) => ordinalOf.set(id, index + 1));
  }
  return visibleCampaignArmies(opts)
    .filter((army) => !army.mine && army.faction !== opts.playerFaction)
    .map((army): CampaignLabel => {
      const markerSize = army.id === opts.selected ? 13 : 11;
      const occupiedCity = occupiedCityForArmy(data, army);
      const display = occupiedCity
        ? garrisonDisplayAnchor(data.map.nodes[occupiedCity.index])
        : { x: army.x, y: army.y };
      const cityOverlap = occupiedCity !== null;
      const selectedOffset =
        !cityOverlap && army.id === opts.selected && isControlledStage(data) ? 28 : 0;
      const overlapClearance = cityOverlap ? (opts.cam.scale >= 3 ? 14 : 10) : 24;
      return {
        text: `${ordinal(ordinalOf.get(army.id) ?? 1)} LEGION`,
        sideText: `${Math.round(army.soldiers / 100) / 10}k`,
        subText: occupiedCity?.name.toUpperCase(),
        x: display.x,
        y: display.y,
        kind: "army",
        size: Math.min(14, 9 + opts.cam.scale),
        priority: 4,
        icon: "army",
        iconColor: factionColor(data, army.faction),
        collisionGroup: occupiedCity ? cityCollisionGroup(occupiedCity.index) : undefined,
        screenOffsetY: markerSize + selectedOffset + overlapClearance,
      };
    });
}

/** World-km footprint radius of the city model mesh; exported so the card
 *  loop can size its own-model keep-out from the rendered footprint. */
export function cityModelRadius(tier: number) {
  return tier >= 3 ? 6.2 : 5.2;
}

function citySelectionRadius(tier: number) {
  return tier >= 3 ? 10.8 : 9.4;
}

function garrisonDisplayAnchor(city: MapNode) {
  const cityRadius = cityModelRadius(city.tier);
  // Keep the garrison inside the city footprint so the composed army+city label
  // collides with the plain city label and reads as one city-owned marker.
  return {
    x: city.pos[0] - cityRadius * 0.08,
    y: city.pos[1] - cityRadius * 0.12,
  };
}

function occupiedCityForArmy(data: CampaignData, army: ArmyView) {
  let best: { index: number; name: string; d: number } | null = null;
  for (let index = 0; index < data.map.nodes.length; index++) {
    const node = data.map.nodes[index];
    if (node.kind !== "city") continue;
    const d = Math.hypot(node.pos[0] - army.x, node.pos[1] - army.y);
    if (d < 8 && (!best || d < best.d)) best = { index, name: node.name, d };
  }
  return best;
}

function visibleCampaignArmies(opts: DrawOptions) {
  return opts.armies.filter((army) => {
    if (!opts.fogOfWar) return true;
    return fogVisible(opts, army.x, army.y, 0.18);
  });
}

function cityLabelOffset(opts: DrawOptions, baseSize: number, reliefPx: number) {
  // The visible gap below the city model is reliefPx (model rides up over its
  // raised ground) plus this screen offset (label sits below the flat z=0
  // anchor). Target ~one label height of gap regardless of elevation, so the
  // offset goes NEGATIVE for a perched city (label climbs back up to the
  // model's foot) and stays positive for a coastal-flat one. Old 1.30/1.45 left
  // two-plus label heights under inland cities.
  const targetGap = opts.cam.scale < 1.25 ? baseSize * 0.9 : baseSize * 1.1;
  // Clamp the climb so a freak height never flings the name onto the model top.
  return Math.max(-baseSize * 2.6, targetGap - reliefPx);
}

// CSS-pixel screen rise of the city model above its flat (z=0) label anchor at
// this camera: project the same (x, y) at z=0 and at the terrain height and take
// the screen-Y difference through the real perspective camera, so the label sits
// the intended gap below the raised model instead of drifting on relief.
function cityReliefRisePx(
  field: TerrainField,
  opts: DrawOptions,
  pos: readonly [number, number],
  cam: CameraSnapshot,
) {
  const h = Math.max(0, field.heightAt(pos[0], pos[1]));
  if (h <= 0) return 0;
  const dpr = window.devicePixelRatio || 1;
  const [, ground] = world3dToScreen(cam, pos[0], pos[1], 0);
  const [, raised] = world3dToScreen(cam, pos[0], pos[1], h);
  return Math.max(0, (ground - raised) / dpr);
}

function cityMarkerRadiusPx(tier: number) {
  return CITY_MARKER_BASE_RADIUS_PX + tier * CITY_MARKER_TIER_RADIUS_PX;
}

function cityMarkerSidePx(tier: number) {
  return cityMarkerRadiusPx(tier) * 2;
}

function cityMarkerOuterEdgePlusSidePx(tier: number) {
  const radius = cityMarkerRadiusPx(tier);
  return radius + cityMarkerSidePx(tier) - OVERVIEW_LABEL_ICON_PADDING_PX;
}

const OVERVIEW_LABEL_ICON_PADDING_PX = 5;

function cityCollisionGroup(index: number) {
  return `city:${index}`;
}

function ordinal(k: number) {
  const value = k % 100;
  const suffix = value >= 11 && value <= 13 ? "th" : (["th", "st", "nd", "rd"][k % 10] ?? "th");
  return `${k}${suffix}`;
}

function campaignFactionLabels(data: CampaignData, opts: DrawOptions): CampaignLabel[] {
  if (!opts.factionView) return [];
  const edge = mapEdgeProjector(data);
  return opts.factionLabels
    .filter((label) => !opts.fogOfWar || fogVisible(opts, label.x, label.y, 0.14))
    .map(
      (label): CampaignLabel => ({
        text: label.name,
        x: label.x,
        y: label.y,
        kind: "faction",
        size: label.minor ? 9 : 17,
        priority: 4,
        angle: -0.06,
        factionRadiusKm: label.radiusKm,
        factionMinor: label.minor,
        screenOffsetX: horizontalEdgeOffset(edge.x(label.x)),
        screenOffsetY: verticalEdgeOffset(edge.y(label.y)),
      }),
    );
}

function fogVisible(opts: DrawOptions, x: number, y: number, threshold: number) {
  if (!opts.fogOfWar) return true;
  return fogVisibility(opts.visionSources, x, y) >= threshold;
}

function fogVisibility(sources: CampaignFogSource[], x: number, y: number) {
  let visible = 0;
  for (const source of sources) {
    const d = Math.hypot(x - source.x, y - source.y);
    const sourceVisible = 1 - smoothstep(source.radius * 0.72, source.radius * 1.08, d);
    visible = Math.max(visible, sourceVisible);
  }
  return visible;
}

const LABEL_EDGE_INSET_START_X = 0.22;
const LABEL_EDGE_INSET_RANGE_X = 0.18;
const LABEL_EDGE_OFFSET_X = 110;
const LABEL_EDGE_INSET_START_Y = 0.22;
const LABEL_EDGE_INSET_RANGE_Y = 0.16;
const LABEL_EDGE_OFFSET_Y = 96;

function mapEdgeProjector(data: CampaignData) {
  const [minX, minY] = data.bgRect.min;
  const [maxX, maxY] = data.bgRect.max;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    x: (worldX: number) => (worldX - minX) / width,
    y: (worldY: number) => (worldY - minY) / height,
  };
}

function horizontalEdgeOffset(t: number) {
  const rightStart = 1 - LABEL_EDGE_INSET_START_X;
  if (t > rightStart)
    return -LABEL_EDGE_OFFSET_X * Math.min(1, (t - rightStart) / LABEL_EDGE_INSET_RANGE_X);
  if (t < LABEL_EDGE_INSET_START_X)
    return (
      LABEL_EDGE_OFFSET_X * Math.min(1, (LABEL_EDGE_INSET_START_X - t) / LABEL_EDGE_INSET_RANGE_X)
    );
  return 0;
}

function verticalEdgeOffset(t: number) {
  const topStart = 1 - LABEL_EDGE_INSET_START_Y;
  if (t > topStart)
    return LABEL_EDGE_OFFSET_Y * Math.min(1, (t - topStart) / LABEL_EDGE_INSET_RANGE_Y);
  if (t < LABEL_EDGE_INSET_START_Y)
    return (
      -LABEL_EDGE_OFFSET_Y * Math.min(1, (LABEL_EDGE_INSET_START_Y - t) / LABEL_EDGE_INSET_RANGE_Y)
    );
  return 0;
}

const CAMPAIGN_MOUNTAIN_MIN_SCALE = 0.28;
const CAMPAIGN_TREE_MIN_SCALE = 0.45;
const CAMPAIGN_ROCK_MIN_SCALE = 0.45;
const CAMPAIGN_MAX_MOUNTAINS = 3200;
const CAMPAIGN_MAX_TREES = 7200;
const CAMPAIGN_MAX_ROCKS = 1000;
const CAMPAIGN_MOUNTAIN_VISUAL_SCALE = 2.25;
const CAMPAIGN_ROCK_VISUAL_SCALE = 1.75;
const CAMPAIGN_TREE_VISUAL_SCALE = 1.72;
// Land gate (B9): every static candidate must pass renderLandAt — the
// full-res rendered coast, not the 8 km grid — with the instance's own
// footprint radius as the margin (`size` is roughly the footprint diameter in
// km), so no prop hangs over the water side of the drawn coastline.
function sceneryFootprintOnLand(field: TerrainField, x: number, y: number, size: number) {
  return field.renderLandAt(x, y, size * 0.5);
}

function campaignScenery(
  candidates: CampaignSceneryInstance[],
  reservations: CampaignSceneryReservation[] = [],
  scale = 1,
): CampaignSceneryInstance[] {
  const lodFiltered = candidates.filter((item) => scale >= sceneryMinScale(item));
  return clearCampaignDynamicScenery(lodFiltered, reservations);
}

const CART_MIN_SCALE = 3.2;
const CART_SPACING_KM = 78;
const CART_CITY_CLEARANCE_KM = 7; // keep carts off the city footprints at each spline end

// Road life: a handful of trade carts riding the road splines. Their position is
// a function of scene time, so they crawl along when the campaign runs and sit
// at a deterministic spot when it is frozen for a snapshot. Carts live ON the
// road, so they bypass the road-clearance cull; they only appear at close zoom
// and obey fog.
function campaignRoadCarts(
  data: CampaignData,
  field: TerrainField,
  time: number,
  opts: DrawOptions,
): CampaignSceneryInstance[] {
  if (opts.cam.scale < CART_MIN_SCALE) return [];
  const carts: CampaignSceneryInstance[] = [];
  data.map.edges.forEach((edge, e) => {
    if (edge.kind !== "road" || !edge.via || edge.via.length < 2) return;
    // Ride the exact land runs the road pass draws (same smoothing, sampling,
    // and ferry splits), or a cart sits off in the grass beside the visible
    // ribbon — or worse, crawls a strait the ribbon honestly leaves undrawn.
    const { runs } = drawnRoadRuns(edge.via, (x, y) =>
      field.renderLandAt(x, y) ? "land" : "water",
    );
    for (const via of runs) {
      const segLen: number[] = [];
      let total = 0;
      for (let i = 1; i < via.length; i++) {
        const d = Math.hypot(via[i][0] - via[i - 1][0], via[i][1] - via[i - 1][1]);
        segLen.push(d);
        total += d;
      }
      if (total < 28) continue; // too short to carry road life
      const count = Math.max(1, Math.floor(total / CART_SPACING_KM));
      for (let c = 0; c < count; c++) {
        const phase = hash2(e * 13 + c * 7 + 1, e * 5 + 3);
        const dir = hash2(e * 3 + c, 7) < 0.5 ? 1 : -1;
        const speed = 0.6 + hash2(e + c, e * 2 + 1) * 0.5; // km/s along the spline
        const dist = ((((phase + (time * speed * dir) / total) % 1) + 1) % 1) * total;
        if (dist < CART_CITY_CLEARANCE_KM || total - dist < CART_CITY_CLEARANCE_KM) continue;
        let acc = 0;
        for (let i = 1; i < via.length; i++) {
          const d = segLen[i - 1];
          if (acc + d >= dist) {
            const t = (dist - acc) / Math.max(1e-6, d);
            const x = via[i - 1][0] + (via[i][0] - via[i - 1][0]) * t;
            const y = via[i - 1][1] + (via[i][1] - via[i - 1][1]) * t;
            if (opts.fogOfWar && !fogVisible(opts, x, y, 0.18)) break;
            const ang = Math.atan2(via[i][1] - via[i - 1][1], via[i][0] - via[i - 1][0]);
            carts.push({
              x,
              y,
              z: Math.max(0, field.heightAt(x, y)),
              size: 1.3,
              height: 0.9,
              kind: "cart",
              shade: 0.55 + phase * 0.35,
              yaw: dir > 0 ? ang : ang + Math.PI,
            });
            break;
          }
          acc += d;
        }
      }
    }
  });
  return carts;
}

function buildCampaignSceneryCandidates(
  data: CampaignData,
  field: TerrainField,
): CampaignSceneryInstance[] {
  if (data.map.attribution === "test") return testStageScenery(data);
  const mountains: ScoredCampaignSceneryInstance[] = [];
  const trees: ScoredCampaignSceneryInstance[] = [];
  const rocks: ScoredCampaignSceneryInstance[] = [];
  for (let gy = 0; gy < field.h; gy++) {
    for (let gx = 0; gx < field.w; gx++) {
      const i = gy * field.w + gx;
      if (!field.land[i]) continue;
      const x0 = field.minX + (gx + 0.5) * field.cell;
      const y0 = field.maxY - (gy + 0.5) * field.cell;
      const rock = field.biome[i * 4 + 2] / 255;
      const forest = field.biome[i * 4 + 1] / 255;
      const height = field.height[i] / Math.max(1, field.maxH);
      const mountainScore = height * 0.85 + rock * 0.5;
      // Thinner than before: a few deliberate massifs let the terrain relief and
      // rock shading carry the range mass, instead of a wall of cones on every
      // high cell that buries cities and roads.
      const mountainChance =
        mountainScore > 0.66 ? 0.58 : height > 0.2 ? 0.6 : rock > 0.18 && height > 0.04 ? 0.4 : 0;
      if (mountainChance > 0 && hash2(gx * 3 + 1, gy * 7 + 2) < mountainChance) {
        const x = x0 + (hash2(gx, gy * 2) - 0.5) * field.cell * 0.7;
        const y = y0 + (hash2(gx * 2, gy) - 0.5) * field.cell * 0.7;
        const radius = field.cell * 0.5 * (0.7 + rock * 0.5);
        const size = radius * CAMPAIGN_MOUNTAIN_VISUAL_SCALE;
        // Gate only the mountain push: a failed land check must not skip the
        // cell's forest block below.
        if (sceneryFootprintOnLand(field, x, y, size)) {
          mountains.push({
            x,
            y,
            z: Math.max(0, field.heightAt(x, y)),
            size,
            // Lower silhouette: broad ridges rather than spires that tower over
            // labels. Vertical scale trimmed alongside the broader massif mesh.
            height: (2.1 + rock * 3.1 + height * 3.3) * 1.0,
            kind: "mountain",
            shade: hash2(gx + 3, gy + 5),
            yaw: hash2(gx * 9 + 1, gy * 4 + 7) * Math.PI * 2,
            score: mountainScore + hash2(gx + 17, gy + 29) * 0.08,
            gx,
            gy,
          });
        }
      } else if (rock > 0.3 && hash2(gx * 5, gy * 9) < rock * 0.6) {
        const count = 1 + Math.floor(hash2(gx, gy) * 2.5);
        for (let t = 0; t < count; t++) {
          const x = x0 + (hash2(gx * 7 + t, gy * 11) - 0.5) * field.cell * 1.2;
          const y = y0 + (hash2(gx * 5 + t, gy * 13) - 0.5) * field.cell * 1.2;
          const radius = 0.9 + hash2(gx + t, gy) * 1.7;
          const size = radius * CAMPAIGN_ROCK_VISUAL_SCALE;
          if (!sceneryFootprintOnLand(field, x, y, size)) continue;
          rocks.push({
            x,
            y,
            z: Math.max(0, field.heightAt(x, y)),
            size,
            height: (0.7 + hash2(gx, gy + t) * 1.4) * 1.12,
            kind: "rock",
            shade: hash2(t + 1, gx),
            yaw: hash2(gx * 7 + t, gy * 3 + 11) * Math.PI * 2,
            score: rock + hash2(gx + t * 5, gy + t * 7) * 0.1,
            gx,
            gy,
          });
        }
      }
      if (forest >= 0.16) {
        const count = Math.max(1, Math.round(forest * 7.0 * (0.6 + hash2(gx, gy) * 0.9)));
        for (let t = 0; t < count; t++) {
          const x = x0 + (hash2(gx * 7 + t, gy * 13 + 1) - 0.5) * field.cell * 1.4;
          const y = y0 + (hash2(gx * 3 + t, gy * 17 + 5) - 0.5) * field.cell * 1.4;
          const heightScale = 2.0 + hash2(gx + t, gy + t) * 1.8;
          const size = heightScale * 0.72 * CAMPAIGN_TREE_VISUAL_SCALE;
          if (!sceneryFootprintOnLand(field, x, y, size)) continue;
          trees.push({
            x,
            y,
            z: Math.max(0, field.heightAt(x, y) - 0.05),
            size,
            height: heightScale * 1.1,
            kind:
              hash2(gx * 5 + t, gy * 11) < (y > TEMPERATE_Y_KM ? 0.75 : 0.25)
                ? "conifer"
                : "broadleaf",
            shade: hash2(gx + t * 19, gy + t * 23),
            yaw: hash2(gx * 13 + t, gy * 7 + t) * Math.PI * 2,
            score: forest + hash2(gx + t * 3, gy + t * 11) * 0.08,
            gx,
            gy,
          });
        }
      }
    }
  }
  return clearCampaignStaticScenery(data, [
    ...selectRegionalScenery(mountains, CAMPAIGN_MAX_MOUNTAINS),
    ...selectRegionalScenery(trees, CAMPAIGN_MAX_TREES),
    ...selectRegionalScenery(rocks, CAMPAIGN_MAX_ROCKS),
  ]);
}

type ScoredCampaignSceneryInstance = CampaignSceneryInstance & {
  score: number;
  gx: number;
  gy: number;
};

const CAMPAIGN_SCENERY_REGION_CELLS = 24;

function selectRegionalScenery(
  items: ScoredCampaignSceneryInstance[],
  limit: number,
): CampaignSceneryInstance[] {
  if (items.length <= limit) return items.map(toCampaignSceneryInstance);
  const buckets = new Map<string, ScoredCampaignSceneryInstance[]>();
  for (const item of items) {
    const key = `${Math.floor(item.gx / CAMPAIGN_SCENERY_REGION_CELLS)},${Math.floor(item.gy / CAMPAIGN_SCENERY_REGION_CELLS)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  for (const bucket of buckets.values()) bucket.sort(compareSceneryScore);

  const selected: ScoredCampaignSceneryInstance[] = [];
  const selectedSet = new Set<ScoredCampaignSceneryInstance>();
  const regions = [...buckets.values()].sort((a, b) => b[0].score - a[0].score);
  const regionalReserve = Math.min(limit, Math.floor(limit * 0.32));
  const perRegionSeed = Math.max(1, Math.floor(regionalReserve / Math.max(1, regions.length)));
  for (const bucket of regions) {
    if (selected.length >= limit) break;
    for (const item of bucket.slice(0, perRegionSeed)) {
      if (selected.length >= limit) break;
      selected.push(item);
      selectedSet.add(item);
    }
  }

  const remainingQuota = limit - selected.length;
  let spent = 0;
  for (const bucket of regions) {
    if (spent >= remainingQuota) break;
    const seeded = bucket.reduce((count, item) => count + (selectedSet.has(item) ? 1 : 0), 0);
    const quota = Math.min(
      bucket.length - seeded,
      Math.floor((bucket.length / items.length) * remainingQuota),
    );
    let taken = 0;
    for (const item of bucket) {
      if (spent >= remainingQuota || taken >= quota) break;
      if (selectedSet.has(item)) continue;
      selected.push(item);
      selectedSet.add(item);
      spent++;
      taken++;
    }
  }

  if (selected.length < limit) {
    const global = [...items].sort(compareSceneryScore);
    for (const item of global) {
      if (selected.length >= limit) break;
      if (selectedSet.has(item)) continue;
      selected.push(item);
      selectedSet.add(item);
    }
  }

  return selected.sort(compareSceneryScore).map(toCampaignSceneryInstance);
}

function compareSceneryScore(a: ScoredCampaignSceneryInstance, b: ScoredCampaignSceneryInstance) {
  return b.score - a.score;
}

function toCampaignSceneryInstance(item: ScoredCampaignSceneryInstance): CampaignSceneryInstance {
  return {
    x: item.x,
    y: item.y,
    z: item.z,
    size: item.size,
    height: item.height,
    kind: item.kind,
    shade: item.shade,
    yaw: item.yaw,
  };
}

function testStageScenery(data: CampaignData): CampaignSceneryInstance[] {
  const [x0, y0] = data.bgRect.min;
  const [x1, y1] = data.bgRect.max;
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;
  const items: CampaignSceneryInstance[] = [
    { x: cx - 34, y: y1 - 5, size: 13.2, kind: "mountain" },
    { x: cx - 26, y: y1 - 2, size: 11.6, kind: "mountain" },
    { x: cx - 16, y: y1 - 6, size: 12.4, kind: "mountain" },
    { x: cx - 5, y: y1 - 3, size: 13.8, kind: "mountain" },
    { x: cx + 18, y: y1 - 7, size: 11.8, kind: "mountain" },
    { x: cx + 32, y: y1 - 5, size: 12.8, kind: "mountain" },
    { x: cx - 10, y: cy + 7, size: 9.8, kind: "mountain" },
    { x: cx + 10, y: cy + 7, size: 9.1, kind: "mountain" },
    { x: cx - 5, y: cy - 1, size: 10.6, kind: "mountain" },
    { x: cx + 21, y: cy - 1, size: 9.2, kind: "mountain" },
    { x: cx + 33, y: cy - 4, size: 9.8, kind: "mountain" },
    { x: x0 + 31, y: y0 + 9, size: 9.8, kind: "rock" },
    { x: x0 + 43, y: y0 + 7, size: 10.8, kind: "rock" },
    { x: x1 - 30, y: y0 + 8, size: 10.2, kind: "rock" },
    { x: x1 - 15, y: y0 + 13, size: 8.6, kind: "rock" },
    { x: x1 - 5, y: y0 + 6, size: 12.2, kind: "rock" },
    { x: cx - 17, y: cy - 15, size: 7.4, kind: "rock" },
    { x: cx - 4, y: cy - 18, size: 7.9, kind: "rock" },
    { x: cx + 18, y: cy - 16, size: 7.1, kind: "rock" },
    { x: cx + 32, y: cy - 10, size: 8.1, kind: "rock" },
    { x: cx - 18, y: cy + 2, size: 6.6, kind: "conifer" },
    { x: cx + 24, y: cy + 2, size: 6.2, kind: "broadleaf" },
    { x: cx + 12, y: cy - 6, size: 5.8, kind: "broadleaf" },
    { x: cx + 28, y: cy - 7, size: 5.4, kind: "conifer" },
    { x: cx - 30, y: cy - 9, size: 5.8, kind: "conifer" },
  ];
  for (let i = 0; i < 32; i++) {
    const x = x0 + 6 + hash2(i * 13, 4) * (x1 - x0 - 12);
    const y = y0 + 5 + hash2(5, i * 17) * (y1 - y0 - 10);
    if (Math.abs(y - cy) < 5 && Math.abs(x - cx) < 34) continue;
    const near = y < cy - 8 ? 1.18 : 1.0;
    items.push({
      x,
      y,
      size: (3.2 + hash2(i, i + 9) * 2.8) * near,
      kind: hash2(i, i + 31) > 0.45 ? "broadleaf" : "conifer",
    });
  }
  // The controlled test stage is intentionally flat ground (isControlledStage
  // skips relief grading), so every prop seats on its single z=0 datum rather
  // than carrying a per-prop seating literal. A relief-bearing stage would seat
  // these through the terrain height sampler, as the real-map scenery path does.
  const flatStageZ = 0;
  return clearCampaignStaticScenery(
    data,
    items.map((item) => {
      const seated = { ...item, z: flatStageZ };
      if (item.kind === "mountain")
        return { ...seated, size: item.size / 3.8, height: item.size / 1.8 };
      return { ...seated, size: item.size / 3.0, height: item.size / 3.0 };
    }),
  );
}

interface CampaignSceneryReservation {
  x: number;
  y: number;
  radius: number;
  kind: "city" | "army";
}

function campaignSceneryReservations(
  entities: CampaignEntityInstance[],
): CampaignSceneryReservation[] {
  return entities.map((entity) => ({
    x: entity.x,
    y: entity.y,
    radius: entity.radius * (entity.kind === "city" ? 0.48 : 2.45),
    kind: entity.kind,
  }));
}

function clearCampaignStaticScenery(data: CampaignData, items: CampaignSceneryInstance[]) {
  const roadSegments = data.map.edges
    .filter((edge) => edge.kind === "road")
    .flatMap((edge) =>
      edge.via
        .slice(1)
        .map((point, index): [[number, number], [number, number]] => [edge.via[index], point]),
    );
  const cityFootprints = data.map.nodes
    .filter((node) => node.kind === "city")
    .map((node) => ({
      x: node.pos[0],
      y: node.pos[1],
      tier: node.tier ?? 1,
    }));
  return items.filter((item) => {
    const propRadius = sceneryReservationRadius(item);
    if (
      cityFootprints.some(
        (city) =>
          Math.hypot(item.x - city.x, item.y - city.y) <
          citySceneryClearance(item, city.tier, isControlledStage(data)) + propRadius,
      )
    )
      return false;
    const clearance = roadSceneryClearance(item, isControlledStage(data));
    return !roadSegments.some(([a, b]) => distanceToSegment(item.x, item.y, a, b) < clearance);
  });
}

function clearCampaignDynamicScenery(
  items: CampaignSceneryInstance[],
  reservations: CampaignSceneryReservation[],
) {
  if (reservations.length === 0) return items;
  return items.filter((item) => {
    const propRadius = sceneryReservationRadius(item);
    return !reservations.some((entity) => {
      const radius = entity.kind === "city" ? entity.radius * 0.92 : entity.radius;
      return Math.hypot(item.x - entity.x, item.y - entity.y) < radius + propRadius;
    });
  });
}

function sceneryReservationRadius(item: CampaignSceneryInstance) {
  if (item.kind === "mountain") return Math.max(4.8, item.size * 0.42);
  if (item.kind === "rock") return Math.max(2.8, item.size * 0.34);
  return Math.max(1.6, item.size * 0.24);
}

// Only the candidate scenery (mountains/trees/rocks) flows through this LoD
// filter. Carts are gated by their own scale check in campaignRoadCarts and
// never reach here.
function sceneryMinScale(item: CampaignSceneryInstance) {
  if (item.kind === "mountain") return CAMPAIGN_MOUNTAIN_MIN_SCALE;
  if (item.kind === "rock") return CAMPAIGN_ROCK_MIN_SCALE;
  return CAMPAIGN_TREE_MIN_SCALE;
}

function citySceneryClearance(
  item: CampaignSceneryInstance,
  tier: number,
  controlledStage: boolean,
) {
  const fixtureScale = controlledStage ? 1.82 : 1;
  if (controlledStage) return (tier >= 3 ? 12.0 : 10.5) * fixtureScale;
  // Mountains get a wide apron so no city ends up embedded in the massif.
  if (item.kind === "mountain") return tier >= 3 ? 11.0 : 9.4;
  if (item.kind === "rock") return tier >= 3 ? 5.2 : 4.4;
  return tier >= 3 ? 5.4 : 4.4;
}

function roadSceneryClearance(item: CampaignSceneryInstance, controlledStage: boolean) {
  const fixtureScale = controlledStage ? 1.36 : 1;
  const base = item.kind === "mountain" ? 8.6 : item.kind === "rock" ? 4.4 : 2.4;
  const sizeScale = item.kind === "mountain" ? 0.44 : item.kind === "rock" ? 0.34 : 0.22;
  return Math.max(base, item.size * sizeScale) * fixtureScale;
}

function distanceToSegment(x: number, y: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy || 1;
  const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / lenSq, 0, 1);
  const px = a[0] + dx * t;
  const py = a[1] + dy * t;
  return Math.hypot(x - px, y - py);
}

function hash2(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
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
