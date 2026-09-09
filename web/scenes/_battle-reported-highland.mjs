import { battleRendererReady } from "./worlds.mjs";

// The reported bay/mountain seed and armies are part of this regression fixture.
const army = [
  [12, 4],
  [13, 4],
  [4, 3],
  [5, 2],
  [6, 2],
  [0, 1],
  [3, 1],
].map(([classId, count]) => ({ classId, count }));
export const reportedHighlandSetup = {
  mapId: -1,
  generatedSeed: "455085311",
  environment: "golden-hour",
  teams: [army, army],
  factions: ["azure", "crimson"],
};

export async function reportedHighland(ctx, deviceScaleFactor = 1) {
  // Full armies can spend several minutes compiling on canonical SwiftShader.
  const timeout = 300000;
  const page = await ctx.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor });
  await page.goto(
    `${ctx.target}/battle/run?${new URLSearchParams({ setup: JSON.stringify(reportedHighlandSetup) })}`,
  );
  await page.waitForFunction(() => window.__game, undefined, { timeout });
  await page.evaluate(() => window.__game.freeze(true));
  await battleRendererReady(page, timeout);
  await page.evaluate(() => window.__game.freezeAtTick(120));
  return page;
}
