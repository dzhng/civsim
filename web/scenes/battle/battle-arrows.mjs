export const meta = {
  name: "battle-arrows",
  kind: "visual",
  world: "battle-duel-archers",
  tier: "quick",
  snapshots: ["arrows-close", "arrows-far"],
  describe: "Archers loose a mid-flight volley that stays readable close and fully zoomed out.",
};

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: "arrows" });
  await page.goto(`${ctx.target}?battle=duel&a=4&b=0&ai=off&env=noon`);
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 20000 });
  await page.addStyleTag({
    content:
      "#gameover, #hud, #buttons, #pausemenu, #banner, #selbox, #minimap, #unitlabels, #unitcards, #toolbar { display: none !important; }",
  });

  const frozenTick = await page.evaluate(async () => {
    const g = window.__game;
    g.select(0);
    g.setPace(0, 0);
    // Bows only fire HALTED (missiles.rs: !mobile_fire && frame_speed > 0.3
    // skips, and a melee attack order never halts). March into bow range
    // (range 150m, spawn gap ~180m), stop, and loose at will.
    const a = g.unitInfo(0);
    const b = g.unitInfo(1);
    g.setOrder(0, a[30] + (b[30] - a[30]) * 0.4, a[31] + (b[31] - a[31]) * 0.4);
    g.set_fire_at_will?.(0, 1);
    let firstVolley = -1;
    for (let tick = 0; tick < 7200; tick++) {
      g.advance(1);
      if (g.projectileCount() > 0) {
        firstVolley = g.tickCount();
        break;
      }
    }
    if (firstVolley < 0) return -1;
    const freeze = firstVolley + 13; // arrows rising, still near the line
    await window.__game.freezeAtTickWithEffects(freeze);
    return freeze;
  });
  ctx.check("archers produced a mid-flight volley", frozenTick > 0, `freeze tick ${frozenTick}`);
  if (frozenTick < 0) {
    await page.close();
    return;
  }

  await page.waitForTimeout(180);
  await page.evaluate(async () => {
    const a = window.__game.unitInfo(0);
    // Tight on the archer line: unit at the frame's lower half, the volley
    // arcs through the air just north (+Y) of it.
    // The archer LINE fills the lower frame; the volley hangs in the air
    // directly above/ahead of it.
    // Near-horizon pitch: the volley silhouettes against the SKY (dark
    // shafts on bright ground read as hairs; on sky they read as arrows).
    window.__game.reviewFrame(a[30] - 20, a[31] - 8, a[30] + 20, a[31] + 16, {
      margin: 4,
      pitch: 0.33,
      fill: 0.8,
    });
  });
  await page.waitForTimeout(180);
  await ctx.snap(page, "arrows-close");

  await page.evaluate(async () => {
    window.__game.reviewFrameClear?.();
    const a = window.__game.unitInfo(0);
    const b = window.__game.unitInfo(1);
    const cam = window.__cam;
    cam.yaw = -Math.PI / 2;
    cam.pitchBias = 0;
    cam.zoom = 0.4;
    cam.setViewCenter((a[30] + b[30]) * 0.5, (a[31] + b[31]) * 0.5);
    cam.clampView?.();
    await window.__game.freezeAtTickWithEffects(window.__game.tickCount());
  });
  await page.waitForTimeout(180);
  await ctx.snap(page, "arrows-far");

  await page.close();
}
