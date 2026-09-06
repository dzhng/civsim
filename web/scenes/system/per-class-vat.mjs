import { PNG } from "pngjs";

export const meta = {
  name: "per-class-vat",
  kind: "flow",
  world: "none",
  tier: "full",
  snapshots: [],
  describe:
    "Per-class VAT registry: a class with its own bake animates on its own clip table; classes without one fall back to the shared placeholder.",
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
    errorPrefix: "per-class-vat",
  });
  try {
    await page.goto(`${ctx.target}/renderer/per-class-vat`);
    await page.waitForFunction(
      () =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.stats?.route === "per-class-vat",
      undefined,
      { timeout: 18000 },
    );
    const stats = await page.evaluate(() => window.__rendererLabStats.stats);

    ctx.check(
      "per-class-vat: a dedicated per-class bake produces a second VAT variant",
      stats.vatVariants === 2,
      JSON.stringify({ vatVariants: stats.vatVariants }),
    );
    ctx.check(
      "per-class-vat: a class drives its own clip table (different durations)",
      stats.divergence === true && stats.class1Frames === stats.class0Frames * 2,
      JSON.stringify({ class0Frames: stats.class0Frames, class1Frames: stats.class1Frames }),
    );
    ctx.check(
      "per-class-vat: sparse class 5 uses its explicitly shared animation asset",
      stats.sharedMatches === true && stats.class5Frames === stats.class0Frames,
      JSON.stringify({ class0Frames: stats.class0Frames, class5Frames: stats.class5Frames }),
    );

    const pixels = countNonBlank(PNG.sync.read(await page.screenshot()));
    ctx.check(
      "per-class-vat: classes render through their per-class VATs (nonblank)",
      pixels > 150000,
      JSON.stringify({ pixels }),
    );
  } finally {
    await page.close();
  }
}
