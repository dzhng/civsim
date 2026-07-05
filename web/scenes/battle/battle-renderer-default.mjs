import { PNG } from "pngjs";
import { battleReal } from "../worlds.mjs";
import { hasBattleWorldDepthContract } from "../_renderer-contract.mjs";

export const meta = {
  name: "battle-renderer-default",
  kind: "flow",
  world: "battle-real",
  tier: "quick",
  snapshots: [],
  describe: "Normal battle launch uses the raw renderer by default.",
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
  await page.waitForFunction(
    () => {
      const stats = window.__game?.stats?.();
      return (
        stats?.renderer === "gpu" &&
        stats.renderStats?.ready === true &&
        stats.renderStats.soldiers === stats.soldiers
      );
    },
    undefined,
    { timeout: 12000 },
  );
  const stats = await page.evaluate(() => window.__game.stats());
  ctx.check(
    "battle default renderer is the photoreal WebGPU world",
    stats.renderer === "gpu" &&
      stats.renderStats?.ready === true &&
      stats.renderStats.soldiers === stats.soldiers &&
      stats.renderStats.markerLayer === "far-lod-impostor" &&
      stats.renderStats.lod?.impostors > 0 &&
      stats.renderStats.environment === "golden" &&
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
    stats.renderStats?.terrain?.fixture === "sim-tint" &&
      stats.renderStats.terrain.layer === "photoreal-battle-ground" &&
      stats.renderStats.terrain.environment?.id === "golden-hour" &&
      stats.renderStats.terrain.environment?.source === "CIVSIM_ENVIRONMENTS.golden" &&
      stats.renderStats.terrain.grass?.layer === "photoreal-blade-field" &&
      stats.renderStats.terrain.grass?.recordCount > 0 &&
      stats.renderStats.terrain.grass?.sourceStorageCore?.runtimeComputeRoute === "active" &&
      stats.renderStats.terrain.groundTriangles > 1000 &&
      stats.renderStats.terrain.scenery > 0,
    JSON.stringify(stats.renderStats?.terrain),
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
  await page.close();

  for (const retired of ["2d", "3d"]) {
    const legacyPage = await ctx.newPage({ errorPrefix: `retired-gfx-${retired}` });
    await legacyPage.goto(`${ctx.target}?battle=duel&a=0&b=0&ai=off&gfx=${retired}`);
    await legacyPage.waitForFunction(
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
      { timeout: 12000 },
    );
    const retiredStats = await legacyPage.evaluate(() => window.__game.stats());
    ctx.check(
      `retired gfx=${retired} battle route still uses raw WebGPU`,
      retiredStats.renderer === "gpu" &&
        retiredStats.renderStats?.drawCalls > 0 &&
        retiredStats.renderStats?.drawCalls < 64 &&
        // Slice 14b: at the duel route's default zoom a 2m soldier subtends
        // only ~3 px, so the projected-screen-height LOD promotes the whole
        // crowd to the far octahedral-impostor tier — 'none' (all skinned
        // mesh) was the pre-14b state. Either LOD-driven marker state is valid.
        (retiredStats.renderStats?.markerLayer === "none" ||
          retiredStats.renderStats?.markerLayer === "far-lod-impostor") &&
        hasBattleWorldDepthContract(retiredStats.renderStats),
      JSON.stringify(retiredStats),
    );
    await legacyPage.close();
  }
}

function isCrowdMass(r, g, b) {
  const luma = r * 0.3 + g * 0.59 + b * 0.11;
  const greenField = g > r + 22 && g > b + 12;
  return luma > 34 && luma < 132 && r < 165 && g < 155 && b < 145 && !greenField;
}
