import { PNG } from "pngjs";

export const meta = {
  name: "photoreal-sea",
  kind: "visual",
  world: "battle-photoreal-sea-vista",
  tier: "full",
  snapshots: [
    "photoreal-sea/sea-horizon",
    "photoreal-sea/sea-mid",
    "photoreal-sea/shore-line",
    "photoreal-sea/sun-glint",
  ],
  describe:
    "The photoreal sea is a SkyModel-reflecting PBR Gerstner surface at a fixed sea-facing battle vista.",
};

const FIXED_TIME = 18.25;
const SEA_QUERY = new URLSearchParams({
  // Map C = CoastalScrub: ocean seals the WEST edge (x <= -1120). Stand in the
  // shallows and look back across the open water toward the coast so deep blue
  // sea fills the foreground. Noon sky keeps the water blue, not golden-hazed.
  map: "C",
  ref: "1",
  env: "noon",
  t: String(FIXED_TIME),
  ticks: "60",
  sea: "gerstner",
  zoom: "8.0",
  cx: "-1180",
  cy: "-150",
  pitch: "0.28",
  yaw: String(Math.PI),
});

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("photoreal-sea requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: "sea" });
  try {
    await page.goto(`${ctx.target}/renderer/photoreal-battle?${SEA_QUERY}`);
    await page.waitForFunction(
      () =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.ok === true &&
        window.__rendererLabStats?.route === "photoreal-battle" &&
        window.__rendererLabStats?.stats?.renderStats?.terrain?.sea,
      undefined,
      { timeout: 180000 },
    );
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__photorealBattleWorld?.settlePresentedFrame?.());

    const stats = await page.evaluate(() => window.__rendererLabStats?.stats?.renderStats ?? null);
    const sea = stats?.sea ?? null;
    ctx.check(
      "sea: Gerstner TSL is the only active displacement tier",
      sea?.requested === "gerstner-tsl" &&
        sea?.source === "gerstner-tsl" &&
        sea?.tier === "gerstner-tsl" &&
        sea?.fallback === false &&
        sea?.storageBytes === 0,
      JSON.stringify(sea),
    );
    ctx.check(
      "sea: PBR surface reflects the SkyModel LUT and uses distance-faded normal detail",
      sea?.surface?.owner === "skyModel-ibl-standard-pbr" &&
        sea?.surface?.skyReflection === "scene.environment:skyModel-lut" &&
        sea?.surface?.sunGlint === "mesh-standard-ggx" &&
        sea?.surface?.normalDetail?.near > sea?.surface?.normalDetail?.far &&
        sea?.surface?.normalDetail?.fadeEnd > sea?.surface?.normalDetail?.fadeStart &&
        sea?.surface?.foam?.heightStart < sea?.surface?.foam?.heightEnd &&
        sea?.surface?.foam?.slopeStart < sea?.surface?.foam?.slopeEnd &&
        sea?.surface?.shore?.heightfieldDatum === true &&
        sea?.surface?.shore?.ramp?.depthNear < sea?.surface?.shore?.ramp?.depthFar &&
        sea?.surface?.shore?.farExtent >= 7200 &&
        sea?.surface?.glint?.roughnessFloor >= 0.1 &&
        sea?.surface?.glint?.normalDetailCeiling <= 0.84 &&
        sea?.surface?.glint?.hotFractionMax <= 0.07 &&
        sea?.surface?.glint?.centerShareMin >= 0.6,
      JSON.stringify(sea?.surface),
    );
    ctx.check(
      "sea: atmosphere owner still provides horizon haze",
      stats?.atmosphere?.sky?.owner === "skyModel" &&
        stats?.atmosphere?.aerial?.owner === "aerialPerspective",
      JSON.stringify(stats?.atmosphere),
    );

    const full = await page.locator("#renderer-canvas").screenshot({ timeout: 180000 });
    const horizon = cropPng(full, { x: 0, y: 410, width: 1280, height: 260 });
    const m = seaBandMetrics(PNG.sync.read(horizon));
    ctx.check(
      "sea-horizon: near sea below the haze band remains blue and readable",
      m.blueFraction > 0.18 && m.lumaSpread > 18,
      JSON.stringify(m),
    );
    await ctx.snap(null, "photoreal-sea/sea-horizon", { shot: horizon });

    // The coast map affords a calm open-water vista at noon. These bands verify
    // deep blue open sea without blanket foam; sun-glint belongs to
    // photoreal-post.
    const mid = cropPng(full, { x: 40, y: 505, width: 560, height: 235 });
    const f = foamBandMetrics(PNG.sync.read(mid));
    ctx.check(
      "sea-mid: open water reads deep blue with no blanket foam",
      f.blueFraction > 0.45 && f.foamFraction < 0.16,
      JSON.stringify(f),
    );
    await ctx.snap(null, "photoreal-sea/sea-mid", { shot: mid });

    const shore = cropPng(full, { x: 0, y: 390, width: 1280, height: 180 });
    const s = shoreLineMetrics(PNG.sync.read(shore));
    ctx.check(
      "sea-foreground: the near water is dominant deep blue",
      s.blueFraction > 0.4,
      JSON.stringify(s),
    );
    await ctx.snap(null, "photoreal-sea/shore-line", { shot: shore });

    const glint = cropPng(full, { x: 430, y: 398, width: 420, height: 270 });
    const glintConstants = sea?.surface?.glint ?? {};
    const g = glintMetrics(PNG.sync.read(glint), glintConstants);
    ctx.check(
      "sea centre stays below the bloom tripwire (no blown highlight)",
      g.maxLuma < 246 && g.hotFraction < glintConstants.hotFractionMax,
      JSON.stringify(g),
    );
    await ctx.snap(null, "photoreal-sea/sun-glint", { shot: glint });
  } finally {
    await page.close();
  }
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

function seaBandMetrics(png) {
  let blue = 0;
  let minLuma = 255;
  let maxLuma = 0;
  const total = png.width * png.height;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (b > r + 10 && g > r + 2 && b > 48) blue++;
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
    }
  }
  return {
    blueFraction: Number((blue / total).toFixed(4)),
    lumaSpread: Number((maxLuma - minLuma).toFixed(2)),
  };
}

function foamBandMetrics(png) {
  let blue = 0;
  let foam = 0;
  const total = png.width * png.height;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      if (b > r + 10 && g > r + 2 && b > 48) blue++;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (luma > 172 && chroma < 72) foam++;
    }
  }
  return {
    blueFraction: Number((blue / total).toFixed(4)),
    foamFraction: Number((foam / total).toFixed(4)),
  };
}

function shoreLineMetrics(png) {
  let sand = 0;
  let turquoise = 0;
  let deepBlue = 0;
  let blue = 0;
  const total = png.width * png.height;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      if (r > 90 && g > 78 && b < g - 5 && r >= b + 22 && Math.abs(r - g) < 55) sand++;
      if (g > r + 8 && b > r + 16 && g > 80 && b > 85 && Math.abs(b - g) < 70) turquoise++;
      if (b > g + 5 && b > r + 28 && b > 55 && g > r + 5) deepBlue++;
      if (b > r + 10 && g > r + 2 && b > 48) blue++;
    }
  }
  return {
    sandFraction: Number((sand / total).toFixed(4)),
    turquoiseFraction: Number((turquoise / total).toFixed(4)),
    deepBlueFraction: Number((deepBlue / total).toFixed(4)),
    blueFraction: Number((blue / total).toFixed(4)),
  };
}

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
