import { reportedHighland } from "../_battle-reported-highland.mjs";

export const meta = {
  name: "battle-terrain-controls",
  kind: "flow",
  world: "battle-real",
  tier: "quick",
  snapshots: [],
  describe:
    "Raised-ground clicks, destination previews and fixed-eye look controls on the reported highland seed.",
};

export async function run(ctx) {
  const page = await reportedHighland(ctx, 2);
  try {
    await page.evaluate(async () => {
      const c = window.__cam,
        g = window.__game,
        u = g.unitInfo(4);
      c.zoom = 7.9;
      c.yaw = -Math.PI / 2;
      c.pitchBias = 0;
      c.pitchBias = c.pitch - 0.25;
      c.setViewCenter(u[0], u[1] + 20);
      g.select(4);
      await g.freezeAtTick(120);
    });
    for (const ahead of [20, 60, 100]) {
      const point = await page.evaluate((ahead) => {
        const g = window.__game,
          c = window.__cam,
          u = g.unitInfo(4);
        const world = [u[0], u[1] + ahead];
        return { world, screen: c.worldToScreen(...world, g.heightAt(...world)) };
      }, ahead);
      await page.mouse.click(...point.screen, { button: "right" });
      await page.evaluate(() => window.__game.freezeAtTickWithEffects(window.__game.tickCount()));
      const result = await page.evaluate(() => ({
        target: Array.from(window.__game.unitInfo(4)).slice(10, 13),
        preview: window.__game.previewDebug(4),
      }));
      const error = Math.hypot(
        result.target[0] - point.world[0],
        result.target[1] - point.world[1],
      );
      ctx.check(
        `DPR2 ground click ${ahead}m ahead matches the rendered terrain`,
        result.target[2] === 1 && error < 1,
        JSON.stringify({ point, target: result.target, error }),
      );
      ctx.check(
        `click ${ahead}m ahead presents a destination immediately`,
        !!result.preview,
        JSON.stringify(result.preview),
      );
    }
    const pose = () => page.evaluate(() => window.__game.cameraSurfaceDebug());
    const before = await pose();
    const targetBefore = await page.evaluate(() =>
      Array.from(window.__game.unitInfo(4)).slice(10, 13),
    );
    await page.mouse.move(800, 400);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(920, 460, { steps: 8 });
    await page.mouse.up({ button: "right" });
    const after = await pose();
    const targetAfter = await page.evaluate(() =>
      Array.from(window.__game.unitInfo(4)).slice(10, 13),
    );
    const drift = Math.hypot(...after.eye.map((x, i) => x - before.eye[i]));
    ctx.check(
      "right-drag rotates at a fixed eye with a unit selected",
      drift < 0.001 && Math.abs(after.camera3d.yaw - before.camera3d.yaw) > 0.5,
      JSON.stringify({ drift, before: before.camera3d, after: after.camera3d }),
    );
    ctx.check(
      "right-drag does not replace the selected unit's order",
      JSON.stringify(targetBefore) === JSON.stringify(targetAfter),
    );
    for (const key of ["q", "e", "z", "x"]) {
      const before = await pose();
      await page.keyboard.down(key);
      await page.waitForFunction((before) => {
        const p = window.__cam.params();
        return Math.abs(p.yaw - before.yaw) + Math.abs(p.pitch - before.pitch) > 0.04;
      }, before.camera3d);
      await page.keyboard.up(key);
      const after = await pose();
      const drift = Math.hypot(...after.eye.map((x, i) => x - before.eye[i]));
      ctx.check(
        `${key.toUpperCase()} turns at the camera position without changing the lens`,
        drift < 0.001 && before.camera3d.fovY === after.camera3d.fovY,
        JSON.stringify({ drift, before: before.camera3d, after: after.camera3d }),
      );
    }
    await page.evaluate(async () => {
      const c = window.__cam,
        g = window.__game,
        u = g.unitInfo(4);
      c.zoom = 9.5;
      c.yaw = -Math.PI / 2;
      c.pitchBias = 0;
      c.setViewCenter(u[30], u[31]);
      g.select(-1);
      await g.freezeAtTick(120);
    });
    await page.mouse.move(500, 5);
    await page.mouse.down();
    await page.mouse.move(1200, 620, { steps: 6 });
    await page.mouse.up();
    ctx.check(
      "a box crossing the horizon selects visible units",
      await page.evaluate(() => window.__game.selected().includes(4)),
    );
    const picking = await page.evaluate(() => window.__game.stats().renderStats.terrain.picking);
    ctx.check(
      "picking uses the rendered terrain triangles",
      picking?.source === "rendered-triangles",
      JSON.stringify(picking),
    );
    const tilt = await page.evaluate(() => {
      const c = window.__cam;
      c.resetLook();
      c.setViewCenter(0, 0);
      return [200, 100, 40, 20, 10].map((distance) => {
        c.zoomAt(1600, 900, c.params().distance / distance);
        return window.__game.cameraSurfaceDebug();
      });
    });
    ctx.check(
      "automatic tilt waits until physically close to the ground",
      tilt[0].camera3d.pitch > 1.2 && tilt[1].camera3d.pitch > 1.2 && tilt[3].camera3d.pitch < 0.5,
      JSON.stringify(
        tilt.map((s) => ({
          distance: s.camera3d.distance,
          pitch: s.camera3d.pitch,
          clearance: s.clearance,
        })),
      ),
    );
    await page.evaluate(() => {
      const c = window.__cam;
      c.resetLook();
      c.zoom = 3;
      c.setViewCenter(0, 0);
    });
    await page.keyboard.down("x");
    await page.waitForFunction(() => window.__cam.pitch < 0.3);
    await page.keyboard.up("x");
    const highLook = await pose();
    await page.mouse.move(800, 450);
    for (let i = 0; i < 60; i++) {
      const distance = await page.evaluate(() => window.__cam.params().distance);
      if (distance < 4) break;
      await page.mouse.wheel(0, -1000);
      // Wait for each input to land instead of letting Chromium coalesce a burst.
      await page.waitForFunction((d) => window.__cam.params().distance < d, distance);
    }
    await page.waitForFunction(() => window.__cam.params().distance < 4);
    const closeLook = await pose();
    ctx.check(
      "wheel zoom after high free-look reaches the ground again",
      highLook.clearance > 500 && closeLook.clearance < 8,
      JSON.stringify({ before: highLook.clearance, after: closeLook.clearance }),
    );
  } finally {
    await page.close();
  }
}
