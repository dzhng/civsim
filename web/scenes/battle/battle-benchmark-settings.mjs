export const meta = {
  name: "battle-benchmark-settings",
  kind: "flow",
  world: "battle-real",
  tier: "full",
  snapshots: [],
  describe: "Benchmark provenance records effective query overrides instead of stored preferences.",
};

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  try {
    await page.goto(`${ctx.target}/benchmark?shadows=off&bloom=off`);
    await page.waitForFunction(
      () => window.__game?.benchmark?.status().phase === "running",
      undefined,
      { timeout: 180000 },
    );
    const sample = await page.evaluate(() => ({
      graphics: window.__game.benchmark.report().identity.graphics,
      shadows: window.__game.stats().renderStats.shadows,
    }));
    ctx.check(
      "reported graphics match resolved shadow and bloom overrides",
      sample.graphics.shadows === "off" &&
        sample.graphics.bloom === false &&
        sample.shadows.mode === "off",
      JSON.stringify(sample),
    );
    await page.getByRole("button", { name: "Cancel benchmark", exact: true }).click();
    await page.getByRole("heading", { name: "Partial result", exact: true }).waitFor();
  } finally {
    await page.close();
  }
}
