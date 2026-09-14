import { PNG } from "pngjs";
export const meta = {
  name: "terrain-water",
  kind: "visual",
  world: "terrain-material",
  tier: "full",
  snapshots: ["terrain-water"],
  describe: "Terrain water and standalone water share one linear-colour response.",
};
export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "terrain-water",
  });
  await page.goto(`${ctx.target}/renderer/terrain-water`);
  await page.waitForFunction(() => window.__rendererLabReady === true);
  const shot = await page.screenshot();
  const png = PNG.sync.read(shot);
  const sample = (y) =>
    Array.from(png.data.subarray((y * png.width + 640) * 4, (y * png.width + 640) * 4 + 3));
  const terrain = sample(200),
    standalone = sample(600);
  const delta = Math.max(...terrain.map((v, i) => Math.abs(v - standalone[i])));
  ctx.check(
    "terrain water matches standalone water under identical light",
    delta <= 2 && terrain[2] > terrain[0] + 10,
    JSON.stringify({ terrain, standalone, delta }),
  );
  await ctx.snap(null, "terrain-water", { shot });
  await page.close();
}
