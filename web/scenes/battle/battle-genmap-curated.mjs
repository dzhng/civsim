import { battleRendererReady } from "../worlds.mjs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { createServer } from "vite";
import { VIEWPORT, VISTA_CAMERA } from "./battle-map-style.mjs";

const CATALOG_PATH = fileURLToPath(
  new URL("../../../packages/game-renderer/src/battle/mapCatalog.ts", import.meta.url),
);

export const meta = {
  name: "battle-genmap-curated",
  kind: "visual",
  world: "battle-generated-curated-vistas",
  tier: "full",
  snapshots: [
    "battle-genmap-curated/shore-and-crags",
    "battle-genmap-curated/highland-vale",
    "battle-genmap-curated/wooded-pass",
  ],
  describe:
    "Curated generated maps boot as pinned seeds, use catalog names, and snap golden-hour vista beauty baselines.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("curated generated map vistas require browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  // Load the real neutral catalog in Node; a production build has no /@fs route.
  const source = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null },
    appType: "custom",
  });
  try {
    const catalog = await source.ssrLoadModule(CATALOG_PATH);
    for (const id of ["shore-and-crags", "highland-vale", "wooded-pass"]) {
      await gate(ctx, id, catalog);
    }
  } finally {
    await source.close();
  }
}

async function gate(ctx, id, catalog) {
  const page = await ctx.newPage({
    viewport: VIEWPORT,
    errorPrefix: `battle-genmap-curated-${id}`,
  });
  try {
    const def = catalog.CURATED_GENERATED_BATTLE_MAP_SEEDS.find((entry) => entry.id === id);
    if (!def) throw new Error(`missing curated generated map entry ${id}`);
    await boot(page, ctx.target, def.seed);
    const manifest = await page.evaluate(() => window.__game.generatedManifest());
    const entry = catalog.CURATED_GENERATED_BATTLE_MAP_CATALOG.find((item) => item.id === id);
    const rebuilt = catalog.generatedBattleMapEntry(manifest, {
      id: def.id,
      label: def.label,
      description: def.description,
    });
    const wiring = { def, entry, manifest, rebuilt };
    ctx.check(
      `${id} curated catalog entry names the loaded generated seed`,
      wiring.def?.label === wiring.entry?.label &&
        wiring.entry?.label === wiring.rebuilt?.label &&
        String(wiring.entry?.generatedSeed) === String(wiring.def?.seed) &&
        String(wiring.manifest?.seed) === String(wiring.def?.seed),
      JSON.stringify(wiring),
    );
    ctx.check(
      `${id} curated catalog edge roles come from the generated manifest path`,
      // Key-order-insensitive: the catalog literal and the wasm manifest
      // serialize the same roles in different key orders.
      edgesEqual(wiring.entry?.edges, wiring.manifest?.edges) &&
        edgesEqual(wiring.rebuilt?.edges, wiring.manifest?.edges),
      JSON.stringify({
        catalog: wiring.entry?.edges,
        rebuilt: wiring.rebuilt?.edges,
        manifest: wiring.manifest?.edges,
      }),
    );

    const terrain = await page.evaluate(() => window.__game.terrainDebug());
    ctx.check(
      `${id} generated certificates stay green in the browser`,
      terrain.certificates?.westSealed > 0.9 &&
        terrain.certificates?.eastSealed > 0.9 &&
        terrain.certificates?.southOpen > 0.6 &&
        terrain.certificates?.northOpen > 0.6 &&
        terrain.certificates?.southDeployPassable > 0.99 &&
        terrain.certificates?.northDeployPassable > 0.99 &&
        terrain.certificates?.corridor === true &&
        terrain.certificates?.westFlankUnreachable > 0.95 &&
        terrain.certificates?.eastFlankUnreachable > 0.95,
      JSON.stringify(terrain.certificates),
    );

    const pose = await poseVista(page);
    ctx.check(`${id} presents the requested vista camera`, pose.matches, JSON.stringify(pose));
    const stats = await page.evaluate(() => window.__game.stats().renderStats);
    ctx.check(
      `${id} uses the production TypeGPU renderer`,
      stats?.substrate === "typegpu",
      stats?.substrate,
    );
    ctx.check(
      `${id} renders under the generated-map golden-hour default`,
      stats?.environment === "golden" &&
        stats?.terrain?.vista?.bands?.some((band) => band.name === "farFog"),
      JSON.stringify({
        environment: stats?.environment,
        vista: stats?.terrain?.vista,
      }),
    );

    const shot = await canvasShot(page);
    const pixels = framePixels(PNG.sync.read(shot));
    ctx.check(
      `${id} vista frame contains terrain and sky`,
      pixels.nonBlack > 200000 && pixels.terrain > 25000 && pixels.sky > 30000,
      JSON.stringify(pixels),
    );
    await ctx.snap(null, `battle-genmap-curated/${id}`, { shot });
  } finally {
    await page.close();
  }
}

async function boot(page, target, seed) {
  await page.goto(`${target}/?map=gen&seed=${seed}&ai=off`);
  await battleRendererReady(page, 180000);
  await page.waitForFunction(
    () => {
      const terrain = window.__game?.stats?.().renderStats?.terrain;
      return (
        terrain?.installed === true && !terrain.replacing && terrain.vista?.bands?.length === 2
      );
    },
    undefined,
    { timeout: 180000 },
  );
  await page.evaluate((tick) => window.__game.freezeAtTick(tick), VISTA_CAMERA.ticks);
  await page.waitForTimeout(250);
}

async function poseVista(page) {
  const previousFrame = await page.evaluate(
    () => window.__game.stats().renderStats.presentedFrameId,
  );
  const requested = await page.evaluate(
    ({ x, y, zoom, yaw }) => {
      const api = window.__game;
      api.setCamera(x, y, zoom, yaw);
      const rig = window.__cam.params();
      // Keep the top ray above the horizon with the production lens.
      const skyMargin = 0.12;
      const pitch = rig.fovY / 2 - skyMargin;
      api.setCamera(x, y, zoom, yaw, pitch);
      return { x, y, zoom, yaw, pitch, fovY: rig.fovY, distance: rig.distance, skyMargin };
    },
    {
      x: VISTA_CAMERA.cx,
      y: VISTA_CAMERA.cy,
      zoom: VISTA_CAMERA.zoom,
      yaw: VISTA_CAMERA.camYaw,
    },
  );
  // A camera mutation does not synchronously publish a completed GPU frame.
  // Wait for the exact submitted pose rather than photographing the old overview.
  const matches = await page
    .waitForFunction(
      ({ requested, previousFrame }) => {
        const stats = window.__game.stats().renderStats;
        const camera = stats.camera;
        const pose = camera?.camera3d;
        return (
          stats.presentedFrameId !== previousFrame &&
          pose &&
          Math.abs(camera.zoom - requested.zoom) < 1e-6 &&
          Math.abs(pose.target[0] - requested.x) < 1e-6 &&
          Math.abs(pose.target[1] - requested.y) < 1e-6 &&
          Math.abs(pose.yaw - requested.yaw) < 1e-6 &&
          Math.abs(pose.pitch - requested.pitch) < 1e-6 &&
          Math.abs(pose.fovY - requested.fovY) < 1e-6 &&
          Math.abs(pose.distance - requested.distance) < 1e-6
        );
      },
      { requested, previousFrame },
      { timeout: 180000 },
    )
    .then(
      () => true,
      () => false,
    );
  return page.evaluate(
    ({ requested, previousFrame, matches }) => ({
      requested,
      previousFrame,
      matches,
      mutable: {
        zoom: window.__cam.zoom,
        pitch: window.__cam.pitch,
        yaw: window.__cam.yaw,
        center: window.__cam.viewCenter(),
        params: window.__cam.params(),
      },
      submitted: window.__game.stats().renderStats.camera,
      presentedFrame: window.__game.stats().renderStats.presentedFrameId,
    }),
    { requested, previousFrame, matches },
  );
}

async function canvasShot(page) {
  return page.screenshot({
    clip: await page.locator("#battlefield").boundingBox(),
    timeout: 180000,
  });
}

function framePixels(png) {
  let nonBlack = 0;
  let terrain = 0;
  let sky = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    if (r + g + b > 18) nonBlack++;
    if ((g > 70 && g >= r - 20 && b < 155) || (r > 95 && g > 82 && b < 135)) terrain++;
    if (r > 150 && g > 160 && b > 165 && Math.abs(r - g) < 28 && Math.abs(g - b) < 38) sky++;
  }
  return { nonBlack, terrain, sky };
}

function edgesEqual(a, b) {
  if (!a || !b) return false;
  const sides = ["north", "south", "west", "east"];
  return sides.every((side) => a[side] === b[side]);
}
