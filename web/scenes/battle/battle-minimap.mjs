import { PNG } from "pngjs";
import { hasBattleWorldDepthContract } from "../_renderer-contract.mjs";
import { battle5v5 } from "../worlds.mjs";

export const meta = {
  name: "battle-minimap",
  kind: "visual",
  world: "battle-5v5",
  tier: "quick",
  snapshots: ["battle-minimap-world-dpr2"],
  describe: "Production WebGPU battle minimap click and terrain-feature consistency at DPR2.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "requires WebGPU browser flags",
      true,
      "set VERIFY_GPU=1 to capture WebGPU minimap/world consistency",
    );
    return;
  }

  const page = await battle5v5(ctx, {
    deviceScaleFactor: 2,
    errorPrefix: "renderer-battle-minimap-dpr2",
    ai: "off",
  });

  // Zoom IN for the click-navigation check: at the whole-map overview zoom the
  // view already covers the field, so clampView pins the camera to centre and a
  // minimap click cannot move it. A gameplay (non-overview) zoom leaves room to
  // recentre, which is the behaviour a player actually exercises. The zoom scale
  // is DPR-dependent (it tracks on-screen soldier size), so a value that's a
  // close vista at DPR1 can still be the pinned overview at this DPR2 capture:
  // zoom 20 clears the overview pitch threshold here where zoom 10 did not.
  await page.evaluate(() => {
    window.__cam.zoom = 20.0;
    window.__cam.yaw = 0;
    window.__cam.clampView?.();
  });
  await page.waitForTimeout(120);

  const terrain = await page.evaluate(() => window.__game.terrainDebug());
  const forest = terrain.features.forest;
  const mud = terrain.features.mud;
  ctx.check(
    "battle terrain debug exposes shared minimap/WebGPU feature centers",
    forest?.cells > 100 && mud?.cells > 100,
    JSON.stringify(terrain),
  );

  const forestCamera = await clickMinimapFeature(page, forest);
  const mudCamera = await clickMinimapFeature(page, mud);
  const clickTolerance = terrain.cell;
  ctx.check(
    "minimap feature clicks move the WebGPU camera to matching world positions",
    near(forestCamera.x, forest.x, clickTolerance) &&
      near(forestCamera.y, forest.y, clickTolerance) &&
      near(mudCamera.x, mud.x, clickTolerance) &&
      near(mudCamera.y, mud.y, clickTolerance),
    JSON.stringify({ clickTolerance, forest, forestCamera, mud, mudCamera }),
  );

  // Back to the whole-field overview for the snapshot.
  await page.evaluate(() => {
    window.__cam.zoom = 3.0;
    window.__cam.clampView?.();
  });

  await page.evaluate(() => window.__game.freezeAtTick(72));
  await page.waitForTimeout(250);
  const state = await page.evaluate(() => window.__game.stats());
  ctx.check(
    "WebGPU battle minimap scene uses sim-sourced terrain and shared depth contract",
    state.renderer === "gpu" &&
      hasBattleWorldDepthContract(state.renderStats) &&
      state.renderStats?.terrain?.fixture === "sim-tint" &&
      state.renderStats.terrain.layer === "photoreal-battle-ground" &&
      state.renderStats.terrain.groundTriangles > 1000 &&
      state.renderStats.terrain.scenery > 0,
    JSON.stringify(state.renderStats),
  );

  const shot = await page.screenshot();
  const metrics = minimapWorldMetrics(PNG.sync.read(shot));
  ctx.check(
    "WebGPU battle minimap scene has visible world feature, minimap, HUD, and army mass",
    metrics.mudFeaturePixels > 800 &&
      metrics.minimapPixels > 5000 &&
      metrics.darkHud > 15000 &&
      metrics.crowdMass > 500,
    JSON.stringify(metrics),
  );
  await ctx.snap(page, "battle-minimap-world-dpr2", { shot });
  await page.close();
}

async function clickMinimapFeature(page, feature) {
  const point = await page.evaluate((feature) => {
    const minimap = document.getElementById("minimap");
    const rect = minimap.getBoundingClientRect();
    return {
      x: rect.left + (feature.miniX / minimap.width) * rect.width,
      y: rect.top + (feature.miniY / minimap.height) * rect.height,
    };
  }, feature);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(120);
  // The camera moved to the feature when the screen-centre ground point (viewCenter)
  // lands on it — cam.x/y is offset from that by the perspective look-ahead.
  return page.evaluate(() => {
    const [x, y] = window.__cam.viewCenter();
    return { x, y, zoom: window.__cam.zoom };
  });
}

function near(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

function minimapWorldMetrics(png) {
  let mudFeaturePixels = 0;
  let minimapPixels = 0;
  let darkHud = 0;
  let crowdMass = 0;
  const centerX0 = Math.floor(png.width * 0.28);
  const centerX1 = Math.floor(png.width * 0.72);
  const centerY0 = Math.floor(png.height * 0.18);
  const centerY1 = Math.floor(png.height * 0.72);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      if (a < 16) continue;
      if (x >= centerX0 && x <= centerX1 && y >= centerY0 && y <= centerY1) {
        if (r > 75 && r < 155 && g > 65 && g < 145 && b > 45 && b < 125 && r >= g * 0.85)
          mudFeaturePixels++;
      }
      if (x > png.width * 0.78 && y > png.height * 0.72 && g > 70 && g > r * 0.75 && b < 125)
        minimapPixels++;
      if (y > png.height * 0.7 && r < 70 && g < 75 && b < 85) darkHud++;
      if (y < png.height * 0.7 && isCrowdMass(r, g, b)) crowdMass++;
    }
  }
  return {
    width: png.width,
    height: png.height,
    mudFeaturePixels,
    minimapPixels,
    darkHud,
    crowdMass,
  };
}

function isCrowdMass(r, g, b) {
  const luma = r * 0.3 + g * 0.59 + b * 0.11;
  const greenField = g > r + 22 && g > b + 12;
  return luma > 34 && luma < 132 && r < 165 && g < 155 && b < 145 && !greenField;
}
