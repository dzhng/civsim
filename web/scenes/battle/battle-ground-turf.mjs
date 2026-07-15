export const meta = {
  name: "battle-ground-turf",
  kind: "visual",
  world: "battle-ground-turf-workbench",
  tier: "quick",
  snapshots: [
    "ground-turf/turf-tile",
    "ground-turf/turf-spike-topdown",
    "ground-turf/turf-spike-rts",
    "ground-turf/turf-spike-sizes",
  ],
  describe:
    "Deterministic baked strand turf at raw-tile, top-down, RTS, and bake-size workbench framings.",
};

const VIEWS = [
  ["tile", "ground-turf/turf-tile"],
  ["topdown", "ground-turf/turf-spike-topdown"],
  ["rts", "ground-turf/turf-spike-rts"],
  ["sizes", "ground-turf/turf-spike-sizes"],
];

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("turf workbench requires browser GPU flags", true, "set VERIFY_GPU=1 to capture");
    return;
  }

  let firstHash = null;
  for (const [view, snapshot] of VIEWS) {
    const page = await openWorkbench(ctx, view);
    const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
    ctx.check(
      `${view} bake is byte-deterministic within a cold boot`,
      stats?.deterministic === true,
    );
    ctx.check(
      `${view} different seed changes baked bytes`,
      stats?.differentSeedDiffers === true && stats?.primaryHash !== stats?.alternateHash,
      JSON.stringify(stats),
    );
    if (firstHash === null) firstHash = stats?.primaryHash;
    else
      ctx.check(
        `${view} cold boot reproduces the primary byte hash`,
        stats?.primaryHash === firstHash,
        JSON.stringify({ firstHash, hash: stats?.primaryHash }),
      );
    if (view === "topdown" || view === "rts")
      ctx.check(
        `${view} framing comes from the production battle camera rig`,
        stats?.cameraContract === "battleCameraRig",
      );
    await ctx.snap(page, snapshot, { shot: await page.locator("#renderer-canvas").screenshot() });
    await page.close();
  }
}

async function openWorkbench(ctx, view) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: `battle-ground-turf-${view}`,
  });
  await page.goto(`${ctx.target}/renderer/battle-ground-turf?view=${view}`);
  await page.waitForFunction(
    (expected) =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.ok === true &&
      window.__rendererLabStats?.stats?.view === expected,
    view,
    { timeout: 30000 },
  );
  await page.waitForTimeout(250);
  return page;
}
