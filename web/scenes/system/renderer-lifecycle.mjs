import { battleRendererReady, campaign, campaignPresentationReady, ready } from "../worlds.mjs";

const CYCLES = 10;

export const meta = {
  name: "renderer-lifecycle",
  kind: "flow",
  world: "campaign-handoff",
  tier: "full",
  snapshots: [],
  describe: "Measures campaign terrain/worker disposal and battle resources across scene cycles.",
};

export async function run(ctx) {
  const page = await campaign(ctx, "handoff", {
    viewport: { width: 1280, height: 800 },
    errorPrefix: "renderer-lifecycle",
  });
  const series = [];
  const terrainWorkers = new Map();
  const observeWorker = (worker) => {
    if (!worker.url().includes("terrainWorkerEntry")) return;
    const record = { closed: false };
    terrainWorkers.set(worker, record);
    worker.once("close", () => {
      record.closed = true;
      terrainWorkers.delete(worker);
    });
  };
  page.on("worker", observeWorker);
  for (const worker of page.workers()) observeWorker(worker);
  await page.evaluate(() => {
    window.__campaignTerrainDisposals = [];
    window.__campaign.cam(0, 450, 6);
    const retired = [];
    const prototype = Object.getPrototypeOf(window.__campaign.rendererOwner().world.world);
    const dispose = prototype.dispose;
    prototype.dispose = function (...args) {
      if (!this.disposed) retired.push([new WeakRef(this), new WeakRef(this.renderer)]);
      return dispose.apply(this, args);
    };
    window.__rendererRetirement = {
      sample: () =>
        retired.map(([world, renderer]) => ({
          worldAlive: Boolean(world.deref()),
          rendererAlive: Boolean(renderer.deref()),
        })),
      restore: () => {
        prototype.dispose = dispose;
      },
    };
  });

  try {
    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      await campaignPresentationReady(page);
      await page.evaluate(() => {
        // Observe the active instance, without a dev-server module import or
        // retaining retired worlds across campaign/battle transitions.
        const renderer = window.__campaign.rendererOwner();
        const destroy = renderer.destroy;
        renderer.destroy = function (...args) {
          const world = this.world;
          if (!world) return destroy.apply(this, args);
          const terrain = world.terrain;
          const geometries = new Set([
            terrain.coarseGround.geometry,
            ...Array.from(terrain.entries.values(), (entry) => entry.ground.geometry),
          ]);
          const before = terrain.stats();
          const disposals = new Map([...geometries].map((geometry) => [geometry, 0]));
          const observe = (event) => {
            disposals.set(event.target, disposals.get(event.target) + 1);
          };
          for (const geometry of geometries) geometry.addEventListener("dispose", observe);
          try {
            return destroy.apply(this, args);
          } finally {
            this.destroy = destroy;
            for (const geometry of geometries) geometry.removeEventListener("dispose", observe);
            window.__campaignTerrainDisposals.push({
              geometries: geometries.size,
              disposed: [...disposals.values()].reduce((sum, count) => sum + count, 0),
              exactlyOnce: [...disposals.values()].every((count) => count === 1),
              coarseDetached: terrain.coarseGround.parent === null,
              geometryBytes: before.geometryBytes,
              residentBefore: before.residentTiles,
              residentAfter: terrain.stats().residentTiles,
            });
          }
        };
      });
      const liveWorkers = [...terrainWorkers.values()].filter((record) => !record.closed);
      ctx.check(`cycle ${cycle} owns one terrain worker`, liveWorkers.length === 1);
      const pending = await page.evaluate(() => {
        window.__campaign.place(0, 1, 0, 3);
        window.__campaign.place(1, 1, 0, 4);
        window.__campaign.tick(2000);
        return window.__campaign.battleReady();
      });
      ctx.check(`cycle ${cycle} creates an encounter`, pending >= 0, String(pending));
      const launched = await page.evaluate(() => window.__campaign.fightReady());
      ctx.check(`cycle ${cycle} launches battle`, launched === true, String(launched));
      await battleRendererReady(page);
      const terrain = await page.evaluate(() => ({
        ...window.__campaignTerrainDisposals.at(-1),
        cycles: window.__campaignTerrainDisposals.length,
      }));
      ctx.check(
        `cycle ${cycle} releases campaign terrain and worker`,
        liveWorkers.length === 1 &&
          liveWorkers.every((record) => record.closed) &&
          terrain.cycles === cycle &&
          terrain.geometries > 1 &&
          terrain.disposed === terrain.geometries &&
          terrain.exactlyOnce &&
          terrain.coarseDetached &&
          terrain.geometryBytes > 0 &&
          terrain.residentBefore > 0 &&
          terrain.residentAfter === 0,
        JSON.stringify({ terrain, workersClosed: liveWorkers.every((record) => record.closed) }),
      );
      await page.waitForTimeout(300);

      const renderer = await page.evaluate(() => window.__game.rendererMemoryInfo());
      await page.evaluate(async () => {
        const disposeRenderer = window.__game.disposeRenderer;
        document.querySelector("#btn-menu")?.click();
        document.querySelector("#pause-exit")?.click();
        await new Promise((resolve) => setTimeout(resolve, 500));
        disposeRenderer();
      });
      await ready(page, "__campaignReady");
      await page.waitForFunction(() => window.__ready === false, undefined, { timeout: 22000 });
      await page.waitForTimeout(1000);
      await page.requestGC();
      const userAgentMemory = await page.evaluate(async () => {
        const measure = performance.measureUserAgentSpecificMemory;
        if (typeof measure !== "function") return null;
        try {
          const result = await measure.call(performance);
          return {
            bytes: result.bytes,
            breakdown: result.breakdown.map((entry) => ({
              bytes: entry.bytes,
              types: entry.types,
              urls: entry.attribution.map((scope) => scope.url),
            })),
          };
        } catch {
          return null;
        }
      });
      // Dereference only after GC and memory measurement, in a separate task.
      const retired = await page.evaluate(() => window.__rendererRetirement.sample());
      // Three's shared bloom quad can retain the latest battle renderer until the
      // next battle replaces its material. Earlier generations must collect.
      ctx.check(
        `cycle ${cycle} collects retired worlds and older renderers`,
        retired.length === cycle * 2 &&
          retired.every(
            (item, index) =>
              !item.worldAlive && (!item.rendererAlive || index === retired.length - 1),
          ),
        JSON.stringify(retired),
      );
      const sample = {
        cycle,
        retired,
        reactRefresh: await page.evaluate(
          () => typeof window.__registerBeforePerformReactRefresh === "function",
        ),
        ...renderer,
        userAgentBytes: userAgentMemory?.bytes ?? null,
        userAgentBreakdown: userAgentMemory?.breakdown ?? null,
      };
      series.push(sample);
      ctx.check(
        `cycle ${cycle} samples renderer resources`,
        renderer !== null,
        JSON.stringify(sample),
      );
    }

    const constant = (key) => series.every((sample) => sample[key] === series[0]?.[key]);
    ctx.check(
      "renderer counters stay flat across dispose cycles",
      constant("geometries") && constant("textures") && constant("programs"),
      JSON.stringify(series),
    );
    ctx.check(
      "user-agent memory series is available",
      series.every((sample) => sample.userAgentBytes !== null),
      JSON.stringify(series),
    );
  } finally {
    await page
      .evaluate(() => {
        window.__rendererRetirement?.restore();
        delete window.__rendererRetirement;
      })
      .catch(() => {});
    page.off("worker", observeWorker);
    terrainWorkers.clear();
    await page.close();
  }
}
