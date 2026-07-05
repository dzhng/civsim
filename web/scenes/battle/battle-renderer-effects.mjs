import { PNG } from "pngjs";
import { hasBattleWorldDepthContract } from "../_renderer-contract.mjs";

export const meta = {
  name: "battle-renderer-effects",
  kind: "visual",
  world: "battle-5v5",
  tier: "quick",
  snapshots: ["battle-projectiles-dpr2"],
  describe:
    "Production WebGPU battle frame with deterministic projectile/effect-line overlay at DPR2.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "requires WebGPU browser flags",
      true,
      "set VERIFY_GPU=1 to capture WebGPU battle effects",
    );
    return;
  }

  const page = await ctx.newPage({ deviceScaleFactor: 2, errorPrefix: "battle-effects-dpr2" });
  await page.goto(`${ctx.target}?battle=5v5&ai=on`);
  await page.waitForFunction(
    () => {
      const stats = window.__game?.stats?.();
      return (
        window.__ready === true &&
        stats?.renderer === "gpu" &&
        stats.renderStats?.ready === true &&
        stats.renderStats.soldiers === stats.soldiers
      );
    },
    undefined,
    { timeout: 20000 },
  );

  await page.evaluate(() => {
    window.__cam.zoom = 2.6;
    window.__cam.yaw = 0;
    window.__cam.x = 0;
    window.__cam.y = 0;
    window.__cam.clampView?.();
    return window.__game.freezeAtTick(473);
  });
  await page.waitForTimeout(120);
  const canvas = page.locator("#battlefield");
  const hiddenEffectsCanvas = PNG.sync.read(await canvas.screenshot());

  await page.evaluate(() => {
    return window.__game.freezeAtTickWithEffects(473);
  });
  await page.waitForTimeout(250);

  const state = await page.evaluate(() => ({
    tick: window.__game.tickCount(),
    stats: window.__game.stats(),
  }));
  const effects = state.stats.renderStats?.tacticalLines?.effects;
  ctx.check(
    "WebGPU battle effect frame preserves deterministic projectile/effect segments",
    state.tick === 473 &&
      state.stats.renderer === "gpu" &&
      hasBattleWorldDepthContract(state.stats.renderStats) &&
      effects?.lineSegments >= 40,
    JSON.stringify({ tick: state.tick, effects, renderStats: state.stats.renderStats }),
  );

  const shot = await page.screenshot();
  const canvasShot = await canvas.screenshot();
  const pageMetrics = battleEffectPageMetrics(PNG.sync.read(shot));
  const visibleEffectsCanvas = PNG.sync.read(canvasShot);
  const canvasMetrics = {
    width: visibleEffectsCanvas.width,
    height: visibleEffectsCanvas.height,
    effectDiffPixels: pixelDiff(hiddenEffectsCanvas, visibleEffectsCanvas),
  };
  ctx.check(
    "WebGPU battle effect frame has projectile pixels, army mass, terrain, HUD, and minimap",
    canvasMetrics.effectDiffPixels > 25 &&
      pageMetrics.warmTerrain > 20000 &&
      pageMetrics.crowdMass > 500 &&
      pageMetrics.darkHud > 15000 &&
      pageMetrics.minimapPixels > 5000,
    JSON.stringify({ pageMetrics, canvasMetrics }),
  );
  await ctx.snap(page, "battle-projectiles-dpr2", { shot });
  await page.close();
}

function battleEffectPageMetrics(png) {
  let warmTerrain = 0;
  let crowdMass = 0;
  let darkHud = 0;
  let minimapPixels = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      if (a < 16) continue;
      if (r > 135 && g > 115 && b < 120) warmTerrain++;
      if (y < png.height * 0.7 && isCrowdMass(r, g, b)) crowdMass++;
      if (y > png.height * 0.7 && r < 70 && g < 75 && b < 85) darkHud++;
      if (x > png.width * 0.78 && y > png.height * 0.72 && g > 70 && g > r * 0.75 && b < 120)
        minimapPixels++;
    }
  }
  return {
    width: png.width,
    height: png.height,
    warmTerrain,
    crowdMass,
    darkHud,
    minimapPixels,
  };
}

function isCrowdMass(r, g, b) {
  const luma = r * 0.3 + g * 0.59 + b * 0.11;
  const greenField = g > r + 22 && g > b + 12;
  return luma > 34 && luma < 132 && r < 165 && g < 155 && b < 145 && !greenField;
}

function pixelDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let diff = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    const da = Math.abs(a.data[i + 3] - b.data[i + 3]);
    if (dr + dg + db + da > 20) diff++;
  }
  return diff;
}
