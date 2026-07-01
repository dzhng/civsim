import { PNG } from "pngjs";

export const meta = {
  name: "battle-map-reference-fiber-shell",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/fiber-shell-off",
    "map-reference/fiber-shell-normal",
    "map-reference/fiber-shell-width",
    "map-reference/fiber-shell-lift",
    "map-reference/fiber-shell-view-thickness",
    "map-reference/fiber-shell-visibility",
    "map-reference/fiber-shell-variants",
    "map-reference/fiber-shell-crops",
  ],
  describe:
    "Captures shell-off, normal, bounded primitive, and debug-visible field fiber shell variants from the same reference camera.",
};

const VARIANTS = ["off", "normal", "width", "lift", "view-thickness", "visibility"];

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "battle map fiber-shell shots require browser GPU flags",
      true,
      "set VERIFY_GPU=1 to capture",
    );
    return;
  }

  const captures = [];
  for (const variant of VARIANTS) {
    const page = await ctx.newPage({
      viewport: { width: 1638, height: 800 },
      errorPrefix: `battle-map-reference-fiber-shell-${variant}`,
    });
    await page.goto(
      `${ctx.target}/renderer/battle-terrain-3d?gate=highland-valley&view=reference&fiberShellVariant=${variant}`,
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
        `fiber shell ${variant} route did not publish valid stats: ${JSON.stringify(stats)}`,
      );
    }

    const rawShot = await page.locator("#renderer-canvas").screenshot();
    const canvasSize = await page.evaluate(() => {
      const canvas = document.querySelector("#renderer-canvas");
      return canvas ? { width: canvas.width, height: canvas.height } : null;
    });
    captures.push({
      variant,
      stats,
      png: cropToSize(PNG.sync.read(rawShot), canvasSize?.width, canvasSize?.height),
    });
    await page.close();
  }

  const off = captureByVariant(captures, "off");
  const normal = captureByVariant(captures, "normal");
  const visibility = captureByVariant(captures, "visibility");
  const bounded = ["width", "lift", "view-thickness"].map((variant) =>
    captureByVariant(captures, variant),
  );
  ctx.check(
    "fiber shell variants share the same field camera and base meadow/root material",
    captures.every(
      (capture) =>
        capture.stats.grassTechnique === "field-accent" &&
        capture.stats.grass?.prepMode === "packed-field" &&
        capture.stats.grass?.accentAggregation === "field-near" &&
        capture.stats.ground?.meadow?.enabled === true &&
        capture.stats.ground?.meadow?.source === "field" &&
        capture.stats.ground?.meadow?.rootMassEnabled === true &&
        capture.stats.ground?.meadow?.fieldRecords === capture.stats.grass?.fieldRecords,
    ) &&
      off.stats.grass?.fieldRecords === normal.stats.grass?.fieldRecords &&
      normal.stats.grass?.fieldRecords === visibility.stats.grass?.fieldRecords,
    JSON.stringify(
      captures.map((capture) => ({
        variant: capture.variant,
        grass: capture.stats.grass,
        meadow: capture.stats.ground?.meadow,
      })),
    ),
  );
  ctx.check(
    "fiber shell off variant disables only shell geometry",
    off.stats.grass?.fiberShellVariant === "off" &&
      off.stats.grass?.fiberShellSourceRecords > 0 &&
      off.stats.grass?.fiberShellRecords === 0 &&
      off.stats.grass?.accentTufts === 0 &&
      off.stats.grass?.tuftInstances === 0 &&
      off.stats.grass?.drawCalls === 0,
    JSON.stringify(off.stats.grass),
  );
  ctx.check(
    "fiber shell active variants submit the same field-owned shell budget",
    normal.stats.grass?.fiberShellVariant === "normal" &&
      visibility.stats.grass?.fiberShellVariant === "visibility" &&
      normal.stats.grass?.accentStyle === "field-fiber-shell" &&
      visibility.stats.grass?.accentStyle === "field-fiber-shell-visibility" &&
      bounded.every(
        (capture) =>
          capture.stats.grass?.fiberShellVariant === capture.variant &&
          capture.stats.grass?.accentStyle === "field-fiber-shell" &&
          capture.stats.grass?.fiberShellRecords === normal.stats.grass?.fiberShellRecords &&
          capture.stats.grass?.fiberShellSourceRecords ===
            normal.stats.grass?.fiberShellSourceRecords &&
          capture.stats.grass?.fiberShellDepthNear === normal.stats.grass?.fiberShellDepthNear &&
          capture.stats.grass?.fiberShellDepthFar === normal.stats.grass?.fiberShellDepthFar &&
          capture.stats.grass?.submittedTriangles === normal.stats.grass?.submittedTriangles &&
          capture.stats.grass?.drawCalls === 1,
      ) &&
      visibility.stats.grass?.fiberShellRecords === normal.stats.grass?.fiberShellRecords &&
      visibility.stats.grass?.fiberShellSourceRecords ===
        normal.stats.grass?.fiberShellSourceRecords &&
      visibility.stats.grass?.fiberShellDepthNear === normal.stats.grass?.fiberShellDepthNear &&
      visibility.stats.grass?.fiberShellDepthFar === normal.stats.grass?.fiberShellDepthFar &&
      visibility.stats.grass?.drawCalls === 1,
    JSON.stringify({
      normal: normal.stats.grass,
      bounded: bounded.map((capture) => capture.stats.grass),
      visibility: visibility.stats.grass,
    }),
  );

  for (const capture of captures) {
    await ctx.snap(null, `map-reference/fiber-shell-${capture.variant}`, {
      shot: PNG.sync.write(capture.png),
    });
  }
  await ctx.snap(null, "map-reference/fiber-shell-variants", {
    shot: PNG.sync.write(composeVariantSheet(captures.map((capture) => capture.png))),
  });
  await ctx.snap(null, "map-reference/fiber-shell-crops", {
    shot: PNG.sync.write(composeCropSheet(captures.map((capture) => capture.png))),
  });
}

function captureByVariant(captures, variant) {
  const capture = captures.find((entry) => entry.variant === variant);
  if (!capture) throw new Error(`missing fiber shell variant capture: ${variant}`);
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
    for (let x = 0; x < w; x++) {
      copyPixel(src, x0 + x, y0 + y, out, x, y);
    }
  }
  return out;
}

function cropToSize(src, width, height) {
  const w = Math.max(1, Math.min(src.width, Math.floor(width ?? src.width)));
  const h = Math.max(1, Math.min(src.height, Math.floor(height ?? src.height)));
  if (w === src.width && h === src.height) return src;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      copyPixel(src, x, y, out, x, y);
    }
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
    for (let x = 0; x < src.width; x++) {
      copyPixel(src, x, y, dst, dx + x, dy + y);
    }
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
