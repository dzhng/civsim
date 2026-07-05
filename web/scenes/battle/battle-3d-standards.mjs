export const meta = {
  name: "battle-3d-standards",
  kind: "visual",
  world: "battle-5v5",
  tier: "quick",
  snapshots: ["battle-standards-tactical", "battle-standards-approach", "battle-standards-eye"],
  describe: "Battle unit flags and readouts are in-scene GPU billboards anchored to the pole top.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "requires WebGPU browser flags",
      true,
      "set VERIFY_GPU=1 to capture battle standards",
    );
    return;
  }

  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "battle-3d-standards",
  });
  await page.goto(`${ctx.target}?battle=5v5&ai=off`);
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
    window.__game.select(4);
    const info = window.__game.unitInfo(4);
    const cam = window.__cam;
    cam.yaw = 0;
    cam.pitchBias = 0;
    cam.zoom = 2.4;
    cam.setViewCenter(info[0] - 52, info[1] - 6);
    cam.clampView?.();
  });
  await page.waitForFunction(
    () => {
      const standards = window.__game.stats().renderStats?.standards;
      return standards?.standards > 0 && standards?.selected === 1;
    },
    undefined,
    { timeout: 10000 },
  );
  await page.waitForTimeout(160);
  const tactical = await page.evaluate(() => {
    const stats = window.__game.stats().renderStats;
    return {
      standards: stats.standards,
      readouts: stats.readouts,
      domFlags: document.querySelectorAll(".ubanner-flag, .ubanner svg").length,
      domReadouts: document.querySelectorAll(".ubanner, #banner-gallery").length,
    };
  });
  ctx.check(
    "tactical standard frame has 3D standards, GPU readouts, selected glow owner, and no DOM banners",
    tactical.standards?.standards >= 10 &&
      tactical.standards?.selected === 1 &&
      tactical.standards?.timeSeconds === 0 &&
      // Chips hide at range by contract (the flag is the marker); the
      // banner-gallery scene owns chip-presence coverage.
      tactical.domFlags === 0 &&
      tactical.domReadouts === 0,
    JSON.stringify(tactical),
  );
  await ctx.snap(page, "battle-standards-tactical");

  // The approach vantage — the swoop regime where the rig leaves the vista
  // telephoto — is where the 3D standards carry the Rome-2 reference look:
  // poles above the grass line, cloth face-on, readouts at the pole tops.
  await page.evaluate(() => {
    const info = window.__game.unitInfo(4);
    const cam = window.__cam;
    cam.zoom = 8.6;
    cam.setViewCenter(info[0], info[1] - 14);
    cam.clampView?.();
  });
  await page.waitForTimeout(180);
  await ctx.snap(page, "battle-standards-approach");

  await page.evaluate(() => {
    const info = window.__game.unitInfo(4);
    const cam = window.__cam;
    cam.zoom = 9.5;
    cam.setViewCenter(info[0] - 10, info[1] - 2);
    cam.clampView?.();
  });
  await page.waitForTimeout(180);
  const eye = await page.evaluate(() => {
    const stats = window.__game.stats().renderStats;
    return {
      camera: stats.camera,
      standards: stats.standards,
      readouts: stats.readouts,
      domFlags: document.querySelectorAll(".ubanner-flag, .ubanner svg").length,
      domReadouts: document.querySelectorAll(".ubanner, #banner-gallery").length,
    };
  });
  ctx.check(
    "eye-level standard frame keeps standards in the world at the pinned clock",
    eye.standards?.standards >= 10 &&
      eye.standards?.selected === 1 &&
      eye.standards?.timeSeconds === 0 &&
      eye.domFlags === 0 &&
      eye.domReadouts === 0 &&
      eye.camera?.camera3d?.pitch < 0.4,
    JSON.stringify(eye),
  );
  await ctx.snap(page, "battle-standards-eye");
  await page.close();
}
