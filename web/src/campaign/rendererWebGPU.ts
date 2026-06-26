import { campaignWaterFeatures, CampaignCloudPass, CampaignWaterPass } from '../../../packages/game-renderer/src/campaign/atmospherePass';
import { CampaignEntityPass, type CampaignEntityInstance } from '../../../packages/game-renderer/src/campaign/entityPass';
import { buildCampaignMapDrawData, CampaignLabelPass, type CampaignLabelPassStats, CampaignLinePass, CampaignMapPass, type CampaignLabel } from '../../../packages/game-renderer/src/campaign/mapPass';
import { CampaignSceneryPass, type CampaignSceneryInstance } from '../../../packages/game-renderer/src/campaign/sceneryPass';
import { CampaignSelectionPass, type CampaignSelectionInstance } from '../../../packages/game-renderer/src/campaign/selectionPass';
import { campaignBorderVertices, CampaignTerritoryPass } from '../../../packages/game-renderer/src/campaign/territoryPass';
import { createFrameShell, type RawFrameShell } from '../../../packages/webgpu-core/src/frameShell';
import { worldToScreen } from '../../../packages/webgpu-core/src/cameraUniform';
import type { CampaignData } from './data';
import type { CamView } from './camera';
import { Allegiance } from './status';
import type { TerrainField } from './terrain';
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
}

export class CampaignRendererWebGPU {
  readonly ready: Promise<void>;
  readonly pitch = 0.66;
  fixedTime: number | null = null;

  private shell: RawFrameShell | null = null;
  private map: CampaignMapPass | null = null;
  private water: CampaignWaterPass | null = null;
  private clouds: CampaignCloudPass | null = null;
  private territoryPass: CampaignTerritoryPass | null = null;
  private lines: CampaignLinePass | null = null;
  private borders: CampaignLinePass | null = null;
  private scenery: CampaignSceneryPass | null = null;
  private entities: CampaignEntityPass | null = null;
  private selection: CampaignSelectionPass | null = null;
  private labels: CampaignLabelPass | null = null;
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
    const fillZoom = Math.max(cssW / (rect.max[0] - rect.min[0]), cssH / (rect.max[1] - rect.min[1])) * (window.devicePixelRatio || 1);
    const minZoom = isControlledStage(this.data) ? fillZoom * 0.78 : fillZoom;
    cam.scale = Math.max(minZoom, Math.min(8, cam.scale));
    const cosP = Math.max(0.2, Math.cos(this.pitch));
    const halfW = (this.canvas.width || cssW) / (2 * cam.scale);
    const halfH = (this.canvas.height || cssH) / (2 * cam.scale * cosP);
    cam.x = clamp(cam.x, rect.min[0] + halfW, rect.max[0] - halfW);
    cam.y = clamp(cam.y, rect.min[1] + halfH, rect.max[1] - halfH);
  }

  toScreen(wx: number, wy: number): [number, number] {
    const stats = this.shell?.stats();
    return worldToScreen({
      x: this.currentCamera.x,
      y: this.currentCamera.y,
      zoom: this.currentCamera.zoom,
      pitch: this.currentCamera.pitch,
      yaw: 0,
      width: stats?.width ?? this.canvas.width,
      height: stats?.height ?? this.canvas.height,
    }, wx, wy);
  }

  toWorld(sx: number, sy: number): [number, number] {
    const zoom = Math.max(0.0001, this.currentCamera.zoom);
    const cosP = Math.max(0.2, Math.cos(this.currentCamera.pitch));
    const width = this.canvas.width || 1;
    const height = this.canvas.height || 1;
    return [
      this.currentCamera.x + (sx - width * 0.5) / zoom,
      this.currentCamera.y - (sy - height * 0.5) / (zoom * cosP),
    ];
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
    if (!this.shell || !this.map || !this.water || !this.clouds || !this.territoryPass || !this.lines || !this.borders || !this.scenery || !this.entities || !this.selection || !this.labels) return;
    const frameStart = performance.now();
    this.currentCamera = { x: opts.cam.x, y: opts.cam.y, zoom: opts.cam.scale, pitch: this.pitch, yaw: 0 };
    this.shell.setCamera(this.currentCamera);
    const buildStart = performance.now();
    const frame = buildEntityFrame(this.data, opts);
    const buildEnd = performance.now();
    this.lastEntities = { cityEntities: frame.cityEntities, armyEntities: frame.armyEntities };
    const uploadStart = performance.now();
    this.scenery.upload(campaignScenery(this.data, this.field));
    this.entities.upload(frame.entities);
    this.selection.upload(frame.selections);
    this.labelStats = this.labels.upload(
      this.staticLabels.concat(campaignArmyLabels(opts.armies), campaignFactionLabels(opts.factionLabels)),
      this.currentCamera,
    );
    const uploadEnd = performance.now();
    const drawStart = performance.now();
    this.shell.drawFrame({
      clear: { r: 0.06, g: 0.07, b: 0.075, a: 1 },
      terrainRect: [0, 0, 0, 0],
      extra: (pass) => {
        this.map!.draw(pass);
        this.territoryPass!.draw(pass);
        this.water!.draw(pass);
        if (!isControlledStage(this.data)) this.borders!.draw(pass);
        this.lines!.draw(pass);
        this.scenery!.draw(pass);
        this.selection!.draw(pass);
        this.entities!.draw(pass);
        this.clouds!.draw(pass);
        this.labels!.draw(pass);
      },
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

  visibleAt(_x: number, _y: number) {
    return 1;
  }

  territoryAlpha(_scale: number) {
    return 1;
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
      ...this.lastEntities,
      labels: this.labelStats.labels,
      visibleLabels: this.labelStats.visibleLabels,
      labelLayer: this.labelStats.layer,
      labelAtlas: `${this.labelStats.atlasWidth}x${this.labelStats.atlasHeight}`,
      labelVertices: this.labelStats.vertices,
      waterFeatures: this.water?.stats().waterFeatures ?? 0,
      cloudQuads: this.clouds?.stats().cloudQuads ?? 0,
      territoryPixels: this.territoryPass?.stats().pixels ?? 0,
      borderSegments: this.borders?.stats().segments ?? 0,
      scenery: this.scenery?.stats().scenery ?? 0,
      lineSegments: this.lines?.stats().segments ?? 0,
      postCutoverScreenshots: 'webgpu-only',
      performance: { ...this.framePerf },
    };
  }

  private currentCamera = { x: 0, y: 0, zoom: 0.18, pitch: this.pitch, yaw: 0 };

  private async init(territory: Territory) {
    this.shell = await createFrameShell(this.canvas);
    this.map = new CampaignMapPass(this.shell, this.data.bg, this.data.bgRect);
    this.water = new CampaignWaterPass(this.shell);
    this.water.upload(campaignWaterFeatures());
    this.clouds = new CampaignCloudPass(this.shell, this.data.bgRect);
    this.territoryPass = new CampaignTerritoryPass(this.shell, {
      width: this.field.w,
      height: this.field.h,
      rgba: territory.rgba,
      rect: this.data.bgRect,
    });
    this.lines = new CampaignLinePass(this.shell);
    this.borders = new CampaignLinePass(this.shell);
    this.scenery = new CampaignSceneryPass(this.shell);
    this.entities = new CampaignEntityPass(this.shell);
    this.selection = new CampaignSelectionPass(this.shell);
    this.labels = new CampaignLabelPass(this.shell);
    const drawData = buildCampaignMapDrawData(this.data);
    this.staticLabels = drawData.labels;
    this.lines.upload(drawData.roadVertices);
    this.borders.upload(isControlledStage(this.data) ? new Float32Array() : campaignBorderVertices(territory.borders));
    publishStats(this.stats());
  }
}

function roundMs(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}

function buildEntityFrame(data: CampaignData, opts: DrawOptions) {
  const entities: CampaignEntityInstance[] = [];
  const selections: CampaignSelectionInstance[] = [];
  let cityEntities = 0;
  let armyEntities = 0;
  const fixtureScale = isControlledStage(data) ? 1.82 : 1;
  for (let node = 0; node < data.map.nodes.length; node++) {
    const mapNode = data.map.nodes[node];
    if (mapNode.kind !== 'city') continue;
    const city = opts.cities.get(node);
    const owner = city?.owner ?? Math.max(0, data.map.factions.findIndex((faction) => faction.id === mapNode.owner));
    const allegiance = statusOf(opts.factionStatus, owner);
    entities.push({
      x: mapNode.pos[0],
      y: mapNode.pos[1],
      radius: (mapNode.tier >= 3 ? 6.2 : 5.2) * fixtureScale,
      faction: factionColor(data, owner),
      allegiance: allegianceColor(allegiance),
      kind: 'city',
      strength: Math.min(1, (city?.garrison ?? 600) / 1200),
    });
    cityEntities++;
    if (node === opts.selectedCity) {
      selections.push({ x: mapNode.pos[0], y: mapNode.pos[1], radius: (mapNode.tier >= 3 ? 8.9 : 7.6) * fixtureScale, color: [0.31, 0.82, 0.39], kind: 'city' });
    }
  }
  for (const army of opts.armies) {
    if (opts.fogOfWar && !army.mine && statusOf(opts.factionStatus, army.faction) !== Allegiance.Foe) continue;
    const allegiance = army.mine || army.faction === opts.playerFaction ? Allegiance.Friend : statusOf(opts.factionStatus, army.faction);
    entities.push({
      x: army.x,
      y: army.y,
      radius: 6.4 * fixtureScale,
      faction: factionColor(data, army.faction),
      allegiance: allegianceColor(allegiance),
      kind: 'army',
      strength: Math.min(1, Math.max(0.25, army.soldiers / 2600)),
    });
    armyEntities++;
    if (army.id === opts.selected) {
      selections.push({ x: army.x, y: army.y, radius: 8.2 * fixtureScale, color: [0.31, 0.82, 0.39], kind: 'army' });
    }
  }
  return { entities, selections, cityEntities, armyEntities };
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

function campaignArmyLabels(armies: ArmyView[]): CampaignLabel[] {
  return armies.map((army) => ({
    text: army.mine ? (army.id === 0 ? '1ST LEGION' : `LEGION ${army.id + 1}`) : `Host ${army.id}`,
    x: army.x,
    y: army.y + 13,
    kind: 'army',
    size: 13,
    priority: 4,
    icon: 'army',
    iconColor: army.mine ? [0.31, 0.82, 0.39] : [0.93, 0.78, 0.30],
  }));
}

function campaignFactionLabels(labels: FactionLabel[]): CampaignLabel[] {
  return labels.map((label) => ({
    text: label.name,
    x: label.x,
    y: label.y,
    kind: 'faction',
    size: Math.max(13, Math.min(label.minor ? 16 : 22, label.radiusKm / (label.minor ? 12 : 20))),
    priority: label.minor ? 2 : 4,
    angle: -0.06,
  }));
}

function campaignScenery(data: CampaignData, field: TerrainField): CampaignSceneryInstance[] {
  if (data.map.attribution === 'test') return testStageScenery(data);
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
      if (out.length > 900) return out;
    }
  }
  return out;
}

function testStageScenery(data: CampaignData): CampaignSceneryInstance[] {
  const [x0, y0] = data.bgRect.min;
  const [x1, y1] = data.bgRect.max;
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;
  const items: CampaignSceneryInstance[] = [
    { x: cx - 31, y: cy + 20, size: 8.4, kind: 'mountain' },
    { x: cx - 23, y: cy + 22, size: 7.8, kind: 'mountain' },
    { x: cx - 14, y: cy + 18, size: 7.2, kind: 'mountain' },
    { x: cx - 4, y: cy + 20, size: 8.1, kind: 'mountain' },
    { x: cx + 20, y: cy + 18, size: 7.7, kind: 'mountain' },
    { x: cx + 31, y: cy + 17, size: 8.2, kind: 'mountain' },
    { x: cx - 8, y: cy + 6, size: 6.6, kind: 'mountain' },
    { x: cx + 10, y: cy + 6, size: 6.3, kind: 'mountain' },
    { x: cx - 17, y: cy - 15, size: 5.4, kind: 'rock' },
    { x: cx - 4, y: cy - 18, size: 5.8, kind: 'rock' },
    { x: cx + 18, y: cy - 16, size: 5.2, kind: 'rock' },
    { x: cx + 32, y: cy - 10, size: 6.0, kind: 'rock' },
    { x: cx - 18, y: cy + 2, size: 5.4, kind: 'conifer' },
    { x: cx + 24, y: cy + 2, size: 5.1, kind: 'broadleaf' },
    { x: cx + 12, y: cy - 6, size: 4.6, kind: 'broadleaf' },
  ];
  for (let i = 0; i < 22; i++) {
    const x = x0 + 6 + hash2(i * 13, 4) * (x1 - x0 - 12);
    const y = y0 + 5 + hash2(5, i * 17) * (y1 - y0 - 10);
    if (Math.abs(y - cy) < 5 && Math.abs(x - cx) < 34) continue;
    items.push({ x, y, size: 2.5 + hash2(i, i + 9) * 2.2, kind: hash2(i, i + 31) > 0.45 ? 'broadleaf' : 'conifer' });
  }
  return items;
}

function isControlledStage(data: CampaignData) {
  return data.map.attribution === 'test' || data.map.attribution === 'handoff-test';
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

function publishStats(stats: ReturnType<CampaignRendererWebGPU['stats']>) {
  (window as unknown as { __campaignWebGPUStats?: unknown }).__campaignWebGPUStats = stats;
}
