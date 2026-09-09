import { UNIT_INFO } from "../_battle-unit-info.mjs";
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
    await page.evaluate(async (info) => {
      const c = window.__cam,
        g = window.__game,
        u = g.unitInfo(4);
      c.zoom = 7.9;
      c.yaw = -Math.PI / 2;
      c.pitchBias = 0;
      c.pitchBias = c.pitch - 0.25;
      c.setViewCenter(u[info.x], u[info.y] + 20);
      g.select(4);
      await g.freezeAtTick(120);
    }, UNIT_INFO);
    for (const ahead of [20, 60, 100]) {
      const point = await page.evaluate(
        ({ ahead, info }) => {
          const g = window.__game,
            c = window.__cam,
            u = g.unitInfo(4);
          const world = [u[info.x], u[info.y] + ahead];
          return { world, screen: c.worldToScreen(...world, g.heightAt(...world)) };
        },
        { ahead, info: UNIT_INFO },
      );
      await page.mouse.click(...point.screen, { button: "right" });
      await page.evaluate(() => window.__game.freezeAtTickWithEffects(window.__game.tickCount()));
      const result = await page.evaluate((info) => {
        const u = window.__game.unitInfo(4);
        return {
          target: [u[info.targetX], u[info.targetY], u[info.hasTarget]],
          preview: window.__game.previewDebug(4),
        };
      }, UNIT_INFO);
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
    const formation = await page.evaluate((info) => {
      const c = window.__cam,
        g = window.__game,
        u = g.unitInfo(4);
      const points = [
        [u[info.x], u[info.y] + 80],
        [u[info.x] + 30, u[info.y] + 80],
      ];
      const screen = points.map((p) => c.worldToScreen(...p, g.heightAt(...p)).map(Math.round));
      const hits = screen.map((p) =>
        c.screenToWorld(p[0] * devicePixelRatio, p[1] * devicePixelRatio),
      );
      return {
        world: hits[0],
        screen,
        facing: Math.atan2(hits[1][1] - hits[0][1], hits[1][0] - hits[0][0]),
      };
    }, UNIT_INFO);
    const formationCamera = await pose();
    await page.mouse.move(...formation.screen[0]);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(...formation.screen[1], { steps: 6 });
    await page.evaluate(() => window.__game.freezeAtTickWithEffects(window.__game.tickCount()));
    const dragPreview = await page.evaluate(() => window.__game.previewDebug(4));
    // The preceding click leaves a preview too. Its mere presence cannot prove
    // the current drag reached the renderer; check this drag's position and axis.
    ctx.check(
      "right-drag displays the current formation preview",
      !!dragPreview &&
        Math.abs((dragPreview.y0 + dragPreview.y1) / 2 - formation.world[1]) < 1 &&
        Math.abs(dragPreview.x1 - dragPreview.x0) < Math.abs(dragPreview.y1 - dragPreview.y0),
      JSON.stringify(dragPreview),
    );
    await page.mouse.up({ button: "right" });
    await page.evaluate(() => window.__game.freezeAtTickWithEffects(window.__game.tickCount()));
    const formationOrder = await page.evaluate(() => Array.from(window.__game.unitInfo(4)));
    ctx.check(
      "right-drag places the formation and faces along the drag",
      Math.hypot(
        formationOrder[UNIT_INFO.targetX] - formation.world[0],
        formationOrder[UNIT_INFO.targetY] - formation.world[1],
      ) < 1 &&
        formationOrder[UNIT_INFO.hasGoalFacing] === 1 &&
        Math.abs(formationOrder[UNIT_INFO.goalFacing] - formation.facing) < 0.001,
      JSON.stringify(formationOrder),
    );
    ctx.check(
      "right-drag leaves the camera stationary",
      JSON.stringify((await pose()).camera3d) === JSON.stringify(formationCamera.camera3d),
    );
    const before = await pose();
    const targetBefore = await page.evaluate((info) => {
      const u = window.__game.unitInfo(4);
      return [u[info.targetX], u[info.targetY], u[info.hasTarget]];
    }, UNIT_INFO);
    await page.mouse.move(800, 400);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(920, 460, { steps: 8 });
    await page.mouse.up({ button: "middle" });
    const after = await pose();
    const targetAfter = await page.evaluate((info) => {
      const u = window.__game.unitInfo(4);
      return [u[info.targetX], u[info.targetY], u[info.hasTarget]];
    }, UNIT_INFO);
    const drift = Math.hypot(...after.eye.map((x, i) => x - before.eye[i]));
    ctx.check(
      "middle-drag rotates at a fixed eye with a unit selected",
      drift < 0.001 && Math.abs(after.camera3d.yaw - before.camera3d.yaw) > 0.5,
      JSON.stringify({ drift, before: before.camera3d, after: after.camera3d }),
    );
    ctx.check(
      "middle-drag does not replace the selected unit's order",
      JSON.stringify(targetBefore) === JSON.stringify(targetAfter),
    );
    const zoomStart = await pose();
    await page.mouse.move(1100, 250);
    await page.mouse.wheel(0, -120);
    await page.waitForFunction(
      (d) => window.__cam.params().distance < d,
      zoomStart.camera3d.distance,
    );
    const zoomEnd = await pose();
    const zoomTravel = zoomStart.camera3d.distance - zoomEnd.camera3d.distance;
    const eyeTravel = Math.hypot(...zoomEnd.eye.map((v, i) => v - zoomStart.eye[i]));
    ctx.check(
      "wheel after middle-look keeps heading and avoids a sideways jump",
      eyeTravel < zoomTravel * 2 + 0.5 &&
        Math.abs(zoomEnd.camera3d.pitch - zoomStart.camera3d.pitch) < 1e-8 &&
        zoomEnd.camera3d.yaw === zoomStart.camera3d.yaw,
      JSON.stringify({ zoomTravel, eyeTravel }),
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
    await page.evaluate(async (info) => {
      const c = window.__cam,
        g = window.__game,
        u = g.unitInfo(4);
      c.zoom = 9.5;
      c.yaw = -Math.PI / 2;
      c.pitchBias = 0;
      c.setViewCenter(u[info.centerX], u[info.centerY]);
      g.select(-1);
      await g.freezeAtTick(120);
    }, UNIT_INFO);
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
      "automatic tilt opens earlier during the approach while retaining the overview",
      tilt[0].camera3d.pitch > 1.2 &&
        tilt[1].camera3d.pitch < 1.25 &&
        tilt[2].camera3d.pitch < 0.9 &&
        tilt[3].camera3d.pitch < 0.5,
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
