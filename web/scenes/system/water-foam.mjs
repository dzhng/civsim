import { PNG } from "pngjs";

// Water Slice 3 — whitecap foam coverage. The winner (Gerstner) with foam on,
// neutral grey. Pins that whitecaps appear across the open sea (present but not a
// white-out), sit on the water rather than the sky, and holds a frozen-clock
// baseline. Colour and the sun-glint streak are later slices.
//
// GPU only (VERIFY_GPU=1); on macOS that means headful + hardware.

const WINNER = "gerstner";

export const meta = {
  name: "water-foam",
  kind: "flow",
  world: "none",
  tier: "full",
  snapshots: [`water/foam-${WINNER}`],
  describe: "Water Slice 3: whitecap foam across the open sea, neutral grey, frozen clock.",
};

const waitReady = (page) =>
  page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "water-bakeoff",
    undefined,
    { timeout: 25000 },
  );

// Foam is bright and NOT blue-dominant (whitecap spray, lit by the preset),
// whereas the water body is blue (b > r). Count foam only in the sea band (below
// the horizon), so the check is preset-colour-agnostic.
function foamStats(png) {
  let foam = 0;
  const seaTop = Math.floor(png.height * 0.4);
  const seaArea = (png.height - seaTop) * png.width;
  for (let y = seaTop; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const o = (y * png.width + x) * 4;
      const r = png.data[o],
        g = png.data[o + 1],
        b = png.data[o + 2];
      if (r + g + b > 470 && r >= b - 12) foam++;
    }
  }
  return { foam, seaArea };
}

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1000, height: 600 }, errorPrefix: WINNER });
  try {
    await page.goto(`${ctx.target}/renderer/water-bakeoff?tech=${WINNER}&t=3.0`);
    await waitReady(page);

    const shot = await page.locator("#renderer-canvas").screenshot();
    const png = PNG.sync.read(shot);
    const s = foamStats(png);
    const frac = s.foam / s.seaArea;

    ctx.check(
      "foam: whitecaps cover the sea — present but not a white-out",
      frac > 0.008 && frac < 0.22,
      JSON.stringify({ foamFraction: frac.toFixed(4) }),
    );

    await ctx.snap(page, `water/foam-${WINNER}`, { shot });
  } finally {
    await page.close();
  }
}
