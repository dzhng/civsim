import { PNG } from 'pngjs';
import { UNIT_INFO, unitScreen, worldPointNearUnit } from '../_battle-unit-info.mjs';
import { hasBattleWorldDepthContract } from '../_renderer-contract.mjs';

export const meta = {
  name: 'battle-input',
  kind: 'flow',
  world: 'battle-5v5',
  tier: 'quick',
  snapshots: [],
  describe: 'Production WebGPU battle route preserves click, box-select, orders, zoom, DPR, and freeze semantics.',
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('requires WebGPU browser flags', true, 'set VERIFY_GPU=1 to exercise the production input path');
    return;
  }

  for (const dpr of [1, 2]) {
    const page = await ctx.newPage({ deviceScaleFactor: dpr, errorPrefix: `gpu-input-dpr${dpr}` });
    await page.goto(`${ctx.target}?battle=5v5&ai=off`);
    await page.waitForFunction(() => {
      const stats = window.__game?.stats?.();
      return window.__ready === true
        && stats?.renderer === 'gpu'
        && stats.renderStats?.ready === true
        && stats.renderStats.soldiers === stats.soldiers;
    }, undefined, { timeout: 20000 });
    await page.waitForTimeout(300);

    await frameUnit(page, 4);

    const target = await unitScreen(page, 4);
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(120);
    const clicked = await page.evaluate(() => window.__game.selected());
    ctx.check(
      `dpr${dpr}: left-click selects the rendered WebGPU unit`,
      clicked.includes(4),
      JSON.stringify({ target, selected: clicked }),
    );

    await page.evaluate(() => window.__game.select(-1));
    const boxTarget = await unitScreen(page, 4);
    await page.mouse.move(boxTarget.x - 70, boxTarget.y - 45);
    await page.mouse.down();
    await page.mouse.move(boxTarget.x, boxTarget.y, { steps: 3 });
    await page.mouse.move(boxTarget.x + 70, boxTarget.y + 45, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    const boxed = await page.evaluate(() => window.__game.selected());
    ctx.check(
      `dpr${dpr}: drag-box selects the rendered WebGPU unit`,
      boxed.includes(4),
      JSON.stringify({ target: boxTarget, selected: boxed }),
    );

    await page.evaluate(() => window.__game.freezeAtTick(72));
    await page.waitForTimeout(120);
    const canvas = page.locator('#battlefield');
    const frozenA = PNG.sync.read(await canvas.screenshot());
    await page.evaluate(() => window.__game.freezeAtTick(72));
    await page.waitForTimeout(120);
    const frozenB = PNG.sync.read(await canvas.screenshot());
    const frozenStats = await page.evaluate(() => window.__game.stats());
    const frozenDiff = pixelByteDiff(frozenA, frozenB);
    ctx.check(
      `dpr${dpr}: freezeAtTick keeps WebGPU canvas pixels stable`,
      frozenStats.renderer === 'gpu'
        && hasBattleWorldDepthContract(frozenStats.renderStats)
        && frozenDiff === 0,
      JSON.stringify({ renderer: frozenStats.renderer, diffBytes: frozenDiff, renderStats: frozenStats.renderStats }),
    );

    const orderTarget = await worldPointNearUnit(page, 4, -80, 45);
    await page.mouse.click(orderTarget.x, orderTarget.y, { button: 'right' });
    await page.waitForTimeout(120);
    const ordered = await page.evaluate((unitInfo) => {
      const info = window.__game.unitInfo(4);
      return {
        selected: window.__game.selected(),
        targetX: info[unitInfo.targetX],
        targetY: info[unitInfo.targetY],
        hasTarget: info[unitInfo.hasTarget],
        stats: window.__game.stats(),
      };
    }, UNIT_INFO);
    ctx.check(
      `dpr${dpr}: right-click issues a wasm move order through WebGPU canvas input`,
      ordered.selected.includes(4)
        && ordered.hasTarget > 0.5
        && Math.hypot(ordered.targetX - orderTarget.worldX, ordered.targetY - orderTarget.worldY) < 2.0
        && ordered.stats.renderStats?.soldiers === ordered.stats.soldiers
        && hasBattleWorldDepthContract(ordered.stats.renderStats),
      JSON.stringify({ target: orderTarget, ordered }),
    );

    const zoomBefore = await page.evaluate(() => window.__cam.zoom);
    await page.mouse.move(orderTarget.x, orderTarget.y);
    await page.mouse.wheel(0, -220);
    await page.waitForTimeout(120);
    const zoomed = await page.evaluate(() => ({ zoom: window.__cam.zoom, stats: window.__game.stats() }));
    ctx.check(
      `dpr${dpr}: wheel zoom updates the production WebGPU battle camera`,
      zoomed.zoom > zoomBefore
        && zoomed.stats.renderStats?.soldiers === zoomed.stats.soldiers
        && hasBattleWorldDepthContract(zoomed.stats.renderStats),
      JSON.stringify({ before: zoomBefore, after: zoomed.zoom, renderStats: zoomed.stats.renderStats }),
    );

    await page.close();
  }
}

async function frameUnit(page, unit) {
  await page.evaluate(({ unit, unitInfo }) => {
    const info = window.__game.unitInfo(unit);
    const cam = window.__cam;
    cam.zoom = 3;
    cam.pitch = 0;
    cam.yaw = 0;
    cam.x = info[unitInfo.x] - 90;
    cam.y = info[unitInfo.y];
    cam.clampView?.();
    window.__game.select(-1);
  }, { unit, unitInfo: UNIT_INFO });
  await page.waitForTimeout(150);
}

function pixelByteDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let diff = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) diff++;
  return diff;
}
