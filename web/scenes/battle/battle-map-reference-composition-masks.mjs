import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const TARGET = new URL(
  "../../../specs/battle-map-reference/assets/target-battle-map.png",
  import.meta.url,
);
const ASSET_DIR = new URL(
  "../../../specs/battle-map-reference/assets/04a0-composition-mask-contract/",
  import.meta.url,
);

const VIEWPORT = { width: 1638, height: 800 };
const QUERY = "gate=highland-valley&view=reference";

const REGIONS = [
  {
    id: "foreground-hummock-near-grass",
    owner: "04A1 foreground hummock, later grass body",
    rect: { x: 0.0, y: 0.62, w: 1.0, h: 0.34 },
    color: [212, 63, 64, 255],
  },
  {
    id: "midground-valley-bands",
    owner: "04A2 midground valley rolling bands",
    rect: { x: 0.04, y: 0.42, w: 0.74, h: 0.2 },
    color: [232, 144, 43, 255],
  },
  {
    id: "left-cliff-wall",
    owner: "05A1 left cliff wall silhouette",
    rect: { x: 0.0, y: 0.18, w: 0.38, h: 0.42 },
    color: [113, 126, 222, 255],
  },
  {
    id: "background-cliff-rows",
    owner: "05A2 background cliff/ridge rows",
    rect: { x: 0.17, y: 0.16, w: 0.72, h: 0.27 },
    color: [105, 171, 91, 255],
  },
  {
    id: "distant-valley-apron-water-right",
    owner: "04A3 distant valley apron, later water placement",
    rect: { x: 0.48, y: 0.34, w: 0.5, h: 0.24 },
    color: [68, 165, 194, 255],
  },
  {
    id: "sky-fog-band",
    owner: "later sky/fog owner only",
    rect: { x: 0.0, y: 0.0, w: 1.0, h: 0.22 },
    color: [184, 121, 215, 255],
  },
];

export const meta = {
  name: "battle-map-reference-composition-masks",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/composition-mask-candidate",
    "map-reference/composition-mask-overlays",
    "map-reference/composition-mask-crops",
  ],
  describe:
    "04A0: freezes the target/current reference-camera comparison crops and masks before terrain/cliff work.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("composition mask shots require browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const page = await ctx.newPage({
    viewport: VIEWPORT,
    errorPrefix: "battle-map-reference-composition-masks",
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
  const framing = framingMetrics(candidate);

  const targetOverlay = overlayRegions(target, REGIONS);
  const candidateOverlay = overlayRegions(candidate, REGIONS);
  const overlaySheet = composePair(targetOverlay, candidateOverlay, 16);
  const cropSheet = composeCropSheet(target, candidate, REGIONS);

  const metadata = {
    slice: "04a0-reference-composition-mask-contract",
    route: `/renderer/battle-terrain-3d?${QUERY}`,
    routeStack: "current renderer-lab battle-terrain-3d reference route",
    routeStackCaveat:
      "04A0 freezes the current committed reference surface; future photoreal re-home must preserve these crop semantics or update this contract intentionally.",
    viewport: VIEWPORT,
    targetAsset: {
      path: "specs/battle-map-reference/assets/target-battle-map.png",
      width: targetNative.width,
      height: targetNative.height,
      normalizedWidth: target.width,
      normalizedHeight: target.height,
      normalization: "contain into candidate canvas with neutral side bars",
    },
    cropSheet:
      "Rows follow regions order; left swatch matches each overlay mask color, then target crop, then candidate crop.",
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
        soldiers: stats?.soldiers,
        heightSpan: stats?.heightSpan,
        grassTechnique: stats?.grassTechnique,
        grassPrimitiveFamily: stats?.grass?.grassPrimitiveFamily,
        referenceGrassBridge: stats?.referenceGrassBridge ?? null,
      },
      framing,
    },
    regions: REGIONS.map((region) => ({
      id: region.id,
      owner: region.owner,
      rect: region.rect,
      targetPixels: rectPixels(target, region.rect),
      candidatePixels: rectPixels(candidate, region.rect),
    })),
    verdict:
      "Accepted as a reproducible mask contract only; it does not accept terrain, grass, cliffs, fog, water, or color.",
  };

  ctx.check(
    "composition contract captures the locked reference route",
    stats?.route === "battle-terrain-3d" &&
      stats?.gate === "highland-valley" &&
      stats?.view === "reference" &&
      stats?.environment?.id === "overcast-foggy" &&
      stats?.environment?.source === "CIVSIM_ENVIRONMENTS.overcast" &&
      stats?.camera?.x === -380 &&
      stats?.camera?.y === -160 &&
      stats?.camera?.zoom === 3.2 &&
      stats?.camera?.pitch === 1.52 &&
      stats?.camera?.yaw === -0.035 &&
      stats?.soldiers === 0,
    JSON.stringify({
      route: stats?.route,
      gate: stats?.gate,
      view: stats?.view,
      environment: stats?.environment,
      camera: stats?.camera,
      soldiers: stats?.soldiers,
    }),
  );
  ctx.check(
    "composition contract normalizes target and candidate to one review canvas",
    target.width === candidate.width &&
      target.height === candidate.height &&
      candidate.width === VIEWPORT.width &&
      candidate.height === VIEWPORT.height,
    JSON.stringify({
      target: { width: target.width, height: target.height },
      candidate: { width: candidate.width, height: candidate.height },
      viewport: VIEWPORT,
    }),
  );
  ctx.check(
    "composition contract defines one owner per mask",
    REGIONS.length === 6 &&
      new Set(REGIONS.map((region) => region.id)).size === REGIONS.length &&
      REGIONS.every((region) => region.owner && region.rect.w > 0 && region.rect.h > 0),
    JSON.stringify(REGIONS.map(({ id, owner, rect }) => ({ id, owner, rect }))),
  );
  ctx.check(
    "reference camera faces the horizon and fills the foreground",
    framing.topSkyRatio > 0.8 &&
      framing.paleHorizonMassToTerrainY > 0.46 &&
      framing.paleHorizonMassToTerrainY < 0.58 &&
      framing.bottomClearRatio < 0.04,
    JSON.stringify(framing),
  );

  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({
      target,
      candidate,
      overlaySheet,
      cropSheet,
      metadata,
    });
  }

  await ctx.snap(null, "map-reference/composition-mask-candidate", {
    shot: PNG.sync.write(candidate),
  });
  await ctx.snap(null, "map-reference/composition-mask-overlays", {
    shot: PNG.sync.write(overlaySheet),
  });
  await ctx.snap(null, "map-reference/composition-mask-crops", {
    shot: PNG.sync.write(cropSheet),
  });
}

async function writeArtifacts({ target, candidate, overlaySheet, cropSheet, metadata }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(new URL("target-normalized.png", ASSET_DIR), PNG.sync.write(target)),
    writeFile(new URL("candidate-current.png", ASSET_DIR), PNG.sync.write(candidate)),
    writeFile(new URL("mask-overlays.png", ASSET_DIR), PNG.sync.write(overlaySheet)),
    writeFile(new URL("crop-sheet.png", ASSET_DIR), PNG.sync.write(cropSheet)),
    writeFile(
      new URL("composition-mask-contract.json", ASSET_DIR),
      `${JSON.stringify(metadata, null, 2)}\n`,
    ),
    writeFile(new URL("decision-note.md", ASSET_DIR), decisionNote(metadata)),
  ]);
}

function decisionNote(metadata) {
  return `# 04A0 reference composition mask contract

## Verdict

Accepted as a reproducible mask contract only. This does not accept terrain,
grass, cliffs, fog, water, or color.

## Route

- ${metadata.route}
- ${metadata.routeStack}
- Caveat: ${metadata.routeStackCaveat}
- Camera: ${JSON.stringify(metadata.candidate.stats.camera)}
- Framing: ${JSON.stringify(metadata.candidate.framing)}

## Masks

${metadata.regions
  .map((region) => `- ${region.id}: ${region.owner}; rect=${JSON.stringify(region.rect)}`)
  .join("\n")}

## Next

Use these masks to implement 04A1 foreground hummock shape first. Do not tune
grass, cliff texture, fog, water, or final color while judging 04A1.
`;
}

function composePair(left, right, gap) {
  const out = solidPng(
    left.width + gap + right.width,
    Math.max(left.height, right.height),
    [218, 224, 224, 255],
  );
  paste(out, left, 0, 0);
  paste(out, right, left.width + gap, 0);
  return out;
}

function composeCropSheet(target, candidate, regions) {
  const thumbW = 360;
  const swatchW = 18;
  const gap = 12;
  const rowGap = 12;
  const rows = regions.map((region) => {
    const targetCrop = resizeToWidth(cropRatio(target, region.rect), thumbW);
    const candidateCrop = resizeToWidth(cropRatio(candidate, region.rect), thumbW);
    const h = Math.max(targetCrop.height, candidateCrop.height);
    const row = solidPng(swatchW + gap + thumbW * 2 + gap, h, [218, 224, 224, 255]);
    fillRect(row, 0, 0, swatchW, h, region.color);
    paste(row, targetCrop, swatchW + gap, 0);
    paste(row, candidateCrop, swatchW + gap + thumbW + gap, 0);
    return row;
  });
  const width = swatchW + gap + thumbW * 2 + gap;
  const height = rows.reduce((sum, row) => sum + row.height, 0) + rowGap * (rows.length - 1);
  const out = solidPng(width, height, [218, 224, 224, 255]);
  let y = 0;
  for (const row of rows) {
    paste(out, row, 0, y);
    y += row.height + rowGap;
  }
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

function overlayRegions(src, regions) {
  const out = new PNG({ width: src.width, height: src.height });
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      out.data[i] = Math.round(src.data[i] * 0.55);
      out.data[i + 1] = Math.round(src.data[i + 1] * 0.55);
      out.data[i + 2] = Math.round(src.data[i + 2] * 0.55);
      out.data[i + 3] = 255;
    }
  }
  for (const region of regions) {
    tintRect(out, src, rectPixels(src, region.rect), region.color);
  }
  return out;
}

function tintRect(out, src, rect, color) {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (x < 0 || y < 0 || x >= out.width || y >= out.height) continue;
      const i = (y * out.width + x) * 4;
      const border =
        x - rect.x < 4 ||
        y - rect.y < 4 ||
        rect.x + rect.w - 1 - x < 4 ||
        rect.y + rect.h - 1 - y < 4;
      const mix = border ? 0.82 : 0.34;
      out.data[i] = Math.round(src.data[i] * (1 - mix) + color[0] * mix);
      out.data[i + 1] = Math.round(src.data[i + 1] * (1 - mix) + color[1] * mix);
      out.data[i + 2] = Math.round(src.data[i + 2] * (1 - mix) + color[2] * mix);
      out.data[i + 3] = 255;
    }
  }
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

function framingMetrics(src) {
  return {
    topSkyRatio: pixelRatio(src, { x: 0, y: 0, w: 1, h: 0.18 }, isPaleSky),
    paleHorizonMassToTerrainY: paleHorizonMassToTerrainY(src),
    bottomClearRatio: pixelRatio(src, { x: 0, y: 0.78, w: 1, h: 0.2 }, isClearColor),
  };
}

function paleHorizonMassToTerrainY(src) {
  const rowHeight = 20;
  const firstY = Math.floor(src.height * 0.25);
  for (let y = firstY; y < src.height; y += rowHeight) {
    const ratio = pixelRatio(
      src,
      { x: 0, y: y / src.height, w: 1, h: rowHeight / src.height },
      isPaleSky,
    );
    if (ratio < 0.1) return y / src.height;
  }
  return 1;
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

function isPaleSky(r, g, b) {
  const avg = (r + g + b) / 3;
  return avg > 155 && Math.abs(r - g) < 22 && b >= r - 8 && b >= g - 12;
}

function isClearColor(r, g, b) {
  return Math.abs(r - 218) < 10 && Math.abs(g - 224) < 12 && Math.abs(b - 224) < 12;
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
