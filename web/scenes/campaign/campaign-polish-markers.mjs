import { PNG } from "pngjs";
import { campaign, campaignPresentationReady } from "../worlds.mjs";

// Campaign-polish workbench: city-label spacing and green-terrain swatch.
// The `test` fixture is a clean two-city green stage (Roma — road — Neapolis)
// with one poseable army. It isolates two contracts before the busy real map:
//   - assets/user-feedback/02-city-label-distance-tibur.png : the label should
//     sit close under its city icon (~one label/icon height), not float away.
//   - assets/user-feedback/03-mountains-roads-trees.png      : natural ground
//     must read green, not brown.
export const meta = {
  name: "campaign-polish-markers",
  kind: "visual",
  world: "campaign-test",
  tier: "quick",
  snapshots: ["polish-label-spacing", "polish-green-swatch"],
  describe:
    "Fixture workbench: city label sits tight under its icon; bare natural ground reads green.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "campaign polish markers workbench requires VERIFY_GPU=1",
      true,
      "set VERIFY_GPU=1 to exercise the WebGPU campaign adapter",
    );
    return;
  }

  const page = await campaign(ctx, "test", {
    viewport: { width: 1280, height: 800 },
    errorPrefix: "campaign-polish-markers",
  });

  // ---- Label spacing -----------------------------------------------------
  // Army out on the road so both Roma and Neapolis render as plain city
  // labels (icon + name), the case the feedback image is about.
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.factionView(false);
    window.__campaign.fogOfWar(false);
    window.__campaign.place(0, 1, 0, 1);
    window.__campaign.select(-1);
    window.__campaign.cam(0, 450, 18);
  });
  await campaignPresentationReady(page);
  const labelStats = await page.evaluate(() => window.__campaignGpuStats);
  const cardNames = await visibleMapCardNames(page);
  ctx.check(
    "label workbench shows Neapolis canvas label + Roma own-city card",
    labelStats.visibleLabelNames?.includes("city:NEAPOLIS") &&
      cardNames.some((n) => n.toUpperCase().includes("ROMA")),
    JSON.stringify({ canvas: labelStats.visibleLabelNames, cards: cardNames }),
  );
  await ctx.snap(page, "polish-label-spacing");

  // ---- Green swatch ------------------------------------------------------
  // Drop onto bare ground south of the road, away from cities/army/props, and
  // measure the green share of the terrain over the central crop.
  await page.evaluate(() => {
    window.__campaign.place(0, 0, 0, 0); // garrison the army back at Roma, off-screen here
    window.__campaign.cam(0, 440, 30);
  });
  await campaignPresentationReady(page);
  const swatch = PNG.sync.read(await page.screenshot());
  const metrics = greenSwatchMetrics(swatch);
  ctx.check(
    "bare natural ground reads green, not brown",
    metrics.greenRatio >= 0.88 && metrics.brownRatio <= 0.05,
    JSON.stringify(metrics),
  );
  await ctx.snap(page, "polish-green-swatch", { shot: PNG.sync.write(swatch) });

  await page.close();
}

// Sample the central terrain crop (no UI bar, no city models at the edges) and
// classify each opaque pixel as green vs brown.
function greenSwatchMetrics(png) {
  // Central terrain band only: below the road at top, above the off-map void
  // at the terrain plane's edge, inside the city models at the left/right.
  const x0 = Math.round(png.width * 0.36);
  const x1 = Math.round(png.width * 0.64);
  const y0 = Math.round(png.height * 0.32);
  const y1 = Math.round(png.height * 0.52);
  let total = 0;
  let green = 0;
  let brown = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      if (a < 16) continue;
      if (Math.max(r, g, b) < 70) continue; // off-map void below the terrain plane
      total++;
      if (g > r * 1.03 && g > b * 1.16 && g > 90 && r > 75) green++;
      // brown/tan = red leads green, both well above blue (the feedback defect)
      if (r > g + 8 && g > b + 10 && r > 120) brown++;
    }
  }
  return {
    total,
    greenRatio: Number((green / Math.max(1, total)).toFixed(4)),
    brownRatio: Number((brown / Math.max(1, total)).toFixed(4)),
  };
}

async function visibleMapCardNames(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".cmp-map-card"))
      .filter((node) => node.style.display !== "none")
      .map((node) => node.querySelector(".cmp-map-card__name")?.textContent ?? ""),
  );
}
