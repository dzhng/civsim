import { PNG } from "pngjs";
import { UNIT_INFO, unitScreen, worldPointNearUnit } from "../_battle-unit-info.mjs";
import { hasBattleWorldDepthContract } from "../_renderer-contract.mjs";
import { battle5v5 } from "../worlds.mjs";

export const meta = {
  name: "battle-input",
  kind: "flow",
  world: "battle-5v5",
  tier: "quick",
  snapshots: [],
  describe:
    "Production WebGPU battle route preserves click, box-select, orders, zoom, DPR, and freeze semantics.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "requires WebGPU browser flags",
      true,
      "set VERIFY_GPU=1 to exercise the production input path",
    );
    return;
  }

  for (const dpr of [1, 2]) {
    const page = await battle5v5(ctx, {
      deviceScaleFactor: dpr,
      errorPrefix: `gpu-input-dpr${dpr}`,
      ai: "off",
    });
    await page.waitForTimeout(300);

    await frameUnit(page, 4);

    const target = await unitScreen(page, 4);
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(120);
    const clicked = await page.evaluate(() => window.__game.selected());
    ctx.check(
      `dpr${dpr}: left-click selects the rendered WebGPU unit`,
      clicked.includes(4),
      JSON.stringify({ target, selected: clicked }),
    );

    await page.evaluate(() => window.__game.select(-1));
    const boxTarget = await unitScreen(page, 4);
    await page.mouse.move(boxTarget.x - 70, boxTarget.y - 45);
    await page.mouse.down();
    await page.mouse.move(boxTarget.x, boxTarget.y, { steps: 3 });
    await page.mouse.move(boxTarget.x + 70, boxTarget.y + 45, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    const boxed = await page.evaluate(() => window.__game.selected());
    ctx.check(
      `dpr${dpr}: drag-box selects the rendered WebGPU unit`,
      boxed.includes(4),
      JSON.stringify({ target: boxTarget, selected: boxed }),
    );

    // Selecting grows per-soldier ground rings (campaign-style decals). Wait
    // for a rendered frame — software-GPU frames take hundreds of ms.
    const ringsGrew = await page
      .waitForFunction(
        () => window.__game.stats().renderStats.tacticalLines.rings?.count > 0,
        undefined,
        { timeout: 10000, polling: 100 },
      )
      .then(
        () => true,
        () => false,
      );
    const ringStats = await page.evaluate(() => window.__game.stats().renderStats.tacticalLines);
    ctx.check(
      `dpr${dpr}: selection grows per-soldier ground rings`,
      ringsGrew && ringStats.rings?.count > 0,
      JSON.stringify(ringStats),
    );

    await page.evaluate(() => window.__game.freezeAtTick(72));
    await page.waitForTimeout(120);
    const canvas = page.locator("#battlefield");
    const frozenA = PNG.sync.read(await canvas.screenshot());
    await page.evaluate(() => window.__game.freezeAtTick(72));
    await page.waitForTimeout(120);
    const frozenB = PNG.sync.read(await canvas.screenshot());
    const frozenStats = await page.evaluate(() => window.__game.stats());
    const frozenDiff = pixelByteDiff(frozenA, frozenB);
    ctx.check(
      `dpr${dpr}: freezeAtTick keeps WebGPU canvas pixels stable`,
      frozenStats.renderer === "gpu" &&
        hasBattleWorldDepthContract(frozenStats.renderStats) &&
        frozenDiff === 0,
      JSON.stringify({
        renderer: frozenStats.renderer,
        diffBytes: frozenDiff,
        renderStats: frozenStats.renderStats,
      }),
    );

    const orderTarget = await worldPointNearUnit(page, 4, -80, 45);
    await page.mouse.click(orderTarget.x, orderTarget.y, { button: "right" });
    await page.waitForTimeout(120);
    const ordered = await page.evaluate((unitInfo) => {
      const info = window.__game.unitInfo(4);
      return {
        selected: window.__game.selected(),
        targetX: info[unitInfo.targetX],
        targetY: info[unitInfo.targetY],
        hasTarget: info[unitInfo.hasTarget],
        stats: window.__game.stats(),
      };
    }, UNIT_INFO);
    ctx.check(
      `dpr${dpr}: right-click issues a wasm move order through WebGPU canvas input`,
      ordered.selected.includes(4) &&
        ordered.hasTarget > 0.5 &&
        Math.hypot(ordered.targetX - orderTarget.worldX, ordered.targetY - orderTarget.worldY) <
          2.0 &&
        ordered.stats.renderStats?.soldiers === ordered.stats.soldiers &&
        hasBattleWorldDepthContract(ordered.stats.renderStats),
      JSON.stringify({ target: orderTarget, ordered }),
    );

    // Holding Space overlays every unit's order paths (facing ticks, lines).
    // Unfreeze first — a frozen scene renders no new tactical-line frames.
    await page.evaluate(() => window.__game.freeze(false));
    await page.waitForTimeout(200);
    const cuesIdle = await page.evaluate(
      () => window.__game.stats().renderStats.tacticalLines.groundCues.count,
    );
    await page.keyboard.down(" ");
    const cuesShown = await page
      .waitForFunction(
        (idle) => window.__game.stats().renderStats.tacticalLines.groundCues.count > idle,
        cuesIdle,
        { timeout: 10000, polling: 100 },
      )
      .then(
        () => true,
        () => false,
      );
    const cuesHeld = await page.evaluate(
      () => window.__game.stats().renderStats.tacticalLines.groundCues.count,
    );
    await page.keyboard.up(" ");
    ctx.check(
      `dpr${dpr}: holding Space shows the order overlay`,
      cuesShown && cuesHeld > cuesIdle,
      JSON.stringify({ cuesIdle, cuesHeld }),
    );

    const zoomBefore = await page.evaluate(() => window.__cam.zoom);
    await page.mouse.move(orderTarget.x, orderTarget.y);
    await page.mouse.wheel(0, -220);
    await page.waitForTimeout(120);
    const zoomed = await page.evaluate(() => ({
      zoom: window.__cam.zoom,
      stats: window.__game.stats(),
    }));
    ctx.check(
      `dpr${dpr}: wheel zoom updates the production WebGPU battle camera`,
      zoomed.zoom > zoomBefore &&
        zoomed.stats.renderStats?.soldiers === zoomed.stats.soldiers &&
        hasBattleWorldDepthContract(zoomed.stats.renderStats),
      JSON.stringify({
        before: zoomBefore,
        after: zoomed.zoom,
        renderStats: zoomed.stats.renderStats,
      }),
    );

    // Keyboard pan is screen-relative: at the north-up view (yaw −π/2, the
    // Backspace/Home reset) D must drive the view east (+X) and W north (+Y).
    // Pins the screen→world axis convention across the whole key/edge pan path
    // (real keydown → held set → pan timer → panWorld).
    await page.mouse.move(400, 300); // clear of the edge-scroll band
    const panProbe = async (key) => {
      const before = await page.evaluate(() => {
        const cam = window.__cam;
        cam.yaw = -Math.PI / 2;
        cam.zoom = 24; // past the rig max → full vista: clampView pans freely
        const b = cam.bounds;
        if (b) cam.setViewCenter((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
        return cam.viewCenter();
      });
      // Hold the key until the main loop has demonstrably applied the pan —
      // software-GPU frames can take hundreds of ms, so a wall-clock hold races.
      await page.keyboard.down(key);
      const moved = await page
        .waitForFunction(
          (b) => {
            const c = window.__cam.viewCenter();
            return Math.hypot(c[0] - b[0], c[1] - b[1]) > 0.5;
          },
          before,
          { timeout: 10000, polling: 100 },
        )
        .then(
          () => true,
          () => false,
        );
      await page.keyboard.up(key);
      const after = await page.evaluate(() => window.__cam.viewCenter());
      return { moved, dx: after[0] - before[0], dy: after[1] - before[1] };
    };
    const d = await panProbe("d");
    ctx.check(
      `dpr${dpr}: D key pans the view east at the north-up yaw`,
      d.moved && d.dx > 0 && Math.abs(d.dy) < d.dx * 0.05,
      JSON.stringify(d),
    );
    const w = await panProbe("w");
    ctx.check(
      `dpr${dpr}: W key pans the view north at the north-up yaw`,
      w.moved && w.dy > 0 && Math.abs(w.dx) < w.dy * 0.05,
      JSON.stringify(w),
    );

    if (dpr === 1) {
      // The banner plants on the unit's world centroid, so it must project
      // inside the block's screen bounds at ANY yaw (a camera-frame anchor
      // drifts under Q/E, and a z = 0 anchor parallaxes off the block on
      // elevated ground).
      await page.evaluate(() => {
        const a = window.__game.unitInfo(4);
        const cam = window.__cam;
        cam.zoom = 5; // mid band: the whole block stays in front of the camera
        cam.setViewCenter(a[0], a[1]);
        cam.clampView?.();
      });
      for (const yaw of [-Math.PI / 2, 0.6, 2.1]) {
        await page.evaluate((y) => {
          window.__cam.yaw = y;
          window.__cam.clampView?.();
        }, yaw);
        await page.waitForTimeout(250);
        const res = await page.evaluate(() => {
          const g = window.__game;
          const cam = window.__cam;
          const u = 4;
          const start = g.soldierStartOf(u);
          const count = Math.floor(g.unitInfo(u)[7]);
          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;
          for (let i = start; i < start + count; i++) {
            if (!g.soldierAlive(i)) continue;
            const [wx, wy] = g.soldierPos(i);
            const [sx, sy] = cam.worldToScreen(wx, wy, g.heightAt(wx, wy));
            if (sx < -1e4 || sy < -1e4) continue; // behind the camera
            if (sx < minX) minX = sx;
            if (sx > maxX) maxX = sx;
            if (sy < minY) minY = sy;
            if (sy > maxY) maxY = sy;
          }
          // Banners are GPU billboards, so read the owner's uploaded
          // standard anchors (renderStats.native.standards.anchors).
          const anchor = g
            .stats()
            .renderStats?.native?.standards?.anchors?.find((candidate) => candidate.unitId === u);
          const projected = anchor ? cam.worldToScreen(anchor.x, anchor.y, anchor.z) : null;
          return {
            minX,
            maxX,
            minY,
            maxY,
            bannerX: projected ? projected[0] : NaN,
            bannerFoot: projected ? projected[1] : NaN,
          };
        });
        const marginX = Math.max(30, 0.35 * (res.maxX - res.minX));
        const marginY = Math.max(30, 0.35 * (res.maxY - res.minY));
        ctx.check(
          `banner plants on the block at yaw ${yaw.toFixed(2)}`,
          res.bannerX > res.minX - marginX &&
            res.bannerX < res.maxX + marginX &&
            res.bannerFoot > res.minY - marginY &&
            res.bannerFoot < res.maxY + marginY,
          JSON.stringify(res),
        );
      }

      // Bronze tooltips (Radix) on the icon-only controls: appear on hover AND
      // keyboard focus, carry the command copy, and replace the native title bubble.
      await page.hover('#toolbar button[data-cmd="pace"]');
      await page.waitForTimeout(500);
      const hoverTip = await page.evaluate(() => {
        const t = document.querySelector(".hud-tooltip");
        const btn = document.querySelector('#toolbar button[data-cmd="pace"]');
        return {
          cls: t?.className ?? "",
          hasCopy: (t?.textContent ?? "").includes("Toggle walk/run"),
          nativeTitle: btn?.getAttribute("title"),
        };
      });
      ctx.check(
        "toolbar icon shows a bronze tooltip on hover (no native title)",
        hoverTip.cls.includes("hud-tooltip") && hoverTip.hasCopy && hoverTip.nativeTitle === null,
        JSON.stringify(hoverTip),
      );

      await page.mouse.move(8, 8);
      await page.waitForTimeout(350);
      await page.evaluate(() =>
        document.querySelector('#toolbar button[data-cmd="pause"]').focus(),
      );
      await page.waitForTimeout(500);
      const focusCopy = await page.evaluate(
        () => document.querySelector(".hud-tooltip")?.textContent ?? "",
      );
      ctx.check(
        "toolbar icon shows its tooltip on keyboard focus",
        focusCopy.includes("Pause"),
        JSON.stringify({ focusCopy: focusCopy.slice(0, 40) }),
      );
    }

    await page.close();
  }
}

async function frameUnit(page, unit) {
  await page.evaluate(
    ({ unit, unitInfo }) => {
      const info = window.__game.unitInfo(unit);
      const cam = window.__cam;
      cam.zoom = 3;
      cam.yaw = 0;
      cam.x = info[unitInfo.x] - 90;
      cam.y = info[unitInfo.y];
      cam.clampView?.();
      window.__game.select(-1);
    },
    { unit, unitInfo: UNIT_INFO },
  );
  await page.waitForTimeout(150);
}

function pixelByteDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let diff = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) diff++;
  return diff;
}
