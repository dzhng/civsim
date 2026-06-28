export const meta = {
  name: 'campaign-webgpu-lod',
  kind: 'visual',
  world: 'campaign-real',
  tier: 'quick',
  snapshots: [
    'campaign-lod-whole-political',
    'campaign-lod-whole-natural',
    'campaign-lod-whole-fog',
    'campaign-lod-regional-italy',
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
    before: () => page.evaluate(() => {
      window.__campaign.freeze(true);
      window.__campaign.factionView(true);
      window.__campaign.fogOfWar(false);
      window.__campaign.select(-1);
      window.__campaign.cam(-100, 250, 0.16);
    }),
    stats: (stats) => stats.visibleLabels >= 20 && stats.roadTriangles > 0 && stats.cityEntities > 300,
  });

  await snapCampaign(page, ctx, 'campaign-lod-whole-natural', {
    before: () => page.evaluate(() => {
      window.__campaign.factionView(false);
      window.__campaign.fogOfWar(false);
      window.__campaign.cam(-100, 250, 0.16);
    }),
    stats: (stats) => stats.visibleLabels >= 16 && stats.roadTriangles > 0,
  });

  await snapCampaign(page, ctx, 'campaign-lod-whole-fog', {
    before: () => page.evaluate(() => {
      window.__campaign.factionView(true);
      window.__campaign.fogOfWar(true);
      window.__campaign.cam(-100, 250, 0.16);
    }),
    stats: (stats) => stats.fogEnabled === true && stats.fogSources > 0 && stats.visibleLabels < 20,
  });

  await snapCampaign(page, ctx, 'campaign-lod-regional-italy', {
    before: () => page.evaluate(() => {
      window.__campaign.fogOfWar(false);
      window.__campaign.factionView(true);
      window.__campaign.cam(-430, 380, 4.0);
    }),
    stats: (stats) => stats.visibleLabels >= 8 && stats.cityEntities > 20 && stats.armyEntities >= 1 && stats.roadTriangles > 0,
  });

  await snapCampaign(page, ctx, 'campaign-lod-rome-close', {
    before: () => page.evaluate(() => window.__campaign.cam(-456, 446, 6.0)),
    stats: (stats) => stats.visibleLabels >= 4 && stats.cityEntities > 20 && stats.armyEntities >= 1 && stats.roadTriangles > 0,
  });

  await snapCampaign(page, ctx, 'campaign-lod-selected-army-city', {
    before: () => page.evaluate((armyId) => {
      window.__campaign.select(armyId);
      window.__campaign.cam(-456, 446, 6.0);
    }, anchors.armyId),
    stats: (stats) => stats.visibleLabels >= 4 && stats.roadTriangles > 0,
  });

  await snapCampaign(page, ctx, 'campaign-lod-selected-city', {
    before: () => page.evaluate((roma) => {
      window.__campaign.select(-1);
      window.__campaign.openCity(roma);
      window.__campaign.cam(-456, 446, 6.0);
    }, anchors.roma),
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

async function snapCampaign(page, ctx, name, { before, stats }) {
  await before();
  await page.waitForTimeout(300);
  const webgpuStats = await page.evaluate(() => window.__campaignWebGPUStats);
  ctx.check(`${name} stats match LoD contract`, stats(webgpuStats), JSON.stringify(webgpuStats));
  await ctx.snap(page, name);
}
