import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const CAMPAIGN_3D_BASELINE = new URL(
  '../../specs/webgpu-skinned-crowd/visualizations/campaign-baselines/campaign-3d.png',
  import.meta.url,
);
const WHOLE_MAP_CAMERA = [-100, 250, 0.16];
const REGIONAL_ITALY_CAMERA = [-430, 380, 4.0];
const ROME_CLOSE_CAMERA = [-456, 446, 6.0];

export const meta = {
  name: 'campaign-webgpu-lod',
  kind: 'visual',
  world: 'campaign-real',
  tier: 'quick',
  snapshots: [
    'campaign-lod-whole-political',
    'campaign-lod-whole-natural',
    'campaign-lod-whole-fog',
    'campaign-lod-regional-italy-natural',
    'campaign-lod-regional-italy-political',
    'campaign-lod-rome-close',
    'campaign-lod-selected-army-city',
    'campaign-lod-selected-city',
    'campaign-lod-border-fog',
  ],
  describe: 'Real campaign map LoD bands for WebGPU map accuracy, labels, roads, fog, selection, and close city/army composition.',
};

export async function run(ctx) {
  if (process.env.VERIFY_WEBGPU !== '1') {
    ctx.check('campaign WebGPU LoD scenes require VERIFY_WEBGPU=1', true, 'set VERIFY_WEBGPU=1 to exercise the WebGPU campaign adapter');
    return;
  }

  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: 'campaign-webgpu-lod',
  });
  await page.goto(`${ctx.target}/`);
  await page.waitForSelector('#menu-new-campaign', { timeout: 20000 });
  await page.click('#menu-new-campaign');
  await page.waitForFunction(
    () => window.__campaignReady === true
      && window.__campaignWebGPUStats?.ready === true
      && window.__campaignWebGPUStats?.renderer === 'webgpu-campaign',
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(() => window.__campaign.freeze());

  const anchors = await page.evaluate(async () => {
    const map = await fetch('/data/campaign-map.json').then((response) => response.json());
    const nodeIndex = (name) => map.nodes.findIndex((node) => node.name === name);
    const roma = nodeIndex('Roma');
    const ostia = nodeIndex('Ostia/Portus');
    const army = window.__campaign.armies().find((candidate) => candidate.mine);
    return { roma, ostia, armyId: army?.id ?? -1 };
  });
  ctx.check('real campaign LoD scene found Roma, Ostia, and player army', anchors.roma >= 0 && anchors.ostia >= 0 && anchors.armyId >= 0, JSON.stringify(anchors));

  await snapCampaign(page, ctx, 'campaign-lod-whole-political', {
    before: () => page.evaluate((camera) => {
      window.__campaign.freeze(true);
      window.__campaign.factionView(true);
      window.__campaign.fogOfWar(false);
      window.__campaign.select(-1);
      window.__campaign.cam(...camera);
    }, WHOLE_MAP_CAMERA),
    stats: (stats) => stats.visibleLabels >= 20 && stats.roadTriangles > 0 && stats.cityEntities > 300,
  });

  await snapCampaign(page, ctx, 'campaign-lod-whole-natural', {
    before: () => page.evaluate((camera) => {
      window.__campaign.factionView(false);
      window.__campaign.fogOfWar(false);
      window.__campaign.cam(...camera);
    }, WHOLE_MAP_CAMERA),
    stats: (stats) => stats.visibleLabels >= 16 && stats.roadTriangles > 0,
  });

  await snapCampaign(page, ctx, 'campaign-lod-whole-fog', {
    before: () => page.evaluate((camera) => {
      window.__campaign.factionView(true);
      window.__campaign.fogOfWar(true);
      window.__campaign.cam(...camera);
    }, WHOLE_MAP_CAMERA),
    stats: (stats) => stats.fogEnabled === true && stats.fogSources > 0 && stats.visibleLabels < 20,
  });

  await snapCampaign(page, ctx, 'campaign-lod-regional-italy-natural', {
    before: () => page.evaluate((camera) => {
      window.__campaign.fogOfWar(false);
      window.__campaign.factionView(false);
      window.__campaign.select(-1);
      window.__campaign.cam(...camera);
    }, REGIONAL_ITALY_CAMERA),
    stats: (stats) => stats.visibleLabels >= 8 && stats.cityEntities > 20 && stats.armyEntities >= 1 && stats.roadTriangles > 0 && stats.factionView === false,
    compare3dBaseline: true,
  });

  await snapCampaign(page, ctx, 'campaign-lod-regional-italy-political', {
    before: () => page.evaluate((camera) => {
      window.__campaign.fogOfWar(false);
      window.__campaign.factionView(true);
      window.__campaign.select(-1);
      window.__campaign.cam(...camera);
    }, REGIONAL_ITALY_CAMERA),
    stats: (stats) => stats.visibleLabels >= 8 && stats.cityEntities > 20 && stats.armyEntities >= 1 && stats.roadTriangles > 0 && stats.factionView === true,
  });

  await snapCampaign(page, ctx, 'campaign-lod-rome-close', {
    before: () => page.evaluate((camera) => window.__campaign.cam(...camera), ROME_CLOSE_CAMERA),
    stats: (stats) => stats.visibleLabels >= 4 && stats.cityEntities > 20 && stats.armyEntities >= 1 && stats.roadTriangles > 0,
  });

  await snapCampaign(page, ctx, 'campaign-lod-selected-army-city', {
    before: () => page.evaluate(({ armyId, roma, camera }) => {
      window.__campaign.place(armyId, 0, roma, 0);
      window.__campaign.select(armyId);
      window.__campaign.cam(...camera);
    }, { ...anchors, camera: ROME_CLOSE_CAMERA }),
    stats: (stats) => stats.visibleLabels >= 4 && stats.roadTriangles > 0 && stats.composedArmyCityLabels >= 1,
  });

  await snapCampaign(page, ctx, 'campaign-lod-selected-city', {
    before: () => page.evaluate(({ roma, camera }) => {
      window.__campaign.select(-1);
      window.__campaign.openCity(roma);
      window.__campaign.cam(...camera);
    }, { roma: anchors.roma, camera: ROME_CLOSE_CAMERA }),
    stats: (stats) => stats.visibleLabels >= 4 && stats.roadTriangles > 0,
  });

  await snapCampaign(page, ctx, 'campaign-lod-border-fog', {
    before: () => page.evaluate(() => {
      window.__campaign.fogOfWar(true);
      window.__campaign.factionView(true);
      window.__campaign.cam(-430, 380, 2.2);
    }),
    stats: (stats) => stats.fogEnabled === true && stats.fogSources > 0 && stats.cloudQuads === 1,
  });

  await page.close();
}

async function snapCampaign(page, ctx, name, { before, stats, compare3dBaseline = false }) {
  await before();
  await page.waitForTimeout(300);
  const webgpuStats = await page.evaluate(() => window.__campaignWebGPUStats);
  ctx.check(`${name} stats match LoD contract`, stats(webgpuStats), JSON.stringify(webgpuStats));
  const shot = await page.screenshot();
  if (compare3dBaseline) {
    checkCampaign3dBaseline(ctx, PNG.sync.read(shot));
  }
  await ctx.snap(page, name, { shot });
}

function checkCampaign3dBaseline(ctx, current) {
  const baseline = PNG.sync.read(readFileSync(CAMPAIGN_3D_BASELINE));
  const baselineMetrics = campaign3dMetrics(baseline);
  const currentMetrics = campaign3dMetrics(current);
  const sameSize = current.width === baseline.width && current.height === baseline.height;
  const keepsStructure = sameSize
    && currentMetrics.waterRatio >= baselineMetrics.waterRatio * 0.55
    && currentMetrics.landRatio >= baselineMetrics.landRatio * 0.55
    && currentMetrics.roadRatio >= baselineMetrics.roadRatio * 0.40
    && currentMetrics.labelRatio >= baselineMetrics.labelRatio * 0.35
    && currentMetrics.modelRatio >= baselineMetrics.modelRatio * 0.35
    && currentMetrics.politicalWashRatio <= 0.12;
  ctx.check(
    'campaign-lod-regional-italy-natural keeps campaign-3d baseline structure',
    keepsStructure,
    JSON.stringify({ baseline: baselineMetrics, current: currentMetrics }),
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
