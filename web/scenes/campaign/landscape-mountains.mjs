const views = [
  { name: "alps-regional", route: "campaign-landscape", query: "region=alps" },
  { name: "alps-close", route: "campaign-landscape", query: "region=alps&zoom=4" },
  { name: "italy-regional", route: "campaign-landscape", query: "region=italy&x=-470&y=640" },
  { name: "italy-close", route: "campaign-landscape", query: "region=italy&x=-470&y=640&zoom=4" },
  { name: "fixture-regional", route: "landscape-surface", query: "" },
  { name: "fixture-close", route: "landscape-surface", query: "zoom=6" },
  { name: "alps-coarse", route: "campaign-landscape", query: "region=alps&zoom=4&cell=8" },
];

export const meta = {
  name: "landscape-mountains",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: views.map((view) => `mountains-${view.name}`),
  describe: "Clay relief across geographic ranges, their foothills, and two sampling levels.",
};

export async function run(ctx) {
  for (const view of views) {
    const page = await ctx.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      errorPrefix: view.name,
    });
    const warnings = [];
    page.on("console", (message) => {
      if (message.type() === "warning" && /GPU|shader|bind|validation/i.test(message.text()))
        warnings.push(message.text());
    });
    await page.goto(`${ctx.target}/renderer/${view.route}?ref=1&clay=1&${view.query}`);
    await page.waitForFunction(() => window.__rendererLabReady === true, undefined, {
      timeout: 90000,
    });
    await page.waitForTimeout(1000);
    const report = await page.evaluate(() => window.__rendererLabStats);
    ctx.check(
      `${view.name}: terrain renders`,
      report?.stats?.terrainTriangles > 0,
      JSON.stringify(report),
    );
    ctx.check(`${view.name}: GPU validation clean`, warnings.length === 0, warnings.join("\n"));
    await ctx.snap(null, `mountains-${view.name}`, {
      threshold: 0,
      maxDiffRatio: 0,
      shot: await page.screenshot({ timeout: 180000 }),
    });
    await page.close();
  }
}
