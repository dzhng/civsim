import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
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
    "BMS18-SLICE-F7C3: curated generated maps boot as pinned generated seeds, use catalog names, and snap golden-hour vista beauty baselines.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("curated generated map vistas require browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  for (const id of ["shore-and-crags", "highland-vale", "wooded-pass"]) {
    await gate(ctx, id);
  }
}

async function gate(ctx, id) {
  const page = await ctx.newPage({
    viewport: VIEWPORT,
    errorPrefix: `battle-genmap-curated-${id}`,
  });
  try {
    const catalog = await catalogEntry(page, ctx.target, id);
    await boot(page, ctx.target, catalog.seed);
    const wiring = await page.evaluate(
      async ({ catalogPath, id }) => {
        const mod = await import(`/@fs${catalogPath}`);
        const def = mod.CURATED_GENERATED_BATTLE_MAP_SEEDS.find((entry) => entry.id === id);
        const entry = mod.CURATED_GENERATED_BATTLE_MAP_CATALOG.find((item) => item.id === id);
        const manifest = window.__game.generatedManifest();
        const rebuilt = mod.generatedBattleMapEntry(manifest, {
          id: def?.id,
          label: def?.label,
          description: def?.description,
        });
        return { def, entry, manifest, rebuilt };
      },
      { catalogPath: CATALOG_PATH, id },
    );
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

    await poseVista(page);
    const stats = await page.evaluate(() => window.__game.stats().renderStats);
    ctx.check(
      `${id} renders under the generated-map golden-hour default`,
      stats?.environment === "golden" &&
        stats?.terrain?.environment?.id === "golden-hour" &&
        stats?.terrain?.environment?.source === "CIVSIM_ENVIRONMENTS.golden" &&
        stats?.terrain?.vista?.bands?.some((band) => band.name === "farFog"),
      JSON.stringify({
        environment: stats?.environment,
        terrainEnvironment: stats?.terrain?.environment,
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

async function catalogEntry(page, target, id) {
  await page.goto(target);
  await page.waitForFunction(() => document.readyState === "complete", undefined, {
    timeout: 20000,
  });
  const entry = await page.evaluate(
    async ({ catalogPath, id }) => {
      const mod = await import(`/@fs${catalogPath}`);
      return mod.CURATED_GENERATED_BATTLE_MAP_SEEDS.find((candidate) => candidate.id === id);
    },
    { catalogPath: CATALOG_PATH, id },
  );
  if (!entry) throw new Error(`missing curated generated map entry ${id}`);
  return entry;
}

async function boot(page, target, seed) {
  await page.goto(`${target}/?map=gen&seed=${seed}&ai=off`);
  await page.waitForFunction(
    () =>
      window.__ready === true &&
      window.__game?.stats?.().renderStats?.terrain?.vista?.bands?.length === 2,
    undefined,
    { timeout: 180000 },
  );
  await page.evaluate((tick) => window.__game.freezeAtTick(tick), VISTA_CAMERA.ticks);
  await page.waitForTimeout(250);
}

async function poseVista(page) {
  await page.evaluate(
    ({ x, y, zoom, yaw, pitch }) => window.__game.setCamera(x, y, zoom, yaw, pitch),
    {
      x: VISTA_CAMERA.cx,
      y: VISTA_CAMERA.cy,
      zoom: VISTA_CAMERA.zoom,
      yaw: VISTA_CAMERA.camYaw,
      pitch: 0.305,
    },
  );
  await page.waitForTimeout(250);
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
