import { PNG } from 'pngjs';

export const meta = {
  name: 'campaign-webgpu-production',
  kind: 'flow',
  world: 'campaign',
  tier: 'full',
  snapshots: [],
  describe: 'Normal campaign route renders through the production raw-WebGPU campaign adapter.',
};

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'campaign-webgpu-production' });
  await page.goto(`${ctx.target}/?campaign=test`);
  await page.waitForFunction(() => window.__campaignReady === true && window.__campaignWebGPUStats?.ready === true, undefined, { timeout: 18000 });
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.cam(0, 450, 6);
  });
  await page.waitForTimeout(260);

  const stats = await page.evaluate(() => window.__campaignWebGPUStats);
  ctx.check(
    'production campaign route is using the raw WebGPU adapter',
    stats.renderer === 'webgpu-campaign'
      && stats.cityEntities === 2
      && stats.armyEntities >= 1
      && stats.waterFeatures >= 5
      && stats.cloudQuads === 1
      && stats.labelLayer === 'raw-webgpu-glyph-atlas'
      && stats.labelVertices > 0
      && stats.cameraContract === 'shared-world-camera-wgsl'
      && stats.depth?.allocated === true
      && stats.depth?.format === 'depth24plus'
      && hasFramePhaseOrder(stats.phases),
    JSON.stringify(stats),
  );
  ctx.check(
    'post-cutover screenshot policy is WebGPU-only',
    stats.postCutoverScreenshots === 'webgpu-only',
    JSON.stringify(stats),
  );

  const pixels = countPixels(PNG.sync.read(await page.screenshot()));
  ctx.check(
    'campaign WebGPU frame has parchment, faction, atmosphere, and UI pixels',
    pixels.warmGround > 120000 && pixels.red > 700 && pixels.gold > 40 && pixels.cloud > 1200,
    JSON.stringify(pixels),
  );

  const armyTarget = await page.evaluate(() => {
    const army = window.__campaign.armies().find((candidate) => candidate.mine);
    if (!army) throw new Error('no player army found');
    const p = window.__campaign.project(army.x, army.y);
    return { x: p[0], y: p[1], id: army.id };
  });
  await page.mouse.click(armyTarget.x, armyTarget.y);
  await page.waitForTimeout(160);
  const armySelected = await page.evaluate(() => ({
    selected: window.__campaign.selected(),
    armyPanel: document.querySelector('#cmp-army')?.textContent ?? '',
  }));
  ctx.check(
    'real canvas click selects the rendered WebGPU army marker',
    armySelected.selected === armyTarget.id && armySelected.armyPanel.includes(`Army ${armyTarget.id}`),
    JSON.stringify({ armyTarget, armySelected }),
  );
  const selectedPixels = countPixels(PNG.sync.read(await page.screenshot()));
  ctx.check(
    'selected WebGPU army marker exposes the campaign selection color',
    selectedPixels.green > 200,
    JSON.stringify(selectedPixels),
  );

  await page.evaluate((armyId) => {
    window.__campaign.place(armyId, 1, 0, 4);
  }, armyTarget.id);
  await page.waitForTimeout(160);
  const cityTarget = await page.evaluate(() => {
    const p = window.__campaign.project(-25, 450);
    return { x: p[0], y: p[1] };
  });
  await page.mouse.click(cityTarget.x, cityTarget.y);
  await page.waitForTimeout(160);
  const cityOpened = await page.evaluate(() => ({
    selected: window.__campaign.selected(),
    cityPanel: document.querySelector('#cmp-city')?.textContent ?? '',
    webgpu: window.__campaignWebGPUStats,
  }));
  ctx.check(
    'real canvas click opens the normal city panel over WebGPU',
    cityOpened.selected === -1
      && cityOpened.cityPanel.includes('Roma')
      && cityOpened.webgpu.visibleLabels >= 2
      && cityOpened.webgpu.labelLayer === 'raw-webgpu-glyph-atlas'
      && cityOpened.webgpu.cameraContract === 'shared-world-camera-wgsl'
      && hasFramePhaseOrder(cityOpened.webgpu.phases),
    JSON.stringify({ cityTarget, cityOpened }),
  );

  await page.close();

  const retired = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'campaign-retired-gfx-legacy' });
  await retired.goto(`${ctx.target}/?campaign=test&gfx=legacy`);
  await retired.waitForFunction(() => window.__campaignReady === true && window.__campaignWebGPUStats?.ready === true, undefined, { timeout: 18000 });
  const retiredStats = await retired.evaluate(() => window.__campaignWebGPUStats);
  ctx.check(
    'retired campaign gfx=legacy route still uses raw WebGPU',
    retiredStats.renderer === 'webgpu-campaign'
      && retiredStats.ready === true
      && retiredStats.labelLayer === 'raw-webgpu-glyph-atlas'
      && retiredStats.postCutoverScreenshots === 'webgpu-only'
      && retiredStats.cameraContract === 'shared-world-camera-wgsl'
      && retiredStats.depth?.allocated === true
      && hasFramePhaseOrder(retiredStats.phases),
    JSON.stringify(retiredStats),
  );
  await retired.close();
}

function hasFramePhaseOrder(phases) {
  const kinds = Array.isArray(phases) ? phases.map((phase) => phase?.kind) : [];
  const background = kinds.indexOf('background');
  const world = kinds.indexOf('world-depth');
  const overlay = kinds.includes('overlay') ? kinds.indexOf('overlay') : kinds.length;
  return background === 0 && world > background && overlay > world;
}

function countPixels(png) {
  let warmGround = 0;
  let red = 0;
  let green = 0;
  let gold = 0;
  let cloud = 0;
  let nonBlank = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const o = (y * png.width + x) * 4;
      const r = png.data[o], g = png.data[o + 1], b = png.data[o + 2];
      if (r + g + b > 60) nonBlank++;
      if (r > 100 && g > 90 && g < 190 && b < 155) warmGround++;
      if (r > 130 && g < 125 && b < 125) red++;
      if (g > 145 && r < 135 && b < 140) green++;
      if (r > 160 && g > 120 && b < 100) gold++;
      if (r > 170 && g > 175 && b > 165 && Math.abs(r - g) < 36 && Math.abs(g - b) < 44) cloud++;
    }
  }
  return { warmGround, red, green, gold, cloud, nonBlank };
}
