// Fractional production-clock coverage: ordinary pause preserves alpha, unlike
// debug freeze. No clock setter or alternative draw path is used.
import { battleRendererReady } from "../worlds.mjs";
import { snapshotSelected } from "../../snapshot.mjs";
import { UNIT_INFO } from "../../../packages/game-renderer/src/battle/unitInfoLayout.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const heldShots = [
  "delayed-root-phase/centroid-fractional",
  "delayed-root-phase/centroid-frozen",
  "delayed-root-phase/centroid-restored",
];
const motionShots = (kind) =>
  Array.from(
    { length: 64 },
    (_, i) => `delayed-root-phase/body-motion-region-${kind}-${String(i).padStart(3, "0")}`,
  );
// This gate excludes HUD/full-frame acceptance; original full A/B captures remain evidence.
const bodyRegion = { x: 400, y: 140, width: 512, height: 500 };

export const meta = {
  name: "battle-delayed-root-phase",
  kind: "visual",
  world: "battle-duel",
  tier: "full",
  snapshots: [...heldShots, ...motionShots("start"), ...motionShots("contact")],
  describe: "Production roots and soldier-attached overlays at a held fractional simulation time.",
};

export async function run(ctx) {
  if (heldShots.some((name) => snapshotSelected(name))) await held(ctx);
  for (const kind of ["start", "contact"]) {
    if (motionShots(kind).some((name) => snapshotSelected(name))) await motion(ctx, kind);
  }
}

async function boot(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "delayed-root-phase",
  });
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.goto(`${ctx.target}?battle=duel&a=0&b=0&ai=off&env=noon`);
  await battleRendererReady(page);
  // Wall-clock performance telemetry is not a presentation-state control.
  await page.addStyleTag({ content: "#fps-readout { visibility: hidden; }" });
  await page.evaluate(() => window.__game.freezeAtTick(4000));
  return page;
}

async function held(ctx) {
  const page = await boot(ctx);
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.soldierPos(g.soldierStartOf(0));
    g.select(0);
    g.setPace(0, 0);
    g.setOrder(0, p[0] + 60, p[1]);
  });
  await page.evaluate(() => window.__game.freezeAtTick(4120));
  const index = await page.evaluate((info) => {
    const g = window.__game;
    const unit = g.unitInfo(0);
    const p = [unit[info.centerX], unit[info.centerY]];
    let closest = g.soldierStartOf(0),
      distance = Infinity;
    for (let i = closest; i < g.soldierStartOf(0) + unit[info.total]; i++) {
      if (!g.soldierAlive(i)) continue;
      const q = g.soldierPos(i);
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < distance) {
        closest = i;
        distance = d;
      }
    }
    g.reviewFrame(p[0] - 3.5, p[1] - 3.5, p[0] + 3.5, p[1] + 3.5, {
      margin: 1,
      pitch: 1,
      fill: 0.8,
    });
    window.__cam.zoom = 3;
    return closest;
  }, UNIT_INFO);
  await page.evaluate(() => window.__game.reloadSoldierAssets());
  await battleRendererReady(page);
  // Establish a known timer origin while frozen, then force the actual clock's
  // existing catch-up cap to discard any pre-freeze fractional remainder.
  await page.clock.pauseAt(new Date("2026-01-01T01:00:00Z"));
  await page.evaluate(() => window.__game.freeze(false));
  await page.clock.fastForward(250);
  const capped = await observation(page, index);
  ctx.check(
    "the production clock advances through its real catch-up cap",
    capped.tick === 4124 && capped.clock.alpha === 0,
    JSON.stringify(capped),
  );
  await page.clock.runFor(16);
  await page.keyboard.press("p");
  await page.clock.runFor(32);
  const held = await observation(page, index);
  const attached = await page.evaluate(() => {
    const stats = window.__game.stats().renderStats;
    return { standards: stats.standards, rings: stats.tacticalLines.rings };
  });
  ctx.check(
    "selected standard and selection rings are submitted",
    attached.standards.selected === 1 &&
      attached.standards.standards > 0 &&
      attached.rings.rings > 0,
    JSON.stringify(attached),
  );
  const framing = await page.evaluate((index) => {
    const g = window.__game;
    const [x, y] = g.soldierPos(index);
    const z = g.heightAt(x, y);
    const a = window.__cam.worldToScreen(x, y, z);
    const b = window.__cam.worldToScreen(x, y, z + 1.8);
    return { foot: a, head: b, pixels: Math.hypot(a[0] - b[0], a[1] - b[1]) };
  }, index);
  ctx.check(
    "the soldier is visible at a reviewable scale",
    framing.pixels > 70 &&
      [framing.foot, framing.head].every(([x, y]) => x > 0 && x < 1280 && y > 0 && y < 600),
    JSON.stringify(framing),
  );
  ctx.check(
    "ordinary pause retains a fractional production clock",
    held.clock.paused && !held.clock.frozen && held.clock.alpha > 0 && held.clock.alpha < 1,
    JSON.stringify(held),
  );
  await ctx.snap(page, "delayed-root-phase/centroid-fractional", { threshold: 0, maxDiffRatio: 0 });
  await page.evaluate(() => window.__game.freeze(true));
  await page.clock.runFor(32);
  const frozen = await observation(page, index);
  await ctx.snap(page, "delayed-root-phase/centroid-frozen", { threshold: 0, maxDiffRatio: 0 });
  await page.evaluate(() => window.__game.freeze(false));
  await page.clock.runFor(32);
  const restored = await observation(page, index);
  ctx.check(
    "unfreeze restores the held clock and playback",
    JSON.stringify(restored) === JSON.stringify(held),
    JSON.stringify(restored),
  );
  await ctx.snap(page, "delayed-root-phase/centroid-restored", { threshold: 0, maxDiffRatio: 0 });
  await saveTrace("centroid-held", { held, frozen, restored, framing, attached });
  await page.close();
}

async function observation(page, index = 0) {
  return page.evaluate((index) => {
    const g = window.__game;
    return {
      tick: g.tickCount(),
      clock: g.stats().clock,
      index,
      alive: g.soldierAlive(index),
      endpoint: g.soldierPos(index),
      playback: g.debugSoldierAnim(index),
      formation: g.formationDebug(0),
    };
  }, index);
}

async function motion(ctx, kind) {
  const page = await boot(ctx);
  const shots = motionShots(kind);
  // Actual frozen engine probe on this fixture reaches first contact at tick
  // 6975, soldier 28. Keep the source index, not a culled-render-list index.
  const index = kind === "contact" ? 28 : 0;
  const beforeTick = kind === "contact" ? 6974 : 4000;
  await page.evaluate((kind) => {
    const g = window.__game;
    g.select(0);
    g.setPace(0, 0);
    if (kind === "contact") g.attackOrder(0, 1);
  }, kind);
  await page.evaluate((tick) => window.__game.freezeAtTick(tick), beforeTick);
  await page.evaluate(
    ({ index, kind }) => {
      const g = window.__game;
      const [x, y] = g.soldierPos(index);
      const centerY = y + (kind === "start" ? 0.5 : 0);
      g.reviewFrame(x - 2.5, centerY - 2.5, x + 2.5, centerY + 2.5, {
        margin: 1,
        pitch: 1,
        fill: 0.8,
      });
      window.__cam.zoom = 3;
    },
    { index, kind },
  );
  await page.evaluate(() => window.__game.reloadSoldierAssets());
  await battleRendererReady(page);
  await page.clock.pauseAt(new Date("2026-01-01T01:00:00Z"));
  await page.evaluate(() => window.__game.freeze(false));
  await page.clock.fastForward(250);
  await page.clock.runFor(16);
  await page.keyboard.press("p");
  await page.clock.runFor(32);
  const initial = await observation(page, index);
  ctx.check(
    `${kind}: real fractional-clock start`,
    initial.tick === beforeTick + 4 &&
      Math.abs(initial.clock.alpha - 0.18) < 1e-9 &&
      initial.clock.paused &&
      !initial.clock.frozen,
    JSON.stringify(initial),
  );
  const samples = [];
  let startEndpoint;
  let halted = false;
  for (let frame = 0; frame < 64; frame++) {
    let command = null;
    if (kind === "start" && frame === 8) {
      startEndpoint = (await observation(page, index)).endpoint;
      command = await page.evaluate((info) => {
        const g = window.__game;
        const unit = g.unitInfo(0);
        const target = [unit[info.x], unit[info.y] + 60];
        g.setOrder(0, ...target);
        return { type: "move", target };
      }, UNIT_INFO);
    }
    if (kind === "start" && frame === 40) {
      const p = (await observation(page, index)).endpoint;
      const travel = Math.hypot(p[0] - startEndpoint[0], p[1] - startEndpoint[1]);
      const activeMove = await page.evaluate(
        (info) => window.__game.unitInfo(0)[info.hasTarget] > 0,
        UNIT_INFO,
      );
      if (travel > 0.1 && activeMove) {
        await page.keyboard.press("g");
        halted = true;
        command = { type: "reform", travelBefore: travel };
      }
    }
    if (frame > 0) {
      await page.keyboard.press("p");
      await page.clock.runFor(16);
      await page.keyboard.press("p");
    }
    const sample = await observation(page, index);
    const context = await page.evaluate(
      ({ index, info }) => {
        const g = window.__game;
        const state = g.debugSoldierAnim(index);
        const root = state?.root;
        if (!root) return { missing: true };
        const z = g.heightAt(...root);
        const foot = window.__cam.worldToScreen(...root, z);
        const head = window.__cam.worldToScreen(...root, z + 1.8);
        const unit = g.unitInfo(0);
        return {
          foot,
          head,
          engaged: unit[info.engaged],
          hasTarget: unit[info.hasTarget],
          tacticalLines: g.stats().renderStats.tacticalLines,
        };
      },
      { index, info: UNIT_INFO },
    );
    samples.push({ frame, command, ...sample, context });
    ctx.check(
      `${kind} ${frame}: submitted root exists and target remains framed`,
      sample.alive === 1 &&
        !context.missing &&
        [context.foot, context.head].every(([x, y]) => x > 0 && x < 1280 && y > 0 && y < 640),
      JSON.stringify({
        tick: sample.tick,
        alpha: sample.clock.alpha,
        endpoint: sample.endpoint,
        root: sample.playback?.root,
        context,
      }),
    );
    ctx.check(
      `${kind}: tracked body anchors remain inside the fixed motion region ${frame}`,
      [context.foot, context.head].every(
        ([x, y]) =>
          x > bodyRegion.x + 16 &&
          x < bodyRegion.x + bodyRegion.width - 16 &&
          y > bodyRegion.y + 16 &&
          y < bodyRegion.y + bodyRegion.height - 16,
      ),
      JSON.stringify(context),
    );
    const full = PNG.sync.read(await page.screenshot());
    const region = new PNG({ width: bodyRegion.width, height: bodyRegion.height });
    PNG.bitblt(full, region, bodyRegion.x, bodyRegion.y, bodyRegion.width, bodyRegion.height, 0, 0);
    await ctx.snap(page, shots[frame], {
      shot: PNG.sync.write(region),
      threshold: 0,
      maxDiffRatio: 0,
    });
  }
  if (kind === "start") {
    ctx.check(
      "start: movement actually occurred after the command",
      samples.some(
        (s) => Math.hypot(s.endpoint[0] - startEndpoint[0], s.endpoint[1] - startEndpoint[1]) > 0.1,
      ),
      JSON.stringify({ halted }),
    );
  } else {
    ctx.check(
      "contact: actual engagement is present for visual arc review",
      samples.some((s) => s.context.engaged > 0),
      JSON.stringify(samples[0].context),
    );
  }
  await saveTrace(kind, { kind, beforeTick, index, halted, samples });
  await page.close();
}

async function saveTrace(kind, data) {
  const folder = new URL("../../../throwaway/live-consumer-capture/", import.meta.url);
  await mkdir(folder, { recursive: true });
  await writeFile(new URL(`${kind}.json`, folder), JSON.stringify(data, null, 2));
}
