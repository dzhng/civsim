import { battleRendererReady } from "../worlds.mjs";

export const meta = {
  name: "battle-wheel-zoom",
  kind: "flow",
  world: "battle-real",
  tier: "quick",
  snapshots: [],
  describe:
    "Wheel input moves the camera immediately without engaging dense grass in the wide overview.",
};

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  try {
    await page.goto(ctx.target);
    await page.locator("#menu-quick-battle").click();
    await page.locator("#qb-generated-seed").fill("7");
    await page.locator("#qb-launch").click();
    await battleRendererReady(page);
    await page.evaluate(() => {
      window.__cam.zoom = 0;
      window.__cam.clampView();
    });
    await page.evaluate(() => window.__game.freezeAtTick(240));
    await page.mouse.move(800, 350);
    const distance = () =>
      page.evaluate(() => window.__game.stats().renderStats.camera.camera3d.distance);
    const start = await distance();
    const stops = [];
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -120);
      await page.evaluate(() => window.__game.freezeAtTick(240));
      stops.push(await distance());
    }
    ctx.check(
      "first wheel notch changes the visible camera distance",
      stops[0] < start * 0.99 && stops[0] > start * 0.9,
      JSON.stringify({ start, first: stops[0] }),
    );
    const ratios = stops.map((d, i) => d / (i ? stops[i - 1] : start));
    ctx.check(
      "equal wheel steps stay proportional instead of accelerating into a close-up",
      ratios.every((r) => Math.abs(r - ratios[0]) < 0.002),
      JSON.stringify(ratios),
    );
    const grass = await page.evaluate(() => window.__game.stats().renderStats.terrain.grass);
    ctx.check(
      "wide overview does not submit invisible dense grass",
      stops.at(-1) > 2500 && grass?.visibility?.base === false && grass?.visibility?.ring === false,
      JSON.stringify({
        distance: stops.at(-1),
        visibility: grass?.visibility,
      }),
    );
    await page.mouse.wheel(0, 120);
    await page.evaluate(() => window.__game.freezeAtTick(240));
    ctx.check("reversing the wheel immediately zooms back out", (await distance()) > stops.at(-1));
  } finally {
    await page.close();
  }
}
