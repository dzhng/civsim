import { battleRendererReady, campaign, campaignPresentationReady, ready } from "../worlds.mjs";

const CYCLES = 10;
const RESOURCE_FIELDS = ["buffers", "textures", "bufferBytes", "textureBytes", "totalBytes"];

function measuredResources(value) {
  return (
    value?.scope === "requested-webgpu-resources" &&
    RESOURCE_FIELDS.every((key) => Number.isFinite(value[key]) && value[key] >= 0) &&
    value.totalBytes === value.bufferBytes + value.textureBytes
  );
}

export const meta = {
  name: "renderer-lifecycle",
  kind: "flow",
  world: "campaign-handoff",
  tier: "full",
  snapshots: [],
  describe: "Measures battle renderer resources across explicit dispose and recreate cycles.",
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
      await ready(page, "__ready", 22000);
      await battleRendererReady(page, 22000);
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
      await page.evaluate(() => window.__game.freezeAtTick(window.__game.tickCount()));

      // Keep this world's bound reader after the campaign replaces __game.
      const memoryReader = await page.evaluateHandle(() => window.__game.rendererMemoryInfo);
      const { renderer, timing } = await page.evaluate(
        (read) => ({
          renderer: read(),
          timing: window.__game.stats().renderStats.gpuTiming,
        }),
        memoryReader,
      );
      // Timestamp readbacks grow with GPU scheduling demand. Subtract only the
      // telemetry owner's measured retained buffers for the live-world plateau;
      // disposal below must still release those buffers together with the world.
      const telemetryMeasured =
        Number.isFinite(timing?.requestedBuffers) &&
        timing.requestedBuffers >= 0 &&
        Number.isFinite(timing?.requestedBufferBytes) &&
        timing.requestedBufferBytes >= 0;
      const worldResources =
        telemetryMeasured && measuredResources(renderer)
          ? {
              ...renderer,
              buffers: renderer.buffers - timing.requestedBuffers,
              bufferBytes: renderer.bufferBytes - timing.requestedBufferBytes,
              totalBytes: renderer.totalBytes - timing.requestedBufferBytes,
            }
          : null;
      await page.evaluate(async () => {
        const disposeRenderer = window.__game.disposeRenderer;
        document.querySelector("#btn-menu")?.click();
        document.querySelector("#pause-exit")?.click();
        await new Promise((resolve) => setTimeout(resolve, 500));
        disposeRenderer();
      });
      await ready(page, "__campaignReady", 22000);
      await page.waitForFunction(() => window.__ready === false, undefined, { timeout: 22000 });
      let released;
      try {
        await page.waitForFunction(
          ({ read, fields }) => {
            const memory = read();
            return (
              memory?.scope === "requested-webgpu-resources" &&
              fields.every((key) => memory[key] === 0)
            );
          },
          { read: memoryReader, fields: RESOURCE_FIELDS },
          { timeout: 22000 },
        );
      } finally {
        released = await memoryReader.evaluate((read) => read());
        await memoryReader.dispose();
      }
      ctx.check(
        `cycle ${cycle} retires every requested battle buffer and texture`,
        measuredResources(released) && RESOURCE_FIELDS.every((key) => released[key] === 0),
        JSON.stringify(released),
      );
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
      const retired = await page.evaluate(() => window.__rendererRetirement.sample());
      ctx.check(
        `cycle ${cycle} collects retired campaign worlds and older renderers`,
        retired.length === cycle &&
          retired.every(
            (item, index) =>
              !item.worldAlive && (!item.rendererAlive || index === retired.length - 1),
          ),
        JSON.stringify(retired),
      );
      const sample = {
        retired,
        cycle,
        renderer,
        timing,
        worldResources,
        userAgentBytes: userAgentMemory?.bytes ?? null,
        userAgentBreakdown: userAgentMemory?.breakdown ?? null,
      };
      series.push(sample);
      ctx.check(
        `cycle ${cycle} samples renderer resources`,
        measuredResources(worldResources) &&
          measuredResources(renderer) &&
          renderer.buffers > 0 &&
          renderer.textures > 0 &&
          renderer.totalBytes > 0,
        JSON.stringify(sample),
      );
    }

    const constant = (key) =>
      series.every((sample) => sample.worldResources?.[key] === series[0]?.worldResources?.[key]);
    ctx.check(
      "live battle resources excluding measured telemetry stay flat across dispose cycles",
      series.every((sample) => measuredResources(sample.worldResources)) &&
        RESOURCE_FIELDS.every(constant),
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
