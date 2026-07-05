export const meta = {
  name: "banner-gallery",
  kind: "visual",
  world: "battle-5v5-readout-gallery",
  tier: "quick",
  snapshots: [
    "banner-gallery",
    "banner-chips-single",
    "banner-chips-pair",
    "banner-chips-row",
    "banner-chips-max",
    "battle-readout-pan-end",
  ],
  describe:
    "Chip-readout ladder over 3D standards: single / pair / full row / wrapped max, plus a pan-rigidity frame.",
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

  // The ladder sits on units 2/0/3/4 (GALLERY_UNIT_FOR_STATE in
  // web/src/battle/scene.ts). Frame their line close, at the swoop zoom where
  // flags carry the reference look, so chip size is judged against the cloth.
  await page.evaluate(() => {
    window.__game.freezeAtTick(4000);
    const points = [2, 0, 3, 4].map((u) => window.__game.unitInfo(u));
    const xs = points.map((info) => info[0]);
    const ys = points.map((info) => info[1]);
    const cam = window.__cam;
    cam.yaw = 0;
    cam.pitchBias = 0;
    cam.zoom = 8.55;
    cam.setViewCenter(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2 - 24,
    );
    cam.clampView?.();
  });
  await page.waitForFunction(
    () => {
      const stats = window.__game.stats().renderStats;
      // 1 + 2 + 3 + 5 ladder chips; live units may add their own rows.
      return stats.readouts?.readouts >= 4 && stats.readouts?.chips >= 11;
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
    "gallery is renderer-backed, chips-only (no bar rects), and DOM-free",
    gallery.standards?.standards >= 10 &&
      gallery.readouts?.readouts >= 4 &&
      gallery.readouts?.chips >= 11 &&
      gallery.readouts?.rects === undefined &&
      gallery.readouts?.ownBars === undefined &&
      gallery.readouts?.atlasWidth > 1 &&
      gallery.domReadouts === 0,
    JSON.stringify(gallery),
  );
  await ctx.snap(page, "banner-gallery");

  // One close-up per ladder state so chip layout is reviewable at reading
  // distance (the wide frame shows composition; far states are small there).
  for (const [label, unit] of [
    ["single", 2],
    ["pair", 0],
    ["row", 3],
    ["max", 4],
  ]) {
    await page.evaluate((u) => {
      const info = window.__game.unitInfo(u);
      const cam = window.__cam;
      cam.yaw = 0;
      cam.zoom = 8.6;
      cam.setViewCenter(info[0], info[1] - 14);
      cam.clampView?.();
    }, unit);
    await page.waitForTimeout(180);
    await ctx.snap(page, `banner-chips-${label}`);
  }

  // Restore the wide framing before the pan gate.
  await page.evaluate(() => {
    const points = [2, 0, 3, 4].map((u) => window.__game.unitInfo(u));
    const xs = points.map((info) => info[0]);
    const ys = points.map((info) => info[1]);
    const cam = window.__cam;
    cam.yaw = 0;
    cam.zoom = 8.55;
    cam.setViewCenter(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2 - 24,
    );
    cam.clampView?.();
  });
  await page.waitForTimeout(180);

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
    pan.standards >= 10 && pan.readouts >= 4 && pan.time === 0,
    JSON.stringify(pan),
  );
  await ctx.snap(page, "battle-readout-pan-end");
  await page.close();
}
