import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

export const meta = {
  name: "shared-prop-models",
  kind: "visual",
  world: "shared-prop-models",
  tier: "full",
  snapshots: [
    "shared/props/trees",
    "shared/props/conifer",
    "shared/props/broadleaf",
    "shared/props/ash",
    "shared/props/aspen",
    "shared/props/bush",
    "shared/props/rocks",
    "shared/props/mountain",
    "shared/props/cart",
  ],
  describe:
    "Captures shared reusable scenery prop baselines (trees, rocks, mountains, carts) under web/shots/models/shared/props from the shared prop registry.",
};

// Each prop family alone on neutral ground. Thresholds gate that the silhouette
// actually renders (foliage/stone/wood), not merely that the frame is non-blank.
// Tree floors sit at ~60% of what the ez-tree generated meshes measure: their
// tapered cylindrical trunks show far fewer wood-hue pixels than the old box
// trunks did, and the cypress conifer hides its trunk inside the foliage column.
const CONTENT_REQUIREMENTS = {
  // Foliage floors sit at ~60% of what the alpha-cutout canopies measure:
  // cutout leaves show far fewer opaque pixels than solid quads did, and the
  // dark pine needles mostly fall outside the green-hue window entirely.
  trees: { foliageRatio: 0.03, trunkRatio: 0.001 },
  // The pine trunk is deliberately slim and dark (it recedes behind the
  // needles), so its wood-hue floor is the loosest of the family.
  conifer: { foliageRatio: 0.006, trunkRatio: 0.0002 },
  broadleaf: { foliageRatio: 0.028, trunkRatio: 0.001 },
  ash: { foliageRatio: 0.018, trunkRatio: 0.001 },
  // Aspen bark is deliberately pale (birch register), outside the wood-hue
  // window, so only its foliage is gated.
  aspen: { foliageRatio: 0.03 },
  bush: { foliageRatio: 0.008 },
  rocks: { stoneRatio: 0.05 },
  mountain: { stoneRatio: 0.08, darkRatio: 0.01 },
  cart: { trunkRatio: 0.01, darkRatio: 0.01 },
};

const gates = [
  {
    id: "trees",
    label: "Mixed Trees",
    criteria:
      "Tree family is visible with separate conifer and broadleaf silhouettes in one comparison capture.",
  },
  {
    id: "conifer",
    label: "Conifer Tree",
    criteria:
      "Individual conifer model has trunk, tiered crown, non-square contact shadow, and shared lighting.",
  },
  {
    id: "broadleaf",
    label: "Broadleaf Tree",
    criteria:
      "Individual broadleaf model has trunk, rounded low-poly canopy, non-square contact shadow, and shared lighting.",
  },
  {
    id: "ash",
    label: "Ash Tree",
    criteria:
      "Individual ash model reads as a tall shade tree: grey-brown trunk, visible limb skeleton, deep-green small-leaf canopy.",
  },
  {
    id: "aspen",
    label: "Aspen Tree",
    criteria:
      "Individual aspen model reads as a slender pale-barked tree with a light yellow-green crown.",
  },
  {
    id: "bush",
    label: "Bush",
    criteria:
      "Bush pair reads as low scrub: no tall trunk, rounded foliage mass sitting on the ground with a contact shadow.",
  },
  {
    id: "rocks",
    label: "Rock Cluster",
    criteria: "Rock/boulder family is visible, low and ridged, distinct from mountains.",
  },
  {
    id: "mountain",
    label: "Mountain Massif",
    criteria: "Mountain massif family is visible, broad and ridged, anchored to the ground.",
  },
  {
    id: "cart",
    label: "Cart",
    criteria:
      "Ox-less trade cart reads as road life: dark wheels, plank bed, canvas load, contact shadow.",
  },
];

export async function run(ctx) {
  ctx.check(
    "reusable props are owned by the shared registry",
    sharedRegistryOwnsProps(),
    "campaign sceneryPass and the renderer-lab route both import builders from sceneryPropRegistry; no parallel build* tables",
  );

  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "shared prop shots require browser GPU flags",
      true,
      "set VERIFY_GPU=1 to capture shared prop shots",
    );
    return;
  }

  const captures = [];
  for (const gate of gates) {
    captures.push(await captureShot(ctx, gate));
  }
  ctx.check(
    "shared prop shots captured",
    captures.every(
      (capture) => capture.stats?.route === "shared-prop-models" && capture.contentOk !== false,
    ),
    JSON.stringify({ captures: captures.length, shots: captures.map((capture) => capture.shot) }),
  );
}

async function captureShot(ctx, gate) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: `prop-shot-${gate.id}`,
  });
  await page.goto(`${ctx.target}/renderer/shared-prop-models?gate=${gate.id}`);
  await page.waitForFunction(
    (id) => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.gate === id,
    gate.id,
    { timeout: 18000 },
  );
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== "shared-prop-models" || stats?.gate !== gate.id) {
    await page.close();
    throw new Error(
      `shared prop shot ${gate.id} did not publish valid stats: ${JSON.stringify(stats)}`,
    );
  }
  const shot = await page.locator("#renderer-canvas").screenshot();
  const content = shotContentCheck(gate.id, shot);
  const shotName = `shared/props/${gate.id}`;
  await ctx.snap(page, shotName, { shot });
  await page.close();
  ctx.check(
    `shared prop content ${gate.id}`,
    content.ok,
    JSON.stringify({ label: gate.label, criteria: gate.criteria, metrics: content.metrics }),
  );
  return {
    ...gate,
    shot: `${shotName}.png`,
    stats,
    contentMetrics: content.metrics,
    contentOk: content.ok,
    status: "gpu-evidence",
  };
}

function shotContentCheck(gateId, shot) {
  const metrics = contentMetrics(PNG.sync.read(shot));
  const required = CONTENT_REQUIREMENTS[gateId];
  if (!required) return { ok: true, metrics };
  const ok = Object.entries(required).every(([key, min]) => (metrics[key] ?? 0) >= min);
  return { ok, metrics };
}

// Shared ownership requires surfaces to place props by id from
// the registry, never from their own copy of the builder list.
function sharedRegistryOwnsProps() {
  const sceneryPass = readSource("../../../packages/game-renderer/src/campaign/sceneryPass.ts");
  const route = readSource("../../../apps/renderer-lab/src/routes/sharedPropModels.ts");
  const passUsesRegistry =
    sceneryPass.includes("from '../models/shared/sceneryPropRegistry'") &&
    !/build(Conifer|Broadleaf|Rock|Mountain|Cart)\w*Mesh\s*\(/.test(sceneryPass);
  const routeUsesRegistry =
    route.includes("sceneryPropRegistry") && route.includes("PROP_REVIEW_GROUPS");
  return passUsesRegistry && routeUsesRegistry;
}

function readSource(relative) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

function contentMetrics(png) {
  let total = 0;
  let stone = 0;
  let foliage = 0;
  let trunk = 0;
  let dark = 0;
  const x0 = Math.floor(png.width * 0.15);
  const x1 = Math.floor(png.width * 0.85);
  const y0 = Math.floor(png.height * 0.15);
  const y1 = Math.floor(png.height * 0.82);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      if (a < 16) continue;
      total++;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (
        Math.abs(r - g) < 38 &&
        Math.abs(g - b) < 50 &&
        r > 55 &&
        r < 175 &&
        g > 50 &&
        g < 170 &&
        b > 40 &&
        b < 150
      )
        stone++;
      if (g > 45 && g < 125 && r < 90 && b < 85 && g > r * 1.2 && g > b * 1.15) foliage++;
      if (r > 60 && r < 130 && g > 30 && g < 90 && b < 60 && r > g * 1.1) trunk++;
      if (max < 100 && min > 8) dark++;
    }
  }
  const ratio = (value) => Number((value / Math.max(1, total)).toFixed(4));
  return {
    centralPixels: total,
    stoneRatio: ratio(stone),
    foliageRatio: ratio(foliage),
    trunkRatio: ratio(trunk),
    darkRatio: ratio(dark),
  };
}
