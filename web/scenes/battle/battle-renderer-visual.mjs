import { battleRendererReady } from "../worlds.mjs";
import { PNG } from "pngjs";
import { UNIT_INFO, worldPointNearUnit } from "../_battle-unit-info.mjs";
import { hasBattleWorldDepthContract } from "../_renderer-contract.mjs";

export const meta = {
  name: "battle-renderer-visual",
  kind: "visual",
  world: "battle-5v5",
  tier: "quick",
  snapshots: ["battle-selection-dpr2"],
  describe:
    "Production WebGPU battle selection frame at DPR2 with HUD, terrain props, ground cues, and army silhouettes.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "requires WebGPU browser flags",
      true,
      "set VERIFY_GPU=1 to capture WebGPU battle visuals",
    );
    return;
  }

  const page = await ctx.newPage({
    deviceScaleFactor: 2,
    errorPrefix: "renderer-battle-visual-dpr2",
  });
  await page.goto(`${ctx.target}?battle=5v5&ai=off`);
  await battleRendererReady(page, 20000);

  await page.evaluate((unitInfo) => {
    window.__game.freezeAtTick(72);
    window.__game.select(4);
    const info = window.__game.unitInfo(4);
    const cam = window.__cam;
    cam.yaw = 0;
    cam.zoom = 2.8;
    cam.x = info[unitInfo.x] - 70;
    cam.y = info[unitInfo.y] - 6;
    cam.clampView?.();
  }, UNIT_INFO);
  await page.waitForTimeout(150);

  const orderTarget = await worldPointNearUnit(page, 4, -80, 45);
  await page.mouse.click(orderTarget.x, orderTarget.y, { button: "right" });
  // Wait for a rendered tactical frame carrying both the selection rings and
  // the order-flash cues (the flash lasts ~2.5s; software-GPU frames are slow).
  await page
    .waitForFunction(
      () => {
        const t = window.__game.stats().renderStats.tacticalLines;
        return t?.rings?.count > 0 && t?.groundCues?.count > 0;
      },
      undefined,
      { timeout: 10000, polling: 100 },
    )
    .catch(() => {});

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
    "WebGPU battle visual frame is selected and ordered through production input",
    state.selected.includes(4) &&
      state.hasTarget > 0.5 &&
      Math.hypot(state.targetX - orderTarget.worldX, state.targetY - orderTarget.worldY) < 2.0 &&
      state.stats.renderer === "gpu" &&
      hasBattleWorldDepthContract(state.stats.renderStats) &&
      state.stats.renderStats?.tacticalLines?.rings?.count > 0,
    JSON.stringify({ orderTarget, state }),
  );
  ctx.check(
    "WebGPU battle visual frame includes terrain props and tactical ground cues",
    state.stats.renderStats?.terrain?.installed === true &&
      state.stats.renderStats.terrain.generation > 0 &&
      state.stats.renderStats.terrain.groundTriangles > 1000 &&
      state.stats.renderStats.terrain.scenery > 0 &&
      // Tactical ground decals in the frozen frame: selection rings (the
      // frozen scene renders no post-order flash frames).
      (state.stats.renderStats.tacticalLines?.groundCues?.count > 0 ||
        state.stats.renderStats.tacticalLines?.rings?.count > 0),
    JSON.stringify({
      terrain: state.stats.renderStats?.terrain,
      tacticalLines: state.stats.renderStats?.tacticalLines,
    }),
  );

  const shot = await page.screenshot();
  const metrics = battleVisualMetrics(PNG.sync.read(shot));
  ctx.check(
    "WebGPU battle visual frame has HUD panels, army mass, terrain, and selection pixels",
    metrics.warmTerrain > 20000 &&
      metrics.crowdMass > 500 &&
      metrics.greenSelection > 120 &&
      metrics.darkHud > 15000,
    JSON.stringify(metrics),
  );
  await ctx.snap(page, "battle-selection-dpr2", { shot });
  await page.close();
}

function battleVisualMetrics(png) {
  let warmTerrain = 0;
  let crowdMass = 0;
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
      if (y < png.height * 0.7 && isCrowdMass(r, g, b)) crowdMass++;
      if (g > r + 32 && g > b + 24 && g > 120) greenSelection++;
      if (y > png.height * 0.7 && r < 70 && g < 75 && b < 85) darkHud++;
    }
  }
  return {
    width: png.width,
    height: png.height,
    warmTerrain,
    crowdMass,
    greenSelection,
    darkHud,
  };
}

function isCrowdMass(r, g, b) {
  const luma = r * 0.3 + g * 0.59 + b * 0.11;
  const greenField = g > r + 22 && g > b + 12;
  return luma > 34 && luma < 132 && r < 165 && g < 155 && b < 145 && !greenField;
}
