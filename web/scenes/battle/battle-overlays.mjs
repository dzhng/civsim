import { battleRendererReady } from "../worlds.mjs";

// Tactical ground overlays on REAL rolling terrain: ground cues and selection
// rings follow terrain height so they cannot sink under
// any rise (invisible order previews, no rings). The world is the generated
// Highland Vale anchor, one unit selected with a queued order, so
// the frame proves: per-soldier campaign-style green rings seated on the
// slope, the destination ring grid + path legs + queue diamond draped over
// the ground, and the DOM banner planted on the block at its rendered height.
export const meta = {
  name: "battle-overlays",
  kind: "visual",
  world: "battle-map-a-overlays",
  tier: "quick",
  snapshots: ["overlays/selection-orders", "overlays/rings-close"],
  describe:
    "Selection rings, order ring-grid/queue cues, and the unit banner over elevated terrain.",
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
  await page.goto(`${ctx.target}?map=gen&seed=7&ai=off`);
  await battleRendererReady(page);

  // Pin the world to an ABSOLUTE tick well past boot variance (freezeAtTick
  // only advances forward — a low target freezes at whatever tick boot
  // happened to reach, a different world every run). Pose while frozen, then
  // advance a fixed delta so the frame is the same world state every run.
  await page.evaluate(() => window.__game.freezeAtTick(4000));
  // Select unit 4 as a narrow column and give it short order hops — the
  // frozen-frame cue filter drops line segments past its length cap, so the
  // path legs must stay under it to connect in the shot.
  await page.evaluate(() => {
    const g = window.__game;
    const a = g.unitInfo(4);
    g.setFiles(4, 6);
    g.select(4);
    g.setOrder(4, a[0] + 10, a[1] + 4);
    g.enqueue(4, 0, a[0] + 18, a[1] + 10, 0, 0);
  });
  // Latch the order-path overlay on (the toolbar twin of holding Space) so
  // the frozen frame carries the destination grid, path legs, and diamond.
  await page.click('#toolbar button[data-cmd="paths"]');
  await page.evaluate(() => window.__game.freezeAtTick(4020));
  await page.evaluate(() => {
    const a = window.__game.unitInfo(4);
    const cam = window.__cam;
    cam.yaw = -Math.PI / 2;
    cam.zoomAt(0, 0, cam.params().distance / 180);
    cam.pitchBias = 0;
    cam.pitchBias = cam.pitch - 0.75;
    cam.setViewCenter(a[0] + 14, a[1] + 6);
    cam.clampView?.();
  });
  await settleFrozenFrame(page);

  const stats = await page.evaluate(() => window.__game.stats());
  ctx.check(
    "every selected soldier grew a ground ring",
    stats.renderStats.tacticalLines.rings?.count > 0,
    JSON.stringify(stats.renderStats.tacticalLines),
  );
  ctx.check(
    "ground cues survived the frozen-frame filter (path legs + queue diamond)",
    stats.renderStats.tacticalLines.groundCues?.count > 0,
    JSON.stringify(stats.renderStats.tacticalLines),
  );
  await ctx.snap(page, "overlays/selection-orders");

  // Close framing: the campaign-style ring profile must READ as a circle
  // under each soldier, not a speckle.
  await page.evaluate(() => {
    const a = window.__game.unitInfo(4);
    const cam = window.__cam;
    cam.zoomAt(0, 0, cam.params().distance / 70);
    cam.pitchBias = 0;
    cam.pitchBias = cam.pitch - 0.65;
    cam.setViewCenter(a[0] + 2, a[1] - 16);
    cam.clampView?.();
  });
  await settleFrozenFrame(page);
  await ctx.snap(page, "overlays/rings-close");

  // FIXPREV-A3D6: the movement preview must mirror the sim-owned CURRENT
  // formation, not the class/default rectangle. Pose unit 4 as a square-ish
  // block, issue a move while the Space/path overlay is latched, then read the
  // actual emitted preview ring grid.
  const preview = await page.evaluate(async () => {
    const g = window.__game;
    const unit = 4;
    const total = Math.max(1, g.formationDebug(unit).total);
    const files = Math.ceil(Math.sqrt(total));
    g.setFiles(unit, files);
    const formation = g.formationDebug(unit);
    g.setOrder(unit, formation.centerX + 14, formation.centerY + 4);
    g.select(unit);
    await g.freezeAtTick(g.tickCount() + 2);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      formation: g.formationDebug(unit),
      preview: g.previewDebug(unit),
    };
  });
  const currentFiles = preview.formation.files;
  const currentRanks = preview.formation.ranks;
  const expectedAspect = currentFiles / currentRanks;
  const actualAspect = preview.preview?.previewShapeAspect ?? 0;
  ctx.check(
    "hold-Space move preview uses current square formation files/ranks",
    preview.preview !== null &&
      preview.preview.previewFiles === currentFiles &&
      preview.preview.previewRanks === currentRanks &&
      Math.abs(actualAspect - expectedAspect) <= 0.05,
    JSON.stringify({ currentFiles, currentRanks, expectedAspect, preview: preview.preview }),
  );
  await page.close();
}

/** Wait until the frozen canvas stops changing (two identical consecutive
 *  captures) — a wall-clock wait races software-GPU frame times. */
async function settleFrozenFrame(page) {
  await page.evaluate(() => window.__game.freezeAtTick(window.__game.tickCount()));
  // A locator screenshot includes overlapping HUD DOM; compare the actual
  // framebuffer so toolbar SVG rerasterization cannot prevent settlement.
  const capture = () => page.evaluate(() => document.querySelector("#battlefield").toDataURL());
  let prev = await capture();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(300);
    const next = await capture();
    if (prev === next && next.length > 10000) return;
    prev = next;
  }
  throw new Error("Frozen overlay canvas did not settle after 20 captures");
}
