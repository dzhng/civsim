import type { CampaignLabel } from "@packages/game-renderer/src/campaign/labelFrame";
import { screenToWorld, world3dToScreen, worldToScreen } from "@packages/renderer-core/src/cameraUniform";
import { Allegiance, campaignArmyStandardScale, campaignSettlementStandardScale, type ArmyView, type CityView } from "@packages/game-renderer/src/campaign/entityFrame";
import { type CampaignEntityInstance } from "@packages/game-renderer/src/campaign/entityInstance";
import { standardSeed, standardWindPhase } from "@packages/game-renderer/src/models/shared/standardAsset";
import type { StandardInstance } from "@packages/game-renderer/src/models/shared/standardInstance";
import { type ChartCameraSpec } from "@packages/renderer-core/src/camera3d";
import { type CampaignSelectionInstance } from "@packages/game-renderer/src/campaign/selection";
import { type CampaignData } from "../../../web/src/campaign/data";
import { type FactionLabel } from "../../../web/src/campaign/territory";
import { type CampaignViews } from "../../../web/src/campaign/views";
import { chartCameraSnapshot } from "./labShell";

export function campaignBgTerrainRect(rect: {
  min: [number, number];
  max: [number, number];
}): [number, number, number, number] {
  return [rect.min[0], rect.min[1], rect.max[0] - rect.min[0], rect.max[1] - rect.min[1]];
}

export function campaignPresetCamera(preset: string) {
  const presets: Record<
    string,
    { x: number; y: number; zoom: number; pitch: number; yaw: number }
  > = {
    fixture: { x: 0, y: 450, zoom: 6.0, pitch: 0, yaw: 0 },
    whole: { x: -100, y: 250, zoom: 0.16, pitch: 0, yaw: 0 },
    roma: { x: -456, y: 446, zoom: 2.5, pitch: 0, yaw: 0 },
    gaul: { x: -1020, y: 938, zoom: 2.2, pitch: 0, yaw: 0 },
    nile: { x: 1131, y: -686, zoom: 2.2, pitch: 0, yaw: 0 },
    alps: { x: -450, y: 1080, zoom: 1.8, pitch: 0, yaw: 0 },
    political: { x: 180, y: 520, zoom: 0.58, pitch: 0, yaw: 0 },
  };
  return presets[preset] ?? presets.whole;
}

export async function loadCampaignUiFixture(): Promise<{
  kind: "controlled";
  data: CampaignData;
  mapJson: string;
}> {
  const y = 450;
  const map = {
    half_w: 70,
    half_h: 520,
    attribution: "renderer-campaign-ui-fixture",
    nodes: [
      { id: 1, name: "Roma", pos: [-28, y], kind: "city", tier: 2, port: false, owner: "rome" },
      {
        id: 2,
        name: "Neapolis",
        pos: [30, y],
        kind: "city",
        tier: 2,
        port: false,
        owner: "independents",
      },
    ],
    edges: [
      {
        a: 1,
        b: 2,
        kind: "road",
        via: [
          [-28, y],
          [-6, y + 4],
          [12, y - 3],
          [30, y],
        ],
        tiles: Array(10).fill("open"),
      },
    ],
    ambush_spots: [],
    factions: [
      { id: "rome", name: "Rome", color: [190, 48, 42], playable: true },
      { id: "independents", name: "Independent", color: [132, 122, 102], playable: false },
    ],
    start_armies: [
      {
        faction: "rome",
        at: "Roma",
        roster: [
          ["MediumInfantry", 1000],
          ["MediumSpear", 500],
          ["Archers", 500],
          ["ShockCavalry", 300],
        ],
      },
    ],
  } as unknown as CampaignData["map"];
  const bgRect = { min: [-54, y - 32] as [number, number], max: [56, y + 34] as [number, number] };
  const cv = document.createElement("canvas");
  cv.width = 1;
  cv.height = 1;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#c9b277";
  g.fillRect(0, 0, 1, 1);
  const bg = await createImageBitmap(cv);
  const nodeIndex = new Map(map.nodes.map((node, i) => [node.id, i]));
  return { kind: "controlled", data: { map, bg, bgRect, nodeIndex }, mapJson: JSON.stringify(map) };
}

export function buildCampaignEntityFrame(
  data: CampaignData,
  views: CampaignViews,
  playerFaction: number,
  selectedArmy: number,
  selectedCity: number,
) {
  const entities: CampaignEntityInstance[] = [];
  const standards: StandardInstance[] = [];
  const selections: CampaignSelectionInstance[] = [];
  let cityEntities = 0;
  let armyEntities = 0;
  for (let node = 0; node < data.map.nodes.length; node++) {
    const mapNode = data.map.nodes[node];
    if (mapNode.kind !== "city") continue;
    const city = views.cities.get(node);
    const owner =
      city?.owner ??
      Math.max(
        0,
        data.map.factions.findIndex((faction) => faction.id === mapNode.owner),
      );
    const allegiance = owner === playerFaction ? Allegiance.Friend : Allegiance.Neutral;
    entities.push({
      id: node, label: mapNode.name, selected: selectedCity === node,
      x: mapNode.pos[0],
      y: mapNode.pos[1],
      radius: mapNode.tier >= 3 ? 8.4 : 7.0,
      faction: factionColor(data, owner),
      allegiance: allegianceColor(allegiance),
      kind: "city",
      strength: Math.min(1, (city?.garrison ?? 600) / 1200),
    });
    const scale = campaignSettlementStandardScale(mapNode.tier >= 3 ? 8.4 : 7.0);
    standards.push({
      x: mapNode.pos[0] + 0.08 * scale,
      y: mapNode.pos[1] + 0.04 * scale,
      tier: "settlement-banner",
      factionId: "azure",
      livery: { field: factionColor(data, owner) },
      scale,
      windPhase: standardWindPhase(standardSeed("settlement-banner", `campaign-ui-city:${node}`)),
    });
    cityEntities++;
    if (node === selectedCity) {
      selections.push({
        x: mapNode.pos[0],
        y: mapNode.pos[1],
        z: 0,
        radius: mapNode.tier >= 3 ? 12.4 : 10.6,
        color: [0.31, 0.82, 0.39],
        kind: "city",
      });
    }
  }
  for (const army of views.armies) {
    standards.push({
      x: army.x,
      y: army.y,
      tier: "campaign-army",
      factionId: "azure",
      livery: { field: factionColor(data, army.faction) },
      scale: campaignArmyStandardScale(9.8),
      windPhase: standardWindPhase(standardSeed("campaign-army", `campaign-ui-army:${army.id}`)),
    });
    armyEntities++;
    if (army.id === selectedArmy) {
      selections.push({
        x: army.x,
        y: army.y,
        z: 0,
        radius: 12.6,
        color: [0.31, 0.82, 0.39],
        kind: "army",
      });
    }
  }
  return { entities, standards, selections, cityEntities, armyEntities };
}

function factionColor(data: CampaignData, faction: number): [number, number, number] {
  const color = data.map.factions[faction]?.color ?? [146, 126, 92];
  return [color[0] / 255, color[1] / 255, color[2] / 255];
}

function allegianceColor(allegiance: Allegiance): [number, number, number] {
  if (allegiance === Allegiance.Friend) return [0.31, 0.82, 0.39];
  if (allegiance === Allegiance.Foe) return [0.88, 0.27, 0.23];
  return [0.93, 0.78, 0.3];
}

export function campaignArmyLabels(armies: ArmyView[]): CampaignLabel[] {
  return armies.map((army) => ({
    text: army.mine ? `Army ${army.id}` : `Host ${army.id}`,
    x: army.x,
    y: army.y - 18,
    kind: "army" as const,
    size: 13,
    priority: 4,
  }));
}

export function campaignFactionLabels(labels: FactionLabel[]): CampaignLabel[] {
  return labels.map((label) => ({
    text: label.name,
    x: label.x,
    y: label.y,
    kind: "faction" as const,
    size: Math.max(13, Math.min(label.minor ? 16 : 22, label.radiusKm / (label.minor ? 12 : 20))),
    priority: label.minor ? 2 : 4,
    angle: -0.06,
  }));
}

export function campaignPick(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
  stats: { width: number; height: number },
  data: CampaignData,
  views: CampaignViews,
) {
  const world = campaignCssToWorld(clientX, clientY, canvas, camera, stats);
  let army = -1;
  let bestD = 14;
  for (const candidate of views.armies) {
    if (!candidate.mine) continue;
    const d = Math.hypot(candidate.x - world.x, candidate.y - world.y);
    if (d < bestD) {
      bestD = d;
      army = candidate.id;
    }
  }
  if (army >= 0) return { kind: "army", army, city: -1, worldX: world.x, worldY: world.y };
  // Scan city nodes directly instead of nearestLoc: roads run THROUGH city
  // nodes, so a click a fraction off the node centre is marginally closer to
  // the road polyline than to the node and nearestLoc resolves it to an edge
  // location — a city click must never race the road under it.
  let city = -1;
  let bestCityD = 18;
  data.map.nodes.forEach((node, index) => {
    if (node.kind !== "city") return;
    const d = Math.hypot(node.pos[0] - world.x, node.pos[1] - world.y);
    if (d < bestCityD) {
      bestCityD = d;
      city = index;
    }
  });
  if (city >= 0) return { kind: "city", army: -1, city, worldX: world.x, worldY: world.y };
  return { kind: "empty", army: -1, city: -1, worldX: world.x, worldY: world.y };
}

export function campaignCssToWorld(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
  stats: { width: number; height: number },
) {
  const rect = canvas.getBoundingClientRect();
  const px = (clientX - rect.left) * (canvas.width / Math.max(1, canvas.clientWidth));
  const py = (clientY - rect.top) * (canvas.height / Math.max(1, canvas.clientHeight));
  const [x, y] = screenToWorld(chartCameraSnapshot(camera, stats.width, stats.height), px, py);
  return { x, y };
}

export function publishCampaignUiDebug(
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
  views: CampaignViews,
  selectedArmy: number,
  selectedCity: number,
  lastPick: { kind: string; army: number; city: number; worldX: number; worldY: number },
) {
  const w = window as unknown as {
    __gpuCampaignUi?: {
      camera: typeof camera;
      armies: ArmyView[];
      cities: [number, CityView][];
      selectedArmy: number;
      selectedCity: number;
      lastPick: typeof lastPick;
      project(x: number, y: number): { x: number; y: number };
    };
  };
  w.__gpuCampaignUi = {
    camera,
    armies: views.armies,
    cities: Array.from(views.cities.entries()),
    selectedArmy,
    selectedCity,
    lastPick,
    project: (x: number, y: number) =>
      campaignWorldToCss(x, y, canvas, camera, { width: canvas.width, height: canvas.height }),
  };
}

function campaignWorldToCss(
  x: number,
  y: number,
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
  stats: { width: number; height: number },
) {
  const rect = canvas.getBoundingClientRect();
  const [px, py] = worldToScreen(chartCameraSnapshot(camera, stats.width, stats.height), x, y);
  return {
    x: rect.left + px * (canvas.clientWidth / Math.max(1, canvas.width)),
    y: rect.top + py * (canvas.clientHeight / Math.max(1, canvas.height)),
  };
}

export function projectNestedPoint(
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
  point: [number, number, number],
) {
  const snapshot = chartCameraSnapshot(camera, canvas.width, canvas.height);
  const [x, y] = world3dToScreen(snapshot, point[0], point[1], point[2]);
  return { x, y, world: point };
}

export // CPU/GPU agreement under the ONE projection owner (camera3d): project each
// ground anchor through worldToScreen, unproject the pixel back through
// screenToWorld, and report the round-trip delta in device pixels (world
// delta × camera.zoom). Both directions ride the same chartCamera3d matrices
// the shell renders with, so any drift is a real projection bug.
function worldCameraAnchorAgreement(
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
  anchors: [string, [number, number, number]][],
) {
  const snapshot = chartCameraSnapshot(camera, canvas.width, canvas.height);
  const points = anchors.map(([id, point]) => {
    const screen = worldToScreen(snapshot, point[0], point[1]);
    const world = screenToWorld(snapshot, screen[0], screen[1]);
    const delta = Math.hypot(world[0] - point[0], world[1] - point[1]) * camera.zoom;
    return { id, screen, roundTrip: world, delta };
  });
  return {
    maxDelta: points.reduce((max, point) => Math.max(max, point.delta), 0),
    points,
  };
}
