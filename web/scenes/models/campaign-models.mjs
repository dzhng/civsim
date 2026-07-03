import { PNG } from "pngjs";

export const meta = {
  name: "campaign-models",
  kind: "visual",
  world: "campaign-models",
  tier: "full",
  snapshots: [
    "campaign/entities/city",
    "campaign/entities/garrison-outside",
    "campaign/entities/garrison-city",
    "campaign/entities/garrison-hidden",
    "campaign/entities/hostile-depth-order",
    "campaign/entities/town",
    "campaign/entities/army",
    "campaign/entities/standard-liveries",
    "campaign/terrain/road",
    "campaign/terrain/road-only",
    "campaign/entities/selected-city",
    "campaign/labels/labels",
    "campaign/terrain/terrain-grass-scrub",
    "campaign/terrain/terrain-stone-relief",
    "campaign/terrain/cloud-fog",
  ],
  describe:
    "Captures campaign model, terrain, road, water, fog, and label baselines under web/shots/models/campaign. Reusable scenery props are reviewed by the shared-prop-models scene.",
};

const CONTENT_REQUIREMENTS = {
  "terrain-grass-scrub": { foliageRatio: 0.03 },
  "terrain-stone-relief": { stoneRatio: 0.12 },
};

const gates = [
  {
    id: "city",
    label: "City Cluster",
    criteria:
      "Large settlement has clustered sandstone buildings, terracotta roofs, ownership flag, shadow, label icon, and selected footprint.",
  },
  {
    id: "garrison-outside",
    label: "Garrison Outside City",
    criteria:
      "Army marker is fully visible outside the city before garrisoning, using the same production city and army depth-tested model path.",
  },
  {
    id: "garrison-city",
    label: "Garrison Partly In City",
    criteria:
      "Army marker can sit inside the city volume with lower soldiers occluded and the raised standard still readable through the production depth pass.",
  },
  {
    id: "garrison-hidden",
    label: "Garrison Hidden In City",
    criteria:
      "Army marker can be lowered into the city volume and fully hidden by city roofs/walls through the production depth pass.",
  },
  {
    id: "hostile-depth-order",
    label: "Hostile Depth Order",
    criteria:
      "A later-submitted scenery bucket behind the city cannot overpaint the nearer city standard; type buckets are batching only.",
  },
  {
    id: "town",
    label: "Town Scale",
    criteria: "Smaller settlement keeps the same model language at a distinct readable scale.",
  },
  {
    id: "army",
    label: "Army Marker",
    criteria:
      "Army flag is attached to the marker with representative figures, faction livery, label icon, shadow, and a ground selection footprint occluded by the formation.",
  },
  {
    id: "standard-liveries",
    label: "Standard Liveries",
    criteria:
      "Every faction livery's army standard reads as solid cloth over the map green: the marker cloth carries a top-lit grade and never matches the ground everywhere.",
  },
  {
    id: "road",
    label: "Road With Cities",
    criteria: "Road segment is visible as a stone route between settlement endpoints.",
  },
  {
    id: "road-only",
    label: "Road Only",
    criteria:
      "Raised pale-stone road treatment is visible without city models hiding edge and shadow behavior.",
  },
  {
    id: "selected-city",
    label: "Selected City Footprint",
    criteria:
      "Selected city footprint sits outside the city shadow, projects with the ground plane, and is occluded by city geometry where covered.",
  },
  {
    id: "labels",
    label: "Campaign Labels",
    criteria:
      "City, army, faction, and sea label typography/icon samples render through the WebGPU glyph atlas.",
  },
  {
    id: "terrain-grass-scrub",
    label: "Terrain Grass And Scrub",
    criteria:
      "Grass/scrub material sample shows warm parchment terrain with sparse Mediterranean vegetation.",
  },
  {
    id: "terrain-stone-relief",
    label: "Terrain Stone Relief",
    criteria:
      "Stone/relief material sample shows rocks and mountains anchored to campaign terrain.",
  },
  {
    id: "cloud-fog",
    label: "Cloud And Fog Layer",
    criteria:
      "Campaign cloud/fog pass is visible as a real WebGPU atmospheric layer over the terrain.",
  },
];

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "campaign model shots require browser GPU flags",
      true,
      "set VERIFY_GPU=1 to capture campaign model shots",
    );
    return;
  }

  const captures = [];
  for (const gate of gates) {
    captures.push(await captureShot(ctx, gate));
  }
  ctx.check(
    "campaign model shots captured",
    captures.every(
      (capture) => capture.stats?.route === "campaign-models" && capture.contentOk !== false,
    ),
    JSON.stringify({ captures: captures.length, shots: captures.map((capture) => capture.shot) }),
  );
}

async function captureShot(ctx, gate) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: `model-shot-${gate.id}`,
  });
  await page.goto(`${ctx.target}/renderer/campaign-models?gate=${gate.id}`);
  await page.waitForFunction(
    (id) => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.gate === id,
    gate.id,
    { timeout: 18000 },
  );
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== "campaign-models" || stats?.gate !== gate.id) {
    await page.close();
    throw new Error(`model shot ${gate.id} did not publish valid stats: ${JSON.stringify(stats)}`);
  }
  const shot = await page.locator("#renderer-canvas").screenshot();
  const content = shotContentCheck(gate.id, shot, stats);
  const shotName = `campaign/${shotFolder(gate.id)}/${gate.id}`;
  await ctx.snap(page, shotName, { shot });
  await page.close();
  ctx.check(
    `campaign model content ${gate.id}`,
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

function shotContentCheck(gateId, shot, stats) {
  const png = PNG.sync.read(shot);
  if (gateId === "standard-liveries") return standardLiveryContentCheck(png, stats);
  const metrics = contentMetrics(png);
  const required = CONTENT_REQUIREMENTS[gateId];
  if (!required) return { ok: true, metrics };
  const ok = Object.entries(required).every(([key, min]) => (metrics[key] ?? 0) >= min);
  return { ok, metrics };
}

function shotFolder(gateId) {
  if (
    [
      "city",
      "town",
      "army",
      "selected-city",
      "garrison-outside",
      "garrison-city",
      "garrison-hidden",
      "hostile-depth-order",
      "standard-liveries",
    ].includes(gateId)
  ) {
    return "entities";
  }
  if (gateId === "labels") {
    return "labels";
  }
  return "terrain";
}

function standardLiveryContentCheck(png, stats) {
  const cells = Array.isArray(stats?.samples?.liveryCells) ? stats.samples.liveryCells : [];
  const failures = [];
  const checked = [];
  for (const cell of cells) {
    // Whole pixels: fractional anchors make every 1-px row rect straddle two
    // rows (floor/ceil), smearing the head/foot bands across neighbours.
    const px = Math.round(Number(cell?.markerPx?.[0]));
    const py = Math.round(Number(cell?.markerPx?.[1]));
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      failures.push({
        name: cell?.name ?? `faction ${cell?.faction ?? "?"}`,
        reason: "missing markerPx",
      });
      continue;
    }
    // The marker is screen-space geometry (radius 9 px), so with a rounded
    // anchor the cloth interior sits at fixed offsets: cloth ~[py-16, py-5)
    // between the swallowtail notch (top ~4 px) and the gold pole hardware
    // (row py-5 and below). Medians keep the gold trim/emblem pixels inside a
    // band from dragging its statistic toward gold-ink luminance.
    const cloth = sampleRect(png, px - 3, py - 16, px + 3, py - 5);
    const ground = sampleRect(png, px - 20, py - 8, px - 12, py);
    if (cloth.count === 0 || ground.count === 0) {
      failures.push({ name: cell.name, reason: "sample outside screenshot" });
      continue;
    }
    // Head rows are parchment-lit, foot rows ink-deepened; the top-lit grade
    // is the guarantee that no flat wash can match the whole cloth.
    const head = sampleRect(png, px - 3, py - 13, px + 3, py - 10);
    const foot = sampleRect(png, px - 3, py - 8, px + 3, py - 5);
    const grade = head.medianLuma - foot.medianLuma;
    const separation = maxChannelSeparation(png, cloth, ground.mean);
    const missed = [];
    if (grade < 10) missed.push("grade");
    if (separation < 25) missed.push("ground-separation");
    if (missed.length > 0) {
      failures.push({
        name: cell.name,
        reason: missed.join("+"),
        grade: Number(grade.toFixed(1)),
        separation: Number(separation.toFixed(1)),
      });
    }
    checked.push({
      name: cell.name,
      grade: Number(grade.toFixed(1)),
      separation: Number(separation.toFixed(1)),
    });
  }
  const expected = Number(stats?.factions ?? 0);
  if (expected !== cells.length) {
    failures.push({
      name: "faction table",
      reason: `expected ${expected}, sampled ${cells.length}`,
    });
  }
  return {
    ok: cells.length > 0 && failures.length === 0,
    metrics: {
      factions: expected,
      checked: cells.length,
      failingFactions: failures.map((failure) => failure.name),
      failures,
      minGrade: minMetric(checked, "grade"),
      minSeparation: minMetric(checked, "separation"),
    },
  };
}

function sampleRect(png, x0, y0, x1, y1) {
  const ix0 = clamp(Math.floor(x0), 0, png.width);
  const iy0 = clamp(Math.floor(y0), 0, png.height);
  const ix1 = clamp(Math.ceil(x1), 0, png.width);
  const iy1 = clamp(Math.ceil(y1), 0, png.height);
  let count = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  const lumas = [];
  for (let y = iy0; y < iy1; y++) {
    for (let x = ix0; x < ix1; x++) {
      const i = (y * png.width + x) * 4;
      const pr = png.data[i];
      const pg = png.data[i + 1];
      const pb = png.data[i + 2];
      r += pr;
      g += pg;
      b += pb;
      lumas.push(luminance(pr, pg, pb));
      count++;
    }
  }
  lumas.sort((a, b2) => a - b2);
  return {
    x0: ix0,
    y0: iy0,
    x1: ix1,
    y1: iy1,
    count,
    mean: count > 0 ? [r / count, g / count, b / count] : [0, 0, 0],
    // Median is the band statistic for cloth grading: the gold trim/emblem
    // pixels inside a band would drag a mean toward gold-ink luminance.
    medianLuma: count > 0 ? lumas[count >> 1] : 0,
  };
}

function maxChannelSeparation(png, rect, mean) {
  let max = 0;
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = (y * png.width + x) * 4;
      max = Math.max(
        max,
        Math.abs(png.data[i] - mean[0]),
        Math.abs(png.data[i + 1] - mean[1]),
        Math.abs(png.data[i + 2] - mean[2]),
      );
    }
  }
  return max;
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function minMetric(rows, key) {
  if (rows.length === 0) return 0;
  return Math.min(...rows.map((row) => row[key]));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
