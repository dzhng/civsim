import { PNG } from "pngjs";
import { campaign, campaignPresentationReady } from "../worlds.mjs";
import { checkNaturalGroundClassifier, naturalGroundColor } from "./natural-ground-lib.js";

// Campaign-polish workbench: city-label spacing and natural-ground swatch.
// The `test` fixture is a clean two-city lowland stage (Roma — road — Neapolis)
// with one poseable army. It isolates two contracts before the busy real map:
//   - assets/user-feedback/02-city-label-distance-tibur.png : the label should
//     sit close under its city icon (~one label/icon height), not float away.
//   - assets/user-feedback/03-mountains-roads-trees.png      : natural ground
//     must retain yellow-to-olive grass color.
export const meta = {
  name: "campaign-polish-markers",
  kind: "visual",
  world: "campaign-test",
  tier: "quick",
  snapshots: ["polish-label-spacing", "polish-green-swatch"],
  describe:
    "Fixture workbench: city label sits tight under its icon; bare natural ground reads yellow-to-olive.",
};

export async function run(ctx) {
  checkNaturalGroundClassifier(ctx);
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
  // measure a fixed world-space patch clear of the road and scenery.
  await page.evaluate(() => {
    window.__campaign.place(0, 0, 0, 0); // garrison the army back at Roma, off-screen here
    window.__campaign.cam(0, 440, 30);
  });
  await campaignPresentationReady(page);
  const swatch = PNG.sync.read(await page.screenshot());
  // South of the y=450 road, west of the tree near (5,434). Use the
  // presented surface/projection owner so relief cannot move the road into it.
  const patch = await page.evaluate(() =>
    [
      [-8, 437],
      [-2, 437],
      [-2, 442],
      [-8, 442],
    ].map(([x, y]) => window.__campaign.project(x, y).map((v) => v * devicePixelRatio)),
  );
  const framed = patch.every(([x, y]) => x >= 0 && y >= 0 && x < swatch.width && y < swatch.height);
  ctx.check("bare-ground world patch remains on screen", framed, JSON.stringify(patch));
  const metrics = groundSwatchMetrics(swatch, patch);
  ctx.check(
    "bare natural ground reads yellow-olive, not red-brown",
    framed && metrics.total >= 1000 && metrics.oliveRatio >= 0.88 && metrics.redBrownRatio <= 0.05,
    JSON.stringify(metrics),
  );
  await ctx.snap(page, "polish-green-swatch", { shot: PNG.sync.write(swatch) });

  await page.close();
}

function groundSwatchMetrics(png, patch) {
  const xs = patch.map(([x]) => x),
    ys = patch.map(([, y]) => y);
  let total = 0,
    olive = 0,
    redBrown = 0;
  for (
    let y = Math.max(0, Math.floor(Math.min(...ys)));
    y < Math.min(png.height, Math.ceil(Math.max(...ys)));
    y++
  ) {
    for (
      let x = Math.max(0, Math.floor(Math.min(...xs)));
      x < Math.min(png.width, Math.ceil(Math.max(...xs)));
      x++
    ) {
      const crosses = patch.map(([ax, ay], i) => {
        const [bx, by] = patch[(i + 1) % patch.length];
        return (bx - ax) * (y + 0.5 - ay) - (by - ay) * (x + 0.5 - ax);
      });
      if (!crosses.every((v) => v >= 0) && !crosses.every((v) => v <= 0)) continue;
      const i = (y * png.width + x) * 4;
      const color = naturalGroundColor(...png.data.subarray(i, i + 3));
      total++;
      if (png.data[i + 3] >= 16 && color.olive) olive++;
      if (png.data[i + 3] >= 16 && color.redBrown) redBrown++;
    }
  }
  return {
    total,
    oliveRatio: Number((olive / Math.max(1, total)).toFixed(4)),
    redBrownRatio: Number((redBrown / Math.max(1, total)).toFixed(4)),
  };
}

async function visibleMapCardNames(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".cmp-map-card"))
      .filter((node) => node.style.display !== "none")
      .map((node) => node.querySelector(".cmp-map-card__name")?.textContent ?? ""),
  );
}
