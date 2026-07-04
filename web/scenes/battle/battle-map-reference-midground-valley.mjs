import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const TARGET = new URL(
  "../../../specs/battle-map-reference/assets/target-battle-map.png",
  import.meta.url,
);
const ASSET_DIR = new URL(
  "../../../specs/battle-map-reference/assets/04a2-midground-valley-rolling-bands/",
  import.meta.url,
);

const VIEWPORT = { width: 1638, height: 800 };
const QUERY =
  "gate=highland-valley&view=reference&grassTechnique=off&groundDiagnostic=landform-clay";
const MIDGROUND_CROP = { x: 0.04, y: 0.42, w: 0.74, h: 0.2 };
const FIELD_METRIC_CROP = { x: 0.02, y: 0.4, w: 0.96, h: 0.58 };

export const meta = {
  name: "battle-map-reference-midground-valley",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: ["map-reference/midground-valley-clay", "map-reference/midground-valley-crop"],
  describe:
    "04A2: captures the locked reference midground valley mask in grass-off topographic clay so rolling-band recession can be judged without grass, water, fog, or final color.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("midground valley shots require browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const page = await ctx.newPage({
    viewport: VIEWPORT,
    errorPrefix: "battle-map-reference-midground-valley",
  });
  await page.goto(`${ctx.target}/renderer/battle-terrain-3d?${QUERY}`);
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true && window.__rendererLabStats?.stats?.view === "reference",
    { timeout: 20000 },
  );
  await page.waitForTimeout(180);

  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  const canvasSize = await page.evaluate(() => {
    const canvas = document.querySelector("#renderer-canvas");
    return canvas ? { width: canvas.width, height: canvas.height } : null;
  });
  const rawShot = await page.locator("#renderer-canvas").screenshot();
  await page.close();

  const candidate = cropToSize(PNG.sync.read(rawShot), canvasSize?.width, canvasSize?.height);
  const targetNative = PNG.sync.read(await readFile(TARGET));
  const target = fitContain(targetNative, candidate.width, candidate.height, [218, 224, 224, 255]);
  const candidateCrop = cropRatio(candidate, MIDGROUND_CROP);
  const targetCrop = cropRatio(target, MIDGROUND_CROP);
  const fullMetrics = valleyMetrics(candidateCrop);
  const fieldMetrics = valleyMetrics(cropRatio(candidateCrop, FIELD_METRIC_CROP));
  const cropSheet = composeCropSheet(targetCrop, candidateCrop);
  const routeLocked =
    stats?.route === "battle-terrain-3d" &&
    stats?.gate === "highland-valley" &&
    stats?.view === "reference" &&
    stats?.camera?.x === -380 &&
    stats?.camera?.y === -160 &&
    stats?.camera?.zoom === 3.2 &&
    stats?.camera?.pitch === 1.52 &&
    stats?.camera?.yaw === -0.035 &&
    stats?.environment?.id === "overcast-foggy" &&
    stats?.ground?.diagnosticMode === "landform-clay" &&
    stats?.grassTechnique === "off" &&
    stats?.grass?.bladeInstances === 0;
  const heightSpanTracked = stats?.heightSpan > 20 && stats?.heightSpan < 55;
  const telemetryAccepted =
    routeLocked &&
    heightSpanTracked &&
    fieldMetrics.luminanceRange > 11 &&
    fieldMetrics.edgeEnergy > 1.7 &&
    fieldMetrics.ridgeRowRange > 24 &&
    fieldMetrics.clearRatio < 0.04;
  const visualReview = {
    accepted: false,
    verdict:
      "Rejected by direct inspection and fresh visual review: the metric-green candidate still reads as shallow horizontal terracing, not broad rolling valley form.",
    next: "Keep the playable-heightfield control as rejected evidence; use the 04A2C presentation-apron owner for the productionized valley-apron pass.",
  };

  const metadata = {
    slice: "04a2-midground-valley-rolling-bands",
    route: `/renderer/battle-terrain-3d?${QUERY}`,
    viewport: VIEWPORT,
    targetAsset: {
      path: "specs/battle-map-reference/assets/target-battle-map.png",
      width: targetNative.width,
      height: targetNative.height,
      normalizedWidth: target.width,
      normalizedHeight: target.height,
      normalization: "contain into candidate canvas with neutral side bars",
    },
    crop: {
      id: "midground-valley-bands",
      rect: MIDGROUND_CROP,
      purpose: "The 04A0 midground mask: central field recession and rolling bands only.",
    },
    metricCrop: {
      id: "midground-field-land-only",
      rect: FIELD_METRIC_CROP,
      relativeTo: "midground-valley-bands",
      purpose:
        "Nested lower field crop used for acceptance so sky, cliff silhouette, and horizon haze cannot satisfy the rolling-band contract.",
    },
    candidate: {
      width: candidate.width,
      height: candidate.height,
      stats: {
        route: stats?.route,
        gate: stats?.gate,
        mapId: stats?.mapId,
        view: stats?.view,
        environment: stats?.environment,
        camera: stats?.camera,
        groundDiagnostic: stats?.ground?.diagnosticMode,
        grassTechnique: stats?.grassTechnique,
        grassBlades: stats?.grass?.bladeInstances,
        heightSpan: stats?.heightSpan,
      },
      metrics: {
        full: fullMetrics,
        field: fieldMetrics,
      },
    },
    thresholds: {
      heightSpan: { min: 20, max: 55 },
      fieldLuminanceRangeMin: 11,
      fieldEdgeEnergyMin: 1.7,
      fieldRidgeRowRangeMin: 24,
    },
    telemetryAccepted,
    visualReview,
    verdict: "Diagnostic telemetry captured; not accepted as final 04A2 evidence.",
  };

  ctx.check(
    "midground valley uses the locked reference camera and clay diagnostic route",
    routeLocked,
    JSON.stringify({
      route: stats?.route,
      gate: stats?.gate,
      view: stats?.view,
      camera: stats?.camera,
      groundDiagnostic: stats?.ground?.diagnosticMode,
      grassTechnique: stats?.grassTechnique,
      grassBlades: stats?.grass?.bladeInstances,
    }),
  );
  ctx.check(
    "midground valley diagnostic records a bounded highland height span",
    heightSpanTracked,
    `heightSpan=${stats?.heightSpan}`,
  );
  ctx.check(
    "midground valley diagnostic publishes rolling-band telemetry",
    fullMetrics.bands.length > 0 &&
      fieldMetrics.bands.length > 0 &&
      Number.isFinite(fieldMetrics.luminanceRange) &&
      Number.isFinite(fieldMetrics.edgeEnergy) &&
      Number.isFinite(fieldMetrics.ridgeRowRange),
    JSON.stringify({ full: fullMetrics, field: fieldMetrics, telemetryAccepted }),
  );
  ctx.check(
    "midground valley diagnostic preserves the rejected visual verdict",
    telemetryAccepted && visualReview.accepted === false,
    JSON.stringify({ full: fullMetrics, field: fieldMetrics, visualReview }),
  );

  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ candidate, cropSheet, metadata });
  }

  await ctx.snap(null, "map-reference/midground-valley-clay", {
    shot: PNG.sync.write(candidate),
  });
  await ctx.snap(null, "map-reference/midground-valley-crop", {
    shot: PNG.sync.write(cropSheet),
  });
}

async function writeArtifacts({ candidate, cropSheet, metadata }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(new URL("candidate-clay.png", ASSET_DIR), PNG.sync.write(candidate)),
    writeFile(new URL("crop-sheet.png", ASSET_DIR), PNG.sync.write(cropSheet)),
    writeFile(
      new URL("midground-valley-contract.json", ASSET_DIR),
      `${JSON.stringify(metadata, null, 2)}\n`,
    ),
    writeFile(new URL("decision-note.md", ASSET_DIR), decisionNote(metadata)),
  ]);
}

function decisionNote(metadata) {
  return `# 04A2 midground valley rolling bands

## Verdict

${metadata.verdict}

${metadata.visualReview.verdict}

## Route

- ${metadata.route}
- Camera: ${JSON.stringify(metadata.candidate.stats.camera)}
- Ground diagnostic: ${metadata.candidate.stats.groundDiagnostic}
- Grass: ${metadata.candidate.stats.grassTechnique}; blades=${metadata.candidate.stats.grassBlades}
- Height span: ${metadata.candidate.stats.heightSpan}

## Metrics

${JSON.stringify(metadata.candidate.metrics, null, 2)}

## Next

${metadata.visualReview.next}
`;
}

function composeCropSheet(targetCrop, candidateCrop) {
  const thumbW = 720;
  const gap = 14;
  const swatchW = 18;
  const target = resizeToWidth(targetCrop, thumbW);
  const candidate = resizeToWidth(candidateCrop, thumbW);
  const h = Math.max(target.height, candidate.height);
  const out = solidPng(swatchW + gap + thumbW * 2 + gap, h, [218, 224, 224, 255]);
  fillRect(out, 0, 0, swatchW, h, [232, 144, 43, 255]);
  paste(out, target, swatchW + gap, 0);
  paste(out, candidate, swatchW + gap + thumbW + gap, 0);
  return out;
}

function valleyMetrics(src) {
  const rowH = Math.max(6, Math.floor(src.height / 10));
  const bands = [];
  for (let y = 0; y < src.height; y += rowH) {
    bands.push(
      Number(avgLuminance(src, 0, src.width, y, Math.min(src.height, y + rowH)).toFixed(2)),
    );
  }
  const min = Math.min(...bands);
  const max = Math.max(...bands);
  const upperMean = mean(bands.slice(0, Math.max(1, Math.floor(bands.length / 3))));
  const lowerMean = mean(bands.slice(Math.floor((bands.length * 2) / 3)));
  const rows = ridgeRows(src);
  return {
    bands,
    luminanceRange: Number((max - min).toFixed(2)),
    darkestBandIndex: bands.indexOf(min),
    brightestBandIndex: bands.indexOf(max),
    bandMeanDelta: Number((upperMean - lowerMean).toFixed(2)),
    ridgeRows: rows,
    ridgeRowRange: rowRange(rows),
    edgeEnergy: Number(edgeEnergy(src).toFixed(2)),
    clearRatio: pixelRatio(src, { x: 0, y: 0, w: 1, h: 1 }, isClearColor),
  };
}

function ridgeRows(src) {
  const cols = 12;
  const startY = Math.floor(src.height * 0.08);
  const endY = Math.max(startY + 1, Math.floor(src.height * 0.92));
  const rows = [];
  for (let col = 0; col < cols; col++) {
    const x0 = Math.floor((src.width * col) / cols);
    const x1 = Math.max(x0 + 1, Math.floor((src.width * (col + 1)) / cols));
    let bestRow = startY;
    let best = -Infinity;
    for (let y = startY; y < endY; y++) {
      let sum = 0;
      let total = 0;
      for (let x = x0; x < x1; x += 4) {
        const i = (y * src.width + x) * 4;
        sum += src.data[i] * 0.2126 + src.data[i + 1] * 0.7152 + src.data[i + 2] * 0.0722;
        total++;
      }
      const avg = total > 0 ? sum / total : 0;
      if (avg > best) {
        best = avg;
        bestRow = y;
      }
    }
    rows.push(bestRow);
  }
  return rows;
}

function edgeEnergy(src) {
  let sum = 0;
  let total = 0;
  for (let y = 1; y < src.height - 1; y += 2) {
    for (let x = 1; x < src.width - 1; x += 2) {
      const i = (y * src.width + x) * 4;
      const ix = (y * src.width + x + 1) * 4;
      const iy = ((y + 1) * src.width + x) * 4;
      const l = luminance(src.data[i], src.data[i + 1], src.data[i + 2]);
      const lx = luminance(src.data[ix], src.data[ix + 1], src.data[ix + 2]);
      const ly = luminance(src.data[iy], src.data[iy + 1], src.data[iy + 2]);
      sum += Math.abs(l - lx) + Math.abs(l - ly);
      total++;
    }
  }
  return total > 0 ? sum / total : 0;
}

function rowRange(rows) {
  return rows.length > 0 ? Math.max(...rows) - Math.min(...rows) : 0;
}

function avgLuminance(src, x0, x1, y0, y1) {
  let sum = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * src.width + x) * 4;
      sum += luminance(src.data[i], src.data[i + 1], src.data[i + 2]);
      total++;
    }
  }
  return total > 0 ? sum / total : 0;
}

function luminance(r, g, b) {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function mean(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function pixelRatio(src, rect, predicate) {
  const r = rectPixels(src, rect);
  let hits = 0;
  let total = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = (y * src.width + x) * 4;
      if (predicate(src.data[i], src.data[i + 1], src.data[i + 2])) hits++;
      total++;
    }
  }
  return total > 0 ? hits / total : 0;
}

function isClearColor(r, g, b) {
  return Math.abs(r - 218) < 10 && Math.abs(g - 224) < 12 && Math.abs(b - 224) < 12;
}

function rectPixels(src, rect) {
  const x = Math.max(0, Math.min(src.width - 1, Math.floor(src.width * rect.x)));
  const y = Math.max(0, Math.min(src.height - 1, Math.floor(src.height * rect.y)));
  return {
    x,
    y,
    w: Math.max(1, Math.min(src.width - x, Math.floor(src.width * rect.w))),
    h: Math.max(1, Math.min(src.height - y, Math.floor(src.height * rect.h))),
  };
}

function cropRatio(src, rect) {
  const r = rectPixels(src, rect);
  const out = new PNG({ width: r.w, height: r.h });
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) copyPixel(src, r.x + x, r.y + y, out, x, y);
  }
  return out;
}

function fitContain(src, width, height, rgba) {
  const scale = Math.min(width / src.width, height / src.height);
  const resized = resize(src, Math.round(src.width * scale), Math.round(src.height * scale));
  const out = solidPng(width, height, rgba);
  paste(
    out,
    resized,
    Math.floor((width - resized.width) / 2),
    Math.floor((height - resized.height) / 2),
  );
  return out;
}

function cropToSize(src, width, height) {
  const w = Math.max(1, Math.min(src.width, Math.floor(width ?? src.width)));
  const h = Math.max(1, Math.min(src.height, Math.floor(height ?? src.height)));
  if (w === src.width && h === src.height) return src;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) copyPixel(src, x, y, out, x, y);
  }
  return out;
}

function resizeToWidth(src, width) {
  return resize(src, width, Math.max(1, Math.round(src.height * (width / src.width))));
}

function resize(src, width, height) {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y / height) * src.height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / width) * src.width));
      copyPixel(src, sx, sy, out, x, y);
    }
  }
  return out;
}

function solidPng(width, height, rgba) {
  const out = new PNG({ width, height });
  for (let i = 0; i < out.data.length; i += 4) out.data.set(rgba, i);
  return out;
}

function fillRect(dst, x0, y0, w, h, rgba) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= dst.width || y >= dst.height) continue;
      const i = (y * dst.width + x) * 4;
      dst.data[i] = rgba[0];
      dst.data[i + 1] = rgba[1];
      dst.data[i + 2] = rgba[2];
      dst.data[i + 3] = rgba[3];
    }
  }
}

function paste(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) copyPixel(src, x, y, dst, dx + x, dy + y);
  }
}

function copyPixel(src, sx, sy, dst, dx, dy) {
  const si = (sy * src.width + sx) * 4;
  const di = (dy * dst.width + dx) * 4;
  dst.data[di] = src.data[si];
  dst.data[di + 1] = src.data[si + 1];
  dst.data[di + 2] = src.data[si + 2];
  dst.data[di + 3] = src.data[si + 3];
}
