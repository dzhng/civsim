import { battleRendererReady, campaign, ready } from "../worlds.mjs";

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
    timeout: 18000,
  });
  const series = [];

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
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
    const sample = {
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
  await page.close();
}
