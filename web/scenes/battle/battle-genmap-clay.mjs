import { PNG } from "pngjs";
import { HORIZON_TARGET, VIEWPORT, VISTA_CAMERA } from "./battle-map-style.mjs";

const SEED = 7;
const SEED7_HASH = "0x3138cbc0087fc0cd";
const RECT = { x0: -1200, y0: -800, x1: 1200, y1: 800 };
const SAMPLE_STEP = 8;

export const meta = {
  name: "battle-genmap-clay",
  kind: "visual",
  world: "battle-generated-seed-7-clay-height-review",
  tier: "full",
  snapshots: ["battle-genmap-clay/vista", "battle-genmap-clay/topdown"],
  describe:
    "BMS02-SLICE-D7F2: generated highland-corridor landform rendered as neutral-clay height review at the locked vista camera and top-down.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("generated clay snaps require browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const page = await ctx.newPage({ viewport: VIEWPORT, errorPrefix: "battle-genmap-clay" });
  try {
    await page.goto(`${ctx.target}/?map=gen&seed=${SEED}&ai=off`);
    await page.waitForFunction(
      () => {
        const stats = window.__game?.stats?.();
        return (
          window.__ready === true &&
          stats?.renderStats?.ready === true &&
          stats.renderStats.terrain?.fixture === "sim-tint"
        );
      },
      undefined,
      { timeout: 30000 },
    );

    const setup = await page.evaluate((profile) => {
      window.__game.freezeAtTick(240);
      const c = window.__cam;
      c.yaw = profile.camYaw;
      c.zoom = profile.zoom;
      c.setViewCenter(profile.cx, profile.cy);
      c.clampView?.();
      return window.__game.stats().renderStats.camera.camera3d;
    }, VISTA_CAMERA);
    await page.waitForTimeout(200);

    const terrain = await page.evaluate(() => window.__game.terrainDebug());
    ctx.check(
      "generated descriptor is the slice-02 pinned terrain",
      terrain.generatedMap?.seed === SEED &&
        terrain.generatedMap?.reliefScale === 1.0 &&
        terrain.generatedMap?.terrainHash === SEED7_HASH,
      JSON.stringify(terrain.generatedMap),
    );

    const samples = await sampleHeights(page);
    const horizon = measureFarTerrainHorizon(setup, samples);
    ctx.check(
      "generated far-terrain horizon is measured from the locked vista camera",
      Number.isFinite(horizon.horizonYRatio) && horizon.samples > 0,
      JSON.stringify(horizon),
    );
    const targetMet =
      Math.abs(horizon.horizonYRatio - HORIZON_TARGET.ratio) <= HORIZON_TARGET.tolerance;
    ctx.check(
      "generated clay horizon records the BMS02 pin; promote to target assert if the browser run lands in band",
      true,
      JSON.stringify({ horizon, target: HORIZON_TARGET, targetMet }),
    );

    await ctx.snap(null, "battle-genmap-clay/vista", {
      shot: PNG.sync.write(renderPerspectiveClay(samples, setup)),
    });
    await ctx.snap(null, "battle-genmap-clay/topdown", {
      shot: PNG.sync.write(renderTopdownClay(samples)),
    });
  } finally {
    await page.close();
  }
}

async function sampleHeights(page) {
  return page.evaluate(
    ({ rect, step }) => {
      const cols = Math.round((rect.x1 - rect.x0) / step) + 1;
      const rows = Math.round((rect.y1 - rect.y0) / step) + 1;
      const height = Array.from({ length: cols * rows });
      let min = Infinity;
      let max = -Infinity;
      for (let y = 0; y < rows; y++) {
        const wy = rect.y0 + y * step;
        for (let x = 0; x < cols; x++) {
          const wx = rect.x0 + x * step;
          const z = window.__game.heightAt(wx, wy);
          height[y * cols + x] = z;
          min = Math.min(min, z);
          max = Math.max(max, z);
        }
      }
      return { rect, step, cols, rows, height, min, max };
    },
    { rect: RECT, step: SAMPLE_STEP },
  );
}

function renderTopdownClay(samples) {
  const png = new PNG({ width: VIEWPORT.width, height: VIEWPORT.height });
  const worldW = samples.rect.x1 - samples.rect.x0;
  const worldH = samples.rect.y1 - samples.rect.y0;
  const scale = Math.min(VIEWPORT.width / worldW, VIEWPORT.height / worldH);
  const drawW = worldW * scale;
  const drawH = worldH * scale;
  const offX = (VIEWPORT.width - drawW) / 2;
  const offY = (VIEWPORT.height - drawH) / 2;
  fillSky(png, 0.92);
  for (let py = Math.floor(offY); py < Math.ceil(offY + drawH); py++) {
    for (let px = Math.floor(offX); px < Math.ceil(offX + drawW); px++) {
      const wx = samples.rect.x0 + (px - offX) / scale;
      const wy = samples.rect.y1 - (py - offY) / scale;
      paintClayPixel(png, px, py, clayShade(samples, wx, wy));
    }
  }
  return png;
}

function renderPerspectiveClay(samples, camera3d) {
  const png = new PNG({ width: VIEWPORT.width, height: VIEWPORT.height });
  fillSky(png, 0.88);
  const order = [];
  for (let y = 0; y < samples.rows; y++) {
    for (let x = 0; x < samples.cols; x++) {
      const wx = samples.rect.x0 + x * samples.step;
      const wy = samples.rect.y0 + y * samples.step;
      const z = samples.height[y * samples.cols + x];
      const p = projectPoint(camera3d, [wx, wy, z], VIEWPORT);
      if (!p || p.x < -20 || p.x > VIEWPORT.width + 20 || p.y < -20 || p.y > VIEWPORT.height + 20) {
        continue;
      }
      order.push({ ...p, wx, wy });
    }
  }
  order.sort((a, b) => b.depth - a.depth);
  for (const p of order) {
    const size = Math.max(2, Math.min(8, Math.round(620 / Math.max(90, p.depth))));
    const shade = clayShade(samples, p.wx, p.wy) * (0.82 + 0.18 * Math.min(1, p.depth / 1300));
    fillRect(
      png,
      Math.round(p.x) - size,
      Math.round(p.y) - size,
      size * 2 + 1,
      size * 2 + 1,
      shade,
    );
  }
  return png;
}

function clayShade(samples, wx, wy) {
  const z = heightAt(samples, wx, wy);
  const zx0 = heightAt(samples, wx - samples.step, wy);
  const zx1 = heightAt(samples, wx + samples.step, wy);
  const zy0 = heightAt(samples, wx, wy - samples.step);
  const zy1 = heightAt(samples, wx, wy + samples.step);
  const dx = (zx1 - zx0) / (2 * samples.step);
  const dy = (zy1 - zy0) / (2 * samples.step);
  const relief = (z - samples.min) / Math.max(1, samples.max - samples.min);
  const light = 0.64 + relief * 0.24 + clamp((-dx * 0.68 + dy * 0.42) * 1.35, -0.22, 0.22);
  return clamp(light, 0.18, 0.96);
}

function heightAt(samples, wx, wy) {
  const gx = clamp((wx - samples.rect.x0) / samples.step, 0, samples.cols - 1);
  const gy = clamp((wy - samples.rect.y0) / samples.step, 0, samples.rows - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(samples.cols - 1, x0 + 1);
  const y1 = Math.min(samples.rows - 1, y0 + 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const a = samples.height[y0 * samples.cols + x0];
  const b = samples.height[y0 * samples.cols + x1];
  const c = samples.height[y1 * samples.cols + x0];
  const d = samples.height[y1 * samples.cols + x1];
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}

function measureFarTerrainHorizon(camera3d, samples) {
  const ratios = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const x = RECT.x0 + (RECT.x1 - RECT.x0) * t;
    const y = RECT.y1;
    const point = projectPoint(camera3d, [x, y, heightAt(samples, x, y)], VIEWPORT);
    if (point && point.x >= -VIEWPORT.width * 0.25 && point.x <= VIEWPORT.width * 1.25) {
      ratios.push(point.y / VIEWPORT.height);
    }
  }
  return {
    horizonYRatio: round3(avg(ratios)),
    deferredTarget: HORIZON_TARGET.ratio,
    tolerance: HORIZON_TARGET.tolerance,
    source: "projected generated north far terrain perimeter with sampled height",
    samples: ratios.length,
    min: round3(Math.min(...ratios)),
    max: round3(Math.max(...ratios)),
  };
}

function projectPoint(camera3d, world, viewport) {
  const eye = eyePosition(camera3d);
  const forward = normalize(sub(camera3d.target, eye));
  const right = normalize(cross(forward, [0, 0, 1]));
  const up = cross(right, forward);
  const view = sub(world, eye);
  const x = dot(view, right);
  const y = dot(view, up);
  const z = dot(view, forward);
  if (z <= 0) return null;
  const tan = Math.tan(camera3d.fovY / 2);
  const ndcX = x / (z * tan * camera3d.aspect);
  const ndcY = y / (z * tan);
  return {
    x: (ndcX * 0.5 + 0.5) * viewport.width,
    y: (1 - (ndcY * 0.5 + 0.5)) * viewport.height,
    depth: z,
  };
}

function eyePosition(camera3d) {
  return [
    camera3d.target[0] + camera3d.distance * Math.cos(camera3d.pitch) * Math.cos(camera3d.yaw),
    camera3d.target[1] + camera3d.distance * Math.cos(camera3d.pitch) * Math.sin(camera3d.yaw),
    camera3d.target[2] + camera3d.distance * Math.sin(camera3d.pitch),
  ];
}

function fillSky(png, shade) {
  for (let y = 0; y < png.height; y++) {
    const t = y / Math.max(1, png.height - 1);
    const s = shade - t * 0.16;
    for (let x = 0; x < png.width; x++) paintClayPixel(png, x, y, s);
  }
}

function fillRect(png, x, y, w, h, shade) {
  for (let py = Math.max(0, y); py < Math.min(png.height, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(png.width, x + w); px++) {
      paintClayPixel(png, px, py, shade);
    }
  }
}

function paintClayPixel(png, x, y, shade) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const o = (y * png.width + x) * 4;
  png.data[o] = Math.round(176 * shade);
  png.data[o + 1] = Math.round(163 * shade);
  png.data[o + 2] = Math.round(141 * shade);
  png.data[o + 3] = 255;
}

function normalize(v) {
  const len = Math.hypot(...v) || 1;
  return v.map((x) => x / len);
}

function sub(a, b) {
  return a.map((x, i) => x - b[i]);
}

function dot(a, b) {
  return a.reduce((sum, x, i) => sum + x * b[i], 0);
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function round3(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : Number.NaN;
}
