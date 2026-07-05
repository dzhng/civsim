import { PNG } from "pngjs";

// Slice 10 — physical sky + atmosphere. Every battle preset renders
// /renderer/photoreal-battle at the SAME fixed setTime and vista framing
// (the rig stop where sky and far terrain are both in frame). One visual
// variable per sub-slice, each with its named crop:
//   10a `sky-band`        (top third)      — the physical sky behind SkyModel
//   10b `far-terrain-band` (distant ridge) — the ONE aerial-perspective owner
//   10c `full`            (full frame)     — presets through the sky model
// Asserts: the stats identity names WHICH sky tier rendered (the SwiftShader
// capability contract — sky-LUT compute was the flagged risk; the shipped
// tier is a fragment-pass LUT bake, so SwiftShader runs the SAME tier and
// must render it non-blank), fixed-time frames are byte-deterministic, and
// the sky band carries the preset mood (golden warm vs overcast flat
// high-key). Out of scope: sea material (12), terrain detail (13), shadows (11).
export const meta = {
  name: "battle-photoreal-sky",
  kind: "flow",
  world: "battle-photoreal",
  tier: "full",
  snapshots: [
    "photoreal-sky/golden-hour-sky-band",
    "photoreal-sky/noon-sky-band",
    "photoreal-sky/dusk-sky-band",
    "photoreal-sky/overcast-foggy-sky-band",
    "photoreal-sky/golden-hour-far-terrain-band",
    "photoreal-sky/noon-far-terrain-band",
    "photoreal-sky/dusk-far-terrain-band",
    "photoreal-sky/overcast-foggy-far-terrain-band",
    "photoreal-sky/golden-hour-full",
    "photoreal-sky/noon-full",
    "photoreal-sky/dusk-full",
    "photoreal-sky/overcast-foggy-full",
  ],
  describe:
    "Physical sky + aerial perspective: per-preset sky-band/far-terrain/full snapshots, sky-tier identity.",
};

// The vista rig stop (battle-perf-30k's framing): sky band + far ridge in frame.
const FRAMING = "map=A&t=0&ref=1&zoom=9.5&cx=0&cy=-310";
const SKY_TIER = "skyview-fragment-lut";
// battle alias → the civsim preset id the stats identity must report.
const PRESETS = [
  { env: "golden-hour", preset: "golden", turbidity: 2.6 },
  { env: "noon", preset: "noon", turbidity: 2.0 },
  { env: "dusk", preset: "dusk", turbidity: 3.6 },
  { env: "overcast-foggy", preset: "overcast-highland", turbidity: 9.8 },
];

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("photoreal sky requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }
  const hardware = process.env.VERIFY_GPU_ADAPTER === "hardware";
  const skyBands = new Map();

  for (const { env, preset, turbidity } of PRESETS) {
    const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: env });
    await page.goto(`${ctx.target}/renderer/photoreal-battle?${FRAMING}&env=${env}`);
    await page.waitForFunction(
      () => window.__rendererLabReady === true && window.__rendererLabStats?.ok === true,
      undefined,
      { timeout: 180000 },
    );
    await page.waitForTimeout(400);
    const stats = await page.evaluate(() => window.__rendererLabStats);
    const sky = stats?.stats?.renderStats?.atmosphere?.sky;
    ctx.check(
      `${env}: sky identity names the tier that ran (${SKY_TIER}, ${hardware ? "hardware" : "swiftshader"})`,
      sky?.owner === "skyModel" && sky?.tier === SKY_TIER && sky?.turbidity === turbidity,
      JSON.stringify(sky),
    );
    ctx.check(
      `${env}: environment identity maps through the ONE preset owner (${preset})`,
      stats?.environment === preset,
      JSON.stringify({ environment: stats?.environment }),
    );

    // Clipped canvas shot (SwiftShader: a full frame is ~30 s of software
    // rasterization — no element-stability wait, long timeouts).
    const clip = await page.locator("#renderer-canvas").boundingBox();
    const shotA = await page.screenshot({ clip, timeout: 180000 });
    if (env === "golden-hour") {
      const shotB = await page.screenshot({ clip, timeout: 180000 });
      ctx.check(
        "fixed setTime renders byte-identical frames under the physical sky",
        Buffer.compare(shotA, shotB) === 0,
        JSON.stringify({ bytesA: shotA.length, bytesB: shotB.length }),
      );
    }
    const full = PNG.sync.read(shotA);
    const skyBand = cropBand(full, 0, 1 / 3);
    const farBand = cropBand(full, 0.15, 0.2);
    skyBands.set(env, skyBand);

    // Non-blank sky on THIS adapter: the band must carry light and must not
    // be a black/void clear (the capability contract made visible).
    const sample = bandStats(skyBand);
    ctx.check(
      `${env}: sky band renders non-blank (mean luminance > 40, not flat black)`,
      sample.meanLum > 40,
      JSON.stringify(sample),
    );

    // Baselines are SwiftShader artifacts; a hardware run must not diff them.
    if (!hardware) {
      await ctx.snap(page, `photoreal-sky/${env}-sky-band`, { shot: PNG.sync.write(skyBand) });
      await ctx.snap(page, `photoreal-sky/${env}-far-terrain-band`, {
        shot: PNG.sync.write(farBand),
      });
      await ctx.snap(page, `photoreal-sky/${env}-full`, { shot: PNG.sync.write(full) });
    }
    await page.close();
  }

  // The mood lives in the sky: golden's band is warm (R >= B), overcast's is
  // cool flat HIGH-KEY (near-white, B >= R), and they are far apart.
  const golden = bandStats(skyBands.get("golden-hour"));
  const overcast = bandStats(skyBands.get("overcast-foggy"));
  ctx.check(
    "golden sky band reads warm-neutral, overcast reads cool",
    golden.meanR >= golden.meanB - 12 && overcast.meanB >= overcast.meanR,
    JSON.stringify({ golden, overcast }),
  );
  ctx.check(
    "overcast sky band is flat HIGH-KEY (bright, low saturation)",
    overcast.meanLum > 150 && overcast.saturation < 14,
    JSON.stringify(overcast),
  );
  const swap = meanAbsDiff(skyBands.get("golden-hour"), skyBands.get("overcast-foggy"));
  ctx.check(
    "preset swap moves the sky band (golden vs overcast mean|Δ| > 4)",
    swap > 4,
    JSON.stringify({ meanAbsDiff: Number(swap.toFixed(2)) }),
  );
}

function cropBand(png, y0frac, hfrac) {
  const h = Math.floor(png.height * hfrac);
  const out = new PNG({ width: png.width, height: h });
  PNG.bitblt(png, out, 0, Math.floor(png.height * y0frac), png.width, h, 0, 0);
  return out;
}

function bandStats(png) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    r += png.data[i];
    g += png.data[i + 1];
    b += png.data[i + 2];
    n++;
  }
  const meanR = r / n;
  const meanG = g / n;
  const meanB = b / n;
  return {
    meanR: Number(meanR.toFixed(1)),
    meanG: Number(meanG.toFixed(1)),
    meanB: Number(meanB.toFixed(1)),
    meanLum: Number((0.2126 * meanR + 0.7152 * meanG + 0.0722 * meanB).toFixed(1)),
    saturation: Number((Math.max(meanR, meanG, meanB) - Math.min(meanR, meanG, meanB)).toFixed(1)),
  };
}

function meanAbsDiff(a, b) {
  if (!a || !b || a.width !== b.width || a.height !== b.height) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    sum +=
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
  }
  return sum / ((a.data.length / 4) * 3);
}
