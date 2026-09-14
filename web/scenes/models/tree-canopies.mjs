export const meta = {
  name: "tree-canopies",
  kind: "visual",
  world: "shared-prop-models",
  tier: "full",
  snapshots: ["shared/props/tree-canopies"],
  describe: "Shared coarse tree crowns remain readable at map scale.",
};
export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "tree-canopies",
  });
  await page.goto(`${ctx.target}/renderer/shared-prop-models?gate=trees&detail=canopy`);
  await page.waitForFunction(() => window.__rendererLabReady === true);
  await ctx.snap(null, "shared/props/tree-canopies", {
    shot: await page.locator("#renderer-canvas").screenshot(),
  });
  await page.close();
}
