import { PNG } from "pngjs";
import { campaign, campaignPresentationReady } from "../worlds.mjs";

export const meta = {
  name: "water-sea",
  kind: "visual",
  world: "campaign-real",
  tier: "full",
  snapshots: ["water/campaign-sea-near", "water/campaign-sea-far"],
  describe:
    "Production campaign water motion stays offshore, returns exactly, and remains calm at strategic distance.",
};

const VIEWS = [
  ["near", 1131, -686, 2.2],
  ["far", -100, 250, 0.16],
];

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("water-sea requires browser GPU flags", true, "set VERIFY_GPU=1 to capture");
    return;
  }
  const page = await campaign(ctx, "new", {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "water-sea",
  });
  try {
    await page.evaluate(() => {
      window.__campaign.freeze(true);
      window.__campaign.factionView(false);
      window.__campaign.fogOfWar(false);
      window.__campaign.select(-1);
    });
    for (const [name, x, y, scale] of VIEWS) {
      await page.evaluate(([x, y, scale]) => window.__campaign.cam(x, y, scale), [x, y, scale]);
      await campaignPresentationReady(page);
      const mask = await sourceMask(page);
      const first = await capture(page, 0);
      const moved = await capture(page, 3);
      const returned = await capture(page, 0);
      const a = PNG.sync.read(first),
        b = PNG.sync.read(moved);
      const metrics = motion(a, b, mask);
      ctx.check(
        `${name}: source mask covers both dry ground and water`,
        metrics.land > 50000 && metrics.water > 50000,
        JSON.stringify(metrics),
      );
      ctx.check(
        `${name}: returning the injected production clock restores exact pixels`,
        a.data.equals(PNG.sync.read(returned).data),
      );
      if (name === "near") {
        ctx.check(
          "campaign-sea: a real band of near water moves and classified motion stays offshore",
          metrics.waterMoved > 2000 &&
            metrics.waterMoved / Math.max(1, metrics.classifiedMoved) > 0.9,
          JSON.stringify(metrics),
        );
      } else {
        ctx.check(
          "campaign-sea: strategic distance remains calm",
          metrics.moved < 400,
          JSON.stringify(metrics),
        );
      }
      await ctx.snap(null, `water/campaign-sea-${name}`, {
        shot: name === "near" ? moved : first,
        threshold: 0,
        maxDiffRatio: 0,
      });
    }
  } finally {
    await page.close();
  }
}

async function capture(page, time) {
  await page.evaluate(async (time) => {
    const api = window.__campaign;
    const renderer = api.rendererOwner();
    renderer.fixedTime = time;
    const cam = api.camGet();
    api.cam(cam.x, cam.y, cam.scale);
    const world = renderer.world;
    const revision = world.stats().surfaceRevision;
    await world.world.settlePresentedFrame();
    if (revision !== world.stats().surfaceRevision || !renderer.stats().residency.ready)
      throw new Error("Terrain changed during production water capture");
    if (!world.stats().water.sourceShore)
      throw new Error("Production water is missing the canonical source shore");
  }, time);
  return page.locator("#campaign-canvas").screenshot({ timeout: 180000 });
}

// Classify through the actual camera and source mask, independently of water's
// colour. Leave a two-cell coastal margin unclassified so silhouettes and
// antialiasing cannot misclassify shore motion. Compare the water fraction only
// within this classified domain; retain whole-canvas and excluded motion telemetry.
async function sourceMask(page) {
  return page.evaluate(() => {
    const api = window.__campaign;
    const canvas = document.querySelector("#campaign-canvas");
    const renderer = api.rendererOwner();
    const rect = renderer.data.bgRect;
    const step = 4;
    const columns = Math.floor(canvas.width / step),
      rows = Math.floor(canvas.height / step);
    const classes = [];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++) {
        const [wx, wy] = api.screenToWorld(x * step + step / 2, y * step + step / 2);
        classes.push(
          wx < rect.min[0] || wx > rect.max[0] || wy < rect.min[1] || wy > rect.max[1]
            ? 0
            : renderer.field.renderWaterAt(wx, wy)
              ? 2
              : 1,
        );
      }
    const cells = [];
    for (let y = 2; y < rows - 2; y++)
      for (let x = 2; x < columns - 2; x++) {
        const kind = classes[y * columns + x];
        if (kind === 0) continue;
        let interior = true;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++)
            if (classes[(y + dy) * columns + x + dx] !== kind) interior = false;
        if (interior) cells.push([x * step, y * step, kind]);
      }
    return { step, cells };
  });
}

function motion(a, b, mask) {
  const out = {
    moved: 0,
    waterMoved: 0,
    landMoved: 0,
    landChanged: 0,
    classifiedMoved: 0,
    unclassifiedMoved: 0,
    classifiedWaterMotionRatio: 0,
    wholeCanvasWaterMotionRatio: 0,
    water: 0,
    land: 0,
  };
  for (let i = 0; i < a.data.length; i += 4)
    if (
      Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]) >
      6
    )
      out.moved++;
  for (const [x, y, kind] of mask.cells)
    for (let dy = 0; dy < mask.step; dy++)
      for (let dx = 0; dx < mask.step; dx++) {
        const i = ((y + dy) * a.width + x + dx) * 4;
        const delta =
          Math.abs(a.data[i] - b.data[i]) +
          Math.abs(a.data[i + 1] - b.data[i + 1]) +
          Math.abs(a.data[i + 2] - b.data[i + 2]);
        if (kind === 1) {
          out.land++;
          if (delta !== 0) out.landChanged++;
          if (delta > 6) out.landMoved++;
        } else {
          out.water++;
          if (delta > 6) out.waterMoved++;
        }
      }
  out.classifiedMoved = out.waterMoved + out.landMoved;
  out.unclassifiedMoved = out.moved - out.classifiedMoved;
  out.classifiedWaterMotionRatio = out.waterMoved / Math.max(1, out.classifiedMoved);
  out.wholeCanvasWaterMotionRatio = out.waterMoved / Math.max(1, out.moved);
  return out;
}
