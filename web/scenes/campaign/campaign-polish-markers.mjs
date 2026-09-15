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
  checkGroundColorControls(ctx);
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

// The user's reference contains both yellow and olive grass (hue 48–71°).
// Allow a small lighting spread around that range, while excluding blue water,
// neutral stone and red-brown soil. Saturation is a color-presence floor, not a
// claim that these fixtures meet the reference's material richness.
function groundColor(r, g, b) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const hue =
    delta === 0
      ? 0
      : ((max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta) *
          60 +
          360) %
        360;
  const colored = max >= 70 && delta / Math.max(1, max) >= 0.2;
  return { olive: colored && hue >= 40 && hue <= 85, redBrown: colored && hue < 40 && r > 120 };
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
      const color = groundColor(...png.data.subarray(i, i + 3));
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

function checkGroundColorControls(ctx) {
  // Actual reference pixels: yellow field (95,185), olive field (285,197).
  // Keep these tiny color controls independent of the active spec's location;
  // full reference-patch coverage and crops remain in its acceptance evidence.
  for (const [name, rgb] of [
    ["yellow field", [186, 164, 63]],
    ["olive field", [123, 133, 46]],
  ]) {
    ctx.check(
      `natural-ground classifier accepts reference ${name}`,
      groundColor(...rgb).olive,
      JSON.stringify(rgb),
    );
  }
  for (const [name, rgb] of [
    ["blue water", [52, 84, 110]],
    ["neutral gray rock", [140, 140, 140]],
    ["red-brown soil", [154, 100, 60]],
  ]) {
    ctx.check(
      `natural-ground classifier rejects ${name}`,
      !groundColor(...rgb).olive,
      JSON.stringify(rgb),
    );
  }
}

async function visibleMapCardNames(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".cmp-map-card"))
      .filter((node) => node.style.display !== "none")
      .map((node) => node.querySelector(".cmp-map-card__name")?.textContent ?? ""),
  );
}
