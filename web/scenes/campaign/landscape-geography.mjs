import { PNG } from "pngjs";
export const meta = {
  name: "landscape-geography",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: ["landscape-geography-italy", "landscape-geography-alps"],
  describe: "Actual campaign roads, sea lanes and borders follow the tiled physical landscape.",
};
export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${ctx.target}/renderer/landscape-geography?ref=1`);
  await page.waitForFunction(() => window.__landscapeTraversal, undefined, { timeout: 120000 });
  for (const [region, x, y] of [
    ["italy", -456, 446],
    ["alps", -450, 1080],
  ]) {
    await page.evaluate(([x, y]) => window.__landscapeTraversal.cam(x, y, 1.8), [x, y]);
    await page.waitForFunction(
      () => {
        const s = window.__landscapeTraversal.stats();
        return s.ready && !s.pendingKey;
      },
      undefined,
      { timeout: 120000 },
    );
    await page.waitForTimeout(300);
    const before = PNG.sync.read(await page.screenshot());
    await ctx.snap(null, `landscape-geography-${region}`, {
      shot: PNG.sync.write(before),
      threshold: 0,
      maxDiffRatio: 0,
    });
    const state = await page.evaluate(() => window.__landscapeTraversal.stats());
    ctx.check(
      `${region}: live geometry and bounded re-seating`,
      state.renderer.geography.vertices > 0 &&
        state.renderer.geography.sampledVertices < state.renderer.geography.vertices &&
        !state.failed.length,
      JSON.stringify(state.renderer.geography),
    );
    await page.evaluate(() => window.__landscapeTraversal.geography(false));
    await page.waitForTimeout(300);
    const hidden = PNG.sync.read(await page.screenshot());
    let pixels = 0;
    for (let i = 0; i < before.data.length; i += 4)
      if (!before.data.subarray(i, i + 4).equals(hidden.data.subarray(i, i + 4))) pixels++;
    ctx.check(
      `${region}: geographic inputs visibly reach the world`,
      pixels > 100,
      `${pixels} pixels`,
    );
    await page.evaluate(() => window.__landscapeTraversal.geography(true));
    await page.waitForTimeout(300);
    const restored = PNG.sync.read(await page.screenshot());
    ctx.check(`${region}: replacement restores exact geography`, before.data.equals(restored.data));
  }
  await page.close();
}
