import { world3dToScreen, type CameraSnapshot } from "@packages/renderer-core/src/cameraUniform";
import type { CampaignLabel } from "./labelFrame";
import {
  Allegiance,
  factionColor,
  fogVisible,
  garrisonDisplayAnchor,
  occupiedCityForArmy,
  statusOf,
  visibleCampaignArmies,
  type CampaignFrameOptions,
  type CampaignRenderData,
  type CampaignTerrainField,
} from "./entityFrame";

const CITY_TIER_IMPORTANCE: Record<number, number> = { 1: 3, 2: 6, 3: 12 };
const cityImportance = (tier: number) => CITY_TIER_IMPORTANCE[tier] ?? 3;
const factionImportance = (cityTierSum: number) => cityTierSum;
const armyImportance = (soldiers: number) => 3 + Math.min(12, soldiers / 200);
const CITY_MARKER_BASE_RADIUS_PX = 5.2;
const CITY_MARKER_TIER_RADIUS_PX = 0.9;

export function campaignCityLabels(
  data: CampaignRenderData,
  field: Pick<CampaignTerrainField, "heightAt">,
  opts: CampaignFrameOptions,
  cam: CameraSnapshot,
  labelAnchorHeightAt?: (x: number, y: number) => number,
  markerBottomY?: (city: number) => number | undefined,
): CampaignLabel[] {
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
    const reliefPx = cityReliefRisePx(field, node.pos, cam, labelAnchorHeightAt);
    // A city label hugs its marker, always (David's rule). The label pass never
    // scores city labels against the render mask — only sea names care about dry
    // ground. It also never takes the world-edge inset
    // (horizontal/verticalEdgeOffset): that inset is for free-floating faction
    // engravings, and since the overview marker IS this label's icon, applying
    // it dragged the icon-marker off its city into the sea (Ierusalem, on the
    // map's eastern strip, shoved ~52px west onto water).
    let belowY = cityLabelOffset(opts, baseSize, reliefPx);
    if (!overviewMarkerLabel && markerBottomY) {
      const bottom = markerBottomY(index);
      if (bottom !== undefined) {
        const [, anchorY] = world3dToScreen(
          cam,
          node.pos[0],
          node.pos[1],
          labelAnchorHeightAt?.(node.pos[0], node.pos[1]) ?? 0,
        );
        belowY = Math.max(
          belowY,
          bottom - anchorY / (window.devicePixelRatio || 1) + baseSize * 1.1,
        );
      }
    }
    const anchor = overviewMarkerLabel
      ? overviewCityLabelAnchor(node.tier)
      : closeupCityLabelAnchor(belowY);
    labels.push({
      text: node.name.toUpperCase(),
      x: node.pos[0],
      y: node.pos[1],
      kind: "city",
      size: baseSize,
      priority: node.tier,
      importance: cityImportance(node.tier),
      // Overview: the settlement icon sits ABOVE the name and IS the city's
      // marker (no separate square). Closeup: the 3D model is the marker, so the
      // label is text-only.
      icon: overviewMarkerLabel ? "city" : undefined,
      iconColor: overviewMarkerLabel ? factionColor(data, owner) : undefined,
      rightIcon: allegiance === Allegiance.Foe ? "sword" : undefined,
      rightIconColor: allegiance === Allegiance.Foe ? [0.83, 0.2, 0.15] : undefined,
      collisionGroup: cityCollisionGroup(index),
      ...anchor,
    });
  });
  return labels;
}

/** Overview city label anchor. The label leads with the settlement
 * icon (the city's marker — there is no separate GPU chip), so anchor its TOP
 * near the city point, lifted half an icon so the icon sits ON the point and
 * the name hangs directly beneath it. */
function overviewCityLabelAnchor(tier: number) {
  const lift = cityMarkerRadiusPx(tier);
  return {
    screenOffsetX: 0,
    screenOffsetY: -lift,
    screenAnchorX: "center" as const,
    screenAnchorY: "top" as const,
  };
}

/** Closeup city labels sit centered under the model. */
function closeupCityLabelAnchor(belowY: number) {
  return {
    screenOffsetX: 0,
    screenOffsetY: belowY,
    screenAnchorX: "center" as const,
    screenAnchorY: "center" as const,
  };
}

export function campaignArmyLabels(
  data: CampaignRenderData,
  opts: CampaignFrameOptions,
): CampaignLabel[] {
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
        !cityOverlap && army.id === opts.selected && opts.controlledStage ? 28 : 0;
      const overlapClearance = cityOverlap ? (opts.cam.scale >= 3 ? 14 : 10) : 24;
      const legion = `${ordinal(ordinalOf.get(army.id) ?? 1)} LEGION`;
      const strength = `${Math.round(army.soldiers / 100) / 10}k`;
      // A garrisoned army REPLACES its city's plain label (same collision group),
      // so it must carry the foe sword itself — otherwise a foe city loses the
      // sword the moment it garrisons an army.
      const foe = statusOf(opts.factionStatus, army.faction) === Allegiance.Foe;
      // A garrisoned army reads city-first, like the own-city cards: the CITY
      // name is the primary line and the legion is the secondary line beneath
      // it. A field army keeps the legion as its primary line.
      return occupiedCity
        ? {
            text: occupiedCity.name.toUpperCase(),
            subText: `${legion} ${strength}`,
            x: display.x,
            y: display.y,
            kind: "army",
            size: Math.min(14, 9 + opts.cam.scale),
            priority: 4,
            importance: armyImportance(army.soldiers),
            iconColor: factionColor(data, army.faction),
            rightIcon: foe ? "sword" : undefined,
            rightIconColor: foe ? [0.83, 0.2, 0.15] : undefined,
            collisionGroup: cityCollisionGroup(occupiedCity.index),
            // The standard flies from this same anchor (see campaignMapMarkers),
            // so drop the name just beneath the flag's foot: flag over city name
            // over legion, the same stack as a plain city's house-over-name. The
            // flag's foot sits ~half its height above the anchor, so a small
            // negative offset tucks the name right under it.
            screenAnchorX: "center",
            screenAnchorY: "top",
            screenOffsetY: -markerSize * 0.5 + selectedOffset,
          }
        : {
            text: legion,
            sideText: strength,
            x: display.x,
            y: display.y,
            kind: "army",
            size: Math.min(14, 9 + opts.cam.scale),
            priority: 4,
            importance: armyImportance(army.soldiers),
            icon: "army",
            iconColor: factionColor(data, army.faction),
            screenOffsetY: markerSize + selectedOffset + overlapClearance,
          };
    });
}

function cityLabelOffset(opts: CampaignFrameOptions, baseSize: number, reliefPx: number) {
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

// CSS-pixel rise between the label anchor and model base. Physical consumers
// supply the presented surface shared by both; raw consumers still project
// labels at z=0 and require the existing relief compensation.
function cityReliefRisePx(
  field: Pick<CampaignTerrainField, "heightAt">,
  pos: readonly [number, number],
  cam: CameraSnapshot,
  labelAnchorHeightAt?: (x: number, y: number) => number,
) {
  const anchorHeight = labelAnchorHeightAt?.(pos[0], pos[1]) ?? 0;
  const h = Math.max(0, field.heightAt(pos[0], pos[1]));
  if (h <= 0) return 0;
  const dpr = window.devicePixelRatio || 1;
  const [, ground] = world3dToScreen(cam, pos[0], pos[1], anchorHeight);
  const [, raised] = world3dToScreen(cam, pos[0], pos[1], h);
  return Math.max(0, (ground - raised) / dpr);
}

export function cityMarkerRadiusPx(tier: number) {
  return CITY_MARKER_BASE_RADIUS_PX + tier * CITY_MARKER_TIER_RADIUS_PX;
}

function cityCollisionGroup(index: number) {
  return `city:${index}`;
}

export function ordinal(k: number) {
  const value = k % 100;
  const suffix = value >= 11 && value <= 13 ? "th" : (["th", "st", "nd", "rd"][k % 10] ?? "th");
  return `${k}${suffix}`;
}

export function campaignFactionLabels(
  data: CampaignRenderData,
  opts: CampaignFrameOptions,
): CampaignLabel[] {
  if (!opts.factionView) return [];
  const edge = mapEdgeProjector(data);
  // Faction power = sum of owned city tiers, from live ownership (opts.cities),
  // keyed by faction index — the same index FactionLabel.faction carries.
  const cityTierSum = Array.from({ length: data.map.factions.length }, () => 0);
  const cityCentroidX = Array.from({ length: data.map.factions.length }, () => 0);
  const cityCentroidY = Array.from({ length: data.map.factions.length }, () => 0);
  for (const [nodeIndex, city] of opts.cities) {
    const node = data.map.nodes[nodeIndex];
    const tier = node?.tier ?? 1;
    cityTierSum[city.owner] = (cityTierSum[city.owner] ?? 0) + tier;
    cityCentroidX[city.owner] += (node?.pos[0] ?? 0) * tier;
    cityCentroidY[city.owner] += (node?.pos[1] ?? 0) * tier;
  }
  return opts.factionLabels
    .filter((label) => !opts.fogOfWar || fogVisible(opts, label.x, label.y, 0.14))
    .map(
      (label): CampaignLabel => ({
        text: label.name,
        x:
          cityTierSum[label.faction] > 0
            ? cityCentroidX[label.faction] / cityTierSum[label.faction]
            : label.x,
        y:
          cityTierSum[label.faction] > 0
            ? cityCentroidY[label.faction] / cityTierSum[label.faction]
            : label.y,
        kind: "faction",
        size: label.minor ? 9 : 17,
        priority: 4,
        importance: factionImportance(cityTierSum[label.faction] ?? 0),
        angle: -0.06,
        factionRadiusKm: label.radiusKm,
        factionMinor: label.minor,
        screenOffsetX: horizontalEdgeOffset(edge.x(label.x)),
        screenOffsetY: verticalEdgeOffset(edge.y(label.y)),
      }),
    );
}

const LABEL_EDGE_INSET_START_X = 0.22;
const LABEL_EDGE_INSET_RANGE_X = 0.18;
const LABEL_EDGE_OFFSET_X = 110;
const LABEL_EDGE_INSET_START_Y = 0.22;
const LABEL_EDGE_INSET_RANGE_Y = 0.16;
const LABEL_EDGE_OFFSET_Y = 96;

function mapEdgeProjector(data: CampaignRenderData) {
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
