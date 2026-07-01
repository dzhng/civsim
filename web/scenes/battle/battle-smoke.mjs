import { battleReal } from "../worlds.mjs";

export const meta = {
  name: "battle-smoke",
  kind: "flow",
  world: "battle-real",
  tier: "quick",
  snapshots: ["battle-initial", "battle-banner", "battle-manual"],
  describe: "Large battle boot, render snapshots, basic movement, and perf health.",
};

export async function run(ctx) {
  const { check, snap } = ctx;
  const page = await battleReal(ctx, { settle: 0 });
  await page.waitForFunction(
    () => document.getElementById("hud")?.textContent?.includes("soldiers") === true,
    undefined,
    { timeout: 8000 },
  );

  const stats = await page.evaluate(() => window.__game.stats());
  check(
    "full battle spawned",
    stats.soldiers >= 15000 && stats.units === 40,
    `${stats.soldiers} soldiers, ${stats.units} units`,
  );

  const camFit = await page.evaluate(() => {
    const c = window.__cam;
    const cv = document.getElementById("battlefield");
    const old = { x: c.x, y: c.y, zoom: c.zoom };
    c.zoom = 0.001; // below any floor → clamps to the zoom-out limit
    c.x = 999999;
    c.y = -999999;
    c.clampView?.();
    const [x0, y0, x1, y1] = c.bounds;
    // Real visible ground span from the screen corners under the perspective camera.
    const pts = [c.screenToWorld(0, 0), c.screenToWorld(cv.width, 0), c.screenToWorld(0, cv.height), c.screenToWorld(cv.width, cv.height)];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [cx, cy] = c.viewCenter();
    const out = {
      x: cx,
      y: cy,
      x0,
      y0,
      x1,
      y1,
      visW: Math.max(...xs) - Math.min(...xs),
      visH: Math.max(...ys) - Math.min(...ys),
      fieldW: x1 - x0,
      fieldH: y1 - y0,
    };
    Object.assign(c, old);
    c.clampView?.();
    return out;
  });
  // Zoomed fully out the real camera frames a tactical overview: the field's short
  // axis fits within the visible ground span (framing scales with min(w,h)).
  check(
    "battle camera zoom-out frames a tactical overview",
    Math.max(camFit.visW, camFit.visH) >= Math.min(camFit.fieldW, camFit.fieldH) * 0.9,
    `visible ${camFit.visW.toFixed(0)}x${camFit.visH.toFixed(0)}, field ${camFit.fieldW.toFixed(0)}x${camFit.fieldH.toFixed(0)}`,
  );
  // Panning is bounded: the look target never leaves the playable field rect.
  check(
    "battle camera cannot pan the look target off the field",
    camFit.x >= camFit.x0 - 0.5 && camFit.x <= camFit.x1 + 0.5 && camFit.y >= camFit.y0 - 0.5 && camFit.y <= camFit.y1 + 0.5,
    `target (${camFit.x.toFixed(1)},${camFit.y.toFixed(1)}) field [${camFit.x0.toFixed(0)},${camFit.x1.toFixed(0)}]x[${camFit.y0.toFixed(0)},${camFit.y1.toFixed(0)}]`,
  );

  // Pixel regression on deterministic battle states: fixed tick, camera, and
  // frozen shader clock. SwiftShader has a tiny sub-pixel wobble on silhouettes.
  await page.evaluate(() => window.__game.freezeAtTick(240));
  await page.waitForFunction(
    () => document.getElementById("hud")?.textContent?.includes("PAUSED") === true,
    undefined,
    { timeout: 8000 },
  );
  await page.waitForTimeout(150);
  await snap(page, "battle-initial", { maxDiffRatio: 0.0008 });
  await page.evaluate(() => window.__game.freeze(false));

  await page.evaluate(() => {
    const a = window.__game.unitInfo(0);
    const c = window.__cam;
    c.x = a[30];
    c.y = a[31] + 2;
    c.zoom = 13;
    c.clampView?.();
  });
  await page.evaluate(() => window.__game.freezeAtTick(480));
  await page.waitForTimeout(150);
  await snap(page, "battle-banner", { maxDiffRatio: 0.0008 });

  await page.click("#btn-menu");
  await page.click("#pause-manual");
  const manualLen = await page.evaluate(() => document.getElementById("manual").innerHTML.length);
  check("the field manual opens in-game", manualLen > 4000, `${manualLen} chars`);
  await snap(page, "battle-manual", { maxDiffRatio: 0.0008 });
  await page.evaluate(() => {
    document.getElementById("manual").style.display = "none";
  });

  const info4 = await page.evaluate(() => window.__game.unitInfo(4));
  const s4 = await page.evaluate(() => window.__game.soldierStartOf(4));
  const before = await page.evaluate((i) => window.__game.soldierPos(i), s4);
  await page.evaluate(
    ([ax, ay]) => {
      window.__game.select(4);
      window.__game.setOrder(4, ax, ay + 60);
      window.__game.advance(300);
    },
    [info4[0], info4[1]],
  );
  const after = await page.evaluate((i) => window.__game.soldierPos(i), s4);
  const moved = Math.hypot(after[0] - before[0], after[1] - before[1]);
  check("ordered unit marches", moved > 5, `soldier moved ${moved.toFixed(1)} m`);
  const mid4 = await page.evaluate(() => window.__game.unitInfo(4));
  check("unit is in motion", mid4[3] > 0.3, `speed ${mid4[3].toFixed(2)} m/s`);
  check("cohesion responds to maneuver", mid4[4] < 0.998, `cohesion ${mid4[4].toFixed(3)}`);

  await page.evaluate(() => window.__game.freeze(false));
  await page.waitForTimeout(3000);
  const statsPre = await page.evaluate(() => window.__game.stats());
  const stats2 = await page.evaluate(() => window.__game.stats());
  check(
    "tick under budget",
    stats2.tickMs < 60,
    `${stats2.tickMs.toFixed(2)} ms avg at ${stats2.soldiers} soldiers`,
  );
  check(
    "frame rate alive (headless/software GL)",
    statsPre.fps > 4,
    `${statsPre.fps.toFixed(0)} fps`,
  );

  await page.close();
}
