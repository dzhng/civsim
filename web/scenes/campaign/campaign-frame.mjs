import { PNG } from "pngjs";
import { campaign } from "../worlds.mjs";

// The camera must never see past the map edge.
// At the max-zoom-out floor the four corners of the map viewport must be map
// (terrain/sea/cloud), never the off-map clear color (near-black). Stress it at a
// WIDE aspect (the top edge is widest, where the perspective trapezoid overreached
// and produced the black top-left/top-right wedges) and a standard aspect.
const CENTER = [-100, 250]; // whole-map center (see campaign-lod WHOLE_MAP_CAMERA)
const TINY_SCALE = 0.001; // below the fill floor → clampCam raises it to minZoom
const HUD_TOP = 104; // skip the DOM top bar (the bronze tray wraps to 2 rows at narrow widths)
const CORNER = 48; // corner block size in px
const MAX_BLACK_RATIO = 0.12; // a map corner is well under this; an off-map corner ≈ 1

export const meta = {
  name: "campaign-frame",
  kind: "visual",
  world: "campaign-real",
  tier: "quick",
  snapshots: ["campaign-frame-zoomout-wide", "campaign-frame-zoomout-tall"],
  describe:
    "Max-zoom-out camera framing: the viewport never sees off the map (no black corners) at wide and standard aspect ratios.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("campaign-frame requires VERIFY_GPU=1", true, "set VERIFY_GPU=1");
    return;
  }

  await snapFrame(ctx, "campaign-frame-zoomout-wide", { width: 1720, height: 720 });
  await snapFrame(ctx, "campaign-frame-zoomout-tall", { width: 1024, height: 768 });
}

async function snapFrame(ctx, name, viewport) {
  const page = await campaign(ctx, "new", { viewport, errorPrefix: name, timeout: 30000 });
  await page.evaluate(() => window.__campaign.freeze());
  await page.evaluate(
    ([cx, cy, scale]) => {
      window.__campaign.freeze(true);
      window.__campaign.factionView(false);
      window.__campaign.fogOfWar(false);
      window.__campaign.select(-1);
      window.__campaign.cam(cx, cy, scale); // clampCam pins this to the zoom-out floor
    },
    [...CENTER, TINY_SCALE],
  );
  await page.waitForTimeout(300);

  const shot = await page.screenshot();
  const png = PNG.sync.read(shot);
  const corners = cornerBlackRatios(png);
  const worst = Math.max(...Object.values(corners));
  ctx.check(
    `${name} no off-map black in any corner (worst ${worst.toFixed(3)} < ${MAX_BLACK_RATIO})`,
    worst < MAX_BLACK_RATIO,
    JSON.stringify(corners),
  );
  await ctx.snap(page, name, { shot });
  await page.close();
}

// Fraction of near-black (off-map clear) pixels in each corner block.
function cornerBlackRatios(png) {
  const { width: w, height: h } = png;
  return {
    topLeft: blackRatio(png, 0, HUD_TOP, CORNER, HUD_TOP + CORNER),
    topRight: blackRatio(png, w - CORNER, HUD_TOP, w, HUD_TOP + CORNER),
    bottomLeft: blackRatio(png, 0, h - CORNER, CORNER, h),
    bottomRight: blackRatio(png, w - CORNER, h - CORNER, w, h),
  };
}

function blackRatio(png, x0, y0, x1, y1) {
  let total = 0;
  let black = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      total++;
      // off-map = transparent OR near-black clear; sea/land/cloud are all lighter.
      if (a < 16 || r + g + b < 54) black++;
    }
  }
  return Number((black / Math.max(1, total)).toFixed(3));
}
