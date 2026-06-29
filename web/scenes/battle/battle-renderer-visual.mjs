import { PNG } from 'pngjs';
import { UNIT_INFO, worldPointNearUnit } from '../_battle-unit-info.mjs';
import { hasBattleWorldDepthContract } from '../_renderer-contract.mjs';

export const meta = {
  name: 'battle-renderer-visual',
  kind: 'visual',
  world: 'battle-5v5',
  tier: 'quick',
  snapshots: ['battle-selection-dpr2'],
  describe: 'Production WebGPU battle selection frame at DPR2 with HUD, terrain props, ground cues, and team silhouettes.',
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('requires WebGPU browser flags', true, 'set VERIFY_GPU=1 to capture WebGPU battle visuals');
    return;
  }

  const page = await ctx.newPage({ deviceScaleFactor: 2, errorPrefix: 'renderer-battle-visual-dpr2' });
  await page.goto(`${ctx.target}?battle=5v5&ai=off`);
  await page.waitForFunction(() => {
    const stats = window.__game?.stats?.();
    return window.__ready === true
      && stats?.renderer === 'gpu'
      && stats.renderStats?.ready === true
      && stats.renderStats.soldiers === stats.soldiers;
  }, undefined, { timeout: 20000 });

  await page.evaluate((unitInfo) => {
    window.__game.freezeAtTick(72);
    window.__game.select(4);
    const info = window.__game.unitInfo(4);
    const cam = window.__cam;
    cam.pitch = 0;
    cam.yaw = 0;
    cam.zoom = 2.8;
    cam.x = info[unitInfo.x] - 70;
    cam.y = info[unitInfo.y] - 6;
    cam.clampView?.();
  }, UNIT_INFO);
  await page.waitForTimeout(150);

  const orderTarget = await worldPointNearUnit(page, 4, -80, 45);
  await page.mouse.click(orderTarget.x, orderTarget.y, { button: 'right' });
  await page.waitForTimeout(250);

  const state = await page.evaluate((unitInfo) => {
    const stats = window.__game.stats();
    const info = window.__game.unitInfo(4);
    return {
      selected: window.__game.selected(),
      hasTarget: info[unitInfo.hasTarget],
      targetX: info[unitInfo.targetX],
      targetY: info[unitInfo.targetY],
      stats,
    };
  }, UNIT_INFO);
  ctx.check(
    'WebGPU battle visual frame is selected and ordered through production input',
    state.selected.includes(4)
      && state.hasTarget > 0.5
      && Math.hypot(state.targetX - orderTarget.worldX, state.targetY - orderTarget.worldY) < 2.0
      && state.stats.renderer === 'gpu'
      && hasBattleWorldDepthContract(state.stats.renderStats)
      && state.stats.renderStats?.tacticalLines?.groundCues?.lineSegments > 0,
    JSON.stringify({ orderTarget, state }),
  );
  ctx.check(
    'WebGPU battle visual frame includes terrain props and tactical ground cues',
    state.stats.renderStats?.terrain?.fixture === 'sim-tint'
      && state.stats.renderStats.terrain.sceneryQuads > 800
      && state.stats.renderStats.terrain.worldPropQuads > 800
      && state.stats.renderStats.tacticalLines?.groundCues?.lineSegments > 0,
    JSON.stringify({
      terrain: state.stats.renderStats?.terrain,
      tacticalLines: state.stats.renderStats?.tacticalLines,
    }),
  );

  const shot = await page.screenshot();
  const metrics = battleVisualMetrics(PNG.sync.read(shot));
  ctx.check(
    'WebGPU battle visual frame has HUD panels, teams, terrain, and selection pixels',
    metrics.warmTerrain > 20000
      && metrics.blueTeam > 250
      && metrics.redTeam > 250
      && metrics.greenSelection > 120
      && metrics.darkHud > 15000,
    JSON.stringify(metrics),
  );
  await ctx.snap(page, 'battle-selection-dpr2', { shot });
  await page.close();
}

function battleVisualMetrics(png) {
  let warmTerrain = 0;
  let blueTeam = 0;
  let redTeam = 0;
  let greenSelection = 0;
  let darkHud = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      if (a < 16) continue;
      if (r > 135 && g > 115 && b < 120) warmTerrain++;
      if (b > r + 24 && b > g + 8) blueTeam++;
      if (r > g + 22 && r > b + 26 && r > 105) redTeam++;
      if (g > r + 32 && g > b + 24 && g > 120) greenSelection++;
      if (y > png.height * 0.70 && r < 70 && g < 75 && b < 85) darkHud++;
    }
  }
  return { width: png.width, height: png.height, warmTerrain, blueTeam, redTeam, greenSelection, darkHud };
}
