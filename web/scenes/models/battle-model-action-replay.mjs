import { requireSwiftShaderBaseline } from "./_swiftshader-baseline.ts";

export const meta = {
  name: "battle-model-action-replay",
  kind: "visual",
  world: "battle-models-action-replay",
  tier: "full",
  snapshots: ["shared/soldiers/action-replay/controller"],
  describe:
    "Synthetic observation replay through the real timeline, catalog and production instance submission; action selection, not GPU blend acceptance.",
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
      "mounted controller retains overlay while production reports the submitted base",
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
  } finally {
    await page.close();
  }
}
