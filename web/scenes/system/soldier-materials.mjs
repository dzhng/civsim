import { PNG } from "pngjs";

export const meta = {
  name: "soldier-materials",
  kind: "flow",
  world: "none",
  tier: "full",
  snapshots: [],
  describe:
    "Soldiers sample material textures; faction color is confined to a tiny upper sword-arm band.",
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

async function capture(ctx, strength, team) {
  const page = await ctx.newPage({
    viewport: { width: 900, height: 620 },
    errorPrefix: `soldier-materials-${strength}-${team}`,
  });
  try {
    await page.goto(
      `${ctx.target}/renderer/soldier-materials?strength=${strength}&team=${team}&class=0`,
    );
    await page.waitForFunction(
      () =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.stats?.route === "soldier-materials",
      undefined,
      { timeout: 18000 },
    );
    await page.waitForTimeout(250);
    return PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
  } finally {
    await page.close();
  }
}

export async function run(ctx) {
  const blue = await capture(ctx, 1, 0);
  const red = await capture(ctx, 1, 1);
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
}
