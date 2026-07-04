import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const TARGET = new URL(
  "../../../specs/battle-map-reference/assets/target-battle-map.png",
  import.meta.url,
);
const ASSET_DIR = new URL(
  "../../../specs/battle-map-reference/assets/04a2c-playable-presentation-boundary/",
  import.meta.url,
);

const VIEWPORT = { width: 1638, height: 800 };
const CONTROL_QUERY =
  "gate=highland-valley&view=reference&grassTechnique=off&groundDiagnostic=landform-clay";
const PROTOTYPE_QUERY = `${CONTROL_QUERY}&owner=presentation-apron`;
const MIDGROUND_CROP = { x: 0.04, y: 0.42, w: 0.74, h: 0.2 };

export const meta = {
  name: "battle-map-reference-midground-owner-boundary",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/midground-owner-boundary-prototype",
    "map-reference/midground-owner-boundary-crop",
  ],
  describe:
    "04A2C: compares the playable-heightfield control against a non-playable presentation-landform prototype in the locked midground valley crop.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("midground owner-boundary shots require browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const control = await captureRoute(ctx, CONTROL_QUERY, "control");
  const prototype = await captureRoute(ctx, PROTOTYPE_QUERY, "presentation-apron");
  const targetNative = PNG.sync.read(await readFile(TARGET));
  const target = fitContain(
    targetNative,
    prototype.image.width,
    prototype.image.height,
    [218, 224, 224, 255],
  );
  const targetCrop = cropRatio(target, MIDGROUND_CROP);
  const controlCrop = cropRatio(control.image, MIDGROUND_CROP);
  const prototypeCrop = cropRatio(prototype.image, MIDGROUND_CROP);
  const cropSheet = composeOwnerSheet(targetCrop, controlCrop, prototypeCrop);
  const cropDiff = meanAbsDiff(controlCrop, prototypeCrop);
  const prototypeMetrics = ownerCropMetrics(prototypeCrop);
  const landform = prototype.stats?.referenceMidgroundOwner?.presentationLandform ?? null;

  const controlLocked = routeLocked(control.stats, "playable-heightfield");
  const prototypeLocked = routeLocked(prototype.stats, "presentation-apron");
  const playableStable =
    Math.abs((control.stats?.heightSpan ?? 0) - (prototype.stats?.heightSpan ?? 0)) < 0.001 &&
    prototype.stats?.referenceMidgroundOwner?.playableSurface?.modifiedByOwner === false;
  const landformTyped =
    landform?.nonPlayable === true &&
    landform?.mask === "04A2-midground-valley-bands" &&
    landform?.renderPhase === "world-depth" &&
    landform?.triangles > 0 &&
    landform?.heightRange?.max - landform?.heightRange?.min > 12 &&
    landform?.edgeJoinMaxGap <= 0.001 &&
    landform?.edgeJoinSamples > 0 &&
    landform?.placementPolicy === "non-playable-presentation-only";
  const prototypeVisible = cropDiff > 3.5 && prototypeMetrics.edgeEnergy > 1.6;

  const metadata = {
    slice: "04a2c-playable-presentation-boundary",
    controlRoute: `/renderer/battle-terrain-3d?${CONTROL_QUERY}`,
    prototypeRoute: `/renderer/battle-terrain-3d?${PROTOTYPE_QUERY}`,
    viewport: VIEWPORT,
    crop: {
      id: "midground-valley-bands",
      rect: MIDGROUND_CROP,
      purpose:
        "The locked 04A0 midground crop: compare target, playable-heightfield control, and presentation-apron prototype.",
    },
    targetAsset: {
      path: "specs/battle-map-reference/assets/target-battle-map.png",
      width: targetNative.width,
      height: targetNative.height,
      normalizedWidth: target.width,
      normalizedHeight: target.height,
    },
    control: {
      stats: ownerStats(control.stats),
    },
    prototype: {
      stats: ownerStats(prototype.stats),
      cropMetrics: prototypeMetrics,
    },
    cropDiff,
    visualReview: {
      acceptedOwner: "presentation-apron",
      acceptedAsFinalTerrainArt: false,
      compareScreenshotsVerdict:
        "The prototype crop is less wrong than the playable-heightfield control for broad rolling midground recession, but it is still a production prototype with visible contour striping, weak depth hierarchy, and polygon/facet artifacts.",
      screenshotCritique:
        "Fresh unprimed critique: rightmost prototype has clearer rolling hill mass and more readable depth bands than the center control, but still needs better perspective behavior, less terracing, clearer lighting, and fewer seam/facet artifacts.",
    },
    verdict:
      "Accepted as an owner-boundary decision only: presentation-apron/non-playable landform is the right owner for midground recession, while 04A3 must productionize the shape and remove prototype artifacts.",
  };

  ctx.check(
    "midground owner-boundary control uses the locked playable-heightfield route",
    controlLocked,
    JSON.stringify(ownerStats(control.stats)),
  );
  ctx.check(
    "midground owner-boundary prototype uses the locked presentation-apron route",
    prototypeLocked,
    JSON.stringify(ownerStats(prototype.stats)),
  );
  ctx.check(
    "midground owner-boundary keeps the playable heightfield stable",
    playableStable,
    JSON.stringify({
      controlHeightSpan: control.stats?.heightSpan,
      prototypeHeightSpan: prototype.stats?.heightSpan,
    }),
  );
  ctx.check(
    "midground owner-boundary publishes typed non-playable landform stats",
    landformTyped,
    JSON.stringify(landform),
  );
  ctx.check(
    "midground owner-boundary prototype is visible in the midground crop",
    prototypeVisible,
    JSON.stringify({ cropDiff, prototypeMetrics }),
  );

  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ prototype: prototype.image, cropSheet, metadata });
  }

  await ctx.snap(null, "map-reference/midground-owner-boundary-prototype", {
    shot: PNG.sync.write(prototype.image),
  });
  await ctx.snap(null, "map-reference/midground-owner-boundary-crop", {
    shot: PNG.sync.write(cropSheet),
  });
}

async function captureRoute(ctx, query, label) {
  const page = await ctx.newPage({
    viewport: VIEWPORT,
    errorPrefix: `battle-map-reference-midground-owner-boundary/${label}`,
  });
  await page.goto(`${ctx.target}/renderer/battle-terrain-3d?${query}`);
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
  return {
    stats,
    image: cropToSize(PNG.sync.read(rawShot), canvasSize?.width, canvasSize?.height),
  };
}

async function writeArtifacts({ prototype, cropSheet, metadata }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(new URL("presentation-apron-prototype.png", ASSET_DIR), PNG.sync.write(prototype)),
    writeFile(new URL("owner-boundary-crop-sheet.png", ASSET_DIR), PNG.sync.write(cropSheet)),
    writeFile(
      new URL("owner-boundary-contract.json", ASSET_DIR),
      `${JSON.stringify(metadata, null, 2)}\n`,
    ),
    writeFile(new URL("decision-note.md", ASSET_DIR), decisionNote(metadata)),
  ]);
}

function decisionNote(metadata) {
  return `# 04A2C playable/presentation boundary

## Verdict

${metadata.verdict}

## Visual Review

${metadata.visualReview.compareScreenshotsVerdict}

${metadata.visualReview.screenshotCritique}

## Routes

- Control: ${metadata.controlRoute}
- Prototype: ${metadata.prototypeRoute}

## Owner Stats

${JSON.stringify({ control: metadata.control.stats, prototype: metadata.prototype.stats }, null, 2)}

## Crop Metrics

${JSON.stringify(
  { cropDiff: metadata.cropDiff, prototypeCrop: metadata.prototype.cropMetrics },
  null,
  2,
)}

## Next

04A3 productionizes the presentation-apron owner. Keep the default route as the
playable-heightfield control until the productionized apron passes its own crop
gate; fix the visible striping/facets and keep the non-playable ownership stats.
`;
}

function routeLocked(stats, owner) {
  return (
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
    stats?.grass?.bladeInstances === 0 &&
    stats?.referenceMidgroundOwner?.id === owner
  );
}

function ownerStats(stats) {
  return {
    route: stats?.route,
    gate: stats?.gate,
    mapId: stats?.mapId,
    camera: stats?.camera,
    groundDiagnostic: stats?.ground?.diagnosticMode,
    grassTechnique: stats?.grassTechnique,
    grassBlades: stats?.grass?.bladeInstances,
    heightSpan: stats?.heightSpan,
    referenceMidgroundOwner: stats?.referenceMidgroundOwner,
  };
}

function composeOwnerSheet(targetCrop, controlCrop, prototypeCrop) {
  const thumbW = 520;
  const gap = 14;
  const swatchW = 18;
  const target = resizeToWidth(targetCrop, thumbW);
  const control = resizeToWidth(controlCrop, thumbW);
  const prototype = resizeToWidth(prototypeCrop, thumbW);
  const h = Math.max(target.height, control.height, prototype.height);
  const out = solidPng(swatchW + gap + thumbW * 3 + gap * 2, h, [218, 224, 224, 255]);
  fillRect(out, 0, 0, swatchW, h, [232, 144, 43, 255]);
  paste(out, target, swatchW + gap, 0);
  paste(out, control, swatchW + gap + thumbW + gap, 0);
  paste(out, prototype, swatchW + gap + thumbW * 2 + gap * 2, 0);
  return out;
}

function ownerCropMetrics(src) {
  return {
    edgeEnergy: Number(edgeEnergy(src).toFixed(2)),
    luminanceRange: Number(luminanceRange(src).toFixed(2)),
    clearRatio: pixelRatio(src, { x: 0, y: 0, w: 1, h: 1 }, isClearColor),
  };
}

function meanAbsDiff(a, b) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let sum = 0;
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      sum +=
        Math.abs(a.data[ia] - b.data[ib]) +
        Math.abs(a.data[ia + 1] - b.data[ib + 1]) +
        Math.abs(a.data[ia + 2] - b.data[ib + 2]);
      total += 3;
    }
  }
  return total > 0 ? Number((sum / total).toFixed(3)) : 0;
}

function cropRatio(src, rect) {
  const r = rectPixels(src, rect);
  const out = new PNG({ width: r.w, height: r.h });
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const si = ((r.y + y) * src.width + r.x + x) * 4;
      const di = (y * out.width + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}

function cropToSize(src, width, height) {
  if (!width || !height || (src.width === width && src.height === height)) return src;
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, x);
      const sy = Math.min(src.height - 1, y);
      const si = (sy * src.width + sx) * 4;
      const di = (y * width + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

function fitContain(src, width, height, bg) {
  const scale = Math.min(width / src.width, height / src.height);
  const outW = Math.max(1, Math.round(src.width * scale));
  const outH = Math.max(1, Math.round(src.height * scale));
  const scaled = resize(src, outW, outH);
  const out = solidPng(width, height, bg);
  paste(out, scaled, Math.floor((width - outW) / 2), Math.floor((height - outH) / 2));
  return out;
}

function resizeToWidth(src, width) {
  const height = Math.max(1, Math.round((src.height * width) / src.width));
  return resize(src, width, height);
}

function resize(src, width, height) {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y / height) * src.height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / width) * src.width));
      const si = (sy * src.width + sx) * 4;
      const di = (y * width + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}

function paste(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
      const si = (y * src.width + x) * 4;
      const di = (ty * dst.width + tx) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
}

function fillRect(dst, x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= dst.width || y >= dst.height) continue;
      const i = (y * dst.width + x) * 4;
      dst.data[i] = color[0];
      dst.data[i + 1] = color[1];
      dst.data[i + 2] = color[2];
      dst.data[i + 3] = color[3];
    }
  }
}

function solidPng(width, height, color) {
  const out = new PNG({ width, height });
  fillRect(out, 0, 0, width, height, color);
  return out;
}

function rectPixels(src, rect) {
  const x = Math.max(0, Math.floor(src.width * rect.x));
  const y = Math.max(0, Math.floor(src.height * rect.y));
  const w = Math.max(1, Math.min(src.width - x, Math.floor(src.width * rect.w)));
  const h = Math.max(1, Math.min(src.height - y, Math.floor(src.height * rect.h)));
  return { x, y, w, h };
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

function luminanceRange(src) {
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      const l = luminance(src.data[i], src.data[i + 1], src.data[i + 2]);
      min = Math.min(min, l);
      max = Math.max(max, l);
    }
  }
  return max - min;
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

function luminance(r, g, b) {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
