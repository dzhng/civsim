export const meta = {
  name: "battle-model-reload-disposal",
  kind: "flow",
  world: "disposed-battle-model-world",
  tier: "full",
  snapshots: [],
  describe:
    "Disposal during catalog loading prevents publication and rejects later reloads without fetching; native scene tests pin pending GPU admission cleanup.",
};

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(`${ctx.target}/renderer/battle-models?ref=1`);
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    await page.evaluate(() => window.__battleModels.freeze());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    const result = await page.evaluate(async () => {
      const world = window.__battleModels.world;
      const previous = world.soldierAssets;
      const originalFetch = window.fetch;
      let release,
        entered,
        fetches = 0;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const reached = new Promise((resolve) => {
        entered = resolve;
      });
      window.fetch = async (...args) => {
        fetches++;
        const result = await originalFetch(...args);
        if (String(args[0]).includes("/catalog.json")) {
          entered();
          await gate;
        }
        return result;
      };
      try {
        const pending = world.reloadSoldierAssets().then(
          () => null,
          (error) => String(error),
        );
        await Promise.race([
          reached,
          pending.then(() => {
            throw Error("Reload did not wait for catalog");
          }),
        ]);
        world.dispose();
        release();
        const error = await pending;
        const before = fetches;
        let closedError = null;
        try {
          await world.reloadSoldierAssets();
        } catch (error) {
          closedError = String(error);
        }
        return {
          error,
          closedError,
          retainedGeneration: world.soldierAssets === previous,
          closedFetches: fetches - before,
        };
      } finally {
        release();
        window.fetch = originalFetch;
      }
    });
    ctx.check(
      "disposed reload rejects without installing a generation",
      /disposed/i.test(result.error ?? "") && result.retainedGeneration,
      result,
    );
    ctx.check(
      "closed preview rejects before network work",
      /disposed/i.test(result.closedError ?? "") && result.closedFetches === 0,
      result,
    );
  } finally {
    await page.close();
  }
}
