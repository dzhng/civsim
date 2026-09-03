import { PNG } from "pngjs";
import { campaign } from "../worlds.mjs";

export const meta = {
  name: "campaign-map-alignment",
  kind: "visual",
  world: "campaign-alignment",
  tier: "quick",
  snapshots: [
    "campaign-map-alignment-wide",
    "campaign-map-alignment-close",
    "campaign-map-alignment-pan",
  ],
  describe:
    "Synthetic campaign map proving land/water mask, cities, roads, and camera projection stay aligned.",
};

const LAND_POINTS = [
  ["Roma", -62, 18],
  ["Tibur", -28, 22],
  ["Narnia", -42, 46],
  ["Ostia/Portus", -76, -8],
  ["clear land", -20, -28],
];

const WATER_POINTS = [
  ["sea center", 72, 5],
  ["sea north", 84, 42],
  ["sea south", 82, -34],
];

const CAMERAS = [
  ["wide", -10, 8, 4.8],
  ["close", 8, 8, 9.6],
  ["pan", 12, 6, 6.4],
];

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "campaign map alignment scene requires VERIFY_GPU=1",
      true,
      "set VERIFY_GPU=1 to exercise the WebGPU campaign adapter",
    );
    return;
  }

  const page = await campaign(ctx, "alignment", {
    viewport: { width: 1280, height: 800 },
    errorPrefix: "campaign-map-alignment",
    timeout: 30000,
  });
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.factionView(true);
    window.__campaign.fogOfWar(false);
    window.__campaign.select(-1);
  });

  const stats = await page.evaluate(() => window.__campaignGpuStats);
  ctx.check(
    "campaign water is mask-bound, not a freehand overlay pass",
    stats.waterLayer === "map-sea-mask" &&
      stats.waterFeatures === 0 &&
      !stats.phases?.some((phase) => phase.passIds?.includes("campaign-water")),
    JSON.stringify(stats),
  );

  const terrain = await page.evaluate(
    ({ land, water }) => ({
      land: land.map(([name, x, y]) => [name, window.__campaign.terrainAt(x, y)]),
      water: water.map(([name, x, y]) => [name, window.__campaign.terrainAt(x, y)]),
    }),
    { land: LAND_POINTS, water: WATER_POINTS },
  );
  ctx.check(
    "fixture semantic terrain samples match authored mask",
    terrain.land.every(([, sample]) => sample.land === true) &&
      terrain.water.every(([, sample]) => sample.land === false),
    JSON.stringify(terrain),
  );

  for (const [name, x, y, scale] of CAMERAS) {
    await page.evaluate(([cx, cy, zoom]) => window.__campaign.cam(cx, cy, zoom), [x, y, scale]);
    await page.waitForTimeout(320);
    const pixels = await sampleFrame(page);
    ctx.check(
      `${name} camera keeps land visibly non-water and sea visibly blue`,
      pixels.land.every((sample) => sample.kind === "land") &&
        pixels.water.every((sample) => sample.kind === "water"),
      JSON.stringify(pixels),
    );
    await ctx.snap(page, `campaign-map-alignment-${name}`);
  }

  await page.close();
}

async function sampleFrame(page) {
  const projected = await page.evaluate(
    ({ land, water }) => {
      const project = ([name, x, y]) => {
        const [sx, sy] = window.__campaign.project(x, y);
        return { name, sx, sy };
      };
      return {
        land: land.map(project),
        water: water.map(project),
      };
    },
    { land: LAND_POINTS.slice(-1), water: WATER_POINTS.slice(0, 1) },
  );
  const image = PNG.sync.read(await page.screenshot());
  const read = (point) => {
    const x = Math.max(0, Math.min(image.width - 1, Math.round(point.sx)));
    const y = Math.max(0, Math.min(image.height - 1, Math.round(point.sy)));
    const o = (y * image.width + x) * 4;
    const r = image.data[o];
    const g = image.data[o + 1];
    const b = image.data[o + 2];
    const blueDominance = b - Math.max(r, g * 0.88);
    return {
      ...point,
      x,
      y,
      rgb: [r, g, b],
      kind: blueDominance > 20 ? "water" : "land",
    };
  };
  return {
    land: projected.land.map(read),
    water: projected.water.map(read),
  };
}
