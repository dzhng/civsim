import { PNG } from "pngjs";

// Water Slice 10 — the campaign strategic sea. Deliberately NOT the deep-ocean look:
// the campaign is an antique painted chart, so the sea gets only a subtle, zoom/pitch-
// gated shimmer — a still chart from altitude, gently alive zoomed in close. The glint
// waves crawl on cam.time (gated so far/top-down presets don't move); land, roads,
// labels and the muted chart palette are untouched.
//
// GPU only (VERIFY_GPU=1); on macOS that means headful + hardware.

export const meta = {
  name: "water-sea",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: ["water/campaign-sea-near", "water/campaign-sea-far"],
  describe:
    "Water Slice 10: the campaign sea is a subtle animated painted-chart shimmer close in, a still chart from altitude.",
};

const waitReady = (page) =>
  page.waitForFunction(
    () =>
      window.__rendererLabReady === true && window.__rendererLabStats?.stats?.preset !== undefined,
    undefined,
    { timeout: 25000 },
  );

async function shoot(ctx, preset, t) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: `${preset}-t${t}`,
  });
  try {
    await page.goto(`${ctx.target}/renderer/campaign-map?preset=${preset}&t=${t}`);
    await waitReady(page);
    await page.waitForTimeout(120);
    return await page.locator("#renderer-canvas").screenshot();
  } finally {
    await page.close();
  }
}

// Count sea pixels (muted slate-blue: blue over red) and how bright they run — a
// battle ocean would be far more saturated/bright than the chart sea.
function seaStats(png) {
  let sea = 0,
    total = 0,
    sumB = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const b = png.data[i + 2];
    total++;
    if (b > r + 12 && b > 70 && b < 190) {
      sea++;
      sumB += b;
    }
  }
  return { seaFrac: sea / total, seaMeanB: sea > 0 ? sumB / sea : 0 };
}

// Pixels that moved between two frames, and how many of them are sea.
function motion(a, b) {
  let moved = 0,
    seaMoved = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d =
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 6) {
      moved++;
      if (b.data[i + 2] > b.data[i] + 12) seaMoved++;
    }
  }
  return { moved, seaMoved };
}

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("water-sea requires browser GPU flags", true, "set VERIFY_GPU=1 to capture");
    return;
  }
  // Near (zoomed-in coastal): the sea shimmers. Compare t=0 vs t=3 to prove motion.
  const near0 = await shoot(ctx, "nile", 0);
  const near3 = await shoot(ctx, "nile", 3);
  const nearMotion = motion(PNG.sync.read(near0), PNG.sync.read(near3));
  const nearSea = seaStats(PNG.sync.read(near3));
  // Far (whole map, top-down): the gate is closed — the chart is still.
  const far0 = await shoot(ctx, "whole", 0);
  const far3 = await shoot(ctx, "whole", 3);
  const farMotion = motion(PNG.sync.read(far0), PNG.sync.read(far3));

  ctx.check(
    "campaign-sea: the sea comes alive close in (a real band of it shimmers)",
    nearMotion.seaMoved > 2000 && nearMotion.seaMoved / Math.max(1, nearMotion.moved) > 0.9,
    JSON.stringify(nearMotion),
  );
  ctx.check(
    "campaign-sea: from altitude the chart is still (the gate is closed)",
    farMotion.moved < 400,
    JSON.stringify(farMotion),
  );
  ctx.check(
    "campaign-sea: the sea is a muted chart blue, not a bright battle ocean",
    nearSea.seaFrac > 0.15 && nearSea.seaMeanB < 165,
    JSON.stringify(nearSea),
  );

  await ctx.snap(null, "water/campaign-sea-near", { shot: near3 });
  await ctx.snap(null, "water/campaign-sea-far", { shot: far0 });
}
