import { battleRendererReady } from "../worlds.mjs";

export const meta = {
  name: "battle-benchmark-flow",
  kind: "flow",
  world: "battle-real",
  tier: "full",
  snapshots: [],
  describe:
    "Menu benchmark prepares without redrawing skipped history, locks game input and cancels to honest partial results.",
};
export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(ctx.target);
  await page.locator("#menu-benchmark").click();
  await battleRendererReady(page, 120000);
  const before = await page.evaluate(() => ({
    status: window.__game.benchmark.status(),
    frame: window.__game.frameMetrics(),
    pose: window.__cam.capturePose(),
  }));
  await page.mouse.move(700, 400);
  await page.mouse.wheel(0, -240);
  await page.keyboard.press("p");
  await page.waitForFunction(
    (t) => window.__game.benchmark.status().tick >= t + 30,
    before.status.tick,
    { timeout: 15000 },
  );
  const after = await page.evaluate(() => ({
    status: window.__game.benchmark.status(),
    frame: window.__game.frameMetrics(),
    pose: window.__cam.capturePose(),
    paused: window.__game.stats().clock.paused,
  }));
  ctx.check(
    "preparation advances real ticks",
    after.status.phase === "preparing" && after.status.tick > before.status.tick,
  );
  ctx.check(
    "preparation retains the ready frame instead of redrawing skipped history",
    after.frame.renderer.renderedFrameId === before.frame.renderer.renderedFrameId,
  );
  ctx.check(
    "manual pan zoom and pause cannot alter the benchmark",
    JSON.stringify(before.pose) === JSON.stringify(after.pose) && !after.paused,
  );
  await page.getByRole("button", { name: "Cancel benchmark", exact: true }).click();
  await page.getByRole("heading", { name: "Partial result", exact: true }).waitFor();
  const report = await page.evaluate(() => window.__game.benchmark.report());
  ctx.check(
    "cancelled preparation has no invented FPS",
    report.status.phase === "cancelled" &&
      !report.completeWindow &&
      report.summary.averageFps === null &&
      report.frames.length === 0,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const file = await download;
  const stream = await file.createReadStream();
  let body = "";
  for await (const chunk of stream) body += chunk;
  const exported = JSON.parse(body);
  ctx.check(
    "export preserves partial status and raw empty recording",
    exported.status.phase === "cancelled" && exported.frames.length === 0,
  );
  await page.getByRole("link", { name: "Back to menu", exact: true }).click();
  await page.locator("#menu-benchmark").waitFor();
  ctx.check("returns to actual menu", new URL(page.url()).pathname === "/");
}
