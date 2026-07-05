export const meta = {
  name: "banner-gallery",
  kind: "visual",
  world: "battle-5v5-readout-gallery",
  tier: "quick",
  snapshots: ["banner-gallery", "battle-readout-pan-end"],
  describe:
    "Renderer-backed battle readout gallery: representative bar/chip states anchored to 3D standards.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("requires WebGPU browser flags", true, "set VERIFY_GPU=1 to capture readouts");
    return;
  }

  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "battle-readout-gallery",
  });
  await page.goto(`${ctx.target}?battle=5v5&ai=off&test=readouts`);
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

  await page.addStyleTag({
    content:
      "#gameover, #hud, #buttons, #pausemenu, #banner, #selbox, #minimap, #unitcards, #toolbar { display: none !important; }",
  });

  await page.evaluate(() => {
    window.__game.freezeAtTick(4000);
    // Must match GALLERY_UNIT_FOR_STATE in web/src/battle/scene.ts.
    const points = [1, 13, 3, 11, 7, 10].map((u) => window.__game.unitInfo(u));
    const xs = points.map((info) => info[0]);
    const ys = points.map((info) => info[1]);
    window.__game.reviewFrame(
      Math.min(...xs) - 22,
      Math.min(...ys) - 10,
      Math.max(...xs) + 22,
      Math.max(...ys) + 18,
      {
        pitch: 1.08,
        fill: 0.62,
      },
    );
  });
  await page.waitForFunction(
    () => {
      const stats = window.__game.stats().renderStats;
      return (
        stats.readouts?.readouts === 6 &&
        stats.readouts?.ownBars === 3 &&
        stats.readouts?.enemyMarkers === 3
      );
    },
    undefined,
    { timeout: 10000 },
  );
  await page.waitForTimeout(180);

  const gallery = await page.evaluate(() => {
    const stats = window.__game.stats().renderStats;
    return {
      standards: stats.standards,
      readouts: stats.readouts,
      domReadouts: document.querySelectorAll(".ubanner, #banner-gallery").length,
    };
  });
  ctx.check(
    "gallery is renderer-backed with own bars, enemy markers, chip glyphs, and no DOM banners",
    gallery.standards?.standards >= 10 &&
      gallery.standards?.selected >= 1 &&
      gallery.readouts?.readouts === 6 &&
      gallery.readouts?.ownBars === 3 &&
      gallery.readouts?.enemyMarkers === 3 &&
      gallery.readouts?.chips >= 11 &&
      gallery.readouts?.selected >= 1 &&
      gallery.readouts?.atlasWidth > 1 &&
      gallery.domReadouts === 0,
    JSON.stringify(gallery),
  );
  await ctx.snap(page, "banner-gallery");

  // The pan pair is banner-gallery (start framing) vs pan-end — a separate
  // pan-start capture was byte-identical to the gallery frame.
  await page.evaluate(() => {
    const cam = window.__cam;
    const [cx, cy] = cam.viewCenter();
    cam.setViewCenter(cx + 18, cy + 6);
    cam.yaw += 0.28;
    cam.clampView?.();
  });
  await page.waitForTimeout(180);
  const pan = await page.evaluate(() => {
    const stats = window.__game.stats().renderStats;
    return {
      standards: stats.standards?.standards,
      readouts: stats.readouts?.readouts,
      time: stats.standards?.timeSeconds,
      orientation: stats.readouts?.orientation,
      depthPolicy: stats.readouts?.depthPolicy,
    };
  });
  ctx.check(
    "pan frame keeps readouts rigidly in-scene at pinned time",
    pan.standards >= 10 &&
      pan.readouts === 6 &&
      pan.time === 0 &&
      pan.orientation === "camera-facing basis from the active three camera",
    JSON.stringify(pan),
  );
  await ctx.snap(page, "battle-readout-pan-end");

  await page.close();
}
