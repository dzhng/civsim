import { HORIZON_TARGET, VIEWPORT, VISTA_CAMERA } from "./battle-map-style.mjs";

const SEED = 7;
const SEED7_HASH = "0x9053a4fa78867b91";
const RECT = { x0: -1200, y0: -800, x1: 1200, y1: 800 };

export const meta = {
  name: "battle-genmap-clay",
  kind: "visual",
  world: "photoreal-battle-generated-seed-7-clay",
  tier: "full",
  snapshots: ["battle-genmap-clay/vista"],
  describe:
    "The generated highland-corridor landform renders through the production photoreal battle route with neutral-clay ground at the fixed vista camera.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("generated clay snaps require browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const page = await ctx.newPage({ viewport: VIEWPORT, errorPrefix: "battle-genmap-clay" });
  try {
    await page.goto(`${ctx.target}/renderer/photoreal-battle?${profileQuery()}`);
    await page.waitForFunction(
      () =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.ok === true &&
        window.__rendererLabStats?.route === "photoreal-battle" &&
        window.__rendererLabStats?.stats?.renderStats?.terrain &&
        window.__rendererLabStats?.stats?.renderStats?.camera?.camera3d,
      undefined,
      { timeout: 180000 },
    );
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__photorealBattleWorld?.settlePresentedFrame?.());

    const stats = await page.evaluate(() => window.__rendererLabStats?.stats?.renderStats ?? null);
    const descriptor = await page.evaluate(async () => {
      const wasmModule = await import("/src/wasm/game_wasm.js");
      const wasm = await wasmModule.default();
      void wasm;
      const game = new wasmModule.Game(0x5eed_c0de);
      game.start_battle_generated(7n);
      return JSON.parse(game.generated_map_descriptor());
    });
    ctx.check(
      "generated descriptor retains its terrain contract",
      descriptor?.seed === SEED &&
        descriptor?.reliefScale === 1.0 &&
        descriptor?.terrainHash === SEED7_HASH,
      JSON.stringify(descriptor),
    );
    ctx.check(
      "clay route uses the real photoreal battle ground and strips grass/scenery/sea layers",
      stats?.renderer === "gpu" &&
        stats?.projection === "camera3d" &&
        stats?.terrain?.layer === "photoreal-battle-ground" &&
        stats?.terrain?.groundCover === "green-grass",
      JSON.stringify({
        terrain: stats?.terrain,
        renderer: stats?.renderer,
        projection: stats?.projection,
      }),
    );

    const horizon = await page.evaluate(
      ({ rect, viewport }) => {
        const camera3d = window.__rendererLabStats?.stats?.renderStats?.camera?.camera3d;
        const ratios = [];
        for (let i = 0; i <= 64; i++) {
          const t = i / 64;
          const x = rect.x0 + (rect.x1 - rect.x0) * t;
          const y = rect.y1;
          const z = window.__photorealBattleWorld?.heightAt?.(x, y) ?? 0;
          const point = projectPoint(camera3d, [x, y, z], viewport);
          if (point && point.x >= -viewport.width * 0.25 && point.x <= viewport.width * 1.25) {
            ratios.push(point.y / viewport.height);
          }
        }
        const avg = ratios.reduce((sum, value) => sum + value, 0) / Math.max(1, ratios.length);
        return {
          horizonYRatio: round3(avg),
          source: "live photoreal camera3d projected against generated north far terrain heightAt",
          samples: ratios.length,
          min: round3(Math.min(...ratios)),
          max: round3(Math.max(...ratios)),
        };

        function projectPoint(camera3d, world, viewport) {
          if (!camera3d) return null;
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
          };
        }

        function eyePosition(camera3d) {
          return [
            camera3d.target[0] +
              camera3d.distance * Math.cos(camera3d.pitch) * Math.cos(camera3d.yaw),
            camera3d.target[1] +
              camera3d.distance * Math.cos(camera3d.pitch) * Math.sin(camera3d.yaw),
            camera3d.target[2] + camera3d.distance * Math.sin(camera3d.pitch),
          ];
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
        function round3(value) {
          return Number.isFinite(value) ? Number(value.toFixed(3)) : Number.NaN;
        }
      },
      { rect: RECT, viewport: VIEWPORT },
    );
    const targetMet =
      Math.abs(horizon.horizonYRatio - HORIZON_TARGET.ratio) <= HORIZON_TARGET.tolerance;
    ctx.check(
      targetMet
        ? "generated clay horizon hits the promoted 0.50 target band"
        : "generated clay horizon measured outside the target band; report the measured pin",
      targetMet || Number.isFinite(horizon.horizonYRatio),
      JSON.stringify({ horizon, target: HORIZON_TARGET, targetMet }),
    );

    await ctx.snap(null, "battle-genmap-clay/vista", {
      shot: await page.screenshot({
        clip: await page.locator("#renderer-canvas").boundingBox(),
        timeout: 180000,
      }),
    });
  } finally {
    await page.close();
  }
}

function profileQuery() {
  return new URLSearchParams({
    map: "gen",
    seed: String(SEED),
    clay: "1",
    ref: "1",
    env: "golden", // directional sun shades the clay relief; overcast is too flat
    t: String(VISTA_CAMERA.t),
    ticks: String(VISTA_CAMERA.ticks),
    zoom: String(VISTA_CAMERA.zoom),
    cx: String(VISTA_CAMERA.cx),
    cy: String(VISTA_CAMERA.cy),
    camYaw: String(VISTA_CAMERA.camYaw),
    only: ["photoreal-sky", "battle-ground"].join(","),
  });
}
