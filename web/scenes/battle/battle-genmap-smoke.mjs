import { PNG } from "pngjs";

const SEED7_HASH = "0x38e99f04c18d3968";

export const meta = {
  name: "battle-genmap-smoke",
  kind: "visual",
  world: "battle-generated-seed-7",
  tier: "quick",
  snapshots: ["battle-genmap-smoke"],
  describe: "Generated battle map seed 7 boots Rust -> wasm -> frontend -> photoreal -> screen.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("generated battle map smoke requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "battle-genmap-smoke",
  });
  await page.goto(`${ctx.target}/?map=gen&seed=7`);
  await page.waitForFunction(
    () => {
      const stats = window.__game?.stats?.();
      return (
        window.__ready === true &&
        stats?.renderStats?.ready === true &&
        stats.renderStats.terrain?.fixture === "sim-tint"
      );
    },
    undefined,
    { timeout: 20000 },
  );

  const terrain = await page.evaluate(() => window.__game.terrainDebug());
  ctx.check(
    "generated map dimensions match the default recipe",
    terrain.w === 600 &&
      terrain.h === 400 &&
      terrain.cell === 4 &&
      terrain.worldWidth === 2400 &&
      terrain.worldHeight === 1600,
    JSON.stringify(terrain),
  );
  ctx.check(
    "generated descriptor carries seed, cover, relief, and wasm hash",
    terrain.generatedMap?.seed === 7 &&
      terrain.generatedMap?.groundCover === "green-grass" &&
      terrain.generatedMap?.reliefScale === 1.0 &&
      terrain.generatedMap?.terrainHash === SEED7_HASH,
    JSON.stringify(terrain.generatedMap),
  );
  ctx.check(
    "generated E/W edges are sealed (wasm certify verdicts)",
    terrain.certificates.westSealed > 0.9 && terrain.certificates.eastSealed > 0.9,
    JSON.stringify(terrain.certificates),
  );
  ctx.check(
    "generated N/S edges are open (wasm certify verdicts)",
    terrain.certificates.southOpen > 0.6 && terrain.certificates.northOpen > 0.6,
    JSON.stringify(terrain.certificates),
  );
  ctx.check(
    "generated deployment bands are passable and connected (wasm certify verdicts)",
    terrain.certificates.southDeployPassable > 0.99 &&
      terrain.certificates.northDeployPassable > 0.99 &&
      terrain.certificates.corridor === true,
    JSON.stringify(terrain.certificates),
  );
  ctx.check(
    "generated flank bands are unreachable and passability has no orphan pockets (wasm certify verdicts)",
    terrain.certificates.westFlankUnreachable > 0.95 &&
      terrain.certificates.eastFlankUnreachable > 0.95 &&
      terrain.certificates.orphanBlockedCells === 0 &&
      terrain.certificates.largestIsolatedPassablePocket <= 96,
    JSON.stringify(terrain.certificates),
  );

  await page.evaluate(() => {
    window.__game.freezeAtTick(240);
    const c = window.__cam;
    c.yaw = -Math.PI / 2;
    c.zoom = 0.72;
    c.setViewCenter(0, -160);
    c.clampView?.();
  });
  await page.waitForTimeout(200);
  const shot = await page.screenshot();
  const pixels = terrainPixels(PNG.sync.read(shot));
  ctx.check(
    "generated smoke frame shows a real terrain render",
    pixels.terrain > 25000 && pixels.nonBlack > 200000,
    JSON.stringify(pixels),
  );
  await ctx.snap(page, "battle-genmap-smoke", { shot, maxDiffRatio: 0.0008 });
  await page.close();
}

function terrainPixels(png) {
  let terrain = 0;
  let nonBlack = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    if (r + g + b > 18) nonBlack++;
    if ((g > 70 && g >= r - 20 && b < 155) || (r > 95 && g > 82 && b < 135)) terrain++;
  }
  return { terrain, nonBlack };
}
