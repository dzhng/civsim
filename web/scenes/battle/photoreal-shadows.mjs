import { PNG } from "pngjs";

// Sun shadows isolate one visual variable: cast-shadow
// presence/direction/quality, crop `shadow-scenery` (a tree grove whose
// shadows are legible even on the low-res fallback tier) per preset at the
// SAME fixed setTime, plus the golden `shadow-contact` formation crop.
// Asserts the shadow-tier identity (EVERY adapter defaults to mode:'single'
// — one soft ortho map; ?shadows=csm stays the
// QA override, asserted on hardware runs), shadow PRESENCE (?shadows=off
// must move the grove crop), per-preset softness (radius derives from
// turbidity — no new preset field), and fixed-time byte-determinism with
// shadows on.
// Out of scope: soldier materials (14a), contact AO (14c), sea receiving (12).
export const meta = {
  name: "battle-photoreal-shadows",
  kind: "flow",
  world: "battle-photoreal",
  tier: "full",
  snapshots: [
    "photoreal-shadows/golden-hour-shadow-scenery",
    "photoreal-shadows/noon-shadow-scenery",
    "photoreal-shadows/dusk-shadow-scenery",
    "photoreal-shadows/overcast-foggy-shadow-scenery",
    "photoreal-shadows/golden-hour-shadow-contact",
    "photoreal-shadows/golden-hour-full",
  ],
  describe:
    "Sun shadows: per-preset scenery crops, single-tier identity, csm QA override, on/off presence.",
};

// A generated wooded-pass grove + a soldier formation in one frame. zoom
// clamps to the rig; the grove crop stays legible at either adapter's clamp.
// zoom 6 keeps near-macro grass blades out of the crop so it measures the grove
// shadows.
const FRAMING = "map=gen&seed=8&t=0&ref=1&zoom=6&cx=-560&cy=-380";
// Grove crop (fractions of the 1280×800 canvas — the wooded-pass grove).
// Aimed at seed 8's two dense mid-field forest clumps.
const SCENERY_CROP = { x0: 0.51, y0: 0.5, w: 0.14, h: 0.13 };
// Formation crop for the golden contact snap (soldier feet on ground).
const CONTACT_CROP = { x0: 0.22, y0: 0.2, w: 0.13, h: 0.16 };
// Radii are the SINGLE tier's: the turbidity radius (1 + (t - 2) * 0.28,
// clamped [1, 3]) narrowed by the fitted map's 0.6 factor. High samples the
// unscaled radius; equal texel radii do not imply equal world-space softness.
const PRESETS = [
  // Golden turbidity 2.9 -> base 1.252.
  { env: "golden-hour", preset: "golden", radius: 0.7512 },
  { env: "noon", preset: "noon", radius: 0.6 },
  { env: "dusk", preset: "dusk", radius: 0.8688 },
  // Turbidity 7.2 keeps ranges readable through haze: base 2.456.
  { env: "overcast-foggy", preset: "overcast-highland", radius: 1.4736 },
];

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("photoreal shadows require browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }
  const hardware = process.env.VERIFY_GPU_ADAPTER === "hardware";
  let goldenScenery = null;

  for (const { env, preset, radius } of PRESETS) {
    const page = await openRoute(ctx, `?${FRAMING}&env=${env}`, env);
    const stats = await page.evaluate(() => window.__rendererLabStats);
    const shadows = stats?.stats?.renderStats?.shadows;
    ctx.check(
      `${env}: shadow identity names the tier that ran (single is the default on every adapter)`,
      shadows?.owner === "shadowRig" &&
        shadows?.mode === "single" &&
        shadows?.cascades === 1 &&
        shadows?.mapSize === 1024,
      JSON.stringify(shadows),
    );
    ctx.check(
      `${env}: PCF softness derives from the preset turbidity (radius ${radius})`,
      Math.abs((shadows?.radius ?? 0) - radius) < 0.01 && stats?.environment === preset,
      JSON.stringify({ radius: shadows?.radius, environment: stats?.environment }),
    );

    const clip = await page.locator("#renderer-canvas").boundingBox();
    const shotA = await page.screenshot({ clip, timeout: 180000 });
    if (env === "golden-hour") {
      const shotB = await page.screenshot({ clip, timeout: 180000 });
      ctx.check(
        "fixed setTime renders byte-identical frames with shadows on",
        Buffer.compare(shotA, shotB) === 0,
        JSON.stringify({ bytesA: shotA.length, bytesB: shotB.length }),
      );
    }
    const full = PNG.sync.read(shotA);
    const scenery = cropFrac(full, SCENERY_CROP);
    if (env === "golden-hour") goldenScenery = scenery;
    const sample = bandStats(scenery);
    ctx.check(
      `${env}: scenery crop renders non-blank`,
      sample.meanLum > 30,
      JSON.stringify(sample),
    );
    // Baselines are SwiftShader artifacts; a hardware run must not diff them.
    if (!hardware) {
      await ctx.snap(page, `photoreal-shadows/${env}-shadow-scenery`, {
        shot: PNG.sync.write(scenery),
      });
      if (env === "golden-hour") {
        await ctx.snap(page, "photoreal-shadows/golden-hour-shadow-contact", {
          shot: PNG.sync.write(cropFrac(full, CONTACT_CROP)),
        });
        await ctx.snap(page, "photoreal-shadows/golden-hour-full", { shot: shotA });
      }
    }
    await page.close();
  }

  // Shadow PRESENCE: the lab-only kill switch must visibly remove the grove
  // shadows (proves the darkening IS the shadow rig, not albedo/haze).
  {
    const page = await openRoute(ctx, `?${FRAMING}&env=golden-hour&shadows=off`, "shadows-off");
    const stats = await page.evaluate(() => window.__rendererLabStats);
    ctx.check(
      "?shadows=off runs the off tier (identity proves the override)",
      stats?.stats?.renderStats?.shadows?.mode === "off",
      JSON.stringify(stats?.stats?.renderStats?.shadows),
    );
    const clip = await page.locator("#renderer-canvas").boundingBox();
    const shot = PNG.sync.read(await page.screenshot({ clip, timeout: 180000 }));
    const offScenery = cropFrac(shot, SCENERY_CROP);
    const delta = meanAbsDiff(goldenScenery, offScenery);
    // Presence proxy, not a contrast target: the AgX grade lifts
    // shadows (aesthetics rule 2 — bright, legible, no moody near-black), so the
    // grove's on/off darkening is subtler than the ACES-era 1.5 this once pinned.
    // The mechanism still holds — the grove visibly darkens and ?shadows=off
    // removes it — so the floor guards presence, not magnitude.
    ctx.check(
      "shadows move the grove crop (on vs off mean|Δ| > 1.2)",
      delta > 1.2,
      JSON.stringify({ meanAbsDiff: Number(delta.toFixed(2)) }),
    );
    await page.close();
  }

  // The QA override: ?shadows=csm still runs the cascade tier (2×2048 split
  // from the live camera3d projection). Hardware-only — CSM re-renders the
  // crowd per cascade, which SwiftShader cannot do in scene budget.
  if (hardware) {
    const page = await openRoute(ctx, `?${FRAMING}&env=golden-hour&shadows=csm`, "shadows-csm");
    const stats = await page.evaluate(() => window.__rendererLabStats);
    const shadows = stats?.stats?.renderStats?.shadows;
    ctx.check(
      "?shadows=csm runs the cascade tier (identity proves the QA override)",
      shadows?.mode === "csm" && shadows?.cascades === 2 && shadows?.mapSize === 2048,
      JSON.stringify(shadows),
    );
    await page.close();
  }
}

async function openRoute(ctx, query, errorPrefix) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix });
  await page.goto(`${ctx.target}/renderer/photoreal-battle${query}`);
  await page.waitForFunction(
    () => window.__rendererLabReady === true && window.__rendererLabStats?.ok === true,
    undefined,
    { timeout: 180000 },
  );
  await page.waitForTimeout(400);
  return page;
}

function cropFrac(png, { x0, y0, w, h }) {
  const width = Math.floor(png.width * w);
  const height = Math.floor(png.height * h);
  const out = new PNG({ width, height });
  PNG.bitblt(
    png,
    out,
    Math.floor(png.width * x0),
    Math.floor(png.height * y0),
    width,
    height,
    0,
    0,
  );
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
