import { PNG } from "pngjs";

export const meta = {
  name: "battle-map-reference-primitive-family",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/primitive-family-field-fiber-shell",
    "map-reference/primitive-family-alpha-impostor",
    "map-reference/primitive-family-billboard-cluster",
    "map-reference/primitive-family-volume-card",
    "map-reference/primitive-family-texture-volume",
    "map-reference/primitive-family-texture-carrier",
    "map-reference/primitive-family-texture-micro-carrier",
    "map-reference/primitive-family-variants",
    "map-reference/primitive-family-crops",
  ],
  describe:
    "Captures 03B4C4/03B4C5 primitive-family candidates from the same battle-map reference camera.",
};

const VARIANTS = [
  "field-fiber-shell",
  "alpha-impostor",
  "billboard-cluster",
  "volume-card",
  "texture-volume",
  "texture-carrier",
  "texture-micro-carrier",
];

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "battle map primitive-family shots require browser GPU flags",
      true,
      "set VERIFY_GPU=1 to capture",
    );
    return;
  }

  const captures = [];
  for (const family of VARIANTS) {
    const page = await ctx.newPage({
      viewport: { width: 1638, height: 800 },
      errorPrefix: `battle-map-reference-primitive-family-${family}`,
    });
    await page.goto(
      `${ctx.target}/renderer/battle-terrain-3d?gate=highland-valley&view=reference&grassPrimitiveFamily=${family}`,
    );
    await page.waitForFunction(
      () =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.stats?.view === "reference",
      { timeout: 20000 },
    );
    await page.waitForTimeout(180);
    const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
    if (stats?.route !== "battle-terrain-3d" || stats?.view !== "reference") {
      await page.close();
      throw new Error(
        `primitive family ${family} route did not publish valid stats: ${JSON.stringify(stats)}`,
      );
    }

    const rawShot = await page.locator("#renderer-canvas").screenshot();
    const canvasSize = await page.evaluate(() => {
      const canvas = document.querySelector("#renderer-canvas");
      return canvas ? { width: canvas.width, height: canvas.height } : null;
    });
    captures.push({
      family,
      stats,
      png: cropToSize(PNG.sync.read(rawShot), canvasSize?.width, canvasSize?.height),
    });
    await page.close();
  }

  const baseline = captureByFamily(captures, "field-fiber-shell");
  const meshCandidates = ["alpha-impostor", "billboard-cluster", "volume-card"].map((family) =>
    captureByFamily(captures, family),
  );
  const textureCandidate = captureByFamily(captures, "texture-volume");
  const carrierCandidate = captureByFamily(captures, "texture-carrier");
  const microCarrierCandidate = captureByFamily(captures, "texture-micro-carrier");
  ctx.check(
    "primitive-family variants share the same field camera and frozen meadow/root material",
    captures.every(
      (capture) =>
        capture.stats.grassTechnique === "field-accent" &&
        capture.stats.grass?.prepMode === "packed-field" &&
        capture.stats.ground?.meadow?.enabled === true &&
        capture.stats.ground?.meadow?.source === "field" &&
        capture.stats.ground?.meadow?.rootMassEnabled === true &&
        capture.stats.ground?.meadow?.fieldRecords === capture.stats.grass?.fieldRecords &&
        capture.stats.grass?.fieldRecords === baseline.stats.grass?.fieldRecords,
    ),
    JSON.stringify(
      captures.map((capture) => ({
        family: capture.family,
        grass: capture.stats.grass,
        meadow: capture.stats.ground?.meadow,
      })),
    ),
  );
  ctx.check(
    "primitive-family baseline keeps the rejected field-shell reference path explicit",
    baseline.stats.grass?.grassPrimitiveFamily === "field-fiber-shell" &&
      baseline.stats.grass?.grassPrimitiveBaseline === "none" &&
      baseline.stats.grass?.accentStyle === "field-fiber-shell" &&
      baseline.stats.grass?.accentAggregation === "field-near" &&
      baseline.stats.grass?.fiberShellVariant === "normal" &&
      baseline.stats.grass?.fiberShellRecords === baseline.stats.grass?.accentTufts &&
      baseline.stats.grass?.submittedTriangles === 41600,
    JSON.stringify(baseline.stats.grass),
  );
  ctx.check(
    "primitive-family candidates publish clump-owned workbench telemetry under the old card cost",
    meshCandidates.every(
      (capture) =>
        capture.stats.grass?.grassPrimitiveFamily === capture.family &&
        capture.stats.grass?.grassPrimitiveBaseline === "field-fiber-shell-normal" &&
        capture.stats.grass?.accentStyle === capture.family &&
        capture.stats.grass?.accentAggregation === "clump" &&
        capture.stats.grass?.accentClumps > 0 &&
        capture.stats.grass?.grassPrimitiveClumps === capture.stats.grass?.accentClumps &&
        capture.stats.grass?.grassPrimitiveSourceRecords ===
          capture.stats.grass?.accentSourceRecords &&
        capture.stats.grass?.grassPrimitiveRecords === capture.stats.grass?.accentTufts &&
        capture.stats.grass?.grassPrimitiveDepthFar >
          capture.stats.grass?.grassPrimitiveDepthNear &&
        capture.stats.grass?.grassPrimitiveTextureBytes === 0 &&
        capture.stats.grass?.submittedTriangles > 0 &&
        capture.stats.grass?.submittedTriangles < 83200 &&
        capture.stats.grass?.drawCalls === 1,
    ),
    JSON.stringify(meshCandidates.map((capture) => capture.stats.grass)),
  );
  ctx.check(
    "texture-volume publishes a real generated atlas while staying below the old card cost",
    textureCandidate.stats.grass?.grassPrimitiveFamily === "texture-volume" &&
      textureCandidate.stats.grass?.grassPrimitiveBaseline === "field-fiber-shell-normal" &&
      textureCandidate.stats.grass?.accentStyle === "volume-card" &&
      textureCandidate.stats.grass?.accentAggregation === "field-cell" &&
      textureCandidate.stats.grass?.accentClumps > 500 &&
      textureCandidate.stats.grass?.grassPrimitiveClumps ===
        textureCandidate.stats.grass?.accentClumps &&
      textureCandidate.stats.grass?.grassPrimitiveSourceRecords ===
        textureCandidate.stats.grass?.accentSourceRecords &&
      textureCandidate.stats.grass?.grassPrimitiveRecords ===
        textureCandidate.stats.grass?.accentTufts &&
      textureCandidate.stats.grass?.grassPrimitiveTextureWidth === 256 &&
      textureCandidate.stats.grass?.grassPrimitiveTextureHeight === 64 &&
      textureCandidate.stats.grass?.grassPrimitiveTextureTiles === 4 &&
      textureCandidate.stats.grass?.grassPrimitiveTextureBytes === 65536 &&
      textureCandidate.stats.grass?.grassPrimitiveDepthFar >
        textureCandidate.stats.grass?.grassPrimitiveDepthNear &&
      textureCandidate.stats.grass?.submittedTriangles > 0 &&
      textureCandidate.stats.grass?.submittedTriangles < 83200 &&
      textureCandidate.stats.grass?.drawCalls === 1,
    JSON.stringify(textureCandidate.stats.grass),
  );
  ctx.check(
    "texture-carrier publishes the same atlas through a separate field-owned carrier family",
    carrierCandidate.stats.grass?.grassPrimitiveFamily === "texture-carrier" &&
      carrierCandidate.stats.grass?.grassPrimitiveBaseline === "field-fiber-shell-normal" &&
      carrierCandidate.stats.grass?.accentStyle === "volume-card" &&
      carrierCandidate.stats.grass?.accentAggregation === "field-cell" &&
      carrierCandidate.stats.grass?.accentClumps > textureCandidate.stats.grass?.accentClumps &&
      carrierCandidate.stats.grass?.grassPrimitiveClumps ===
        carrierCandidate.stats.grass?.accentClumps &&
      carrierCandidate.stats.grass?.grassPrimitiveSourceRecords ===
        carrierCandidate.stats.grass?.accentSourceRecords &&
      carrierCandidate.stats.grass?.grassPrimitiveRecords ===
        carrierCandidate.stats.grass?.accentTufts &&
      carrierCandidate.stats.grass?.grassPrimitiveTextureWidth ===
        textureCandidate.stats.grass?.grassPrimitiveTextureWidth &&
      carrierCandidate.stats.grass?.grassPrimitiveTextureHeight ===
        textureCandidate.stats.grass?.grassPrimitiveTextureHeight &&
      carrierCandidate.stats.grass?.grassPrimitiveTextureTiles ===
        textureCandidate.stats.grass?.grassPrimitiveTextureTiles &&
      carrierCandidate.stats.grass?.grassPrimitiveTextureBytes ===
        textureCandidate.stats.grass?.grassPrimitiveTextureBytes &&
      carrierCandidate.stats.grass?.grassPrimitiveDepthFar >
        textureCandidate.stats.grass?.grassPrimitiveDepthFar &&
      carrierCandidate.stats.grass?.submittedTriangles > 0 &&
      carrierCandidate.stats.grass?.submittedTriangles < 83200 &&
      carrierCandidate.stats.grass?.drawCalls === 1,
    JSON.stringify({
      carrier: carrierCandidate.stats.grass,
      texture: textureCandidate.stats.grass,
    }),
  );
  ctx.check(
    "texture-micro-carrier keeps the same atlas but tests many smaller field-owned carrier primitives",
    microCarrierCandidate.stats.grass?.grassPrimitiveFamily === "texture-micro-carrier" &&
      microCarrierCandidate.stats.grass?.grassPrimitiveBaseline === "field-fiber-shell-normal" &&
      microCarrierCandidate.stats.grass?.accentStyle === "volume-card" &&
      microCarrierCandidate.stats.grass?.accentAggregation === "field-cell" &&
      microCarrierCandidate.stats.grass?.accentClumps >
        carrierCandidate.stats.grass?.accentClumps &&
      microCarrierCandidate.stats.grass?.accentTufts > carrierCandidate.stats.grass?.accentTufts &&
      microCarrierCandidate.stats.grass?.accentTufts <=
        microCarrierCandidate.stats.grass?.accentClumps * 4 &&
      microCarrierCandidate.stats.grass?.grassPrimitiveClumps ===
        microCarrierCandidate.stats.grass?.accentClumps &&
      microCarrierCandidate.stats.grass?.grassPrimitiveSourceRecords ===
        microCarrierCandidate.stats.grass?.accentSourceRecords &&
      microCarrierCandidate.stats.grass?.grassPrimitiveRecords ===
        microCarrierCandidate.stats.grass?.accentTufts &&
      microCarrierCandidate.stats.grass?.grassPrimitiveTextureWidth ===
        carrierCandidate.stats.grass?.grassPrimitiveTextureWidth &&
      microCarrierCandidate.stats.grass?.grassPrimitiveTextureHeight ===
        carrierCandidate.stats.grass?.grassPrimitiveTextureHeight &&
      microCarrierCandidate.stats.grass?.grassPrimitiveTextureTiles ===
        carrierCandidate.stats.grass?.grassPrimitiveTextureTiles &&
      microCarrierCandidate.stats.grass?.grassPrimitiveTextureBytes ===
        carrierCandidate.stats.grass?.grassPrimitiveTextureBytes &&
      microCarrierCandidate.stats.grass?.grassPrimitiveMicroCards >=
        microCarrierCandidate.stats.grass?.accentTufts * 3 &&
      microCarrierCandidate.stats.grass?.grassPrimitiveDepthFar >=
        carrierCandidate.stats.grass?.grassPrimitiveDepthFar &&
      microCarrierCandidate.stats.grass?.meshTriangles <=
        carrierCandidate.stats.grass?.meshTriangles &&
      microCarrierCandidate.stats.grass?.submittedTriangles >
        carrierCandidate.stats.grass?.submittedTriangles &&
      microCarrierCandidate.stats.grass?.submittedTriangles < 83200 &&
      microCarrierCandidate.stats.grass?.drawCalls === 1,
    JSON.stringify({
      micro: microCarrierCandidate.stats.grass,
      carrier: carrierCandidate.stats.grass,
    }),
  );

  for (const capture of captures) {
    await ctx.snap(null, `map-reference/primitive-family-${capture.family}`, {
      shot: PNG.sync.write(capture.png),
    });
  }
  await ctx.snap(null, "map-reference/primitive-family-variants", {
    shot: PNG.sync.write(composeVariantSheet(captures.map((capture) => capture.png))),
  });
  await ctx.snap(null, "map-reference/primitive-family-crops", {
    shot: PNG.sync.write(composeCropSheet(captures.map((capture) => capture.png))),
  });
}

function captureByFamily(captures, family) {
  const capture = captures.find((entry) => entry.family === family);
  if (!capture) throw new Error(`missing primitive-family capture: ${family}`);
  return capture;
}

function composeVariantSheet(images) {
  const gap = 12;
  const width = images.reduce((sum, image) => sum + image.width, 0) + gap * (images.length - 1);
  const height = Math.max(...images.map((image) => image.height));
  const out = solidPng(width, height, [218, 224, 224, 255]);
  let x = 0;
  for (const image of images) {
    paste(out, image, x, 0);
    x += image.width + gap;
  }
  return out;
}

function composeCropSheet(images) {
  const columns = images.map((image) => ({
    foreground: resizeToWidth(cropRatio(image, 0, 0.62, 1, 0.34), 520),
    midground: resizeToWidth(cropRatio(image, 0, 0.42, 1, 0.2), 520),
  }));
  const gap = 12;
  const rowGap = 12;
  const width = columns.length * 520 + gap * (columns.length - 1);
  const foregroundHeight = Math.max(...columns.map((column) => column.foreground.height));
  const midgroundHeight = Math.max(...columns.map((column) => column.midground.height));
  const out = solidPng(width, foregroundHeight + rowGap + midgroundHeight, [218, 224, 224, 255]);
  let x = 0;
  for (const column of columns) {
    paste(out, column.foreground, x, 0);
    paste(out, column.midground, x, foregroundHeight + rowGap);
    x += 520 + gap;
  }
  return out;
}

function cropRatio(src, xRatio, yRatio, wRatio, hRatio) {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(src.width * xRatio)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(src.height * yRatio)));
  const w = Math.max(1, Math.min(src.width - x0, Math.floor(src.width * wRatio)));
  const h = Math.max(1, Math.min(src.height - y0, Math.floor(src.height * hRatio)));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) copyPixel(src, x0 + x, y0 + y, out, x, y);
  }
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
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = rgba[0];
    out.data[i + 1] = rgba[1];
    out.data[i + 2] = rgba[2];
    out.data[i + 3] = rgba[3];
  }
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
