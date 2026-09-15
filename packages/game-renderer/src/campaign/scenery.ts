import type { SceneryInstance } from "../terrain/scenery";
import type {
  CampaignRenderData,
  CampaignSceneryReservation,
  CampaignTerrainField,
} from "./entityFrame";
import { testStageScenery } from "../fixtures/campaignScenery";
import { hash2, smoothstep } from "../../../renderer-core/src/math";

import { terrainScatterCandidates } from "../terrain/scatter";
import { campaignRelief, campaignNoise } from "../terrain/campaignRelief";
import { buildCampaignCoast } from "../terrain/campaignCoast";

const CAMPAIGN_MOUNTAIN_MIN_SCALE = 0.28;
const CAMPAIGN_TREE_MIN_SCALE = 0.45;
const CAMPAIGN_ROCK_MIN_SCALE = 0.45;
const CAMPAIGN_MAX_MOUNTAINS = 3200;
const CAMPAIGN_MAX_TREES = 32000;
const CAMPAIGN_MAX_ROCKS = 1000;
const CAMPAIGN_MOUNTAIN_VISUAL_SCALE = 2.25;
const CAMPAIGN_ROCK_VISUAL_SCALE = 1.75;
const CAMPAIGN_TREE_VISUAL_SCALE = 1.72;
// Land gate (B9): every static candidate must pass renderLandAt — the
// full-res rendered coast, not the 8 km grid — with the instance's own
// footprint radius as the margin (`size` is roughly the footprint diameter in
// km), so no prop hangs over the water side of the drawn coastline.
function sceneryFootprintOnLand(field: CampaignTerrainField, x: number, y: number, size: number) {
  return field.renderLandAt(x, y, size * 0.5);
}

export function tallySceneryCandidates(candidates: SceneryInstance[]) {
  const tally = { total: candidates.length, mountains: 0, trees: 0, rocks: 0 };
  for (const item of candidates) {
    if (item.kind === "mountain") tally.mountains++;
    else if (item.kind === "rock") tally.rocks++;
    else if (item.kind !== "cart") tally.trees++;
  }
  return tally;
}

const SCENERY_VIEW_MARGIN_KM = 16;

export function campaignScenery(
  candidates: SceneryInstance[],
  reservations: CampaignSceneryReservation[] = [],
  scale = 1,
  view?: { x: number; y: number; radiusKm: number },
): SceneryInstance[] {
  const lodFiltered = candidates.filter((item) => {
    if (scale < sceneryMinScale(item)) return false;
    if (!view) return true;
    const reach = view.radiusKm + SCENERY_VIEW_MARGIN_KM + item.size * 2;
    return (item.x - view.x) ** 2 + (item.y - view.y) ** 2 <= reach * reach;
  });
  return clearCampaignDynamicScenery(lodFiltered, reservations);
}

export function buildCampaignSceneryCandidates(
  data: CampaignRenderData,
  field: CampaignTerrainField,
  controlledStage: boolean,
  temperateYKm: number,
): SceneryInstance[] {
  if (data.map.attribution === "test")
    return clearCampaignStaticScenery(data, testStageScenery(data), controlledStage);
  const mountains: ScoredSceneryInstance[] = [];
  const rocks: ScoredSceneryInstance[] = [];
  for (let gy = 0; gy < field.h; gy++) {
    for (let gx = 0; gx < field.w; gx++) {
      const i = gy * field.w + gx;
      if (!field.land[i]) continue;
      const x0 = field.minX + (gx + 0.5) * field.cell;
      const y0 = field.maxY - (gy + 0.5) * field.cell;
      const rock = field.biome[i * 4 + 2] / 255;
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
    }
  }
  return clearCampaignStaticScenery(
    data,
    [
      ...selectRegionalScenery(mountains, CAMPAIGN_MAX_MOUNTAINS),
      ...buildCampaignWoodlandCandidates(field, temperateYKm).map((tree) => ({
        ...tree,
        z: Math.max(0, field.heightAt(tree.x, tree.y) - 0.05),
      })),
      ...selectRegionalScenery(rocks, CAMPAIGN_MAX_ROCKS),
    ],
    controlledStage,
  );
}

/** Fixed-world planting independent of the requested terrain tessellation.
 * Generate once per source; view filtering selects from this global cache. */
export function buildCampaignWoodlandCandidates(
  field: Pick<
    CampaignTerrainField,
    "w" | "h" | "cell" | "minX" | "maxY" | "height" | "biome" | "renderLandAt" | "renderWaterAt"
  >,
  temperateYKm: number,
): SceneryInstance[] {
  const bounds = [
    field.minX,
    field.maxY - field.h * field.cell,
    field.minX + field.w * field.cell,
    field.maxY,
  ];
  const trees: ScoredSceneryInstance[] = [];
  const relief = campaignRelief(field, 2);
  const coverAt = (x: number, y: number) => {
    const forest = relief.sample(field.biome, 4, 1, x, y) / 255;
    const moisture = relief.sample(field.biome, 4, 0, x, y) / 255;
    // Strategic cover supplies forest interiors; moist, gentle ground can also
    // carry small groves between the coarse source's mountain cells.
    const grove = smoothstep(0.4, 0.65, campaignNoise(x / 40 + 22, y / 40 - 17));
    return Math.max(forest, moisture * 0.6 * grove);
  };
  // Coast scratch is local and reused for all candidates in each 128 km block.
  const block = 128,
    halo = 24;
  for (let by = Math.floor(bounds[1] / block); by < Math.ceil(bounds[3] / block); by++) {
    for (let bx = Math.floor(bounds[0] / block); bx < Math.ceil(bounds[2] / block); bx++) {
      const x0 = bx * block,
        y0 = by * block;
      const candidates = [
        ...terrainScatterCandidates(
          [
            Math.max(x0, bounds[0]),
            Math.max(y0, bounds[1]),
            Math.min(x0 + block, bounds[2]),
            Math.min(y0 + block, bounds[3]),
          ],
          4,
          41,
        ),
      ].filter(
        ({ x, y }) =>
          field.renderLandAt(x, y, 2) && !field.renderWaterAt(x, y) && coverAt(x, y) >= 0.09,
      );
      if (!candidates.length) continue;
      const coast = buildCampaignCoast(
        (x, y) => field.renderLandAt(x, y),
        x0 - halo,
        y0 - halo,
        (block + halo * 2) / 2 + 1,
        2,
      );
      const heightAt = (x: number, y: number) =>
        field.renderLandAt(x, y) ? relief.heightAt(x, y, coast.inlandAt(x, y)) : 0;
      for (const { x, y, seed } of candidates) {
        const forest = coverAt(x, y);
        const slope =
          Math.hypot(
            heightAt(x + 2, y) - heightAt(x - 2, y),
            heightAt(x, y + 2) - heightAt(x, y - 2),
          ) / 4;
        if (
          slope > 0.55 ||
          hash2(seed, 3) > smoothstep(0.09, 0.65, forest) * (1 - smoothstep(0.25, 0.55, slope))
        )
          continue;
        const fringe = forest < 0.2;
        const height = fringe ? 0.9 + hash2(seed, 4) * 0.6 : 4 + hash2(seed, 4) * 2;
        const size = height * (fringe ? 0.85 : 0.72) * CAMPAIGN_TREE_VISUAL_SCALE;
        if (!field.renderLandAt(x, y, size * 0.5)) continue;
        trees.push({
          x,
          y,
          size,
          height: height * (fringe ? 1 : 1.1),
          kind: fringe ? "bush" : campaignTreeSpecies(hash2(seed, 5), y > temperateYKm),
          shade: hash2(seed, 6),
          yaw: hash2(seed, 7) * Math.PI * 2,
          score: campaignNoise(x / 50 + 6, y / 50 + 3),
          gx: Math.floor((x - field.minX) / field.cell),
          gy: Math.floor((field.maxY - y) / field.cell),
        });
      }
    }
  }
  return selectRegionalScenery(trees, CAMPAIGN_MAX_TREES);
}

// Deterministic species pick per biome band: boreal forests run conifer-led
// with pale aspen accents, temperate forests mix oak/ash/aspen over a conifer
// minority — variety within one muted register, not a per-cell monoculture.
function campaignTreeSpecies(roll: number, boreal: boolean): SceneryInstance["kind"] {
  if (boreal) {
    if (roll < 0.4) return "conifer";
    if (roll < 0.7) return "broadleaf";
    if (roll < 0.85) return "aspen";
    return "ash";
  }
  if (roll < 0.15) return "conifer";
  if (roll < 0.65) return "broadleaf";
  if (roll < 0.85) return "ash";
  return "aspen";
}

type ScoredSceneryInstance = SceneryInstance & {
  score: number;
  gx: number;
  gy: number;
};

const CAMPAIGN_SCENERY_REGION_CELLS = 24;

function selectRegionalScenery(items: ScoredSceneryInstance[], limit: number): SceneryInstance[] {
  if (items.length <= limit) return items.map(toSceneryInstance);
  const buckets = new Map<string, ScoredSceneryInstance[]>();
  for (const item of items) {
    const key = `${Math.floor(item.gx / CAMPAIGN_SCENERY_REGION_CELLS)},${Math.floor(item.gy / CAMPAIGN_SCENERY_REGION_CELLS)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  for (const bucket of buckets.values()) bucket.sort(compareSceneryScore);

  const selected: ScoredSceneryInstance[] = [];
  const selectedSet = new Set<ScoredSceneryInstance>();
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

  return selected.sort(compareSceneryScore).map(toSceneryInstance);
}

function compareSceneryScore(a: ScoredSceneryInstance, b: ScoredSceneryInstance) {
  return b.score - a.score;
}

function toSceneryInstance(item: ScoredSceneryInstance): SceneryInstance {
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

function clearCampaignStaticScenery(
  data: CampaignRenderData,
  items: SceneryInstance[],
  controlledStage: boolean,
) {
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
          citySceneryClearance(item, city.tier, controlledStage) + propRadius,
      )
    )
      return false;
    const clearance = roadSceneryClearance(item, controlledStage);
    return !roadSegments.some(([a, b]) => distanceToSegment(item.x, item.y, a, b) < clearance);
  });
}

function clearCampaignDynamicScenery(
  items: SceneryInstance[],
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

function sceneryReservationRadius(item: SceneryInstance) {
  if (item.kind === "mountain") return Math.max(4.8, item.size * 0.42);
  if (item.kind === "rock") return Math.max(2.8, item.size * 0.34);
  return Math.max(1.6, item.size * 0.24);
}

// Only the candidate scenery (mountains/trees/rocks) flows through this LoD
// filter. Carts are gated by their own scale check in campaignRoadCarts and
// never reach here.
function sceneryMinScale(item: SceneryInstance) {
  if (item.kind === "mountain") return CAMPAIGN_MOUNTAIN_MIN_SCALE;
  if (item.kind === "rock") return CAMPAIGN_ROCK_MIN_SCALE;
  return CAMPAIGN_TREE_MIN_SCALE;
}

function citySceneryClearance(item: SceneryInstance, tier: number, controlledStage: boolean) {
  const fixtureScale = controlledStage ? 1.82 : 1;
  if (controlledStage) return (tier >= 3 ? 12.0 : 10.5) * fixtureScale;
  // Mountains get a wide apron so no city ends up embedded in the massif.
  if (item.kind === "mountain") return tier >= 3 ? 11.0 : 9.4;
  if (item.kind === "rock") return tier >= 3 ? 5.2 : 4.4;
  return tier >= 3 ? 5.4 : 4.4;
}

function roadSceneryClearance(item: SceneryInstance, controlledStage: boolean) {
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

function clamp(value: number, min: number, max: number) {
  if (max < min) return (min + max) * 0.5;
  return Math.max(min, Math.min(max, value));
}
