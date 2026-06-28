import { CampaignCloudPass, CampaignFogPass, type CampaignFogSource } from '../../../packages/game-renderer/src/campaign/atmospherePass';
import { CampaignEntityPass, type CampaignEntityInstance } from '../../../packages/game-renderer/src/campaign/entityPass';
import { buildCampaignMapDrawData, CampaignLabelPass, type CampaignLabelPassStats, CampaignMapPass, CampaignMarkerPass, CampaignRoadPass, CampaignWorldLinePass, type CampaignLabel, type CampaignMarker } from '../../../packages/game-renderer/src/campaign/mapPass';
import { CampaignSceneryPass, type CampaignSceneryInstance } from '../../../packages/game-renderer/src/campaign/sceneryPass';
import { CampaignSelectionPass, type CampaignSelectionInstance } from '../../../packages/game-renderer/src/campaign/selectionPass';
import { campaignBorderVertices, CampaignTerritoryPass } from '../../../packages/game-renderer/src/campaign/territoryPass';
import { createFrameShell, type FrameGraphPass, type RawFrameShell, type WorldRenderPass } from '../../../packages/webgpu-core/src/frameShell';
import { screenToWorld, world3dToScreen } from '../../../packages/webgpu-core/src/cameraUniform';
import type { CampaignData } from './data';
import type { CamView } from './camera';
import { Allegiance } from './status';
import type { TerrainField } from './terrain';
import { campaignSurface, type CampaignSurface } from './surface';
import { type FactionLabel, type Territory } from './territory';
import type { ArmyView, CityView } from './views';

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
}

export class CampaignRendererWebGPU {
  readonly ready: Promise<void>;
  readonly pitch = CAMPAIGN_CLOSE_PITCH;
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
  private selection: CampaignSelectionPass | null = null;
  private labels: CampaignLabelPass | null = null;
  private surface: CampaignSurface;
  private staticLabels: CampaignLabel[] = [];
  private labelStats: CampaignLabelPassStats = {
    labels: 0,
    visibleLabels: 0,
    atlasWidth: 0,
    atlasHeight: 0,
    vertices: 0,
    layer: 'raw-webgpu-glyph-atlas',
  };
  private lastEntities = { cityEntities: 0, armyEntities: 0 };
  private lastFog = { enabled: false, sources: [] as CampaignFogSource[] };
  private lastFactionView = false;
  private lastLabelComposition = { composedArmyCityLabels: 0 };
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
    window.addEventListener('resize', this.onResize);
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
      ? Math.max(cssW / (rect.max[0] - rect.min[0]), cssH / (rect.max[1] - rect.min[1])) * (window.devicePixelRatio || 1)
      : Math.max(cssW / (rect.max[0] - rect.min[0]), cssH / ((rect.max[1] - rect.min[1]) * cosP)) * (window.devicePixelRatio || 1);
    const minZoom = controlled ? fillZoom * 0.78 : fillZoom;
    const maxZoom = controlled ? Math.max(8, minZoom * 2.2) : 8;
    cam.scale = Math.max(minZoom, Math.min(maxZoom, cam.scale));
    const halfW = (this.canvas.width || cssW) / (2 * cam.scale);
    const halfH = (this.canvas.height || cssH) / (2 * cam.scale * cosP);
    if (controlled) {
      cam.x = clampControlledAxis(cam.x, rect.min[0], rect.max[0], halfW);
      cam.y = clampControlledAxis(cam.y, rect.min[1], rect.max[1], halfH);
    } else {
      cam.x = clamp(cam.x, rect.min[0] + halfW, rect.max[0] - halfW);
      cam.y = clamp(cam.y, rect.min[1] + halfH, rect.max[1] - halfH);
    }
  }

  toScreen(wx: number, wy: number): [number, number] {
    const stats = this.shell?.stats();
    return world3dToScreen({
      x: this.currentCamera.x,
      y: this.currentCamera.y,
      zoom: this.currentCamera.zoom,
      pitch: this.currentCamera.pitch,
      yaw: 0,
      perspective: this.currentCamera.perspective,
      width: stats?.width ?? this.canvas.width,
      height: stats?.height ?? this.canvas.height,
    }, wx, wy, this.surface.heightAt(wx, wy));
  }

  toWorld(sx: number, sy: number): [number, number] {
    return screenToWorld({
      ...this.currentCamera,
      width: this.canvas.width || 1,
      height: this.canvas.height || 1,
    }, sx, sy);
  }

  updateTerritory(territory: Territory) {
    if (!this.territoryPass || !this.borders) return;
    this.territoryPass.upload({
      width: this.field.w,
      height: this.field.h,
      rgba: territory.rgba,
      rect: this.data.bgRect,
    });
    this.borders.upload(campaignBorderVertices(territory.borders));
  }

  draw(opts: DrawOptions) {
    if (!this.shell || !this.map || !this.clouds || !this.fog || !this.territoryPass || !this.lines || !this.roads || !this.borders || !this.markers || !this.scenery || !this.entities || !this.selection || !this.labels) return;
    const frameStart = performance.now();
    this.lastFactionView = opts.factionView;
    this.currentCamera = { x: opts.cam.x, y: opts.cam.y, zoom: opts.cam.scale, pitch: this.pitchForScale(opts.cam.scale), yaw: 0, perspective: campaignPerspective(opts.cam.scale) };
    this.shell.setCamera(this.currentCamera);
    const buildStart = performance.now();
    const frame = buildEntityFrame(this.data, this.field, opts);
    const buildEnd = performance.now();
    this.lastEntities = { cityEntities: frame.cityEntities, armyEntities: frame.armyEntities };
    const uploadStart = performance.now();
    this.scenery.upload(campaignScenery(this.data, this.field, campaignSceneryReservations(frame.entities)));
    this.entities.upload(frame.entities);
    this.selection.upload(frame.selections);
    this.markers.upload(campaignMapMarkers(this.data, opts));
    this.lastFog = { enabled: opts.fogOfWar, sources: opts.visionSources };
    this.fog.upload(opts.visionSources, opts.fogOfWar);
    const staticLabels = opts.fogOfWar ? [] : this.staticLabels;
    const cityLabels = campaignCityLabels(this.data, opts);
    const armyLabels = campaignArmyLabels(this.data, opts);
    const factionLabels = campaignFactionLabels(this.data, opts);
    this.lastLabelComposition = {
      composedArmyCityLabels: armyLabels.filter((label) => label.subText).length,
    };
    this.labelStats = this.labels.upload(staticLabels.concat(cityLabels, armyLabels, factionLabels), this.currentCamera);
    const uploadEnd = performance.now();
    const drawStart = performance.now();
    const passes: FrameGraphPass[] = [
      { id: 'campaign-map-surface', role: 'world-depth-fill', phase: 'world-depth', depth: 'write', draw: (pass) => this.map!.draw(pass) },
      { id: 'campaign-scenery-opaque', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => this.scenery!.drawOpaque(pass) },
      { id: 'campaign-entities-opaque', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => this.entities!.drawOpaque(pass) },
      ...(opts.factionView ? [{ id: 'campaign-territory-wash', role: 'world-decal' as const, phase: 'world-depth' as const, depth: 'read' as const, draw: (pass: WorldRenderPass) => this.territoryPass!.draw(pass) }] : []),
      ...(opts.factionView && !isControlledStage(this.data) ? [{ id: 'campaign-borders', role: 'world-decal' as const, phase: 'world-depth' as const, depth: 'read' as const, draw: (pass: WorldRenderPass) => this.borders!.draw(pass) }] : []),
      { id: 'campaign-scenery-shadows', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => this.scenery!.drawShadows(pass) },
      { id: 'campaign-entity-shadows', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => this.entities!.drawShadows(pass) },
      { id: 'campaign-roads', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => this.roads!.draw(pass) },
      { id: 'campaign-sea-lanes-depth', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => this.lines!.draw(pass) },
      { id: 'campaign-ground-selection', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => this.selection!.draw(pass) },
      { id: 'campaign-clouds', role: 'overlay-effect', phase: 'overlay', draw: (pass) => this.clouds!.draw(pass) },
      { id: 'campaign-fog-of-war', role: 'overlay-effect', phase: 'overlay', draw: (pass) => this.fog!.draw(pass) },
      { id: 'campaign-markers', role: 'overlay-ui', phase: 'overlay', draw: (pass) => this.markers!.draw(pass) },
      { id: 'campaign-labels', role: 'overlay-ui', phase: 'overlay', draw: (pass) => this.labels!.draw(pass) },
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

  destroy() {
    window.removeEventListener('resize', this.onResize);
    this.shell?.destroy();
    this.shell = null;
    publishStats(this.stats());
  }

  stats() {
    const shell = this.shell?.stats();
    return {
      renderer: 'webgpu-campaign',
      ready: this.shell !== null,
      width: shell?.width ?? 0,
      height: shell?.height ?? 0,
      device: shell?.device ?? 'initializing',
      cameraContract: shell?.cameraContract ?? 'initializing',
      ...this.lastEntities,
      labels: this.labelStats.labels,
      visibleLabels: this.labelStats.visibleLabels,
      ...this.lastLabelComposition,
      labelLayer: this.labelStats.layer,
      labelAtlas: `${this.labelStats.atlasWidth}x${this.labelStats.atlasHeight}`,
      labelVertices: this.labelStats.vertices,
      waterFeatures: 0,
      waterLayer: 'map-sea-mask',
      cloudQuads: this.clouds?.stats().cloudQuads ?? 0,
      fogEnabled: this.fog?.stats().fogEnabled ?? false,
      fogSources: this.fog?.stats().fogSources ?? 0,
      factionView: this.lastFactionView,
      territoryPixels: this.territoryPass?.stats().pixels ?? 0,
      borderSegments: this.borders?.stats().segments ?? 0,
      mapMarkers: this.markers?.stats().markers ?? 0,
      scenery: this.scenery?.stats().scenery ?? 0,
      lineSegments: this.lines?.stats().segments ?? 0,
      roadTriangles: this.roads?.stats().triangles ?? 0,
      phases: shell?.phases ?? [],
      depth: shell?.depth ?? null,
      postCutoverScreenshots: 'webgpu-only',
      performance: { ...this.framePerf },
    };
  }

  private currentCamera = { x: 0, y: 0, zoom: 0.18, pitch: this.pitch, yaw: 0, perspective: 0 };

  private async init(territory: Territory) {
    this.shell = await createFrameShell(this.canvas);
    const controlledStage = isControlledStage(this.data);
    this.map = new CampaignMapPass(this.shell, this.data.bg, this.data.bgRect, controlledStage ? undefined : { seaTintMix: 1 }, this.surface.mesh);
    this.clouds = new CampaignCloudPass(this.shell, this.data.bgRect, controlledStage ? 0.75 : 2.05);
    this.fog = new CampaignFogPass(this.shell, this.data.bgRect);
    this.territoryPass = new CampaignTerritoryPass(this.shell, {
      width: this.field.w,
      height: this.field.h,
      rgba: territory.rgba,
      rect: this.data.bgRect,
    }, controlledStage ? undefined : { alpha: 0.55, warmMix: 0.015 }, this.surface.mesh);
    this.lines = new CampaignWorldLinePass(this.shell, 'triangle-list');
    this.roads = new CampaignRoadPass(this.shell);
    this.borders = new CampaignWorldLinePass(this.shell);
    this.markers = new CampaignMarkerPass(this.shell);
    this.scenery = new CampaignSceneryPass(this.shell);
    this.entities = new CampaignEntityPass(this.shell);
    this.selection = new CampaignSelectionPass(this.shell);
    this.labels = new CampaignLabelPass(this.shell);
    const drawData = buildCampaignMapDrawData(this.data, {
      roadScale: 0.78,
      ...(controlledStage ? { roadEndpointInset: 8.2 } : {}),
      roadSurfaceAt: (x, y) => this.field.landAt(x, y, controlledStage ? 2.5 : 10.5) ? 'land' : 'water',
      heightAt: (x, y) => this.field.heightAt(x, y),
    });
    this.staticLabels = drawData.labels;
    this.lines.upload(drawData.lineVertices);
    this.roads.upload(drawData.roadMeshVertices);
    this.borders.upload(controlledStage ? new Float32Array() : campaignBorderVertices(territory.borders));
    publishStats(this.stats());
  }
}

function roundMs(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}

const CAMPAIGN_CLOSE_PITCH = 0.82;

function campaignPitch(zoom: number) {
  const t = smoothstep(0.62, 1.6, zoom);
  return CAMPAIGN_CLOSE_PITCH * t;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function campaignPerspective(zoom: number) {
  return Math.min(0.0048, Math.max(0, (zoom - 1.0) * 0.0032));
}

function buildEntityFrame(data: CampaignData, field: TerrainField, opts: DrawOptions) {
  const entities: CampaignEntityInstance[] = [];
  const selections: CampaignSelectionInstance[] = [];
  let cityEntities = 0;
  let armyEntities = 0;
  const fixtureScale = isControlledStage(data) ? 1.82 : 1;
  for (let node = 0; node < data.map.nodes.length; node++) {
    const mapNode = data.map.nodes[node];
    if (mapNode.kind !== 'city') continue;
    if (!fogVisible(opts, mapNode.pos[0], mapNode.pos[1], 0.18)) continue;
    const city = opts.cities.get(node);
    const owner = city?.owner ?? Math.max(0, data.map.factions.findIndex((faction) => faction.id === mapNode.owner));
    const allegiance = statusOf(opts.factionStatus, owner);
    entities.push({
      x: mapNode.pos[0],
      y: mapNode.pos[1],
      z: field.heightAt(mapNode.pos[0], mapNode.pos[1]),
      radius: (mapNode.tier >= 3 ? 6.2 : 5.2) * fixtureScale,
      faction: factionColor(data, owner),
      allegiance: allegianceColor(allegiance),
      kind: 'city',
      strength: Math.min(1, (city?.garrison ?? 600) / 1200),
    });
    cityEntities++;
    if (node === opts.selectedCity) {
      selections.push({
        x: mapNode.pos[0],
        y: mapNode.pos[1],
        z: field.heightAt(mapNode.pos[0], mapNode.pos[1]),
        radius: (mapNode.tier >= 3 ? 10.8 : 9.4) * fixtureScale,
        color: [0.31, 0.82, 0.39],
        kind: 'city',
      });
    }
  }
  for (const army of opts.armies) {
    if (opts.fogOfWar && !army.mine && statusOf(opts.factionStatus, army.faction) !== Allegiance.Foe) continue;
    const allegiance = army.mine || army.faction === opts.playerFaction ? Allegiance.Friend : statusOf(opts.factionStatus, army.faction);
    entities.push({
      x: army.x,
      y: army.y,
      z: field.heightAt(army.x, army.y),
      radius: 6.4 * fixtureScale,
      faction: factionColor(data, army.faction),
      allegiance: allegianceColor(allegiance),
      kind: 'army',
      strength: Math.min(1, Math.max(0.25, army.soldiers / 2600)),
    });
    armyEntities++;
    if (army.id === opts.selected) {
      const controlledStage = isControlledStage(data);
      const selectionRadius = controlledStage ? 8.4 * fixtureScale : 12.6 * fixtureScale;
      selections.push({
        x: army.x,
        y: army.y,
        z: field.heightAt(army.x, army.y),
        radius: selectionRadius,
        color: [0.31, 0.82, 0.39],
        kind: 'army',
      });
    }
  }
  return { entities, selections, cityEntities, armyEntities };
}

const CITY_MARKER_BASE_RADIUS_PX = 3.8;
const CITY_MARKER_TIER_RADIUS_PX = 0.7;

function campaignMapMarkers(data: CampaignData, opts: DrawOptions): CampaignMarker[] {
  if (isControlledStage(data) || opts.cam.scale >= 0.5) return [];
  const markers: CampaignMarker[] = [];
  data.map.nodes.forEach((node, index) => {
    if (node.kind !== 'city') return;
    const minTier = opts.cam.scale < 0.6 ? 3 : opts.cam.scale < 0.85 ? 2 : 1;
    if (node.tier < minTier) return;
    if (!fogVisible(opts, node.pos[0], node.pos[1], 0.18)) return;
    const city = opts.cities.get(index);
    const owner = city?.owner ?? Math.max(0, data.map.factions.findIndex((faction) => faction.id === node.owner));
    const allegiance = opts.factionView ? statusOf(opts.factionStatus, owner) : Allegiance.Neutral;
    markers.push({
      x: node.pos[0],
      y: node.pos[1],
      radius: cityMarkerRadiusPx(node.tier),
      faction: opts.factionView ? factionColor(data, owner) : [0.16, 0.12, 0.08],
      allegiance: allegianceColor(allegiance),
      kind: 'city',
      selected: index === opts.selectedCity,
    });
  });
  for (const army of visibleCampaignArmies(opts)) {
    const allegiance = army.mine || army.faction === opts.playerFaction ? Allegiance.Friend : statusOf(opts.factionStatus, army.faction);
    markers.push({
      x: army.x,
      y: army.y,
      radius: army.id === opts.selected ? 10.5 : 9,
      faction: factionColor(data, army.faction),
      allegiance: allegianceColor(allegiance),
      kind: 'army',
      selected: army.id === opts.selected,
    });
  }
  return markers;
}

function statusOf(status: Int8Array, faction: number): Allegiance {
  return faction >= 0 && faction < status.length ? status[faction] as Allegiance : Allegiance.Neutral;
}

function factionColor(data: CampaignData, faction: number): [number, number, number] {
  const color = data.map.factions[faction]?.color ?? [146, 126, 92];
  return [color[0] / 255, color[1] / 255, color[2] / 255];
}

function allegianceColor(allegiance: Allegiance): [number, number, number] {
  if (allegiance === Allegiance.Friend) return [0.31, 0.82, 0.39];
  if (allegiance === Allegiance.Foe) return [0.88, 0.27, 0.23];
  return [0.93, 0.78, 0.30];
}

function campaignCityLabels(data: CampaignData, opts: DrawOptions): CampaignLabel[] {
  const edge = mapEdgeProjector(data);
  const occupiedCities = occupiedCityLabels(data, opts);
  const labels: CampaignLabel[] = [];
  data.map.nodes.forEach((node, index) => {
    if (node.kind !== 'city') return;
    if (occupiedCities.has(index)) return;
    if (!fogVisible(opts, node.pos[0], node.pos[1], 0.18)) return;
    const city = opts.cities.get(index);
    const owner = city?.owner ?? Math.max(0, data.map.factions.findIndex((faction) => faction.id === node.owner));
    const allegiance = opts.factionView ? statusOf(opts.factionStatus, owner) : Allegiance.Neutral;
    const baseSize = Math.min(15, 9.5 + opts.cam.scale) * (node.tier >= 3 ? 1.15 : 1);
    const overviewMarkerLabel = opts.cam.scale < 0.6;
    labels.push({
      text: node.name.toUpperCase(),
      x: node.pos[0],
      y: node.pos[1],
      kind: 'city',
      size: baseSize,
      priority: node.tier,
      icon: 'city',
      iconColor: allegianceColor(allegiance),
      screenOffsetX: cityLabelOffsetX(opts, node.tier) + horizontalEdgeOffset(edge.x(node.pos[0])),
      screenOffsetY: cityLabelOffset(opts, baseSize, false, node.tier) + verticalEdgeOffset(edge.y(node.pos[1])),
      screenAnchorX: overviewMarkerLabel ? 'left' : 'center',
      screenAnchorY: overviewMarkerLabel ? 'top' : 'center',
    });
  });
  return labels;
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
  return visibleCampaignArmies(opts).map((army): CampaignLabel => {
    const allegiance = army.mine || army.faction === opts.playerFaction ? Allegiance.Friend : statusOf(opts.factionStatus, army.faction);
    const markerSize = army.id === opts.selected ? 13 : 11;
    const occupiedCity = occupiedCityForArmy(data, army);
    const cityOverlap = occupiedCity !== null;
    const selectedOffset = army.id === opts.selected && isControlledStage(data) ? 28 : 0;
    const overlapClearance = cityOverlap ? (opts.cam.scale >= 3 ? 44 : 38) : 24;
    return {
      text: `${ordinal(ordinalOf.get(army.id) ?? 1)} LEGION`,
      sideText: `${Math.round(army.soldiers / 100) / 10}k`,
      subText: occupiedCity?.name.toUpperCase(),
      x: army.x,
      y: army.y,
      kind: 'army',
      size: Math.min(14, 9 + opts.cam.scale),
      priority: 4,
      icon: 'army',
      iconColor: allegianceColor(allegiance),
      screenOffsetY: markerSize + selectedOffset + overlapClearance,
    };
  });
}

function occupiedCityLabels(data: CampaignData, opts: DrawOptions) {
  const occupied = new Set<number>();
  for (const army of visibleCampaignArmies(opts)) {
    const match = occupiedCityForArmy(data, army);
    if (match) occupied.add(match.index);
  }
  return occupied;
}

function occupiedCityForArmy(data: CampaignData, army: ArmyView) {
  let best: { index: number; name: string; d: number } | null = null;
  for (let index = 0; index < data.map.nodes.length; index++) {
    const node = data.map.nodes[index];
    if (node.kind !== 'city') continue;
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

function cityLabelOffset(opts: DrawOptions, baseSize: number, hasArmy: boolean, tier: number) {
  if (opts.cam.scale < 0.6) return cityMarkerOuterEdgePlusSidePx(tier);
  const armyOffset = hasArmy ? baseSize * 1.5 : 0;
  if (opts.cam.scale < 1.25) return 18 + armyOffset;
  return Math.max(30, baseSize * 1.9) + armyOffset;
}

function cityLabelOffsetX(opts: DrawOptions, tier: number) {
  if (opts.cam.scale >= 0.6) return 0;
  return cityMarkerOuterEdgePlusSidePx(tier);
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

function ordinal(k: number) {
  const value = k % 100;
  const suffix = value >= 11 && value <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][k % 10] ?? 'th');
  return `${k}${suffix}`;
}

function campaignFactionLabels(data: CampaignData, opts: DrawOptions): CampaignLabel[] {
  if (!opts.factionView) return [];
  const edge = mapEdgeProjector(data);
  return opts.factionLabels
    .filter((label) => !opts.fogOfWar || fogVisible(opts, label.x, label.y, 0.14))
    .map((label): CampaignLabel => ({
      text: label.name,
      x: label.x,
      y: label.y,
      kind: 'faction',
      size: label.minor ? 9 : 17,
      priority: 4,
      angle: -0.06,
      factionRadiusKm: label.radiusKm,
      factionMinor: label.minor,
      screenOffsetX: horizontalEdgeOffset(edge.x(label.x)),
      screenOffsetY: verticalEdgeOffset(edge.y(label.y)),
    }));
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
  if (t > rightStart) return -LABEL_EDGE_OFFSET_X * Math.min(1, (t - rightStart) / LABEL_EDGE_INSET_RANGE_X);
  if (t < LABEL_EDGE_INSET_START_X) return LABEL_EDGE_OFFSET_X * Math.min(1, (LABEL_EDGE_INSET_START_X - t) / LABEL_EDGE_INSET_RANGE_X);
  return 0;
}

function verticalEdgeOffset(t: number) {
  const topStart = 1 - LABEL_EDGE_INSET_START_Y;
  if (t > topStart) return LABEL_EDGE_OFFSET_Y * Math.min(1, (t - topStart) / LABEL_EDGE_INSET_RANGE_Y);
  if (t < LABEL_EDGE_INSET_START_Y) return -LABEL_EDGE_OFFSET_Y * Math.min(1, (LABEL_EDGE_INSET_START_Y - t) / LABEL_EDGE_INSET_RANGE_Y);
  return 0;
}

function campaignScenery(data: CampaignData, field: TerrainField, reservations: CampaignSceneryReservation[] = []): CampaignSceneryInstance[] {
  if (data.map.attribution === 'test') return testStageScenery(data, reservations);
  const out: CampaignSceneryInstance[] = [];
  const step = 5;
  for (let gy = 0; gy < field.h; gy += step) {
    for (let gx = 0; gx < field.w; gx += step) {
      const i = gy * field.w + gx;
      if (!field.land[i]) continue;
      const x = field.minX + (gx + 0.5) * field.cell + (hash2(gx, gy) - 0.5) * field.cell * 4;
      const y = field.maxY - (gy + 0.5) * field.cell + (hash2(gx + 7, gy + 11) - 0.5) * field.cell * 4;
      const rock = field.biome[i * 4 + 2] / 255;
      const forest = field.biome[i * 4 + 1] / 255;
      const height = field.height[i] / Math.max(1, field.maxH);
      if (height > 0.32 && hash2(gx * 3, gy * 5) < height * 0.72) {
        out.push({ x, y, size: 6.0 + height * 10.0, kind: 'mountain' });
      } else if (forest > 0.24 && hash2(gx * 5, gy * 9) < forest * 0.8) {
        out.push({ x, y, size: 2.8 + forest * 4.2, kind: hash2(gx + 19, gy + 23) > 0.42 ? 'broadleaf' : 'conifer' });
      } else if (rock > 0.26 && hash2(gx * 11, gy * 3) < rock * 0.65) {
        out.push({ x, y, size: 2.4 + rock * 4.0, kind: 'rock' });
      }
      if (out.length > 900) return clearCampaignBlockingScenery(data, out, reservations);
    }
  }
  return clearCampaignBlockingScenery(data, out, reservations);
}

function testStageScenery(data: CampaignData, reservations: CampaignSceneryReservation[]): CampaignSceneryInstance[] {
  const [x0, y0] = data.bgRect.min;
  const [x1, y1] = data.bgRect.max;
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;
  const items: CampaignSceneryInstance[] = [
    { x: cx - 34, y: y1 - 5, size: 13.2, kind: 'mountain' },
    { x: cx - 26, y: y1 - 2, size: 11.6, kind: 'mountain' },
    { x: cx - 16, y: y1 - 6, size: 12.4, kind: 'mountain' },
    { x: cx - 5, y: y1 - 3, size: 13.8, kind: 'mountain' },
    { x: cx + 18, y: y1 - 7, size: 11.8, kind: 'mountain' },
    { x: cx + 32, y: y1 - 5, size: 12.8, kind: 'mountain' },
    { x: cx - 10, y: cy + 7, size: 9.8, kind: 'mountain' },
    { x: cx + 10, y: cy + 7, size: 9.1, kind: 'mountain' },
    { x: cx - 5, y: cy - 1, size: 10.6, kind: 'mountain' },
    { x: cx + 21, y: cy - 1, size: 9.2, kind: 'mountain' },
    { x: cx + 33, y: cy - 4, size: 9.8, kind: 'mountain' },
    { x: x0 + 31, y: y0 + 9, size: 9.8, kind: 'rock' },
    { x: x0 + 43, y: y0 + 7, size: 10.8, kind: 'rock' },
    { x: x1 - 30, y: y0 + 8, size: 10.2, kind: 'rock' },
    { x: x1 - 15, y: y0 + 13, size: 8.6, kind: 'rock' },
    { x: x1 - 5, y: y0 + 6, size: 12.2, kind: 'rock' },
    { x: cx - 17, y: cy - 15, size: 7.4, kind: 'rock' },
    { x: cx - 4, y: cy - 18, size: 7.9, kind: 'rock' },
    { x: cx + 18, y: cy - 16, size: 7.1, kind: 'rock' },
    { x: cx + 32, y: cy - 10, size: 8.1, kind: 'rock' },
    { x: cx - 18, y: cy + 2, size: 6.6, kind: 'conifer' },
    { x: cx + 24, y: cy + 2, size: 6.2, kind: 'broadleaf' },
    { x: cx + 12, y: cy - 6, size: 5.8, kind: 'broadleaf' },
    { x: cx + 28, y: cy - 7, size: 5.4, kind: 'conifer' },
    { x: cx - 30, y: cy - 9, size: 5.8, kind: 'conifer' },
  ];
  for (let i = 0; i < 32; i++) {
    const x = x0 + 6 + hash2(i * 13, 4) * (x1 - x0 - 12);
    const y = y0 + 5 + hash2(5, i * 17) * (y1 - y0 - 10);
    if (Math.abs(y - cy) < 5 && Math.abs(x - cx) < 34) continue;
    const near = y < cy - 8 ? 1.18 : 1.0;
    items.push({ x, y, size: (3.2 + hash2(i, i + 9) * 2.8) * near, kind: hash2(i, i + 31) > 0.45 ? 'broadleaf' : 'conifer' });
  }
  return clearCampaignBlockingScenery(data, items, reservations);
}

interface CampaignSceneryReservation {
  x: number;
  y: number;
  radius: number;
}

function campaignSceneryReservations(entities: CampaignEntityInstance[]): CampaignSceneryReservation[] {
  return entities.map((entity) => ({
    x: entity.x,
    y: entity.y,
    radius: entity.radius * (entity.kind === 'city' ? 1.15 : 2.45),
  }));
}

function clearCampaignBlockingScenery(data: CampaignData, items: CampaignSceneryInstance[], reservations: CampaignSceneryReservation[]) {
  const roadSegments = data.map.edges
    .filter((edge) => edge.kind === 'road')
    .flatMap((edge) => edge.via.slice(1).map((point, index): [[number, number], [number, number]] => [edge.via[index], point]));
  const cityFootprints = data.map.nodes
    .filter((node) => node.kind === 'city')
    .map((node) => ({
      x: node.pos[0],
      y: node.pos[1],
      radius: citySceneryClearance(node.tier ?? 1, isControlledStage(data)),
    }));
  return items.filter((item) => {
    const propRadius = item.size * (item.kind === 'mountain' ? 0.38 : item.kind === 'rock' ? 0.32 : 0.24);
    if (cityFootprints.some((city) => Math.hypot(item.x - city.x, item.y - city.y) < city.radius + propRadius)) return false;
    if (reservations.some((entity) => Math.hypot(item.x - entity.x, item.y - entity.y) < entity.radius + propRadius)) return false;
    const clearance = roadSceneryClearance(item, isControlledStage(data));
    return !roadSegments.some(([a, b]) => distanceToSegment(item.x, item.y, a, b) < clearance);
  });
}

function citySceneryClearance(tier: number, controlledStage: boolean) {
  const fixtureScale = controlledStage ? 1.82 : 1;
  return (tier >= 3 ? 12.0 : 10.5) * fixtureScale;
}

function roadSceneryClearance(item: CampaignSceneryInstance, controlledStage: boolean) {
  const fixtureScale = controlledStage ? 1.36 : 1;
  const base = item.kind === 'mountain' || item.kind === 'rock' ? 5.8 : 3.4;
  const sizeScale = item.kind === 'mountain' || item.kind === 'rock' ? 0.52 : 0.38;
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

function isControlledStage(data: CampaignData) {
  return data.map.attribution === 'test' || data.map.attribution.endsWith('-test');
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

function publishStats(stats: ReturnType<CampaignRendererWebGPU['stats']>) {
  (window as unknown as { __campaignWebGPUStats?: unknown }).__campaignWebGPUStats = stats;
}
