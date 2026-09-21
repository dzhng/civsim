import { PNG } from "pngjs";
import { battleReal } from "../worlds.mjs";
import { hasBattleWorldDepthContract, hasBattleSeatingInspection } from "../_renderer-contract.mjs";

export const meta = {
  name: "battle-renderer-default",
  kind: "flow",
  world: "battle-real",
  tier: "quick",
  snapshots: [],
  describe: "Normal battle launch uses the production TypeGPU renderer.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "requires WebGPU browser flags",
      true,
      "set VERIFY_GPU=1 to exercise the default renderer",
    );
    return;
  }

  const page = await battleReal(ctx, { settle: 500, errorPrefix: "gpu-default" });

  await page.evaluate(() => window.__game.freezeAtTick(window.__game.tickCount()));
  const stats = await page.evaluate(() => window.__game.stats());
  ctx.check(
    "battle default renderer is the TypeGPU world",
    stats.renderer === "gpu" &&
      stats.renderStats?.ready === true &&
      stats.renderStats.soldiers === stats.soldiers &&
      Object.values(stats.renderStats.native?.crowd?.impostors ?? {}).some(
        (layer) => layer.instances > 0 && layer.draws > 0,
      ) &&
      stats.renderStats.environment === "golden-hour" &&
      hasBattleWorldDepthContract(stats.renderStats),
    JSON.stringify(stats),
  );
  ctx.check(
    // Draw-call count stays independent of soldier count (instanced crowd, not
    // per-soldier draws): the whole world fits a small fixed budget.
    "renderer drew the full battle crowd",
    stats.renderStats?.soldiers === stats.renderStats?.expectedSoldiers &&
      stats.renderStats?.soldiers === stats.soldiers &&
      stats.renderStats?.drawCalls > 0 &&
      stats.renderStats?.drawCalls < 64,
    JSON.stringify(stats.renderStats),
  );
  ctx.check(
    "WebGPU battle terrain includes sim-sourced feature detail",
    stats.renderStats?.terrain?.installed === true &&
      stats.renderStats.terrain.generation > 0 &&
      stats.renderStats.environment === "golden-hour" &&
      stats.renderStats.terrain.grass?.layers?.some((layer) => layer.recordCount > 0) &&
      // Owner-reported indirect-draw wiring; resolved GPU blade counts are unavailable.
      stats.renderStats.terrain.grass.layers.every((layer) => layer.drawIndirect === true) &&
      stats.renderStats.terrain.groundTriangles > 1000 &&
      stats.renderStats.terrain.scenery > 0,
    JSON.stringify(stats.renderStats?.terrain),
  );

  const seating = await page.evaluate(() => window.__game.verifySeating());
  ctx.check(
    "presented crowd seats every expected soldier on its installed terrain",
    hasBattleSeatingInspection(seating),
    JSON.stringify(seating),
  );

  const shot = await page.screenshot();
  const png = PNG.sync.read(shot);
  let terrain = 0;
  let crowd = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    if ((r > 100 && g > 86 && b < 125) || (g > 78 && g >= r - 12 && b < 150)) terrain++;
    if (isCrowdMass(r, g, b)) crowd++;
  }
  ctx.check(
    "WebGPU battle frame has visible terrain and crowd mass",
    terrain > 20000 && crowd > 300,
    JSON.stringify({ terrain, crowd }),
  );
  const cache = await page.evaluate(async () => {
    const game = window.__game;
    const frames = async () => {
      for (let i = 0; i < 3; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
    };
    game.freeze(true);
    await game.freezeAtTick(game.tickCount());
    const first = game.debugSoldierAnim(0);
    await frames();
    const repeated = game.debugSoldierAnim(0);
    await game.freezeAtTick(game.tickCount() + 3);
    await frames();
    const advanced = game.debugSoldierAnim(0);
    const tickBeforeReload = game.tickCount();
    const beforeReload = await game.verifySeating();
    await game.reloadSoldierAssets();
    await frames();
    await game.freezeAtTick(tickBeforeReload);
    const reloaded = game.debugSoldierAnim(0);
    const afterReload = await game.verifySeating();
    return {
      repeatedSamePayload: !!first?.playback && first.playback === repeated?.playback,
      advancedNewPayload: !!advanced?.playback && advanced.playback !== repeated?.playback,
      advancedPhase: advanced?.phase,
      priorPhase: repeated?.phase,
      reloadSameTick: game.tickCount() === tickBeforeReload,
      reloadNewPayload: !!reloaded?.playback && reloaded.playback !== advanced?.playback,
      reloadPhase: reloaded?.phase,
      reloadClip: reloaded?.clip,
      priorClip: advanced?.clip,
      beforeReload,
      afterReload,
    };
  });
  ctx.check(
    "frozen frame reuse retains the same submitted pose",
    cache.repeatedSamePayload,
    JSON.stringify(cache),
  );
  ctx.check(
    "frozen tick advance refreshes the submitted phase at the same camera",
    cache.advancedNewPayload && cache.advancedPhase !== cache.priorPhase,
    JSON.stringify(cache),
  );
  ctx.check(
    "successful same-tick catalog reload presents a new crowd generation with the same pose",
    cache.reloadSameTick &&
      cache.reloadNewPayload &&
      cache.reloadPhase === cache.advancedPhase &&
      cache.reloadClip === cache.priorClip &&
      hasBattleSeatingInspection(cache.beforeReload) &&
      hasBattleSeatingInspection(cache.afterReload) &&
      cache.afterReload.presentedFrameId > cache.beforeReload.presentedFrameId &&
      cache.afterReload.presented.crowdGeneration > cache.beforeReload.presented.crowdGeneration,
    JSON.stringify(cache),
  );
  await page.close();
}

function isCrowdMass(r, g, b) {
  const luma = r * 0.3 + g * 0.59 + b * 0.11;
  const greenField = g > r + 22 && g > b + 12;
  return luma > 34 && luma < 132 && r < 165 && g < 155 && b < 145 && !greenField;
}
