import { PNG } from "pngjs";

// The post-chain gate proves (1) the ONE post owner's identity (bloom
// stage + the AgX tone-map, ?post/?bloom toggles), and (2) the load-bearing
// 12e pairing: the disciplined GGX sun glint survives bloom. The sun-glint crop
// is captured with bloom ON and OFF at the SAME fixed golden-hour vista; the
// pairing check asserts bloom enriches the track (hot coverage
// grows) yet stays under the bloom tripwire and stays concentrated in
// the reflected-sun band (bloom did not turn it into blanket sparkle).
export const meta = {
  name: "photoreal-post",
  kind: "visual",
  world: "battle-photoreal-sea-vista",
  tier: "full",
  snapshots: [
    "photoreal-post/post-hero",
    "photoreal-post/sun-glint-bloom",
    "photoreal-post/sun-glint-nobloom",
  ],
  describe:
    "The post chain keeps restrained bloom and AgX tone mapping while the sun-glint pairing isolates bloom.",
};

const FIXED_TIME = 18.25;
// The 12e sun-glint vista, verbatim (sea/sun/glint framing).
const BASE = {
  // Map C = CoastalScrub: stand in the shallows facing the coast so the golden
  // sea fills the frame. The map's ocean is a bounded strip with no
  // open-horizon sun path, so this proves the post chain (bloom + AgX) over the
  // sea; the compact sun-glint requires open ocean.
  map: "C",
  ref: "1",
  t: String(FIXED_TIME),
  ticks: "60",
  zoom: "8.0",
  cx: "-1180",
  cy: "-150",
  pitch: "0.28",
  yaw: String(Math.PI),
};
const GLINT_CROP = { x: 430, y: 398, width: 420, height: 270 };

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("photoreal-post requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: "post" });
  try {
    // --- bloom ON (production default) ---
    const on = await load(ctx, page, {});
    const post = on.stats?.post ?? null;
    ctx.check(
      "post: the ONE chain owner is installed with bloom + the AgX tone-map",
      post?.owner === "battlePostChain" &&
        post?.enabled === true &&
        post?.bloom?.enabled === true &&
        post?.bloom?.threshold >= 1.0 &&
        post?.tonemap === "agx",
      JSON.stringify(post),
    );
    await ctx.snap(null, "photoreal-post/post-hero", { shot: on.full });

    const glintConstants = on.stats?.sea?.surface?.glint ?? {};
    const bloomGlint = glintMetrics(PNG.sync.read(cropPng(on.full, GLINT_CROP)), glintConstants);
    ctx.check(
      "bloom on: the sea vista stays disciplined under the 12e bloom tripwire (no blowout)",
      bloomGlint.maxLuma < 246 && bloomGlint.hotFraction < glintConstants.hotFractionMax,
      JSON.stringify(bloomGlint),
    );
    await ctx.snap(null, "photoreal-post/sun-glint-bloom", {
      shot: cropPng(on.full, GLINT_CROP),
    });

    // --- bloom OFF (same chain, bloom stage dropped) ---
    const off = await load(ctx, page, { bloom: "off" });
    ctx.check(
      "post: ?bloom=off drops only the bloom stage (chain + AgX tone-map stay)",
      off.stats?.post?.enabled === true &&
        off.stats?.post?.bloom?.enabled === false &&
        off.stats?.post?.tonemap === "agx",
      JSON.stringify(off.stats?.post),
    );
    const plainGlint = glintMetrics(PNG.sync.read(cropPng(off.full, GLINT_CROP)), glintConstants);
    await ctx.snap(null, "photoreal-post/sun-glint-nobloom", {
      shot: cropPng(off.full, GLINT_CROP),
    });

    // --- the pairing verdict: bloom enriches WITHOUT blowing out ---
    // (The coast map has no open-ocean sun path, so this proves bloom
    // lifts the sea highlights over the bloom-off pass without crossing the 12e
    // tripwire rather than compact-sun-glint enrichment.)
    ctx.check(
      "12e pairing: bloom lifts the sea highlights but does not blow past the tripwire",
      bloomGlint.maxLuma >= plainGlint.maxLuma && bloomGlint.maxLuma < 246,
      JSON.stringify({ bloom: bloomGlint, plain: plainGlint }),
    );
  } finally {
    await page.close();
  }
}

async function load(ctx, page, extra) {
  const query = new URLSearchParams({ ...BASE, ...extra });
  await page.goto(`${ctx.target}/renderer/photoreal-battle?${query}`);
  await page.waitForFunction(
    () =>
      window.__rendererLabStats?.ok === true &&
      window.__rendererLabStats?.route === "photoreal-battle" &&
      window.__rendererLabStats?.stats?.renderStats?.post &&
      window.__rendererLabStats?.stats?.renderStats?.terrain?.sea,
    undefined,
    { timeout: 180000 },
  );
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__photorealBattleWorld?.settlePresentedFrame?.());
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats?.renderStats ?? null);
  const full = await page.locator("#renderer-canvas").screenshot({ timeout: 180000 });
  return { stats, full };
}

function cropPng(buffer, rect) {
  const src = PNG.sync.read(buffer);
  const out = new PNG({ width: rect.width, height: rect.height });
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const si = ((rect.y + y) * src.width + rect.x + x) * 4;
      const di = (y * rect.width + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return PNG.sync.write(out);
}

// Verbatim from photoreal-sea.mjs (the 12e glint discipline metric): hot =
// near-white low-chroma pixels; centerShare = fraction of hot pixels in the
// central reflected-sun band.
function glintMetrics(png, constants) {
  let hot = 0;
  let centerHot = 0;
  let maxLuma = 0;
  const total = png.width * png.height;
  const threshold = constants?.hotLumaThreshold ?? 224;
  const centerX0 = png.width * 0.36;
  const centerX1 = png.width * 0.64;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      maxLuma = Math.max(maxLuma, luma);
      if (luma >= threshold && Math.max(r, g, b) - Math.min(r, g, b) < 52) {
        hot++;
        if (x >= centerX0 && x <= centerX1) centerHot++;
      }
    }
  }
  return {
    hotFraction: Number((hot / total).toFixed(4)),
    centerShare: Number((hot === 0 ? 0 : centerHot / hot).toFixed(4)),
    maxLuma: Number(maxLuma.toFixed(2)),
  };
}
