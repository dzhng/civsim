import { buildStackCrowd } from "@packages/crowd-runtime/src/stackCrowd";
import type { CrowdInstance } from "@packages/crowd-runtime/src/instanceData";
import type { CampaignMarker } from "@packages/game-renderer/src/campaign/mapPass";
import { drawnRoadRuns } from "@packages/game-renderer/src/campaign/roadGeometry";
import type { CampaignEntityInstance } from "./entityPass";
import type { CampaignSceneryInstance } from "./sceneryPass";
import type { CampaignSelectionInstance } from "./selectionPass";
import { standardSeed, standardWindPhase } from "../models/shared/standardAsset";
import type { StandardInstance } from "../models/shared/standardPass";
import type { CampaignFogSource } from "./atmospherePass";
import { SELECTION_GREEN } from "../overlays";
import { hash2 } from "../math";
import { smoothstep } from "../../../renderer-core/src/scalar";

interface CampaignMapNode {
  id: number;
  name: string;
  pos: [number, number];
  kind: "city" | "junction";
  tier: number;
  port: boolean;
  owner: string;
}

export interface CampaignRenderData {
  map: {
    attribution: string;
    nodes: CampaignMapNode[];
    edges: Array<{
      kind: "road" | "sea";
      via: [number, number][];
    }>;
    factions: Array<{ id: string; color: [number, number, number] }>;
  };
  bgRect: { min: [number, number]; max: [number, number] };
}

export interface CampaignTerrainField {
  w: number;
  h: number;
  cell: number;
  minX: number;
  maxY: number;
  land: Uint8Array;
  biome: Uint8Array;
  height: Float32Array;
  maxH: number;
  heightAt(x: number, y: number): number;
  renderLandAt(x: number, y: number, marginKm?: number): boolean;
}

export interface ArmyView {
  id: number;
  x: number;
  y: number;
  faction: number;
  soldiers: number;
  stance: number;
  pieKind: number;
  pieFrac: number;
  marching: boolean;
  encounter: number;
  moraleCap: number;
  mine: boolean;
  /** Soldiers per class (index = UnitClassId), for the 3D army marker. */
  roster: number[];
  /** Live roster entries in this stack. */
  unitCount: number;
  /** Live roster entries per class, for representative markers. */
  unitsByClass: number[];
}

export interface CityView {
  owner: number;
  garrison: number;
  queue: number;
}

interface CampaignFactionLabel {
  faction: number;
  name: string;
  x: number;
  y: number;
  radiusKm: number;
  minor: boolean;
}

export interface CampaignFrameOptions {
  cam: { x: number; y: number; scale: number };
  armies: ArmyView[];
  cities: Map<number, CityView>;
  selected: number;
  selectedCity: number;
  factionLabels: CampaignFactionLabel[];
  factionStatus: Int8Array;
  playerFaction: number;
  fogOfWar: boolean;
  visionSources: CampaignFogSource[];
  factionView: boolean;
  stackUnitCap: number;
  controlledStage: boolean;
}

export interface CampaignSceneryReservation {
  x: number;
  y: number;
  radius: number;
  kind: "city" | "army";
}

/** 0 = friend (own or allied), 1 = neutral, 2 = foe (at war). */
export enum Allegiance {
  Friend = 0,
  Neutral = 1,
  Foe = 2,
}

export const CAMPAIGN_FIGURE_SIZE = 2.4;

// Standard scale rules — exported so the renderer-lab review surfaces track
// production by construction instead of re-hardcoding the ratios (the same
// contract CAMPAIGN_FIGURE_SIZE carries for the figures). Sized toward the
// Roma reference: the settlement banner towers over the town, the army
// standard clears its figure crowd.
export function campaignSettlementStandardScale(cityRadius: number): number {
  return cityRadius / 2.9;
}

export function campaignArmyStandardScale(armyRadius: number): number {
  return armyRadius / 3.5;
}

// Zoom LOD for the army-stack figures. Below FIGURE_FAR_ZOOM the stack shows the
// standard banner alone (figures would be sub-readable and cost draw calls over
// the whole map); the figure count ramps to CAMPAIGN_MAX_FIGURES as the camera
// closes past FIGURE_NEAR_ZOOM. (Campaign zoom runs ~0.16 whole-map to ~6 close.)
const CAMPAIGN_MAX_FIGURES = 6;
const FIGURE_FAR_ZOOM = 1.4;
const FIGURE_NEAR_ZOOM = 3.6;

// Allegiance → the crowd shader's tiny armband slot: friend=0 (blue), foe=1
// (red), neutral=2 (amber). Note this is NOT the raw Allegiance enum order
// (Neutral=1, Foe=2), so a neutral stack reads amber, not enemy-red.
function allegianceCrowdFaction(allegiance: Allegiance): 0 | 1 | 2 {
  return allegiance === Allegiance.Friend
    ? 0
    : allegiance === Allegiance.Foe
      ? 1
      : 2;
}

export function buildEntityFrame(
  data: CampaignRenderData,
  field: CampaignTerrainField,
  opts: CampaignFrameOptions,
  mountedClasses: number[],
  animTime: number,
) {
  const entities: CampaignEntityInstance[] = [];
  const standards: StandardInstance[] = [];
  const sceneryReservations: CampaignSceneryReservation[] = [];
  const selections: CampaignSelectionInstance[] = [];
  const crowd: CrowdInstance[] = [];
  const cityEntityAnchors: [number, number][] = [];
  let cityEntities = 0;
  let armyEntities = 0;
  const fixtureScale = opts.controlledStage ? 1.82 : 1;
  const garrisonStandardCities = new Set<number>();
  for (const army of opts.armies) {
    if (!visibleArmyForModel(opts, army)) continue;
    const occupiedCity = occupiedCityForArmy(data, army);
    if (occupiedCity) garrisonStandardCities.add(occupiedCity.index);
  }
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
    sceneryReservations.push({
      x: mapNode.pos[0],
      y: mapNode.pos[1],
      radius: cityModelRadius(mapNode.tier) * fixtureScale * 0.48,
      kind: "city",
    });
    if (!garrisonStandardCities.has(node)) {
      const scale = campaignSettlementStandardScale(cityModelRadius(mapNode.tier) * fixtureScale);
      standards.push({
        x: mapNode.pos[0] + 0.08 * scale,
        y: mapNode.pos[1] + 0.04 * scale,
        z: field.heightAt(mapNode.pos[0], mapNode.pos[1]),
        tier: "settlement-banner",
        factionId: "azure",
        livery: { field: factionColor(data, owner) },
        scale,
        windPhase: standardWindPhase(standardSeed("settlement-banner", `city:${node}`)),
      });
    }
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
    if (!visibleArmyForModel(opts, army)) continue;
    const allegiance =
      army.mine || army.faction === opts.playerFaction
        ? Allegiance.Friend
        : statusOf(opts.factionStatus, army.faction);
    const occupiedCity = occupiedCityForArmy(data, army);
    const display = occupiedCity
      ? garrisonDisplayAnchor(data.map.nodes[occupiedCity.index])
      : { x: army.x, y: army.y };
    const armyScale = campaignArmyStandardScale(6.4 * fixtureScale);
    standards.push({
      x: display.x,
      y: display.y,
      z: field.heightAt(display.x, display.y),
      tier: "campaign-army",
      factionId: "azure",
      livery: { field: factionColor(data, army.faction) },
      scale: armyScale,
      windPhase: standardWindPhase(standardSeed("campaign-army", `army:${army.id}`)),
    });
    sceneryReservations.push({
      x: display.x,
      y: display.y,
      radius: 6.4 * fixtureScale * 2.45,
      kind: "army",
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
      const selectionRadius = occupiedCity
        ? 11.8 * fixtureScale
        : opts.controlledStage
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
  return {
    entities,
    standards,
    sceneryReservations,
    selections,
    crowd,
    cityEntities,
    armyEntities,
    cityEntityAnchors,
  };
}

function visibleArmyForModel(opts: CampaignFrameOptions, army: ArmyView) {
  return !opts.fogOfWar || army.mine || fogVisible(opts, army.x, army.y, 0.18);
}

export function campaignMapMarkers(
  data: CampaignRenderData,
  opts: CampaignFrameOptions,
): CampaignMarker[] {
  if (opts.controlledStage || opts.cam.scale >= 0.5) return [];
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
    // City markers are the settlement icon rendered above the label (see
    // campaignCityLabels) — no separate GPU chip. Only armies draw a GPU marker.
  });
  for (const army of visibleCampaignArmies(opts)) {
    if (army.mine || army.faction === opts.playerFaction) continue;
    // A garrisoned army's standard flies from the city itself (the same anchor
    // its label uses), so the flag sits directly above the city name.
    const occupiedCity = occupiedCityForArmy(data, army);
    const at = occupiedCity
      ? garrisonDisplayAnchor(data.map.nodes[occupiedCity.index])
      : { x: army.x, y: army.y };
    markers.push({
      x: at.x,
      y: at.y,
      radius: army.id === opts.selected ? 10.5 : 9,
      faction: factionColor(data, army.faction),
      allegiance: factionColor(data, army.faction),
      kind: "army",
      selected: army.id === opts.selected,
    });
  }
  return markers;
}

export function statusOf(status: Int8Array, faction: number): Allegiance {
  return faction >= 0 && faction < status.length
    ? (status[faction] as Allegiance)
    : Allegiance.Neutral;
}

export function factionColor(data: CampaignRenderData, faction: number): [number, number, number] {
  const color = data.map.factions[faction]?.color ?? [146, 126, 92];
  return [color[0] / 255, color[1] / 255, color[2] / 255];
}

function allegianceColor(allegiance: Allegiance): [number, number, number] {
  if (allegiance === Allegiance.Friend) return SELECTION_GREEN;
  if (allegiance === Allegiance.Foe) return [0.88, 0.27, 0.23];
  return [0.93, 0.78, 0.3];
}

function cityModelRadius(tier: number) {
  return tier >= 3 ? 6.2 : 5.2;
}

function citySelectionRadius(tier: number) {
  return tier >= 3 ? 10.8 : 9.4;
}

export function garrisonDisplayAnchor(city: CampaignMapNode) {
  const cityRadius = cityModelRadius(city.tier);
  // Keep the garrison inside the city footprint so the composed army+city label
  // collides with the plain city label and reads as one city-owned marker.
  return {
    x: city.pos[0] - cityRadius * 0.08,
    y: city.pos[1] - cityRadius * 0.12,
  };
}

export function occupiedCityForArmy(data: CampaignRenderData, army: ArmyView) {
  let best: { index: number; name: string; d: number } | null = null;
  for (let index = 0; index < data.map.nodes.length; index++) {
    const node = data.map.nodes[index];
    if (node.kind !== "city") continue;
    const d = Math.hypot(node.pos[0] - army.x, node.pos[1] - army.y);
    if (d < 8 && (!best || d < best.d)) best = { index, name: node.name, d };
  }
  return best;
}

export function visibleCampaignArmies(opts: CampaignFrameOptions) {
  return opts.armies.filter((army) => {
    if (!opts.fogOfWar) return true;
    return fogVisible(opts, army.x, army.y, 0.18);
  });
}

export function fogVisible(opts: CampaignFrameOptions, x: number, y: number, threshold: number) {
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

const CART_MIN_SCALE = 3.2;
const CART_SPACING_KM = 78;
const CART_CITY_CLEARANCE_KM = 7; // keep carts off the city footprints at each spline end

// Road life: a handful of trade carts riding the road splines. Their position is
// a function of scene time, so they crawl along when the campaign runs and sit
// at a deterministic spot when it is frozen for a snapshot. Carts live ON the
// road, so they bypass the road-clearance cull; they only appear at close zoom
// and obey fog.
export function campaignRoadCarts(
  data: CampaignRenderData,
  field: CampaignTerrainField,
  time: number,
  opts: CampaignFrameOptions,
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
