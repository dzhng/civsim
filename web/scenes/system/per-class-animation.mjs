import { PNG } from "pngjs";

export const meta = {
  name: "per-class-animation",
  kind: "flow",
  world: "none",
  tier: "full",
  snapshots: [],
  describe:
    "Complete appearance bundles select their authored local clip durations; shared rig identities reuse one palette owner.",
};

function countNonBlank(png) {
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (Math.abs(r - 21) > 8 || Math.abs(g - 22) > 8 || Math.abs(b - 26) > 8) n++;
  }
  return n;
}

export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 900, height: 620 },
    errorPrefix: "per-class-animation",
  });
  try {
    await page.goto(`${ctx.target}/renderer/per-class-animation`);
    await page.waitForFunction(
      () =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.stats?.route === "per-class-animation",
      undefined,
      { timeout: 18000 },
    );
    const stats = await page.evaluate(() => window.__rendererLabStats.stats);

    ctx.check(
      "per-class-animation: a dedicated per-class bake produces a second rig/animation variant",
      stats.rigVariants === 2,
      JSON.stringify({ rigVariants: stats.rigVariants }),
    );
    ctx.check(
      "per-class-animation: a class drives its own clip table (different durations)",
      stats.divergence === true && stats.class1Duration === stats.class0Duration * 2,
      JSON.stringify({
        class0Duration: stats.class0Duration,
        class1Duration: stats.class1Duration,
      }),
    );
    ctx.check(
      "per-class-animation: sparse class 5 uses its explicitly shared animation asset",
      stats.sharedMatches === true && stats.class5Duration === stats.class0Duration,
      JSON.stringify({
        class0Duration: stats.class0Duration,
        class5Duration: stats.class5Duration,
      }),
    );

    const pixels = countNonBlank(PNG.sync.read(await page.screenshot()));
    ctx.check(
      "per-class-animation: classes render through their per-class local animations (nonblank)",
      pixels > 150000,
      JSON.stringify({ pixels }),
    );
  } finally {
    await page.close();
  }
}
