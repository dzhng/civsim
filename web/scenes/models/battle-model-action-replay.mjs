import { requireSwiftShaderBaseline } from "./_swiftshader-baseline.ts";
import { temporalSnapshots, verifyTemporalReplay } from "./_temporal-replay.mjs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const disabledSnapshots = [15.1, 15.9].map(
  (tick) => `shared/soldiers/action-replay/disabled-${tick}`,
);

// This is the same workbench/timeline submission as the longer temporal replay.
export async function verifyDisabledGait(ctx, page) {
  await page.evaluate(() => {
    const h = window.__battleModels;
    h.freeze();
    h.set({
      classId: 4,
      clip: "idle",
      phase: 0,
      formation: false,
      yaw: 0.45,
      pitch: 1.15,
      zoom: 190,
      target: [0, 0, 1],
    });
  });
  await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw, undefined, {
    timeout: 30000,
  });
  const draw = await page.evaluateHandle(
    async (root) => {
      const { BattleModelReplay } = await import(
        `${root}apps/renderer-lab/src/battleModelReplay.ts`
      );
      const { evaluatePlaybackPose, ACTION_TICK_SECONDS } = await import(
        `${root}packages/crowd-runtime/src/actionTimeline.ts`
      );
      const w = window.__battleModels.world;
      const camera = structuredClone(w.stats().camera);
      const asset = w.soldierAssets[4];
      const walk = asset.animation.clips.find(
        (clip) => clip.name === asset.manifest.presentation.actions.walk.clip,
      );
      const speed = walk.strideMeters / walk.duration;
      const initial = new BattleModelReplay(w.soldierAssets, 4).seek(0).observation;
      const replay = new BattleModelReplay(w.soldierAssets, 4, {
        endTick: 16,
        events: [],
        observation: (tick) => ({
          ...initial,
          speedMps: speed,
          forwardMps: speed,
          incapacitated: tick >= 15,
        }),
      });
      w.crowd.upload([]);
      w.setTime(0);
      return async (tick) => {
        const state = replay.seek(tick);
        w.drawInstances(state.instances, camera);
        await w.settlePresentedFrame();
        w.render();
        await w.world.settlePresentedFrame();
        return {
          playback: state.playback,
          observation: state.observation,
          locals: Array.from(evaluatePlaybackPose(asset, state.playback)),
          expectedPhase: (15 * ACTION_TICK_SECONDS) / walk.duration,
        };
      };
    },
    `/@fs${fileURLToPath(new URL("../../../", import.meta.url))}`,
  );
  try {
    const frames = [];
    for (const [i, tick] of [15.1, 15.9].entries()) {
      const state = await draw.evaluate((draw, tick) => draw(tick), tick);
      const shot = await page.locator("canvas").first().screenshot();
      const repeated = await draw.evaluate((draw, tick) => draw(tick), tick);
      const repeatShot = await page.locator("canvas").first().screenshot();
      ctx.check(
        `disabled/${tick}: exact repeated submitted pose`,
        JSON.stringify(state) === JSON.stringify(repeated),
      );
      ctx.check(
        `disabled/${tick}: exact repeated pixels`,
        PNG.sync.read(shot).data.equals(PNG.sync.read(repeatShot).data),
      );
      ctx.check(
        `disabled/${tick}: completed travel retained with no prospective advance`,
        state.observation.incapacitated &&
          state.observation.speedMps > 0 &&
          Math.abs(state.playback.base.destination.phase - state.expectedPhase) < 1e-12,
        JSON.stringify(state.playback),
      );
      await ctx.snap(null, disabledSnapshots[i], { shot, threshold: 0, maxDiffRatio: 0 });
      frames.push({ state, pixels: PNG.sync.read(shot).data });
    }
    ctx.check(
      "disabled: fractional submitted pose holds exactly",
      JSON.stringify(frames[0].state.playback) === JSON.stringify(frames[1].state.playback) &&
        JSON.stringify(frames[0].state.locals) === JSON.stringify(frames[1].state.locals),
    );
    ctx.check(
      "disabled: fractional production pixels hold exactly",
      frames[0].pixels.equals(frames[1].pixels),
    );
  } finally {
    await draw.dispose();
  }
}

export const meta = {
  name: "battle-model-action-replay",
  kind: "visual",
  world: "battle-models-action-replay",
  tier: "full",
  snapshots: [
    "shared/soldiers/action-replay/controller",
    ...temporalSnapshots,
    ...disabledSnapshots,
  ],
  describe:
    "Synthetic observation replay through the real timeline, catalog and GPU-blended production submission; numerical and temporal pose gates remain separate.",
};

export async function run(ctx) {
  requireSwiftShaderBaseline(meta.name);
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(`${ctx.target}/renderer/battle-models?replay=1`);
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    const seek = async (tick) => {
      await page.evaluate((tick) => {
        window.__battleModels.freeze();
        window.__battleModels.replay.seek(tick);
      }, tick);
      await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
      await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
      return page.evaluate(() => window.__battleModels.stats());
    };
    await page.evaluate(() =>
      window.__battleModels.set({
        classId: 4,
        clip: "idle",
        phase: 0,
        formation: false,
        yaw: 0.45,
        pitch: 1.15,
        zoom: 190,
      }),
    );
    const first = await seek(60);
    const repeat = await seek(90);
    ctx.check(
      "each observed release enters its authored release phase",
      first.sampled.clip === "bow_release" &&
        repeat.sampled.clip === "bow_release" &&
        first.sampled.phase === repeat.sampled.phase,
      { first: first.sampled, repeat: repeat.sampled },
    );
    const injured = await seek(105);
    ctx.check(
      "health decrease selects a fresh hit",
      injured.sampled.clip === "hit_a" && injured.sampled.phase === 0,
      injured.sampled,
    );
    const dead = await seek(240);
    ctx.check(
      "terminal death holds its final phase",
      dead.sampled.clip === "death_a" && dead.sampled.phase === 1,
      dead.sampled,
    );
    const rewound = await seek(90);
    ctx.check(
      "backward seek replays intermediate observations",
      JSON.stringify(rewound.replay.playback) === JSON.stringify(repeat.replay.playback),
    );
    const paused = await seek(90);
    ctx.check(
      "frozen replay has deterministic pose state",
      JSON.stringify(paused.replay.playback) === JSON.stringify(repeat.replay.playback),
    );
    await page.evaluate(() => window.__battleModels.replay.reset());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    ctx.check(
      "explicit reset clears terminal history",
      await page.evaluate(
        () =>
          window.__battleModels.stats().replay.tick === 0 &&
          window.__battleModels.stats().sampled.clip === "idle",
      ),
    );

    await page.evaluate(() => window.__battleModels.set({ classId: 3, clip: "idle" }));
    ctx.check(
      "switching back to manual inspection clears replay tick",
      (await page.locator("#model-replay-tick").textContent()) === "0",
    );
    const equipment = await seek(165);
    ctx.check(
      "equipment replay uses the canonical sidearm appearance",
      equipment.replay.playback.appearanceId === 18 && equipment.replay.instances[0].classId === 18,
    );
    await page.locator("#model-replay-panel").evaluate((element) => {
      element.open = true;
    });
    await page.selectOption("#model-replay-jump", "60");
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    ctx.check(
      "event picker seeks the real replay",
      await page.evaluate(() => window.__battleModels.stats().replay.tick === 60),
    );
    await page.click("#model-replay-play");
    await page.waitForFunction(() => window.__battleModels.stats().replay.tick > 60);
    await page.click("#model-replay-play");
    const pausedTick = await page.evaluate(() => window.__battleModels.stats().replay.tick);
    await page.waitForTimeout(100);
    ctx.check(
      "play and pause operate the replay clock",
      await page.evaluate((tick) => window.__battleModels.stats().replay.tick === tick, pausedTick),
    );

    await page.evaluate(() => window.__battleModels.set({ classId: 7, clip: "idle", zoom: 150 }));
    const mounted = await seek(90);
    ctx.check(
      "mounted controller submits an overlay and reports the base destination separately",
      mounted.replay.playback.riderUpperBody.destination.clip === "bow_release" &&
        mounted.sampled.clip === mounted.replay.playback.base.destination.clip,
    );
    await page.locator("#model-replay-panel").evaluate((element) => {
      element.open = true;
      element.scrollIntoView({ block: "center" });
    });
    await page.locator("#model-submitted-status").scrollIntoViewIfNeeded();
    const visiblePanel = await page.evaluate(() => {
      const elements = [
        ...document.querySelectorAll(
          "#model-replay-panel summary, #model-replay-panel p, #model-replay-panel label, #model-replay-panel button, #model-review-matrix",
        ),
        document.querySelector("#model-submitted-status"),
      ];
      return elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: element.textContent,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        };
      });
    });
    ctx.check(
      "replay controls and submitted status fit inside the captured viewport",
      visiblePanel.every(
        ({ top, bottom, left, right }) => top >= 40 && bottom <= 800 && left >= 0 && right <= 1280,
      ),
      JSON.stringify(visiblePanel),
    );
    ctx.check(
      "footer reports submitted replay pose",
      (await page.locator("#model-submitted-status").textContent()).includes(
        `run ${mounted.sampled.phase.toFixed(3)}`,
      ),
    );
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
    await ctx.snap(page, "shared/soldiers/action-replay/controller", {
      threshold: 0,
      maxDiffRatio: 0,
    });

    await page.route("**/assets/soldiers/catalog.json", (route) =>
      route.fulfill({ json: { appearances: null } }),
    );
    const failed = await page.evaluate(() => window.__battleModels.reload());
    ctx.check(
      "failed reload retains replay history",
      !failed.ok &&
        (await page.evaluate(
          (expected) => JSON.stringify(window.__battleModels.stats().replay.playback) === expected,
          JSON.stringify(mounted.replay.playback),
        )),
    );
    await page.unroute("**/assets/soldiers/catalog.json");
    const loaded = await page.evaluate(() => window.__battleModels.reload());
    ctx.check(
      "successful reload resets replay against new bundles",
      loaded.ok && (await page.evaluate(() => window.__battleModels.stats().replay.tick === 0)),
    );
    await page.route("**/appearances/horse-archers/appearance.json*", async (route) => {
      const response = await route.fetch();
      const manifest = await response.json();
      manifest.presentation = null;
      await route.fulfill({ json: manifest });
    });
    const manual = await page.evaluate(() => window.__battleModels.reload());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    ctx.check(
      "valid manual-only reload exits replay successfully",
      manual.ok && (await page.evaluate(() => window.__battleModels.stats().replay === null)),
    );
    ctx.check(
      "manual-only appearance disables replay but keeps clip inspection",
      (await page.locator("#model-replay-play").isDisabled()) &&
        (await page.locator("#model-clip").isEnabled()),
    );
    await page.unroute("**/appearances/horse-archers/appearance.json*");
    const matrix = await page.request.get(`${ctx.target}/assets/soldiers/review-matrix.json`);
    ctx.check(
      "source-generated applicability matrix is available",
      matrix.ok() && Object.keys((await matrix.json()).appearances).length > 0,
    );
    await page.evaluate(() => window.__battleModels.reload());
    await verifyTemporalReplay(ctx, page);
    await verifyDisabledGait(ctx, page);
    await page.goto(
      `${ctx.target}/renderer/battle-models?ref=1&catalog=/assets/soldiers/candidates/blender-reference/catalog.json`,
    );
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    await page.evaluate(() => window.__battleModels.freeze());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    await verifyTemporalReplay(ctx, page, [41]);
  } finally {
    await page.close();
  }
}
