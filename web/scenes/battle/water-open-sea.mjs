import { PNG } from "pngjs";

// Water Slice 9 — the battle OPEN-SEA horizon plane on the shared material. The
// sealed `role:'ocean'` map edge is now the same animated `civsimWaterColor` sea the
// on-field water (Slice 8) uses, so the field↔sea shoreline seam cannot exist: the
// field water is agitation 0 at the shore and the sea ramps up from 0 there, meeting
// as one material. This pins a coastal battle at the sea-facing 3/4 camera: a
// continuous Aegean sea filling the frame past a warm sand beach, whitecaps and glint
// building offshore — the closest production surface to the reference.
//
// GPU only (VERIFY_GPU=1); on macOS that means headful + hardware.

const GATE = "coastal-scrub";
// The 3/4 gameplay camera aimed at the west sea flank (the default field view frames
// a mid-field rock, no water). Fixed t for a deterministic animated-sea frame.
const VIEW = `gate=${GATE}&view=field&cx=-1150&cy=-150&t=3.0`;

export const meta = {
  name: "water-open-sea",
  kind: "visual",
  world: "battle-terrain-3d",
  tier: "full",
  snapshots: ["water-open-sea/coastal-sea"],
  describe:
    "Water Slice 9: the sealed ocean edge as the shared animated sea, meeting a beach with no shoreline seam, at the sea-facing gameplay camera.",
};

// Sea stats over the whole frame. Water = bluish (b over r). The sea's surface
// texture (ripple/foam/glint) shows up as luma variance within the water — a dead
// flat fill (the old gradQuad) would have almost none.
function seaStats(png) {
  let water = 0,
    total = 0,
    n = 0,
    sum = 0,
    sum2 = 0,
    sumB = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const o = (y * png.width + x) * 4;
      const r = png.data[o];
      const g = png.data[o + 1];
      const b = png.data[o + 2];
      total++;
      if (b > r + 15 && b > 55) {
        water++;
        const l = (r + g + b) / 3;
        n++;
        sum += l;
        sum2 += l * l;
        sumB += b;
      }
    }
  }
  const mean = n > 0 ? sum / n : 0;
  const stdev = n > 0 ? Math.sqrt(Math.max(0, sum2 / n - mean * mean)) : 0;
  return {
    waterFrac: Number((water / total).toFixed(3)),
    seaMeanB: Number((n > 0 ? sumB / n : 0).toFixed(1)),
    seaLumaStdev: Number(stdev.toFixed(2)),
  };
}

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("water-open-sea requires browser GPU flags", true, "set VERIFY_GPU=1 to capture");
    return;
  }
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: GATE });
  try {
    await page.goto(`${ctx.target}/renderer/battle-terrain-3d?${VIEW}`);
    await page.waitForFunction(
      (g) => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.gate === g,
      GATE,
      { timeout: 20000 },
    );
    await page.waitForTimeout(180);
    const shot = await page.locator("#renderer-canvas").screenshot();
    const s = seaStats(PNG.sync.read(shot));

    // The open sea fills a real band of the frame — the ocean edge renders as the
    // sea surface, not a thin sliver.
    ctx.check(
      "open-sea: the sea fills a real band of the frame",
      s.waterFrac > 0.2,
      JSON.stringify(s),
    );
    // It reads as Aegean water (blue-dominant), not a grey or washed fill.
    ctx.check(
      "open-sea: the sea reads as Aegean blue (not crushed to near-black)",
      s.seaMeanB > 80,
      JSON.stringify(s),
    );
    // It is a real rippled/whitecapped surface, not the dead flat gradQuad it replaced.
    ctx.check(
      "open-sea: the sea has surface texture (ripple/foam), not a flat fill",
      s.seaLumaStdev > 5,
      JSON.stringify(s),
    );

    await ctx.snap(page, "water-open-sea/coastal-sea", { shot });
  } finally {
    await page.close();
  }
}
