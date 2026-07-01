import { PNG } from "pngjs";

// Slice 1 of the water spec — the technique bake-off gate. Proves both candidate
// water fields (analytic Gerstner, compute IFFT) render through the one
// WaterFieldSource seam, measures their GPU cost at the battle and campaign
// cameras, asserts the IFFT route degrades to Gerstner when compute-ocean
// support is forced off, and blesses one deterministic compare montage at a
// fixed clock. The reference-image fidelity comparison and the unprimed critique
// are run by hand (compare-screenshots / screenshot-critique) and recorded in
// slices/01-bakeoff-decision.md; this scene pins the machine-checkable contracts.
//
// GPU only: needs VERIFY_GPU=1 with a real adapter. On this Mac the blessed
// path is installed Chrome in headless mode with hardware/Metal:
// VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome.

export const meta = {
  name: "water-bakeoff",
  kind: "flow",
  world: "none",
  tier: "full",
  snapshots: ["water/bakeoff-compare-dusk"],
  describe:
    "Water Slice 1: Gerstner vs IFFT through the WaterFieldSource seam — perf at both cameras, capability fallback, one compare montage.",
};

const READY_PREDICATE = (r) =>
  window.__rendererLabReady === true && window.__rendererLabStats?.stats?.route === r;
const waitReady = (page) =>
  page.waitForFunction(READY_PREDICATE, "water-bakeoff", { timeout: 25000 });

async function readStats(page) {
  return page.evaluate(() => window.__rendererLabStats);
}

// Median GPU frame time over several frames — the timer reads back a frame or
// two late, so we poll and take the median to shed warmup and outliers.
async function sampleGpuMs(page) {
  const samples = [];
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(60);
    const v = await page.evaluate(() => window.__rendererLabStats?.stats?.gpuTimeMs);
    if (typeof v === "number" && v >= 0) samples.push(v);
  }
  if (samples.length === 0) return null;
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

async function measure(ctx, tech, cam) {
  const page = await ctx.newPage({
    viewport: { width: 960, height: 600 },
    errorPrefix: `${tech}-${cam}`,
  });
  try {
    await page.goto(`${ctx.target}/renderer/water-bakeoff?tech=${tech}&cam=${cam}`);
    await waitReady(page);
    const stats = (await readStats(page)).stats;
    const gpuMs = await sampleGpuMs(page);
    return {
      tech: stats.tech,
      cam,
      gpuMs,
      timestampQuery: stats.timestampQuery,
      fieldResolution: stats.fieldResolution,
      fields: stats.fields,
    };
  } finally {
    await page.close();
  }
}

export async function run(ctx) {
  // --- Perf gate: both techniques at both cameras. ---
  const perf = {};
  for (const cam of ["battle", "campaign"]) {
    for (const tech of ["gerstner", "ifft"]) {
      perf[`${tech}@${cam}`] = await measure(ctx, tech, cam);
    }
  }
  const anyTimestamp = Object.values(perf).some((p) => p.timestampQuery);

  // Both techniques must render and report field stats through the seam.
  ctx.check(
    "bakeoff: both techniques live through the WaterFieldSource seam",
    perf["gerstner@battle"].tech === "gerstner" &&
      perf["ifft@battle"].tech === "ifft" &&
      perf["ifft@battle"].fieldResolution >= 64,
    JSON.stringify({
      gerstner: perf["gerstner@battle"].tech,
      ifft: perf["ifft@battle"].tech,
      res: perf["ifft@battle"].fieldResolution,
    }),
  );

  // The IFFT spectrum is real GPU storage; Gerstner holds none (the perf floor).
  const ifftField = perf["ifft@battle"].fields?.find((f) => f.id === "ifft");
  const gerstnerField = perf["gerstner@battle"].fields?.find((f) => f.id === "gerstner");
  ctx.check(
    "bakeoff: IFFT holds compute storage, Gerstner is analytic (zero storage)",
    ifftField?.storageBytes > 0 && gerstnerField?.storageBytes === 0,
    JSON.stringify({
      ifftStorage: ifftField?.storageBytes,
      gerstnerStorage: gerstnerField?.storageBytes,
    }),
  );

  if (anyTimestamp) {
    // Hard budget on the real target GPU: the IFFT frame (compute + plane) must
    // stay well under a 60fps frame at both cameras. Recorded in the artifact.
    const BUDGET_MS = 8;
    const ifftWorst = Math.max(perf["ifft@battle"].gpuMs ?? 0, perf["ifft@campaign"].gpuMs ?? 0);
    ctx.check(
      `bakeoff: IFFT GPU time within the ${BUDGET_MS}ms budget at both cameras`,
      ifftWorst > 0 && ifftWorst < BUDGET_MS,
      JSON.stringify({
        ifftBattle: perf["ifft@battle"].gpuMs,
        ifftCampaign: perf["ifft@campaign"].gpuMs,
        gerstnerBattle: perf["gerstner@battle"].gpuMs,
        gerstnerCampaign: perf["gerstner@campaign"].gpuMs,
      }),
    );
  } else {
    ctx.check(
      "bakeoff: GPU timestamp unavailable on this adapter (perf recorded as n/a)",
      true,
      "no timestamp-query",
    );
  }

  // --- Capability gate: forced no-compute-ocean degrades IFFT → Gerstner. ---
  {
    const page = await ctx.newPage({
      viewport: { width: 640, height: 400 },
      errorPrefix: "fallback",
    });
    try {
      await page.goto(`${ctx.target}/renderer/water-bakeoff?tech=ifft&computeUnsupported=1&t=2`);
      await waitReady(page);
      const stats = (await readStats(page)).stats;
      ctx.check(
        "bakeoff: forced no-compute-ocean falls the IFFT request back to Gerstner",
        stats.fallbackTriggered === true &&
          stats.tech === "gerstner" &&
          stats.computeSupported === false,
        JSON.stringify({
          tech: stats.tech,
          fallbackTriggered: stats.fallbackTriggered,
          computeSupported: stats.computeSupported,
        }),
      );
    } finally {
      await page.close();
    }
  }

  // --- Deterministic compare montage at a frozen clock. ---
  {
    const page = await ctx.newPage({
      viewport: { width: 1000, height: 600 },
      errorPrefix: "compare",
    });
    try {
      await page.goto(`${ctx.target}/renderer/water-bakeoff?compare=1&t=2.0&preset=dusk`);
      await waitReady(page);
      await page.waitForTimeout(400);
      const shot = await page.locator("#renderer-canvas").screenshot();
      const png = PNG.sync.read(shot);
      let nonBlank = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i] + png.data[i + 1] + png.data[i + 2] > 40) nonBlank++;
      }
      ctx.check(
        "bakeoff: frozen compare frame renders a non-blank sea on both halves",
        nonBlank > png.width * png.height * 0.85,
        JSON.stringify({ nonBlank, total: png.width * png.height }),
      );
      await ctx.snap(page, "water/bakeoff-compare-dusk", { shot });
    } finally {
      await page.close();
    }
  }
}
