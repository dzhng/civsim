import { PNG } from "pngjs";

// Water Slice 8 — battle COASTAL FIELD water on the shared `waterShade` material.
// The on-field river/shore water (the flat `groundPass` tint until now) is brought
// onto the same Aegean albedo × golden preset + shore ramp the open sea uses, so
// both sides of every shoreline are one material (the seam-foundation slice). This
// pins the shore-grade target at the 3/4 gameplay camera: a river reads shallow
// turquoise at the bank grading to a calm mid-blue, with a thin swash line — NOT the
// deep-ocean whitecap look. Judged at `view=field` (the grazing `view=west/east`
// regression snaps live in battle-terrain-blockers).
//
// GPU only (VERIFY_GPU=1); on macOS that means headful + hardware.

const GATE = "shore-and-crags";
// Shore & Crags carries the curated generated water flank; aim the 3/4 field
// camera at the east water reach. Fixed t for a deterministic animated-water frame.
const VIEW = `gate=${GATE}&view=field&cx=1150&cy=-150&t=3.0`;

export const meta = {
  name: "water-coastal",
  kind: "visual",
  world: "battle-terrain-3d",
  tier: "full",
  snapshots: ["water-coastal/river-shore"],
  describe:
    "Water Slice 8: on-field river water on the shared waterShade material — turquoise shallows grading to calm mid-blue with a swash line, at the gameplay camera.",
};

// Classify the water band. Water = bluish (b clearly over r). Within it, shallow
// turquoise (green lifts toward blue) vs deep mid-blue (blue dominant, dimmer).
// whiteout = near-white low-saturation pixels: an open-sea surf white-out spikes
// this, a calm river leaves it ~0 (the swash is a dim lighter turquoise, not white).
function waterStats(png) {
  let water = 0,
    shallow = 0,
    deep = 0,
    whiteout = 0,
    total = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const o = (y * png.width + x) * 4;
      const r = png.data[o];
      const g = png.data[o + 1];
      const b = png.data[o + 2];
      total++;
      const isWater = b > r + 18 && b > 55;
      if (isWater) {
        water++;
        // Turquoise shallows: green sits high, close under blue.
        if (g > r + 18 && g > 95 && b - g < 55) shallow++;
        // Deep body: blue dominant and dimmer.
        else if (b > g + 12 && (r + g + b) / 3 < 95) deep++;
      }
      if ((r + g + b) / 3 > 170 && Math.max(r, g, b) - Math.min(r, g, b) < 45) whiteout++;
    }
  }
  return {
    waterFrac: Number((water / total).toFixed(4)),
    shallowFrac: Number((shallow / total).toFixed(4)),
    deepFrac: Number((deep / total).toFixed(4)),
    whiteoutFrac: Number((whiteout / total).toFixed(5)),
  };
}

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("water-coastal requires browser GPU flags", true, "set VERIFY_GPU=1 to capture");
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
    const s = waterStats(PNG.sync.read(shot));

    // The river fills a real band of the frame — the field water renders, it is not
    // a hairline or a leaked flat tint.
    ctx.check(
      "coastal: on-field water fills a real band of the frame",
      s.waterFrac > 0.1,
      JSON.stringify(s),
    );
    // Shore grade: BOTH shallow turquoise AND deeper mid-blue are present — the depth
    // ramp reads across the river, not one flat colour.
    ctx.check(
      "coastal: shore grades shallow turquoise → deeper blue (both present)",
      s.shallowFrac > 0.005 && s.deepFrac > 0.02,
      JSON.stringify(s),
    );
    // Calm water: the river is NOT an open-sea surf white-out. The swash is a dim
    // lighter turquoise (judged by eye / screenshot-critique), so near-white pixels
    // stay ~0; a whitecapped ocean look would spike this.
    ctx.check(
      "coastal: water reads calm — not an open-sea white-out",
      s.whiteoutFrac < 0.02,
      JSON.stringify(s),
    );

    await ctx.snap(page, "water-coastal/river-shore", { shot });
  } finally {
    await page.close();
  }
}
