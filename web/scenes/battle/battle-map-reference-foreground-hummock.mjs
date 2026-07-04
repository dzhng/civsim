import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const TARGET = new URL(
  "../../../specs/battle-map-reference/assets/target-battle-map.png",
  import.meta.url,
);
const ASSET_DIR = new URL(
  "../../../specs/battle-map-reference/assets/04a1-foreground-hummock-heightfield/",
  import.meta.url,
);

const VIEWPORT = { width: 1638, height: 800 };
const QUERY =
  "gate=highland-valley&view=reference&grassTechnique=off&groundDiagnostic=landform-clay";
const CREST_CROP = { x: 0.0, y: 0.46, w: 1.0, h: 0.36 };
const LOWER_CROP = { x: 0.0, y: 0.62, w: 1.0, h: 0.34 };

export const meta = {
  name: "battle-map-reference-foreground-hummock",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: ["map-reference/foreground-hummock-clay", "map-reference/foreground-hummock-crops"],
  describe:
    "04A1: captures the locked reference foreground in grass-off topographic clay so foreground landform fixes can be judged without grass, water, fog, or final color.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("foreground hummock shots require browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const page = await ctx.newPage({
    viewport: VIEWPORT,
    errorPrefix: "battle-map-reference-foreground-hummock",
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
  const crestCrop = cropRatio(candidate, CREST_CROP);
  const lowerCrop = cropRatio(candidate, LOWER_CROP);
  const metrics = {
    crest: landformMetrics(crestCrop),
    lower: landformMetrics(lowerCrop),
  };
  const cropSheet = composeCropSheet(target, candidate);
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
  const crestAccepted =
    metrics.crest.luminanceRange > 12 &&
    metrics.crest.topToBottomDelta > 8 &&
    metrics.crest.bottomClearRatio < 0.04;
  const lowerAccepted =
    metrics.lower.luminanceRange > 8 &&
    metrics.lower.topToBottomDelta > 8 &&
    metrics.lower.ridgeRowRange > 12 &&
    metrics.lower.bottomClearRatio < 0.04;
  const landformAccepted = routeLocked && heightSpanTracked && crestAccepted && lowerAccepted;

  const metadata = {
    slice: "04a1-foreground-hummock-heightfield",
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
      metrics,
    },
    crops: [
      {
        id: "foreground-hummock-crest-and-downslope",
        rect: CREST_CROP,
        purpose:
          "Extends above the 04A0 lower foreground mask to include the visible crest and downslope.",
      },
      {
        id: "foreground-hummock-lower-body",
        rect: LOWER_CROP,
        purpose:
          "The 04A0 foreground mask: lower body only, not sufficient by itself to see the crest.",
      },
    ],
    thresholds: {
      heightSpan: { min: 20, max: 55 },
      crest: { luminanceRangeMin: 12, topToBottomDeltaMin: 8 },
      lower: { luminanceRangeMin: 8, topToBottomDeltaMin: 8, ridgeRowRangeMin: 12 },
    },
    landformAccepted,
    verdict: landformAccepted
      ? "Accepted as terrain-only/topographic-clay heightfield evidence for a foreground crest and lower-body downslope; not final grass, color, water, cliff, or fog."
      : "Diagnostic captured; 04A1 remains open until the crop proves both the foreground crest and lower-body downslope without breaking 04A0 composition.",
  };

  ctx.check(
    "foreground hummock uses the locked reference camera and clay diagnostic route",
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
    "foreground hummock diagnostic records a bounded highland height span",
    heightSpanTracked,
    `heightSpan=${stats?.heightSpan}`,
  );
  ctx.check(
    "foreground hummock diagnostic publishes crest and lower crop telemetry",
    metrics.crest.bands.length > 0 &&
      metrics.lower.bands.length > 0 &&
      Number.isFinite(metrics.crest.luminanceRange) &&
      Number.isFinite(metrics.lower.ridgeRowRange),
    JSON.stringify({ crest: metrics.crest, lower: metrics.lower, landformAccepted }),
  );
  ctx.check(
    "foreground hummock diagnostic accepts crest and lower-body downslope",
    landformAccepted,
    JSON.stringify({ crest: metrics.crest, lower: metrics.lower }),
  );

  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ candidate, cropSheet, metadata });
  }

  await ctx.snap(null, "map-reference/foreground-hummock-clay", {
    shot: PNG.sync.write(candidate),
  });
  await ctx.snap(null, "map-reference/foreground-hummock-crops", {
    shot: PNG.sync.write(cropSheet),
  });
}

async function writeArtifacts({ candidate, cropSheet, metadata }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(new URL("candidate-clay.png", ASSET_DIR), PNG.sync.write(candidate)),
    writeFile(new URL("crop-sheet.png", ASSET_DIR), PNG.sync.write(cropSheet)),
    writeFile(
      new URL("foreground-hummock-contract.json", ASSET_DIR),
      `${JSON.stringify(metadata, null, 2)}\n`,
    ),
    writeFile(new URL("decision-note.md", ASSET_DIR), decisionNote(metadata)),
  ]);
}

function decisionNote(metadata) {
  return `# 04A1 foreground hummock heightfield

## Verdict

${metadata.verdict}

## Route

- ${metadata.route}
- Camera: ${JSON.stringify(metadata.candidate.stats.camera)}
- Ground diagnostic: ${metadata.candidate.stats.groundDiagnostic}
- Grass: ${metadata.candidate.stats.grassTechnique}; blades=${metadata.candidate.stats.grassBlades}
- Height span: ${metadata.candidate.stats.heightSpan}

## Metrics

- Crest crop: ${JSON.stringify(metadata.candidate.metrics.crest)}
- Lower crop: ${JSON.stringify(metadata.candidate.metrics.lower)}

## Next

Proceed to 04A2 midground valley rolling bands. Keep this clay gate green.
`;
}

function composeCropSheet(target, candidate) {
  const thumbW = 720;
  const gap = 14;
  const rowGap = 14;
  const crops = [
    { color: [212, 63, 64, 255], rect: CREST_CROP },
    { color: [160, 67, 54, 255], rect: LOWER_CROP },
  ];
  const rows = crops.map((crop) => {
    const targetCrop = resizeToWidth(cropRatio(target, crop.rect), thumbW);
    const candidateCrop = resizeToWidth(cropRatio(candidate, crop.rect), thumbW);
    const swatchW = 18;
    const h = Math.max(targetCrop.height, candidateCrop.height);
    const row = solidPng(swatchW + gap + thumbW * 2 + gap, h, [218, 224, 224, 255]);
    fillRect(row, 0, 0, swatchW, h, crop.color);
    paste(row, targetCrop, swatchW + gap, 0);
    paste(row, candidateCrop, swatchW + gap + thumbW + gap, 0);
    return row;
  });
  const width = rows[0].width;
  const height = rows.reduce((sum, row) => sum + row.height, 0) + rowGap * (rows.length - 1);
  const out = solidPng(width, height, [218, 224, 224, 255]);
  let y = 0;
  for (const row of rows) {
    paste(out, row, 0, y);
    y += row.height + rowGap;
  }
  return out;
}

function landformMetrics(src) {
  const rowH = Math.max(8, Math.floor(src.height / 12));
  const bands = [];
  for (let y = 0; y < src.height; y += rowH) {
    bands.push(
      Number(avgLuminance(src, 0, src.width, y, Math.min(src.height, y + rowH)).toFixed(2)),
    );
  }
  const min = Math.min(...bands);
  const max = Math.max(...bands);
  const rows = ridgeRows(src);
  return {
    bands,
    luminanceRange: Number((max - min).toFixed(2)),
    darkestBandIndex: bands.indexOf(min),
    brightestBandIndex: bands.indexOf(max),
    topToBottomDelta: Number((bands[0] - bands[bands.length - 1]).toFixed(2)),
    ridgeRows: rows,
    ridgeRowRange: rowRange(rows),
    bottomClearRatio: pixelRatio(src, { x: 0, y: 0.76, w: 1, h: 0.2 }, isClearColor),
  };
}

function ridgeRows(src) {
  const cols = 12;
  const startY = Math.floor(src.height * 0.12);
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

function rowRange(rows) {
  return rows.length > 0 ? Math.max(...rows) - Math.min(...rows) : 0;
}

function avgLuminance(src, x0, x1, y0, y1) {
  let sum = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * src.width + x) * 4;
      sum += src.data[i] * 0.2126 + src.data[i + 1] * 0.7152 + src.data[i + 2] * 0.0722;
      total++;
    }
  }
  return total > 0 ? sum / total : 0;
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
