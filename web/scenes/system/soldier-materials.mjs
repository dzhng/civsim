import { PNG } from "pngjs";
import { requireSwiftShaderBaseline } from "../models/_swiftshader-baseline.ts";

export const meta = {
  name: "soldier-materials",
  kind: "visual",
  world: "raw-soldier-explicit-materials",
  tier: "full",
  snapshots: ["soldier-materials-authored", "soldier-materials-blue", "soldier-materials-metal"],
  describe:
    "Raw production soldier material IDs, scalar factors and independent faction masks; ordinary blue is not faction identity.",
};

function regionAverage(png, box) {
  const x0 = Math.floor(png.width * box[0]),
    x1 = Math.floor(png.width * box[1]);
  const y0 = Math.floor(png.height * box[2]),
    y1 = Math.floor(png.height * box[3]);
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * png.width + x) * 4;
      r += png.data[o];
      g += png.data[o + 1];
      b += png.data[o + 2];
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

function changedArea(a, b, threshold) {
  if (!a || !b || a.width !== b.width || a.height !== b.height) return Infinity;
  let changed = 0;
  let total = 0;
  for (let y = Math.floor(a.height * 0.16); y < Math.floor(a.height * 0.78); y++) {
    for (let x = Math.floor(a.width * 0.24); x < Math.floor(a.width * 0.76); x++) {
      const o = (y * a.width + x) * 4;
      const delta =
        Math.abs(a.data[o] - b.data[o]) +
        Math.abs(a.data[o + 1] - b.data[o + 1]) +
        Math.abs(a.data[o + 2] - b.data[o + 2]);
      if (delta > threshold) changed++;
      total++;
    }
  }
  return { changed, total, share: total > 0 ? changed / total : 0 };
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

async function capture(ctx, params, snapshot) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: `soldier-materials-${params}`,
  });
  try {
    await page.goto(`${ctx.target}/renderer/soldier-materials?${params}&class=0`);
    await page.waitForFunction(
      () =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.stats?.route === "soldier-materials",
      undefined,
      { timeout: 18000 },
    );
    await page.waitForTimeout(250);
    if (snapshot) await ctx.snap(page, snapshot, { threshold: 0, maxDiffRatio: 0 });
    return PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
  } finally {
    await page.close();
  }
}

export async function run(ctx) {
  requireSwiftShaderBaseline(meta.name);
  const authored = await capture(ctx, "strength=1&team=0", "soldier-materials-authored");
  const remapped = await capture(ctx, "strength=1&team=0&reverseMaterials");
  ctx.check(
    "material table permutation and matching ID remap preserve exact pixels",
    authored.data.equals(remapped.data),
  );
  const blue = await capture(ctx, "strength=1&team=0&surface=blue", "soldier-materials-blue");
  const red = await capture(ctx, "strength=1&team=1&surface=blue");
  const bodyBlue = regionAverage(blue, [0.43, 0.57, 0.3, 0.58]);
  const bodyRed = regionAverage(red, [0.43, 0.57, 0.3, 0.58]);
  const shieldBlue = regionAverage(blue, [0.3, 0.43, 0.3, 0.62]);
  const shieldRed = regionAverage(red, [0.3, 0.43, 0.3, 0.62]);
  const bodyFactionDiff = dist(bodyBlue, bodyRed);
  const shieldFactionDiff = dist(shieldBlue, shieldRed);
  const armband = changedArea(blue, red, 30);

  ctx.check(
    "soldier-materials: body and shield do not carry faction tint",
    bodyFactionDiff < 5 && shieldFactionDiff < 5,
    JSON.stringify({
      bodyBlue,
      bodyRed,
      bodyFactionDiff,
      shieldBlue,
      shieldRed,
      shieldFactionDiff,
    }),
  );
  ctx.check(
    "soldier-materials: only a tiny armband-sized region changes by faction",
    armband.changed > 8 && armband.share > 0 && armband.share < 0.012,
    JSON.stringify({
      changedPixels: armband.changed,
      changedShare: Number(armband.share.toFixed(5)),
      totalPixels: armband.total,
    }),
  );
  const unmaskedBlue = await capture(ctx, "strength=0&team=0&surface=blue");
  const unmaskedRed = await capture(ctx, "strength=0&team=1&surface=blue");
  ctx.check(
    "explicit mask disabled: ordinary blue is identical for both factions",
    unmaskedBlue.data.equals(unmaskedRed.data),
  );
  const differentSeed = await capture(ctx, "strength=0&team=0&surface=blue&seed=123");
  ctx.check(
    "seed cannot change uniform surface color",
    unmaskedBlue.data.equals(differentSeed.data),
  );
  const rough = await capture(ctx, "strength=0&surface=gray&roughness=1&metallic=1");
  const noKey = await capture(ctx, "strength=0&surface=gray&roughness=1&metallic=1&keyOff");
  const unlitFace = regionAverage(rough, [0.46, 0.51, 0.44, 0.48]);
  const unlitFaceWithoutKey = regionAverage(noKey, [0.46, 0.51, 0.44, 0.48]);
  ctx.check(
    "unlit front plane receives fill but no directional specular",
    dist(unlitFace, unlitFaceWithoutKey) === 0 && Math.min(...unlitFace) > 10,
    JSON.stringify({ unlitFace, unlitFaceWithoutKey }),
  );
  const smooth = await capture(
    ctx,
    "strength=0&surface=gray&roughness=0&metallic=1",
    "soldier-materials-metal",
  );
  const dielectric = await capture(ctx, "strength=0&surface=gray&roughness=0&metallic=0");
  const roughnessResponse = changedArea(rough, smooth, 10);
  const metallicResponse = changedArea(smooth, dielectric, 10);
  ctx.check(
    "same-color roughness changes rendered response with faction tint disabled",
    roughnessResponse.changed > 100,
    JSON.stringify(roughnessResponse),
  );
  ctx.check(
    "same-color metallic changes rendered response with faction tint disabled",
    metallicResponse.changed > 100,
    JSON.stringify(metallicResponse),
  );
}
