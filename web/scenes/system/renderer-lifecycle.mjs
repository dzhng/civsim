import { battleRendererReady, campaign, ready } from "../worlds.mjs";

const CYCLES = 10;

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
    await page.waitForTimeout(300);

    const renderer = await page.evaluate(() => window.__game.rendererMemoryInfo());
    await page.evaluate(async () => {
      const disposeRenderer = window.__game.disposeRenderer;
      document.querySelector("#btn-menu")?.click();
      document.querySelector("#pause-exit")?.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      disposeRenderer();
    });
    await ready(page, "__campaignReady", 22000);
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
    const sample = {
      cycle,
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
  await page.close();
}
