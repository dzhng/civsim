import { PNG } from "pngjs";

// The slice-08a parity gate: /renderer/photoreal-battle boots the SAME wasm
// battle world as the production battle page and renders the FULL world on
// the photoreal substrate. Asserts the stats identity fields (single owners),
// the soldier-count floor (buildCrowdInstances output = sim count), the
// seating tripwire (every soldier's elevation equals the shared heightfield
// sample — mirrors battle-terrain-elevation's mechanics), the sealed-edge/
// scenery/grass floors, the overlay ports (gold selection cues + effect
// lines), and fixed-time byte-determinism. On a hardware adapter it also runs
// the 30.5k full-world frame-time leg (budget 33 ms; SwiftShader is never a
// perf oracle).
export const meta = {
  name: "battle-photoreal-parity",
  kind: "flow",
  world: "battle-photoreal",
  tier: "full",
  snapshots: ["photoreal-parity"],
  describe: "Photoreal battle world at parity: identity, counts, seating, overlays, determinism.",
};

const SUBSTRATE = "threejs-webgpu-tsl";
const PROJECTION = "camera3d";
const FIXED_TIME = 0;
const PERF_BUDGET_MS = 33;
const SOLDIER_FLOOR = 15000;
const PERF_SOLDIER_FLOOR = 30000;

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("photoreal battle parity requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }
  const hardware = process.env.VERIFY_GPU_ADAPTER === "hardware";

  // --- The full map-A world at parity framing (crowd on screen) --------------
  {
    const page = await openRoute(
      ctx,
      `?map=A&t=${FIXED_TIME}&ref=1&select=1&fx=1&zoom=4.5&cx=0&cy=-650`,
      "parity",
    );
    const stats = await page.evaluate(() => window.__rendererLabStats);
    ctx.check(
      "identity fields assert the single owners",
      stats?.ok === true &&
        stats.substrate === SUBSTRATE &&
        stats.projection === PROJECTION &&
        stats.environment === "golden",
      JSON.stringify({
        substrate: stats?.substrate,
        projection: stats?.projection,
        environment: stats?.environment,
      }),
    );
    const rs = stats?.stats?.renderStats;
    ctx.check(
      "every sim soldier reaches the photoreal crowd (count identity + floor)",
      rs?.soldiers >= SOLDIER_FLOOR && rs.soldiers === rs.expectedSoldiers,
      JSON.stringify({ soldiers: rs?.soldiers, expected: rs?.expectedSoldiers }),
    );
    // The heightfield firewall tripwire (battle-terrain-elevation mechanics):
    // every instance's elevation must equal the shared terrainHeightAt sample,
    // and map A's relief must give the crowd a real span.
    ctx.check(
      "soldiers seat on the shared heightfield (match=true, real relief span)",
      rs?.seating?.matches === true && rs.seating.checked >= SOLDIER_FLOOR && rs.seating.span > 0.5,
      JSON.stringify(rs?.seating),
    );
    ctx.check(
      "the full world is assembled (ground + sealed edges + scenery + grass)",
      rs?.terrain?.groundTriangles > 100000 &&
        rs.terrain.sealedEdges.includes("west:cliff") &&
        rs.terrain.sealedEdges.includes("east:ocean") &&
        rs.terrain.scenery >= 500 &&
        rs.terrain.grass.layer === "photoreal-blade-field" &&
        rs.terrain.grass.recordCount > 1000 &&
        rs.terrain.grass.packedBytesPerRecord === 64 &&
        rs.terrain.grass.sourceStorageCore?.runtimeComputeRoute === "active",
      JSON.stringify(
        rs?.terrain && {
          groundTriangles: rs.terrain.groundTriangles,
          sealedEdges: rs.terrain.sealedEdges,
          scenery: rs.terrain.scenery,
          grass: rs.terrain.grass,
        },
      ),
    );
    ctx.check(
      "overlay ports carry the tactical-line contracts (gold rings + pie cues + effects)",
      rs?.tacticalLines?.rings?.rings >= 2 &&
        rs.tacticalLines.groundCues.lineSegments >= 10 &&
        rs.tacticalLines.effects.lineSegments >= 6,
      JSON.stringify(rs?.tacticalLines),
    );

    // Clipped page screenshots (photoreal-substrate pattern): a full frame
    // costs ~30 s of SwiftShader rasterization, so no element-stability wait.
    const clip = await page.locator("#renderer-canvas").boundingBox();
    const shotA = await page.screenshot({ clip, timeout: 180000 });
    const png = PNG.sync.read(shotA);
    const m = frameMetrics(png);
    ctx.check(
      "frame shows the world: olive field, blue crowd, gold selection glow",
      m.field > m.total * 0.3 && m.crowd > 200 && m.gold >= 10,
      JSON.stringify(m),
    );
    const shotB = await page.screenshot({ clip, timeout: 180000 });
    ctx.check(
      "fixed setTime renders byte-identical frames",
      Buffer.compare(shotA, shotB) === 0,
      JSON.stringify({ bytesA: shotA.length, bytesB: shotB.length }),
    );
    // Baselines are SwiftShader artifacts; a hardware run must not diff them.
    if (!hardware) await ctx.snap(page, "photoreal-parity", { shot: shotA });
    await page.close();
  }

  // --- Hardware frame-time leg: the FULL world at 30.5k ----------------------
  if (hardware) {
    const page = await openRoute(
      ctx,
      "?map=A&count=30500&zoom=4.5&cx=0&cy=-650&ref=1",
      "parity-perf",
    );
    await page.waitForFunction(
      () =>
        window.__rendererLabStats?.stats?.frames >= 120 &&
        window.__rendererLabStats?.stats?.gpuTimeMs !== null,
      undefined,
      { timeout: 60000 },
    );
    const s = await page.evaluate(() => window.__rendererLabStats.stats);
    ctx.check(
      `full world at 30.5k holds the ${PERF_BUDGET_MS} ms budget on hardware`,
      s.renderStats.soldiers >= PERF_SOLDIER_FLOOR &&
        s.medianMs !== null &&
        s.medianMs <= PERF_BUDGET_MS &&
        s.gpuTimeMs <= PERF_BUDGET_MS,
      JSON.stringify({
        soldiers: s.renderStats.soldiers,
        medianMs: s.medianMs,
        p95Ms: s.p95Ms,
        gpuTimeMs: s.gpuTimeMs,
        drawCalls: s.drawCalls,
      }),
    );
    await page.close();
  } else {
    ctx.check(
      "SwiftShader is not a perf oracle: 30.5k ms leg skipped by name",
      true,
      "hardware-only",
    );
  }
}

async function openRoute(ctx, query, errorPrefix) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix });
  await page.goto(`${ctx.target}/renderer/photoreal-battle${query}`);
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.ok === true &&
      window.__rendererLabStats?.route === "photoreal-battle",
    undefined,
    { timeout: 180000 },
  );
  await page.waitForTimeout(400);
  return page;
}

function frameMetrics(png) {
  let field = 0;
  let crowd = 0;
  let gold = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    if (g > 90 && g > b + 30 && r > 80 && r < 200) field++;
    if (b > r + 24 && b > g + 8 && b > 90) crowd++;
    if (r > 200 && g > 140 && g < 240 && b < 130) gold++;
  }
  return { field, crowd, gold, total: png.width * png.height };
}
