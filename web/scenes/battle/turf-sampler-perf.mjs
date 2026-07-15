export const meta = {
  name: "turf-sampler-perf",
  kind: "flow",
  world: "battle-ground-turf-workbench",
  tier: "full",
  snapshots: [],
  describe: "Hardware comparison of one-tap and rotated two-tap turf ground fill.",
};

const WARMUP_FRAMES = 80;
const SAMPLE_FRAMES = 120;
const DELTA_BUDGET_MS = 0.3;

export async function run(ctx) {
  if (process.env.VERIFY_GPU_ADAPTER !== "hardware") {
    ctx.check(
      "turf sampler perf is a hardware-only oracle",
      true,
      "set VERIFY_GPU_ADAPTER=hardware to measure",
    );
    return;
  }
  const naive = await sample(ctx, "naive");
  const anti = await sample(ctx, "anti");
  const delta = anti.medianGpuMs - naive.medianGpuMs;
  ctx.check(
    `two-tap turf fill adds at most ${DELTA_BUDGET_MS} ms median GPU`,
    Number.isFinite(delta) && delta <= DELTA_BUDGET_MS,
    JSON.stringify({ naive, anti, deltaMs: round(delta) }),
  );
  console.log(
    `battle-ground-turf sampler perf:\n${JSON.stringify({ naive, anti, deltaMs: round(delta) }, null, 2)}`,
  );
}

async function sample(ctx, mode) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: `battle-ground-turf-perf-${mode}`,
  });
  await page.goto(`${ctx.target}/renderer/battle-ground-turf?view=bench&sample=${mode}`);
  await page.waitForFunction(
    (expected) =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.sample === expected &&
      window.__rendererLabStats?.stats?.gpuMs !== null,
    mode,
    { timeout: 30000 },
  );
  const values = await page.evaluate(
    async ({ warmup, samples }) => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      for (let i = 0; i < warmup; i++) await frame();
      const result = [];
      for (let i = 0; i < samples; i++) {
        await frame();
        const value = window.__rendererLabStats?.stats?.gpuMs;
        if (typeof value === "number" && value > 0) result.push(value);
      }
      return result;
    },
    { warmup: WARMUP_FRAMES, samples: SAMPLE_FRAMES },
  );
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  await page.close();
  return {
    sample: mode,
    medianGpuMs: round(median(values)),
    samples: values.length,
    device: stats?.device,
  };
}

function median(values) {
  if (values.length === 0) return Number.NaN;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) * 0.5 : ordered[middle];
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}
