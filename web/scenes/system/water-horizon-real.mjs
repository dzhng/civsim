import { PNG } from "pngjs";

// Water Slice 02 (keystone) — the real-camera horizon gate. The finite water quad
// is projected through the real 3D perspective camera (projectWorld / camera3d
// viewProj) onto a reverse-Z depth32float buffer. The one visual variable: the
// horizon is STRAIGHT and flat — the fake-projection "dome + radial streak" wedge
// is gone. Crop = the top-third horizon band. Frozen clock for determinism.
//
// GPU only (VERIFY_GPU=1); SwiftShader is the CI proxy — this scene also proves
// depth32float + reverse-Z render non-blank there.

const WINNER = "gerstner";

export const meta = {
  name: "water-horizon-real",
  kind: "flow",
  world: "none",
  tier: "full",
  snapshots: ["water/horizon-real"],
  describe:
    "Water Slice 02: the finite sea meets a straight true horizon under the real perspective camera (no dome/streak).",
};

const waitReady = (page) =>
  page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "water-bakeoff",
    undefined,
    { timeout: 25000 },
  );

// The horizon row for one column: scan down from the top and return the first row
// whose colour departs from the sky by more than `thresh` (sum of abs channel
// deltas). Null when the column is all sky (no sea/horizon visible).
function horizonRow(png, x, sky, thresh, maxY) {
  for (let y = 0; y < maxY; y++) {
    const o = (y * png.width + x) * 4;
    const d =
      Math.abs(png.data[o] - sky[0]) +
      Math.abs(png.data[o + 1] - sky[1]) +
      Math.abs(png.data[o + 2] - sky[2]);
    if (d > thresh) return y;
  }
  return null;
}

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1000, height: 600 }, errorPrefix: WINNER });
  try {
    await page.goto(`${ctx.target}/renderer/water-bakeoff?tech=${WINNER}&t=3.0`);
    await waitReady(page);

    const stats = (await page.evaluate(() => window.__rendererLabStats)).stats;
    ctx.check(
      "horizon: the water route reports the reverse-Z depth32float world phase",
      stats.depth?.format === "depth32float" &&
        stats.phases?.some((p) => p.depth === "depth32float-reverse-z-clear"),
      JSON.stringify({ depth: stats.depth, phases: stats.phases?.map((p) => ({ kind: p.kind, depth: p.depth })) }),
    );

    const shot = await page.locator("#renderer-canvas").screenshot();
    const png = PNG.sync.read(shot);

    // Sky sample at top-centre; horizon lives in the upper band, so only scan the
    // top ~55% for the sea boundary.
    const so = (Math.floor(png.height * 0.02) * png.width + Math.floor(png.width / 2)) * 4;
    const sky = [png.data[so], png.data[so + 1], png.data[so + 2]];
    const maxY = Math.floor(png.height * 0.55);

    // Find the horizon row across the middle 80% of columns (skip the extreme
    // edges where MSAA/letterboxing can jitter). A straight horizon → all rows
    // cluster tightly; a dome/wedge → the centre bulges far from the edges.
    const rows = [];
    const x0 = Math.floor(png.width * 0.1);
    const x1 = Math.floor(png.width * 0.9);
    for (let x = x0; x < x1; x++) {
      const r = horizonRow(png, x, sky, 60, maxY);
      if (r !== null) rows.push(r);
    }
    ctx.check(
      "horizon: a sea/sky boundary is visible across the frame",
      rows.length > (x1 - x0) * 0.9,
      JSON.stringify({ found: rows.length, cols: x1 - x0 }),
    );

    // Anti-dome metric: the fake-projection artifact bulged the sea/sky boundary
    // in the CENTRE (dome) and streaked it at the EDGES (wedge), a systematic
    // curve. The real camera makes it a level line, so the centre-third median
    // and the edge median agree to within a few px. Medians reject the random
    // per-wave crest jitter at the horizon (which is real geometry, not a dome).
    const median = (xs) => {
      const s = [...xs].sort((a, b) => a - b);
      return s.length ? s[Math.floor(s.length / 2)] : null;
    };
    const region = (lo, hi) => {
      const out = [];
      for (let x = Math.floor(png.width * lo); x < Math.floor(png.width * hi); x++) {
        const r = horizonRow(png, x, sky, 60, maxY);
        if (r !== null) out.push(r);
      }
      return out;
    };
    const centre = median(region(0.4, 0.6));
    const edges = median([...region(0.1, 0.25), ...region(0.75, 0.9)]);
    const bulge = Math.abs(centre - edges);
    ctx.check(
      "horizon: the sea/sky boundary is level — no centre dome, no edge wedge",
      bulge < png.height * 0.03,
      JSON.stringify({ centreMedian: centre, edgeMedian: edges, bulge, tol: Math.round(png.height * 0.03) }),
    );

    await ctx.snap(page, "water/horizon-real", { shot });
  } finally {
    await page.close();
  }
}
