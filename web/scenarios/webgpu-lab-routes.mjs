import { PNG } from 'pngjs';

export const meta = {
  name: 'webgpu-lab-routes',
  kind: 'flow',
  world: 'none',
  tier: 'full',
  snapshots: [],
  describe: 'Fresh raw-WebGPU lab routes render and expose deterministic stats.',
};

const routes = [
  ['frame-shell', (s) => s?.ok && s.route === 'frame-shell' && s.stats.atmosphere === 'aegean-sky-haze'],
  ['assets', (s) => s?.ok && s.route === 'assets' && s.stats.badErrors > 0 && s.stats.importUi?.paste && s.stats.importUi?.file && s.stats.importUi?.drop],
  ['crowd-data?count=1000', (s) => s?.ok && s.route === 'crowd-data' && s.stats.stats.written === 1000],
  ['animation-state', (s) => s?.ok && s.route === 'animation-state'],
  ['skinned-soldier?phase=0.25', (s) => s?.ok && s.route === 'skinned-soldier' && s.stats.instances === 1 && s.stats.cameraContract === 'shared-world-camera-wgsl'],
  ['skinned-crowd?count=1200', (s) => s?.ok && s.route === 'skinned-crowd' && s.stats.count === 1200 && s.stats.cameraContract === 'shared-world-camera-wgsl'],
  ['lod?zoom=5', (s) => s?.ok && s.route === 'lod' && (s.stats.counts.l1 + s.stats.counts.l2 + s.stats.counts.l3 + s.stats.counts.l0) === 1800],
  ['battle', (s) => s?.ok && s.route === 'battle' && s.stats.soldiers === 2400 && s.stats.cameraContract === 'shared-world-camera-wgsl'],
  ['perf?count=900', (s) => s?.ok
    && s.route === 'perf'
    && s.stats.kind === 'webgpu-full-game-perf'
    && s.stats.mode === 'headless-liveness'
    && s.stats.releaseBudget === 'not-set'
    && s.stats.scenes?.[0]?.id === 'lab-skinned-crowd'
    && s.stats.scenes[0].stats.count === 900
    && s.stats.scenes[0].frame.samples > 0],
  ['campaign', (s) => s?.ok && s.route === 'campaign' && s.stats.markers > 0],
  ['campaign-map?preset=whole', (s) => s?.ok && s.route === 'campaign-map' && s.stats.roads > 20 && s.stats.seaLanes > 0 && s.stats.cityMarkers > 20 && s.stats.visibleLabels > 5 && s.stats.labelVertices > 20 && s.stats.factions > 5 && s.stats.territoryPixels > 10000 && s.stats.borderSegments > 100 && s.stats.waterFeatures >= 5 && s.stats.cloudQuads === 1 && s.stats.territoryLayer === 'raw-webgpu-texture' && s.stats.atmosphereLayer === 'raw-webgpu-cloud-water' && s.stats.labelLayer === 'raw-webgpu-glyph-atlas'],
  ['campaign-ui', (s) => s?.ok && s.route === 'campaign-ui' && s.stats.fixture === 'controlled' && s.stats.cityEntities === 2 && s.stats.armyEntities === 1 && s.stats.selections >= 2 && s.stats.depth?.allocated === true && s.stats.depth?.format === 'depth24plus' && s.stats.ui.armyPanel && s.stats.ui.cityPanel && s.stats.ui.autoReplenishToggle && s.stats.ui.classRows >= 8 && s.stats.ui.diplomacyRows >= 1 && s.stats.labelLayer === 'raw-webgpu-glyph-atlas' && s.stats.labelVertices > 0 && s.stats.postCutoverScreenshots === 'webgpu-only'],
  ['render-graph', (s) => s?.ok
    && s.route === 'render-graph'
    && s.stats.firstPass === 'camera'
    && s.stats.lastPass === 'present'
    && s.stats.passes >= 7
    && s.stats.depth?.allocated === true
    && s.stats.depth?.format === 'depth24plus'
    && s.stats.nested3d?.fixtures?.includes('flag-in-city')
    && s.stats.nested3d?.fixtures?.includes('garrison-in-city-stub')
    && s.stats.nested3d?.fixtures?.includes('rank-overlap')],
  ['world-camera', (s) => s?.ok
    && s.route === 'world-camera'
    && s.stats.cameraContract === 'shared-world-camera-wgsl'
    && s.stats.depth?.allocated === true
    && s.stats.depth?.format === 'depth24plus'
    && s.stats.anchorAgreement?.maxDelta < 0.001
    && s.stats.nested3d?.fixtures?.includes('flag-in-city')
    && s.stats.nested3d?.fixtures?.includes('garrison-in-city-stub')
    && s.stats.nested3d?.fixtures?.includes('rank-overlap')],
  ['battle-terrain?fixture=coast', (s) => s?.ok && s.route === 'battle-terrain' && s.stats.fixture === 'coast' && s.stats.waterQuads >= 3 && s.stats.sceneryQuads >= 8 && s.stats.cameraContract === 'shared-world-camera-wgsl'],
  ['battle-terrain?fixture=melee', (s) => s?.ok && s.route === 'battle-terrain' && s.stats.fixture === 'melee' && s.stats.waterQuads >= 3 && s.stats.sceneryQuads >= 8 && s.stats.selectionQuads === 0 && s.stats.cameraContract === 'shared-world-camera-wgsl'],
  ['battle-live?mode=5v5&ticks=36', (s) => s?.ok && s.route === 'battle-live' && s.stats.written > 1000 && s.stats.units >= 10 && s.stats.player > 0 && s.stats.enemy > 0 && s.stats.drawCalls >= 1 && s.stats.drawCalls <= 15 && s.stats.overlay.lineSegments >= 20 && s.stats.cameraContract === 'shared-world-camera-wgsl' && s.stats.overlay.cameraContract === 'shared-world-camera-wgsl'],
  ['battle-ui?mode=5v5&ticks=36', (s) => s?.ok && s.route === 'battle-ui' && s.stats.written > 1000 && s.stats.units >= 10 && s.stats.drawCalls >= 1 && s.stats.drawCalls <= 15 && s.stats.overlay.lineSegments >= 20 && s.stats.ui.cards >= 8 && s.stats.ui.toolbarButtons >= 5 && s.stats.ui.postCutoverScreenshots === 'webgpu-only' && s.stats.cameraContract === 'shared-world-camera-wgsl' && s.stats.overlay.cameraContract === 'shared-world-camera-wgsl'],
  ['battle-input?mode=5v5&ticks=36', (s) => s?.ok && s.route === 'battle-input' && s.stats.written > 1000 && s.stats.units >= 10 && s.stats.drawCalls >= 1 && s.stats.drawCalls <= 15 && s.stats.overlay.lineSegments >= 20 && s.stats.selectedUnits.length === 1 && s.stats.ui.cards >= 8 && s.stats.cameraContract === 'shared-world-camera-wgsl' && s.stats.overlay.cameraContract === 'shared-world-camera-wgsl'],
  ['cutover', (s) => s?.ok
    && s.route === 'cutover'
    && s.stats.kind === 'webgpu-cutover-report'
    && s.stats.renderer === 'raw-webgpu-production-default'
    && s.stats.routineScreenshots === 'webgpu-only'
    && s.stats.atmosphere === 'aegean-sky-haze'
    && s.stats.removed.includes('@babylonjs/core')
    && s.stats.retiredSwitches.includes('?gfx=legacy')
    && s.stats.complete >= 12
    && s.stats.releaseReady === true
    && s.stats.visualReport?.endsWith('webgpu-visual-report.html')
    && s.stats.perfReport?.endsWith('webgpu-performance-report.html')
    && s.stats.blockers.length === 0],
];

function countPixels(png) {
  let warmGround = 0;
  let blue = 0;
  let red = 0;
  let water = 0;
  let sky = 0;
  let gold = 0;
  let green = 0;
  let cloud = 0;
  let minimapDark = 0;
  let minimapBlue = 0;
  let minimapRed = 0;
  let minimapGold = 0;
  let nonBlank = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const o = (y * png.width + x) * 4;
      const r = png.data[o], g = png.data[o + 1], b = png.data[o + 2];
      if (r + g + b > 60) nonBlank++;
      if (r > 100 && g > 90 && g < 190 && b < 150) warmGround++;
      if (b > 110 && r < 120 && g < 165) blue++;
      if (r > 130 && g < 125 && b < 125) red++;
      if (b > 115 && g > 110 && r < 150) water++;
      if (b > 170 && g > 160 && r > 130) sky++;
      if (r > 160 && g > 120 && b < 90) gold++;
      if (g > 145 && r < 130 && b < 130) green++;
      if (r > 170 && g > 175 && b > 165 && Math.abs(r - g) < 36 && Math.abs(g - b) < 44) cloud++;
      if (r < 45 && g < 45 && b < 40) minimapDark++;
      if (x < 240 && y > png.height - 210 && y < png.height - 8) {
        if (r < 45 && g < 45 && b < 40) minimapDark++;
        if (b > 130 && r < 130 && g > 80) minimapBlue++;
        if (r > 130 && g < 100 && b < 100) minimapRed++;
        if (r > 160 && g > 120 && b < 90) minimapGold++;
      }
    }
  }
  return { warmGround, blue, red, water, sky, gold, green, cloud, minimapDark, minimapBlue, minimapRed, minimapGold, nonBlank };
}

function pixelByteDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let diff = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) diff++;
  return diff;
}

function patchStats(png, sample, radius = 4) {
  const cx = Math.max(0, Math.min(png.width - 1, Math.round(sample.x)));
  const cy = Math.max(0, Math.min(png.height - 1, Math.round(sample.y)));
  let red = 0;
  let blue = 0;
  let tan = 0;
  let green = 0;
  let count = 0;
  for (let y = Math.max(0, cy - radius); y <= Math.min(png.height - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(png.width - 1, cx + radius); x++) {
      const o = (y * png.width + x) * 4;
      const r = png.data[o], g = png.data[o + 1], b = png.data[o + 2];
      if (r > 135 && g < 95 && b < 95) red++;
      if (b > 120 && r < 110 && g < 140) blue++;
      if (r > 120 && g > 95 && g < 175 && b < 125) tan++;
      if (g > 135 && r < 120 && b < 120) green++;
      count++;
    }
  }
  return { x: cx, y: cy, count, red, blue, tan, green };
}

export async function run(ctx) {
  for (const [route, predicate] of routes) {
    const page = await ctx.newPage({ viewport: { width: 900, height: 620 }, errorPrefix: `webgpu-${route}` });
    await page.goto(`${ctx.target}/webgpu/${route}`);
    await page.waitForFunction(() => window.__webgpuLabReady === true && window.__webgpuLabStats, undefined, { timeout: 18000 });
    await page.waitForTimeout(280);
    const stats = await page.evaluate(() => window.__webgpuLabStats);
    ctx.check(`${route}: route stats satisfy contract`, predicate(stats), JSON.stringify(stats));
    const pixels = countPixels(PNG.sync.read(await page.screenshot()));
    ctx.check(`${route}: route rendered nonblank raw-WebGPU frame`, pixels.nonBlank > 200000 && pixels.warmGround > 8000, JSON.stringify(pixels));
    if (route === 'render-graph' || route === 'world-camera') {
      const canvasPng = PNG.sync.read(await page.locator('#webgpu-canvas').screenshot());
      const samples = stats.stats.samples;
      const lower = patchStats(canvasPng, samples.occludedLowerStandard);
      const upper = patchStats(canvasPng, samples.visibleUpperFlag);
      const frontRank = patchStats(canvasPng, samples.frontRankOverlap);
      ctx.check(
        `${route}: city volume occludes the lower planted standard`,
        lower.red <= 8 && lower.tan > 8,
        JSON.stringify({ lower, sample: samples.occludedLowerStandard }),
      );
      ctx.check(
        `${route}: inserted standard remains visible above the city`,
        upper.red > 12,
        JSON.stringify({ upper, sample: samples.visibleUpperFlag }),
      );
      ctx.check(
        `${route}: front battle rank wins overlapping depth`,
        frontRank.blue > 12 && frontRank.red <= 10,
        JSON.stringify({ frontRank, sample: samples.frontRankOverlap }),
      );
    }
    if (route === 'assets') {
      await page.click('#asset-validate-json');
      await page.waitForFunction(() => window.__webgpuLabStats?.stats?.imported !== null, undefined, { timeout: 5000 });
      const imported = await page.evaluate(() => window.__webgpuLabStats);
      ctx.check(
        `${route}: imported manifest validates through the workbench UI`,
        imported.stats.imported?.ok === false && imported.stats.imported.errors > 0,
        JSON.stringify(imported.stats.imported),
      );
    }
    if (route.includes('crowd') || route === 'battle' || route.startsWith('battle-live') || route.startsWith('battle-ui') || route.startsWith('battle-input')) {
      ctx.check(`${route}: player and enemy accents visible`, pixels.blue > 10 && pixels.red > 10, JSON.stringify(pixels));
    }
    if (route.startsWith('battle-terrain')) {
      ctx.check(`${route}: Aegean water and nonblack sky visible`, pixels.water > 1200 && pixels.sky > 1200, JSON.stringify(pixels));
      ctx.check(`${route}: warm ground and terrain highlights visible`, pixels.warmGround > 8000 && pixels.gold > 250, JSON.stringify(pixels));
    }
    if (route.startsWith('campaign-map')) {
      ctx.check(
        `${route}: parchment map, territory, atmosphere, roads, and city pins are visible`,
        pixels.warmGround > 45000 && pixels.water > 4000 && pixels.cloud > 1500 && pixels.red > 1000 && pixels.minimapDark > 10000 && stats.stats.borderSegments > 100,
        JSON.stringify(pixels),
      );
      const domLabelCount = await page.locator('.webgpu-campaign-label').count();
      ctx.check(
        `${route}: campaign labels are rendered by the WebGPU glyph atlas`,
        stats.stats.labelLayer === 'raw-webgpu-glyph-atlas'
          && stats.stats.visibleLabels >= 8
          && stats.stats.labelVertices >= stats.stats.visibleLabels * 6
          && domLabelCount === 0,
        JSON.stringify({ labelLayer: stats.stats.labelLayer, visibleLabels: stats.stats.visibleLabels, labelVertices: stats.stats.labelVertices, labelAtlas: stats.stats.labelAtlas, domLabelCount }),
      );
    }
    if (route.startsWith('campaign-ui')) {
      const ui = await page.evaluate(() => ({
        armyPanel: document.querySelector('.webgpu-campaign-panel.army')?.textContent ?? '',
        cityPanel: document.querySelector('.webgpu-campaign-panel.city')?.textContent ?? '',
        diplomacyRows: document.querySelectorAll('.webgpu-campaign-panel.diplomacy .cmp-diplo-row').length,
        classRows: document.querySelectorAll('.webgpu-campaign-panel.classes .cmp-class-row').length,
        replenish: document.querySelector('#cmp-auto-replenish') !== null,
      }));
      ctx.check(
        `${route}: WebGPU campaign entities and selection colors are visible`,
        pixels.warmGround > 45000 && pixels.red > 700 && pixels.green > 250 && pixels.gold > 600,
        JSON.stringify(pixels),
      );
      ctx.check(
        `${route}: retained campaign panels are visible over WebGPU`,
        ui.armyPanel.includes('Army 0') && ui.cityPanel.includes('Roma') && ui.diplomacyRows >= 1 && ui.classRows >= 8 && ui.replenish && stats.stats.labelLayer === 'raw-webgpu-glyph-atlas' && stats.stats.visibleLabels >= 1,
        JSON.stringify({ ui, labels: { layer: stats.stats.labelLayer, visible: stats.stats.visibleLabels, vertices: stats.stats.labelVertices } }),
      );
      const armyTarget = await page.evaluate(() => {
        const debug = window.__webgpuCampaignUi;
        const army = debug.armies.find((a) => a.mine);
        if (!army) throw new Error('campaign-ui army missing');
        return debug.project(army.x, army.y);
      });
      await page.mouse.click(armyTarget.x, armyTarget.y);
      await page.waitForTimeout(120);
      const armyClicked = await page.evaluate(() => window.__webgpuLabStats);
      ctx.check(
        `${route}: canvas click selects the rendered army marker`,
        armyClicked.stats.selectedArmy === 0 && armyClicked.stats.lastPick.kind === 'army',
        JSON.stringify({ target: armyTarget, stats: armyClicked.stats.lastPick, selectedArmy: armyClicked.stats.selectedArmy }),
      );
      const cityTarget = await page.evaluate(() => window.__webgpuCampaignUi.project(-28, 450));
      await page.mouse.click(cityTarget.x, cityTarget.y);
      await page.waitForTimeout(120);
      const cityClicked = await page.evaluate(() => window.__webgpuLabStats);
      ctx.check(
        `${route}: canvas click opens the rendered city panel`,
        cityClicked.stats.selectedArmy === -1 && cityClicked.stats.selectedCity === 0 && cityClicked.stats.lastPick.kind === 'city',
        JSON.stringify({ target: cityTarget, stats: cityClicked.stats.lastPick, selectedCity: cityClicked.stats.selectedCity }),
      );
    }
    if (route.startsWith('battle-live') || route.startsWith('battle-ui') || route.startsWith('battle-input')) {
      ctx.check(`${route}: WebGPU selection overlay visible`, pixels.gold > 250, JSON.stringify(pixels));
      ctx.check(
        `${route}: WebGPU minimap compositor visible`,
        stats.stats.minimap.units >= 10
          && pixels.minimapDark > 500
          && pixels.minimapBlue > 5
          && pixels.minimapRed > 5
          && pixels.minimapGold > 0,
        JSON.stringify({ stats: stats.stats.minimap, pixels }),
      );
    }
    if (route.startsWith('battle-ui')) {
      const ui = await page.evaluate(() => ({
        cards: document.querySelectorAll('.webgpu-unitcards .ucard').length,
        selectedCards: document.querySelectorAll('.webgpu-unitcards .ucard.sel').length,
        toolbarButtons: document.querySelectorAll('.webgpu-toolbar button').length,
        hudText: document.querySelector('.webgpu-battle-hud')?.textContent ?? '',
      }));
      ctx.check(
        `${route}: retained battle UI layer is visible over WebGPU`,
        ui.cards >= 8 && ui.selectedCards === 1 && ui.toolbarButtons >= 5 && ui.hudText.includes('raw WebGPU'),
        JSON.stringify(ui),
      );
    }
    await page.close();
  }

  for (const dpr of [1, 2]) {
    const route = 'battle-input?mode=5v5&ticks=36';
    const page = await ctx.newPage({ viewport: { width: 900, height: 620 }, deviceScaleFactor: dpr, errorPrefix: `webgpu-battle-input-dpr${dpr}` });
    await page.goto(`${ctx.target}/webgpu/${route}`);
    await page.waitForFunction(() => window.__webgpuLabReady === true && window.__webgpuBattleInput, undefined, { timeout: 18000 });
    await page.waitForTimeout(280);
    const target = await trueRenderedUnitScreen(page, 4);
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(120);
    const clicked = await page.evaluate(() => window.__webgpuLabStats);
    ctx.check(
      `battle-input dpr${dpr}: left-click selects the rendered unit pixel`,
      clicked.stats.selectedUnits.includes(4) && clicked.stats.lastPick.kind === 'click',
      JSON.stringify({ target, stats: clicked.stats.lastPick, selected: clicked.stats.selectedUnits }),
    );

    const target2 = await trueRenderedUnitScreen(page, 4);
    await page.mouse.move(target2.x - 60, target2.y - 38);
    await page.mouse.down();
    await page.mouse.move(target2.x + 60, target2.y + 38, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    const boxed = await page.evaluate(() => window.__webgpuLabStats);
    ctx.check(
      `battle-input dpr${dpr}: drag-box selects the rendered unit pixel`,
      boxed.stats.selectedUnits.includes(4) && boxed.stats.lastPick.kind === 'box' && boxed.stats.lastPick.boxUnits > 0,
      JSON.stringify({ target: target2, stats: boxed.stats.lastPick, selected: boxed.stats.selectedUnits }),
    );

    const orderTarget = await renderedWorldPoint(page, 4, -36, 18);
    await page.mouse.click(orderTarget.x, orderTarget.y, { button: 'right' });
    await page.waitForTimeout(120);
    const ordered = await page.evaluate(() => window.__webgpuLabStats);
    ctx.check(
      `battle-input dpr${dpr}: right-click issues a wasm move order`,
      ordered.stats.selectedOrder?.hasTarget
        && ordered.stats.lastOrder.kind === 'move'
        && ordered.stats.lastOrder.unit === 4
        && Math.hypot(ordered.stats.selectedOrder.targetX - orderTarget.worldX, ordered.stats.selectedOrder.targetY - orderTarget.worldY) < 1.5,
      JSON.stringify({ target: orderTarget, selectedOrder: ordered.stats.selectedOrder, lastOrder: ordered.stats.lastOrder }),
    );

    const zoomBefore = ordered.stats.camera.zoom;
    await page.mouse.move(orderTarget.x, orderTarget.y);
    await page.mouse.wheel(0, -220);
    await page.waitForTimeout(120);
    const zoomed = await page.evaluate(() => window.__webgpuLabStats);
    ctx.check(
      `battle-input dpr${dpr}: wheel zoom updates the WebGPU camera`,
      zoomed.stats.camera.zoom > zoomBefore,
      JSON.stringify({ before: zoomBefore, after: zoomed.stats.camera.zoom }),
    );

    await page.evaluate(() => window.__webgpuBattleInput.freezeAtTick(72));
    const canvas = page.locator('#webgpu-canvas');
    const frozenA = await canvas.screenshot();
    await page.evaluate(() => window.__webgpuBattleInput.freezeAtTick(72));
    const frozenB = await canvas.screenshot();
    const frozenStats = await page.evaluate(() => window.__webgpuLabStats);
    const frozenPixelDiff = pixelByteDiff(PNG.sync.read(frozenA), PNG.sync.read(frozenB));
    ctx.check(
      `battle-input dpr${dpr}: freezeAtTick pins tick and pixels`,
      frozenStats.stats.ticks === 72 && frozenStats.stats.frozen === true && frozenPixelDiff === 0,
      JSON.stringify({ ticks: frozenStats.stats.ticks, frozen: frozenStats.stats.frozen, bytesA: frozenA.length, bytesB: frozenB.length, cmp: Buffer.compare(frozenA, frozenB), pixelByteDiff: frozenPixelDiff }),
    );
    await page.close();
  }
}

async function trueRenderedUnitScreen(page, unitId) {
  return page.evaluate((unit) => {
    const debug = window.__webgpuBattleInput;
    const target = debug.units.find((u) => u.unit === unit);
    if (!target) throw new Error(`unit ${unit} missing`);
    const c = debug.camera;
    const cv = document.getElementById('webgpu-canvas');
    const rect = cv.getBoundingClientRect();
    const cosP = Math.max(0.2, Math.cos(c.pitch || 0));
    const yawC = Math.cos(c.yaw || 0);
    const yawS = Math.sin(c.yaw || 0);
    const dx = target.x - c.x;
    const dy = target.y - c.y;
    const rx = dx * yawC + dy * yawS;
    const ry = -dx * yawS + dy * yawC;
    const canvasX = rx * c.zoom + c.width / 2;
    const canvasY = -ry * c.zoom * cosP + c.height / 2;
    return {
      unit,
      x: rect.left + canvasX * (cv.clientWidth / cv.width),
      y: rect.top + canvasY * (cv.clientHeight / cv.height),
      canvasX,
      canvasY,
      dprWidth: cv.width,
      cssWidth: cv.clientWidth,
    };
  }, unitId);
}

async function renderedWorldPoint(page, unitId, dxWorld, dyWorld) {
  return page.evaluate(({ unit, dx, dy }) => {
    const debug = window.__webgpuBattleInput;
    const base = debug.units.find((u) => u.unit === unit);
    if (!base) throw new Error(`unit ${unit} missing`);
    const c = debug.camera;
    const cv = document.getElementById('webgpu-canvas');
    const rect = cv.getBoundingClientRect();
    const worldX = base.x + dx;
    const worldY = base.y + dy;
    const cosP = Math.max(0.2, Math.cos(c.pitch || 0));
    const yawC = Math.cos(c.yaw || 0);
    const yawS = Math.sin(c.yaw || 0);
    const relX = worldX - c.x;
    const relY = worldY - c.y;
    const rx = relX * yawC + relY * yawS;
    const ry = -relX * yawS + relY * yawC;
    const canvasX = rx * c.zoom + c.width / 2;
    const canvasY = -ry * c.zoom * cosP + c.height / 2;
    return {
      unit,
      worldX,
      worldY,
      x: rect.left + canvasX * (cv.clientWidth / cv.width),
      y: rect.top + canvasY * (cv.clientHeight / cv.height),
      canvasX,
      canvasY,
    };
  }, { unit: unitId, dx: dxWorld, dy: dyWorld });
}
