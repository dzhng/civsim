import { battleRendererReady } from "../worlds.mjs";
import { PNG } from "pngjs";
import { cropRatio } from "./battle-map-style-legibility-lib.js";

const SEED = 7;
const VIEWPORT = { width: 1280, height: 800 };
const PRESETS = [
  { id: "golden-hour", label: "golden" },
  { id: "overcast-foggy", label: "overcast" },
];

export const meta = {
  name: "battle-genmap-lake",
  kind: "visual",
  world: "battle-generated-seed-7-lake",
  tier: "full",
  snapshots: ["battle-genmap-lake/golden-lake", "battle-genmap-lake/overcast-lake"],
  describe:
    "Generated lake pockets render as calm sea-family water clipped to sim tint=water cells.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("generated lake water snaps require browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  for (const preset of PRESETS) {
    const page = await ctx.newPage({
      viewport: VIEWPORT,
      errorPrefix: `battle-genmap-lake-${preset.label}`,
    });
    try {
      const capture = await captureLakeFrame(ctx, page, preset.id);
      assertLakeStats(ctx, preset.label, capture.stats, capture.lake);
      assertRenderedWaterMask(ctx, preset.label, capture.image, capture.maskSamples);
      await ctx.snap(null, `battle-genmap-lake/${preset.label}-lake`, {
        shot: PNG.sync.write(capture.crop),
      });
    } finally {
      await page.close();
    }
  }
}

async function captureLakeFrame(ctx, page, env) {
  await page.goto(`${ctx.target}/?map=gen&seed=${SEED}&ai=off&env=${env}`);
  await battleRendererReady(page);
  await page.evaluate(() => window.__game.freezeAtTick(60));
  const pose = await page.evaluate(async (seed) => {
    const debug = window.__game.terrainDebug();
    const lake = debug.generatedMap?.lakeSurfaces?.[0] ?? debug.certificates?.drainage?.lakes?.[0];
    if (!lake) return null;
    const cx = (lake.minX + lake.maxX) * 0.5;
    const cy = (lake.minY + lake.maxY) * 0.5;
    const yaw = cx < 0 ? 0 : Math.PI;
    window.__game.setCamera(cx, cy, 7.1, yaw, 0.78);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const canvas = document.getElementById("battlefield");
    const canvasW = canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1);
    const canvasH = canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1);
    const wasmModule = await import("/src/wasm/game_wasm.js");
    const wasm = await wasmModule.default();
    const game = new wasmModule.Game(0x5eed_c0de);
    game.start_battle_generated(BigInt(seed));
    const w = game.terrain_w();
    const h = game.terrain_h();
    const cell = game.terrain_cell();
    const ox = game.terrain_origin_x();
    const oy = game.terrain_origin_y();
    const tint = new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), w * h).slice();
    const screen = (x, y) => window.__cam.worldToScreen(x, y, lake.level);
    const corners = [
      screen(lake.minX, lake.minY),
      screen(lake.maxX, lake.minY),
      screen(lake.minX, lake.maxY),
      screen(lake.maxX, lake.maxY),
    ];
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const cropX = Math.max(0, Math.min(...xs) - 90);
    const cropY = Math.max(0, Math.min(...ys) - 80);
    const crop = {
      x: cropX,
      y: cropY,
      width: Math.min(canvasW, Math.max(...xs) + 90) - cropX,
      height: Math.min(canvasH, Math.max(...ys) + 80) - cropY,
    };
    // Inlined: helpers defined node-side are not visible in page context.
    const buildMask = () => {
      const water = [];
      const dry = [];
      const stride = 4;
      const minX = Math.max(0, lake.minCellX - 4);
      const maxX = Math.min(w - 1, lake.maxCellX + 4);
      const minY = Math.max(0, lake.minCellY - 4);
      const maxY = Math.min(h - 1, lake.maxCellY + 4);
      for (let sy = minY; sy <= maxY; sy += stride) {
        for (let sx = minX; sx <= maxX; sx += stride) {
          const i = sy * w + sx;
          const wx = ox + (sx + 0.5) * cell;
          const wy = oy + (sy + 0.5) * cell;
          const [px, py] = screen(wx, wy);
          if (px < 0 || py < 0 || px >= canvasW || py >= canvasH) continue;
          if (tint[i] === 1) water.push([px, py]);
          else dry.push([px, py]);
        }
      }
      return { water: water.slice(0, 180), dry: dry.slice(0, 180) };
    };
    const samples = buildMask();
    game.free();
    return { lake, crop, samples };
  }, SEED);
  ctx.check("seed-7 generated map exports at least one lake surface", pose !== null);
  if (!pose) {
    throw new Error("seed-7 generated lake surface missing");
  }
  await page.waitForTimeout(400);
  const shot = await page.locator("#battlefield").screenshot({ timeout: 180000 });
  const image = PNG.sync.read(shot);
  const crop = cropRatio(
    image,
    pose.crop.x / image.width,
    pose.crop.y / image.height,
    pose.crop.width / image.width,
    pose.crop.height / image.height,
  );
  return {
    image,
    crop,
    lake: pose.lake,
    maskSamples: pose.samples,
    stats: await page.evaluate(() => window.__game.stats().renderStats),
  };
}

function assertLakeStats(ctx, label, stats, lake) {
  const water = stats?.terrain?.water;
  const lakes = water?.surfaces.filter((surface) => surface.kind === "lake");
  ctx.check(
    `${label}: installed water geometry matches the generated lake and has no ocean`,
    stats?.renderer === "gpu" &&
      stats?.terrain?.installed === true &&
      stats?.terrain?.vista !== null &&
      lakes?.length >= 1 &&
      water.surfaces.every((surface) => surface.kind === "lake") &&
      Math.abs((lakes[0]?.level ?? NaN) - lake.level) < 1e-3,
    JSON.stringify({ terrain: stats?.terrain, lake }),
  );
}

function assertRenderedWaterMask(ctx, label, image, samples) {
  const water = samples.water.map(([x, y]) => isWaterPixel(image, x, y));
  const dry = samples.dry.map(([x, y]) => isWaterPixel(image, x, y));
  const waterHit = fraction(water);
  const dryLeak = fraction(dry);
  ctx.check(
    `${label}: rendered lake-blue pixels follow sim tint=water projection`,
    samples.water.length >= 24 && samples.dry.length >= 24 && waterHit >= 0.42 && dryLeak <= 0.12,
    JSON.stringify({
      waterSamples: samples.water.length,
      drySamples: samples.dry.length,
      waterHit,
      dryLeak,
    }),
  );
}

function isWaterPixel(image, sx, sy) {
  const x = Math.max(0, Math.min(image.width - 1, Math.round(sx)));
  const y = Math.max(0, Math.min(image.height - 1, Math.round(sy)));
  const o = (y * image.width + x) * 4;
  const r = image.data[o];
  const g = image.data[o + 1];
  const b = image.data[o + 2];
  const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
  // Water's two honest signatures at a battle camera: specular sky/sun
  // reflection (bright, desaturated - the reference's pale lake sliver) or
  // blue-dominance. A blue-only classifier scores real glinting water 0.
  const bright = luma > 165 && Math.abs(r - g) < 40 && b > r - 20;
  const blue = b > r + 10 && g > r + 16 && b > 45 && luma > 45;
  // Overcast water: desaturated grey-blue. Grass is always green-dominant;
  // the lake's grey is not.
  const grey = g < r + 12 && b >= r - 4 && luma > 115;
  return bright || blue || grey;
}

function fraction(values) {
  if (values.length === 0) return 0;
  return Number((values.filter(Boolean).length / values.length).toFixed(3));
}
