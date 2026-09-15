import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { campaign, campaignPresentationReady } from "../worlds.mjs";
import { checkNaturalGroundClassifier, naturalGroundColor } from "./natural-ground-lib.js";

const CAMPAIGN_MAP_JSON = new URL("../../public/data/campaign-map.json", import.meta.url);
const WHOLE_MAP_CAMERA = [-100, 250, 0.16];
// The perspective camera foreshortens the vertical axis by cos(pitch) ≈ 0.68,
// so an unadjusted scale would show
// ~47% more map north-south. This target/scale frames the same mainland-Italy
// region (all 13 anchor cities on screen) under the camera3d projection.
const REGIONAL_ITALY_CAMERA = [-430, 445, 3.0];
const ROME_CLOSE_CAMERA = [-456, 446, 6.0];
const MAINLAND_ITALY_CITY_NAMES = [
  "Roma",
  "Tibur",
  "Narnia",
  "Spoletium",
  "Reate",
  "Ferentinum",
  "Alba Fucens",
  "Clusium",
  "Volsinii",
  "Casinum",
  "Aesernia",
  "Capua",
];
const CENTRAL_ITALY_ROAD_PAIRS = [
  ["Roma", "Tibur"],
  ["Roma", "Narnia"],
  ["Roma", "Reate"],
  ["Roma", "Volsinii"],
  ["Roma", "Ferentinum"],
  ["Roma", "Ostia/Portus"],
  ["Alba Fucens", "Tibur"],
  ["Narnia", "Spoletium"],
  ["Clusium", "Volsinii"],
  ["Capua", "Minturnae"],
];
// Three world-space Apennine regions are projected onto REGIONAL_ITALY_CAMERA
// through the real camera (screen-rect bounding box
// of the named crops' world corners).
const TERRAIN_FEATURE_CROPS = {
  "northern-apennines": { x: 578, y: 251, w: 279, h: 366 },
  "central-apennines": { x: 475, y: 292, w: 393, h: 429 },
  "southern-apennines": { x: 712, y: 495, w: 304, h: 285 },
};
const ROAD_SAMPLE_OFFSETS = roadSampleOffsets();
const CAMPAIGN_MAP = JSON.parse(readFileSync(CAMPAIGN_MAP_JSON, "utf8"));
const MAINLAND_ITALY_POINTS = pointsForCityNames(CAMPAIGN_MAP, MAINLAND_ITALY_CITY_NAMES);
const CENTRAL_ITALY_ROAD_POINTS = roadSamplesForPairs(CAMPAIGN_MAP, CENTRAL_ITALY_ROAD_PAIRS);

export const meta = {
  name: "campaign-lod",
  kind: "visual",
  world: "campaign-real",
  tier: "quick",
  snapshots: [
    "campaign-lod-whole-political",
    "campaign-lod-whole-natural",
    "campaign-lod-whole-fog",
    "campaign-lod-regional-italy-natural",
    "campaign-lod-regional-italy-political",
    "campaign-lod-rome-close",
    "campaign-lod-selected-army-city",
    "campaign-lod-selected-city",
    "campaign-lod-border-fog",
  ],
  describe:
    "Real campaign map LoD bands for WebGPU map accuracy, labels, roads, fog, selection, and close city/army composition.",
};

export async function run(ctx) {
  checkNaturalGroundClassifier(ctx);
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "campaign WebGPU LoD scenes require VERIFY_GPU=1",
      true,
      "set VERIFY_GPU=1 to exercise the WebGPU campaign adapter",
    );
    return;
  }

  const page = await campaign(ctx, "new", {
    viewport: { width: 1280, height: 800 },
    errorPrefix: "campaign-lod",
  });
  await page.evaluate(() => window.__campaign.freeze());

  const anchors = await page.evaluate(async () => {
    const map = await fetch("/data/campaign-map.json").then((response) => response.json());
    const nodeIndex = (name) => map.nodes.findIndex((node) => node.name === name);
    const roma = nodeIndex("Roma");
    const ostia = nodeIndex("Ostia/Portus");
    const army = window.__campaign.armies().find((candidate) => candidate.mine);
    return { roma, ostia, armyId: army?.id ?? -1 };
  });
  ctx.check(
    "real campaign LoD scene found Roma, Ostia, and player army",
    anchors.roma >= 0 && anchors.ostia >= 0 && anchors.armyId >= 0,
    JSON.stringify(anchors),
  );

  await snapCampaign(page, ctx, "campaign-lod-whole-political", {
    before: () =>
      page.evaluate((camera) => {
        window.__campaign.freeze(true);
        window.__campaign.factionView(true);
        window.__campaign.fogOfWar(false);
        window.__campaign.select(-1);
        window.__campaign.cam(...camera);
      }, WHOLE_MAP_CAMERA),
    stats: (stats) =>
      stats.visibleLabels >= 20 && hasRoadJunctionGeometry(stats) && stats.cityEntities > 300,
  });

  await snapCampaign(page, ctx, "campaign-lod-whole-natural", {
    before: () =>
      page.evaluate((camera) => {
        window.__campaign.factionView(false);
        window.__campaign.fogOfWar(false);
        window.__campaign.cam(...camera);
      }, WHOLE_MAP_CAMERA),
    stats: (stats) => stats.visibleLabels >= 16 && hasRoadJunctionGeometry(stats),
  });

  await snapCampaign(page, ctx, "campaign-lod-whole-fog", {
    before: () =>
      page.evaluate((camera) => {
        window.__campaign.factionView(true);
        window.__campaign.fogOfWar(true);
        window.__campaign.cam(...camera);
      }, WHOLE_MAP_CAMERA),
    stats: (stats) => stats.fogEnabled === true && stats.fogSources > 0 && stats.visibleLabels < 20,
  });

  await snapCampaign(page, ctx, "campaign-lod-regional-italy-natural", {
    before: () =>
      page.evaluate((camera) => {
        window.__campaign.fogOfWar(false);
        window.__campaign.factionView(false);
        window.__campaign.select(-1);
        window.__campaign.cam(...camera);
      }, REGIONAL_ITALY_CAMERA),
    stats: (stats) =>
      stats.visibleLabels >= 8 &&
      stats.cityEntities > 20 &&
      stats.armyEntities >= 1 &&
      hasRoadJunctionGeometry(stats) &&
      stats.factionView === false &&
      hasTerrainFeatureDensity(stats),
    checkStructure: true,
    realItalyAlignment: "regional",
  });

  await snapCampaign(page, ctx, "campaign-lod-regional-italy-political", {
    before: () =>
      page.evaluate((camera) => {
        window.__campaign.fogOfWar(false);
        window.__campaign.factionView(true);
        window.__campaign.select(-1);
        window.__campaign.cam(...camera);
      }, REGIONAL_ITALY_CAMERA),
    stats: (stats) =>
      stats.visibleLabels >= 8 &&
      stats.cityEntities > 20 &&
      stats.armyEntities >= 1 &&
      hasRoadJunctionGeometry(stats) &&
      stats.factionView === true &&
      hasTerrainFeatureDensity(stats),
  });
  await checkOwnCityCards(page, ctx, "campaign-lod-regional-italy-political");

  await snapCampaign(page, ctx, "campaign-lod-rome-close", {
    before: () =>
      page.evaluate((camera) => {
        window.__campaign.factionView(false);
        window.__campaign.select(-1);
        window.__campaign.cam(...camera);
      }, ROME_CLOSE_CAMERA),
    stats: (stats) =>
      stats.visibleLabels >= 4 &&
      stats.cityEntities > 20 &&
      stats.armyEntities >= 1 &&
      hasRoadJunctionGeometry(stats) &&
      hasTerrainFeatureDensity(stats),
    realItalyAlignment: "close",
    naturalGroundFloor: 0.42,
  });

  {
    // Own cities render as DOM map cards; the
    // canvas label stats cover neutral cities only. Assert the cards directly.
    const cards = await visibleMapCardNames(page);
    ctx.check(
      "campaign-lod rome-close shows own-city map cards incl. Ostia/Portus + garrisoned Roma",
      cards.some((n) => n.toUpperCase().includes("OSTIA")) &&
        cards.some((n) => n.toUpperCase().includes("ROMA")) &&
        cards.length >= 5,
      JSON.stringify(cards),
    );
  }
  await checkOwnCityCards(page, ctx, "campaign-lod-rome-close");
  await snapCampaign(page, ctx, "campaign-lod-selected-army-city", {
    before: () =>
      page.evaluate(
        ({ armyId, roma, camera }) => {
          window.__campaign.place(armyId, 0, roma, 0);
          window.__campaign.factionView(false);
          window.__campaign.select(armyId);
          window.__campaign.cam(...camera);
        },
        { ...anchors, camera: ROME_CLOSE_CAMERA },
      ),
    stats: (stats) =>
      stats.visibleLabels >= 4 &&
      hasRoadJunctionGeometry(stats) &&
      stats.composedArmyCityLabels >= 1 &&
      stats.garrisonedArmySelections >= 1 &&
      stats.maxSelectionRadius >= 11 &&
      stats.maxSelectionRadius < 13,
    naturalGroundFloor: 0.42,
  });

  await snapCampaign(page, ctx, "campaign-lod-selected-city", {
    before: () =>
      page.evaluate(
        ({ roma, camera }) => {
          window.__campaign.select(-1);
          window.__campaign.factionView(false);
          window.__campaign.openCity(roma);
          window.__campaign.cam(...camera);
        },
        { roma: anchors.roma, camera: ROME_CLOSE_CAMERA },
      ),
    stats: (stats) => stats.visibleLabels >= 4 && hasRoadJunctionGeometry(stats),
  });

  await snapCampaign(page, ctx, "campaign-lod-border-fog", {
    before: () =>
      page.evaluate(() => {
        window.__campaign.fogOfWar(true);
        window.__campaign.factionView(true);
        window.__campaign.cam(-430, 380, 2.2);
      }),
    stats: (stats) =>
      stats.fogEnabled === true &&
      stats.fogSources > 0 &&
      stats.physicalWorld?.fog === true &&
      hasTerrainFeatureDensity(stats),
  });

  await page.close();
}

function hasTerrainFeatureDensity(stats) {
  // Candidate tallies, not per-frame uploads: uploads are LOD- and
  // view-culled, so they say nothing about whole-map feature density.
  // On real geography relief is the terrain surface's own: neither mountains
  // nor rocks are planted as props, so both tallies must be exactly zero and
  // the woodland floor is the one density this gate owns.
  const scenery = stats.sceneryCandidateStats;
  return (
    scenery?.mountains === 0 &&
    scenery?.rocks === 0 &&
    stats.physicalWorld?.terrain?.allocationBytes > 0 &&
    scenery?.trees >= 2400
  );
}

function hasRoadJunctionGeometry(stats) {
  return stats.roadTriangles > 0 && stats.roadJunctionCaps >= 100;
}

async function snapCampaign(
  page,
  ctx,
  name,
  { before, stats, checkStructure = false, realItalyAlignment = null, naturalGroundFloor = null },
) {
  await before();
  await campaignPresentationReady(page);
  const gpuStats = await page.evaluate(() => window.__campaignGpuStats);
  ctx.check(`${name} stats match LoD contract`, stats(gpuStats), JSON.stringify(gpuStats));
  const shot = await page.screenshot();
  if (realItalyAlignment) {
    await checkRealItalyAlignment(page, ctx, name, PNG.sync.read(shot), realItalyAlignment);
  }
  if (checkStructure) {
    checkRegionalMapStructure(ctx, PNG.sync.read(shot));
  }
  if (naturalGroundFloor !== null) {
    const metrics = naturalGroundMetrics(PNG.sync.read(shot));
    ctx.check(
      `${name} natural terrain keeps its yellow-olive ground coverage`,
      metrics.naturalGroundRatio >= naturalGroundFloor,
      JSON.stringify(metrics),
    );
  }
  await ctx.snap(page, name, { shot });
}

function pointsForCityNames(map, names) {
  const byName = new Map(map.nodes.map((node) => [node.name, node]));
  return names.map((name) => {
    const node = byName.get(name);
    if (!node) throw new Error(`campaign map is missing city ${name}`);
    return { kind: "city", name, x: node.pos[0], y: node.pos[1] };
  });
}

function roadSamplesForPairs(map, pairs) {
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  const samples = [];
  for (const [a, b] of pairs) {
    const edge = map.edges.find((candidate) => {
      if (candidate.kind !== "road") return false;
      const an = byId.get(candidate.a)?.name;
      const bn = byId.get(candidate.b)?.name;
      return (an === a && bn === b) || (an === b && bn === a);
    });
    if (!edge) throw new Error(`campaign map is missing road ${a} -> ${b}`);
    for (let i = 1; i < edge.via.length; i++) {
      const start = edge.via[i - 1];
      const end = edge.via[i];
      const len = Math.hypot(end[0] - start[0], end[1] - start[1]);
      const steps = Math.max(1, Math.ceil(len / 16));
      for (let step = 0; step < steps; step++) {
        const t = (step + 1) / (steps + 1);
        samples.push({
          kind: "road",
          name: `${a}-${b}`,
          x: start[0] + (end[0] - start[0]) * t,
          y: start[1] + (end[1] - start[1]) * t,
        });
      }
    }
  }
  return samples;
}

async function checkRealItalyAlignment(page, ctx, name, current, cameraBand) {
  const semantic = await page.evaluate(
    ({ cities, roads }) => {
      const terrainSample = (point) => {
        const sample = window.__campaign.terrainAt(point.x, point.y);
        return { ...point, land: sample.land, height: sample.height };
      };
      return {
        cities: cities.map(terrainSample),
        roads: roads.map(terrainSample),
      };
    },
    { cities: MAINLAND_ITALY_POINTS, roads: CENTRAL_ITALY_ROAD_POINTS },
  );
  const badSemanticCities = semantic.cities.filter((point) => !point.land);
  const badSemanticRoads = semantic.roads.filter((point) => !point.land);
  ctx.check(
    `${name} semantic mainland Italy cities and roads stay on land`,
    badSemanticCities.length === 0 && badSemanticRoads.length === 0,
    JSON.stringify({
      badSemanticCities,
      badSemanticRoads: badSemanticRoads.slice(0, 8),
      checkedCities: semantic.cities.length,
      checkedRoadSamples: semantic.roads.length,
    }),
  );

  const visible = await page.evaluate(
    ({ cities, roads }) => {
      const project = (point) => {
        const [sx, sy] = window.__campaign.project(point.x, point.y);
        return { ...point, sx, sy };
      };
      return {
        cities: cities.map(project),
        roads: roads.map(project),
      };
    },
    { cities: MAINLAND_ITALY_POINTS, roads: CENTRAL_ITALY_ROAD_POINTS },
  );
  const pixelMetrics = renderedLandMetrics(current, visible);
  const minVisibleCities = cameraBand === "close" ? 5 : 10;
  const minVisibleRoads = cameraBand === "close" ? 8 : 22;
  ctx.check(
    `${name} rendered mainland Italy anchors do not sit in visible water`,
    pixelMetrics.visibleCities >= minVisibleCities &&
      pixelMetrics.visibleRoads >= minVisibleRoads &&
      pixelMetrics.badCities.length === 0 &&
      pixelMetrics.badRoads.length === 0,
    JSON.stringify(pixelMetrics),
  );
  const roadMetrics = renderedRoadMetrics(current, visible.roads);
  const minRoadHitRatio = cameraBand === "regional" ? 0.88 : 0.9;
  ctx.check(
    `${name} visible central Italy roads are continuous above terrain`,
    roadMetrics.visibleRoads >= minVisibleRoads && roadMetrics.roadHitRatio >= minRoadHitRatio,
    JSON.stringify(roadMetrics),
  );
}

// The regional natural view must read as a STRUCTURED map: substantial sea and
// land, visible roads and labels, and natural terrain not bled over by the
// political wash. Absolute floors, not a cross-render comparison: the scene
// renders its own evidence, so deleting baselines never breaks it.
function checkRegionalMapStructure(ctx, current) {
  const m = campaign3dMetrics(current);
  ctx.check(
    "campaign-lod-regional-italy-natural reads as a structured map (sea, land, roads, labels; no political wash)",
    m.waterRatio >= 0.3 &&
      m.landRatio >= 0.12 &&
      m.roadRatio >= 0.012 &&
      m.labelRatio >= 0.002 &&
      m.politicalWashRatio <= 0.12,
    JSON.stringify(m),
  );
  const features = terrainFeatureCropMetrics(current);
  const featureChecks = Object.fromEntries(
    Object.keys(TERRAIN_FEATURE_CROPS).map((name) => {
      const crop = features[name];
      return [
        name,
        {
          crop,
          // Relief contrast, dark features and natural-ground color coverage
          // stay three separate visual gates.
          ok:
            crop.mountainRatio >= 0.07 &&
            crop.darkFeatureRatio >= 0.04 &&
            crop.naturalGroundRatio >= 0.55,
        },
      ];
    }),
  );
  ctx.check(
    "campaign-lod-regional-italy-natural keeps named mountain and forest crops readable",
    Object.values(featureChecks).every((check) => check.ok),
    JSON.stringify(featureChecks),
  );
}

function campaign3dMetrics(png) {
  let total = 0;
  let water = 0;
  let land = 0;
  let road = 0;
  let label = 0;
  let model = 0;
  let politicalWash = 0;
  for (let y = 36; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      if (a < 16) continue;
      total++;
      if (b > r + 18 && b > g * 0.82 && b > 70) water++;
      if (g > b + 12 && r > b + 5 && g > 80 && r > 75) land++;
      if (r > 168 && g > 155 && b > 120 && Math.abs(r - g) < 55 && Math.abs(g - b) < 75) road++;
      if (r > 205 && g > 205 && b > 185) label++;
      if (r > 115 && g > 45 && g < 165 && b < 125 && r > g + 12) model++;
      if (r > 145 && g > 80 && b > 65 && r > g + 35 && g > b + 8) politicalWash++;
    }
  }
  const ratio = (value) => Number((value / Math.max(1, total)).toFixed(4));
  return {
    width: png.width,
    height: png.height,
    waterRatio: ratio(water),
    landRatio: ratio(land),
    roadRatio: ratio(road),
    labelRatio: ratio(label),
    modelRatio: ratio(model),
    politicalWashRatio: ratio(politicalWash),
  };
}

function naturalGroundMetrics(png) {
  let total = 0;
  let naturalGround = 0;
  for (let y = 36; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      if (a < 16 || isWaterPixel(r, g, b) || isRoadPixel(r, g, b) || isLabelPixel(r, g, b))
        continue;
      const cityRoof = r > 135 && r > g + 24 && g > 70 && b < 110;
      if (cityRoof) continue;
      total++;
      if (naturalGroundColor(r, g, b).olive) naturalGround++;
    }
  }
  return {
    total,
    naturalGroundRatio: Number((naturalGround / Math.max(1, total)).toFixed(4)),
  };
}

function terrainFeatureCropMetrics(png) {
  return Object.fromEntries(
    Object.entries(TERRAIN_FEATURE_CROPS).map(([name, crop]) => [
      name,
      terrainFeatureMetrics(png, crop),
    ]),
  );
}

function terrainFeatureMetrics(png, crop) {
  let total = 0;
  let mountain = 0;
  let darkFeature = 0;
  let naturalGround = 0;
  for (let y = Math.max(36, crop.y); y < Math.min(png.height, crop.y + crop.h); y++) {
    for (let x = Math.max(0, crop.x); x < Math.min(png.width, crop.x + crop.w); x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      if (a < 16 || isWaterPixel(r, g, b) || isRoadPixel(r, g, b) || isLabelPixel(r, g, b))
        continue;
      total++;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max - min;
      const greyStone = max < 150 && min > 25 && saturation < 65 && r >= b - 12 && g >= b - 12;
      const warmStone =
        r > 90 &&
        r < 175 &&
        g > 65 &&
        g < 150 &&
        b > 35 &&
        b < 125 &&
        r >= g * 1.04 &&
        g >= b * 1.08;
      if (greyStone || warmStone) mountain++;
      if ((max < 105 && min > 20 && saturation < 65) || (warmStone && max < 130)) darkFeature++;
      if (naturalGroundColor(r, g, b).olive) naturalGround++;
    }
  }
  const ratio = (value) => Number((value / Math.max(1, total)).toFixed(4));
  return {
    total,
    mountainRatio: ratio(mountain),
    darkFeatureRatio: ratio(darkFeature),
    naturalGroundRatio: ratio(naturalGround),
  };
}

function renderedLandMetrics(png, projected) {
  const cities = sampleProjectedLand(png, projected.cities, 0.4);
  const roads = sampleProjectedLand(png, projected.roads, 0.45);
  return {
    width: png.width,
    height: png.height,
    visibleCities: cities.visible,
    visibleRoads: roads.visible,
    badCities: cities.bad,
    badRoads: roads.bad.slice(0, 12),
  };
}

function sampleProjectedLand(png, points, maxWaterRatio) {
  const offsets = [
    [0, 0],
    [10, 0],
    [-10, 0],
    [0, 10],
    [0, -10],
    [14, 10],
    [-14, 10],
    [14, -10],
    [-14, -10],
  ];
  let visible = 0;
  const bad = [];
  for (const point of points) {
    if (point.sx < 0 || point.sy < 36 || point.sx >= png.width || point.sy >= png.height) continue;
    let samples = 0;
    let water = 0;
    for (const [dx, dy] of offsets) {
      const x = Math.round(point.sx + dx);
      const y = Math.round(point.sy + dy);
      if (x < 0 || y < 36 || x >= png.width || y >= png.height) continue;
      samples++;
      const i = (y * png.width + x) * 4;
      if (isWaterPixel(png.data[i], png.data[i + 1], png.data[i + 2])) water++;
    }
    if (samples === 0) continue;
    visible++;
    const waterRatio = water / samples;
    if (waterRatio > maxWaterRatio) {
      bad.push({
        kind: point.kind,
        name: point.name,
        sx: Number(point.sx.toFixed(1)),
        sy: Number(point.sy.toFixed(1)),
        water,
        samples,
        waterRatio: Number(waterRatio.toFixed(3)),
      });
    }
  }
  return { visible, bad };
}

function isWaterPixel(r, g, b) {
  return b > r + 18 && b > g * 0.82 && b > 70;
}

function renderedRoadMetrics(png, roads) {
  let visibleRoads = 0;
  let roadColorSamples = 0;
  const missingRoads = [];
  for (const point of roads) {
    if (point.sx < 0 || point.sy < 36 || point.sx >= png.width || point.sy >= png.height) continue;
    visibleRoads++;
    if (sampleRoadPixel(png, point.sx, point.sy)) {
      roadColorSamples++;
    } else {
      missingRoads.push({
        name: point.name,
        sx: Number(point.sx.toFixed(1)),
        sy: Number(point.sy.toFixed(1)),
      });
    }
  }
  return {
    visibleRoads,
    roadColorSamples,
    roadHitRatio: Number((roadColorSamples / Math.max(1, visibleRoads)).toFixed(3)),
    missingRoads: missingRoads.slice(0, 16),
  };
}

function sampleRoadPixel(png, sx, sy) {
  for (const [dx, dy] of ROAD_SAMPLE_OFFSETS) {
    const x = Math.round(sx + dx);
    const y = Math.round(sy + dy);
    if (x < 0 || y < 36 || x >= png.width || y >= png.height) continue;
    const i = (y * png.width + x) * 4;
    if (isRoadPixel(png.data[i], png.data[i + 1], png.data[i + 2])) return true;
  }
  return false;
}

function roadSampleOffsets() {
  const offsets = [[0, 0]];
  for (let radius = 2; radius <= 12; radius += 2) {
    offsets.push([radius, 0], [-radius, 0], [0, radius], [0, -radius]);
    offsets.push([radius, radius], [-radius, radius], [radius, -radius], [-radius, -radius]);
  }
  return offsets;
}

function isRoadPixel(r, g, b) {
  return r > 156 && g > 138 && b > 96 && Math.abs(r - g) < 72 && Math.abs(g - b) < 92;
}

function isLabelPixel(r, g, b) {
  return r > 205 && g > 205 && b > 185;
}

async function visibleMapCardNames(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".cmp-map-card"))
      .filter((node) => node.style.display !== "none")
      .map((node) => node.querySelector(".cmp-map-card__name")?.textContent ?? ""),
  );
}

// Every visible own-city card sits
// beside a rendered city model (an entity anchor exists at its node, and no
// card covers that anchor point) with a mostly-land rect (the landward card
// offset keeps DOM cards off the open sea).
async function checkOwnCityCards(page, ctx, name) {
  const audit = await page.evaluate(async () => {
    const api = window.__campaign;
    const anchors = window.__campaignGpuStats.cityEntityAnchors ?? [];
    const anchorKeys = new Set(anchors.map(([x, y]) => `${x},${y}`));
    const map = await (await fetch("/data/campaign-map.json")).json();
    const cityByCardName = new Map(
      map.nodes
        .filter((node) => node.kind === "city")
        .map((node) => [node.name.toUpperCase(), node]),
    );
    const cards = Array.from(document.querySelectorAll(".cmp-map-card--city"))
      .filter((node) => node.style.display !== "none")
      .map((node) => ({
        name: node.querySelector(".cmp-map-card__name")?.textContent?.trim() ?? "",
        rect: node.getBoundingClientRect(),
      }));
    const audited = [];
    for (const card of cards) {
      const city = cityByCardName.get(card.name);
      if (!city) {
        audited.push({ name: card.name, error: "no city node for card name" });
        continue;
      }
      const rect = card.rect;
      const points = [
        [rect.left, rect.top],
        [rect.right, rect.top],
        [rect.right, rect.bottom],
        [rect.left, rect.bottom],
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
      ];
      let land = 0;
      for (const [sx, sy] of points) {
        const [wx, wy] = api.screenToWorld(sx, sy);
        if (api.renderLandAt(wx, wy, 0)) land++;
      }
      const [ax, ay] = api.project(city.pos[0], city.pos[1]);
      const anchorCovered = cards.some(
        (other) =>
          ax >= other.rect.left &&
          ax <= other.rect.right &&
          ay >= other.rect.top &&
          ay <= other.rect.bottom,
      );
      audited.push({
        name: card.name,
        modelPresent: anchorKeys.has(`${city.pos[0]},${city.pos[1]}`),
        anchorCovered,
        landFraction: land / points.length,
        onScreenAnchor: ax >= 0 && ay >= 0 && ax <= innerWidth && ay <= innerHeight,
      });
    }
    return audited;
  });
  // Cards anchor directly under their city — no landward dodge, and at
  // full-tilt zoom a collision slides a card straight DOWN (never sideways) — so a
  // coastal city's card legitimately hangs over near-shore water
  // (landFraction is informational, not a gate). The real contract: the card
  // belongs to an on-screen city model and does not bury its own marker.
  const bad = audit.filter(
    (card) => card.error || !card.modelPresent || (card.onScreenAnchor && card.anchorCovered),
  );
  ctx.check(
    `${name} own-city cards sit directly under their visible city model`,
    audit.length > 0 && bad.length === 0,
    JSON.stringify({ bad, audited: audit.length }),
  );
}
