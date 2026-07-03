// Tactical ground overlays on REAL rolling terrain — the regression this pins:
// ground cues and selection rings used to render at flat z = 0 and sink under
// any rise (invisible order previews, no rings). The world is river-and-crags
// (the steepest quick-battle map), one unit selected with a queued order, so
// the frame proves: per-soldier campaign-style green rings seated on the
// slope, the destination ghost + queue diamonds draped over the ground, and
// the DOM banner planted on the block at its rendered height.
export const meta = {
  name: "battle-overlays",
  kind: "visual",
  world: "battle-map-a-overlays",
  tier: "quick",
  snapshots: ["overlays/selection-orders", "overlays/rings-close"],
  describe: "Selection rings, order ghost/queue cues, and the unit banner over elevated terrain.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "battle overlay shots require browser GPU flags",
      true,
      "set VERIFY_GPU=1 to capture",
    );
    return;
  }
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "overlays",
  });
  await page.goto(`${ctx.target}?map=A&ai=off`);
  await page.waitForFunction(
    () => {
      const stats = window.__game?.stats?.();
      return (
        window.__ready === true &&
        stats?.renderer === "gpu" &&
        stats.renderStats?.ready === true &&
        stats.renderStats.soldiers === stats.soldiers
      );
    },
    undefined,
    { timeout: 20000 },
  );

  // Pin the world to an ABSOLUTE tick well past boot variance (freezeAtTick
  // only advances forward — a low target freezes at whatever tick boot
  // happened to reach, a different world every run). Pose while frozen, then
  // advance a fixed delta so the frame is the same world state every run.
  await page.evaluate(() => window.__game.freezeAtTick(4000));
  // Narrow unit 4 (ghost segments stay under the frozen-frame cue filter's
  // length cap), select it, order a move plus one queued waypoint.
  await page.evaluate(() => {
    const g = window.__game;
    const a = g.unitInfo(4);
    g.setFiles(4, 6);
    g.select(4);
    g.setOrder(4, a[0] + 24, a[1] + 10);
    g.enqueue(4, 0, a[0] + 44, a[1] + 26, 0, 0);
  });
  // Latch the order-path overlay on (the toolbar twin of holding Space) so the
  // frozen frame carries the ghost, path, and queue diamonds.
  await page.click('#toolbar button[data-cmd="paths"]');
  await page.evaluate(() => window.__game.freezeAtTick(4020));
  await page.evaluate(() => {
    const a = window.__game.unitInfo(4);
    const cam = window.__cam;
    cam.yaw = -Math.PI / 2;
    cam.pitchBias = -0.35;
    cam.zoom = 7;
    cam.setViewCenter(a[0] + 14, a[1] + 6);
    cam.clampView?.();
  });
  await settleFrozenFrame(page);

  const stats = await page.evaluate(() => window.__game.stats());
  ctx.check(
    "every selected soldier grew a ground ring",
    stats.renderStats.tacticalLines.rings?.rings > 0,
    JSON.stringify(stats.renderStats.tacticalLines),
  );
  ctx.check(
    "ground cues survived the frozen-frame filter (ghost + queue diamonds)",
    stats.renderStats.tacticalLines.groundCues?.vertices > 0,
    JSON.stringify(stats.renderStats.tacticalLines),
  );
  await ctx.snap(page, "overlays/selection-orders");

  // Close framing: the campaign-style ring profile must READ as a circle
  // under each soldier, not a speckle.
  await page.evaluate(() => {
    const a = window.__game.unitInfo(4);
    const cam = window.__cam;
    cam.zoom = 7.6;
    cam.pitchBias = -0.5;
    cam.setViewCenter(a[0] + 2, a[1] - 16);
    cam.clampView?.();
  });
  await settleFrozenFrame(page);
  await ctx.snap(page, "overlays/rings-close");
  await page.close();
}

/** Wait until the frozen canvas stops changing (two identical consecutive
 *  captures) — a wall-clock wait races software-GPU frame times. */
async function settleFrozenFrame(page) {
  const canvas = page.locator("#battlefield");
  let prev = await canvas.screenshot();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(300);
    const next = await canvas.screenshot();
    if (Buffer.compare(prev, next) === 0) return;
    prev = next;
  }
}
