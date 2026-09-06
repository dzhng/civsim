import { PNG } from "pngjs";
import { requireSwiftShaderBaseline } from "../models/_swiftshader-baseline.ts";

export const meta = {
  name: "soldier-materials",
  kind: "visual",
  world: "raw-soldier-explicit-materials",
  tier: "full",
  snapshots: [
    "soldier-materials-authored",
    "soldier-materials-blue",
    "soldier-materials-metal",
    "soldier-materials-blender-checker",
  ],
  describe:
    "Raw production soldier material IDs, scalar factors and independent faction masks; ordinary blue is not faction identity.",
};

function regionAverage(png, box) {
  const x0 = Math.floor(png.width * box[0]),
    x1 = Math.floor(png.width * box[1]);
  const y0 = Math.floor(png.height * box[2]),
    y1 = Math.floor(png.height * box[3]);
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * png.width + x) * 4;
      r += png.data[o];
      g += png.data[o + 1];
      b += png.data[o + 2];
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

function changedArea(a, b, threshold) {
  if (!a || !b || a.width !== b.width || a.height !== b.height) return Infinity;
  let changed = 0;
  let total = 0;
  for (let y = Math.floor(a.height * 0.16); y < Math.floor(a.height * 0.78); y++) {
    for (let x = Math.floor(a.width * 0.24); x < Math.floor(a.width * 0.76); x++) {
      const o = (y * a.width + x) * 4;
      const delta =
        Math.abs(a.data[o] - b.data[o]) +
        Math.abs(a.data[o + 1] - b.data[o + 1]) +
        Math.abs(a.data[o + 2] - b.data[o + 2]);
      if (delta > threshold) changed++;
      total++;
    }
  }
  return { changed, total, share: total > 0 ? changed / total : 0 };
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

async function capture(ctx, params, snapshot, decorate) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: `soldier-materials-${params}`,
  });
  try {
    if (decorate) await decorate(page);
    await page.goto(`${ctx.target}/renderer/soldier-materials?${params}`);
    await page.waitForFunction(
      () =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.stats?.route === "soldier-materials",
      undefined,
      { timeout: 18000 },
    );
    await page.waitForTimeout(250);
    if (snapshot) await ctx.snap(page, snapshot, { threshold: 0, maxDiffRatio: 0 });
    const pixels = PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
    pixels.rawStats = await page.evaluate(() => window.__rendererLabStats.stats);
    return pixels;
  } finally {
    await page.close();
  }
}

function textureCase(transform, channel, pixel, mipmapFilter = "none") {
  return async (page) => {
    const image = new PNG({ width: 4, height: 2 });
    for (let i = 0; i < image.data.length; i += 4) image.data.set([...pixel, 255], i);
    await page.route("**/raw-texture-probe.png", (route) =>
      route.fulfill({ contentType: "image/png", body: PNG.sync.write(image) }),
    );
    await page.route("**/baked/placeholder.materials.json", async (route) => {
      const response = await route.fetch();
      const surface = await response.json();
      surface.materials = surface.materials.map((material) =>
        transform({ ...material, textures: undefined }),
      );
      surface.textures = channel
        ? {
            [channel]: {
              image: "/raw-texture-probe.png",
              mimeType: "image/png",
              sampler: {
                magFilter: "nearest",
                minFilter: "nearest",
                mipmapFilter,
                wrapS: "repeat",
                wrapT: "clamp-to-edge",
              },
            },
          }
        : {};
      await route.fulfill({ response, json: surface });
    });
  };
}

function maxPixelError(a, b) {
  let max = 0;
  for (let i = 0; i < a.data.length; i++) max = Math.max(max, Math.abs(a.data[i] - b.data[i]));
  return max;
}

function uvGradientCase(vertexOracle) {
  return async (page) => {
    const decode = (value) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const image = new PNG({ width: 2, height: 2 });
    image.data.set([32, 64, 128, 255, 192, 64, 128, 255, 32, 224, 128, 255, 192, 224, 128, 255]);
    await page.route("**/raw-gradient.png", (route) =>
      route.fulfill({ contentType: "image/png", body: PNG.sync.write(image) }),
    );
    await page.route("**/baked/placeholder.materials.json", async (route) => {
      const response = await route.fetch(),
        surface = await response.json();
      surface.materials = surface.materials.map((material) => ({
        ...material,
        textures: vertexOracle ? undefined : { baseColor: true },
      }));
      surface.textures = vertexOracle
        ? {}
        : {
            baseColor: {
              image: "/raw-gradient.png",
              mimeType: "image/png",
              sampler: {
                magFilter: "linear",
                minFilter: "linear",
                mipmapFilter: "none",
                wrapS: "clamp-to-edge",
                wrapT: "clamp-to-edge",
              },
            },
          };
      await route.fulfill({ response, json: surface });
    });
    await page.route(/\/tier-[012]\.mesh\.json$/, async (route) => {
      const response = await route.fetch(),
        mesh = await response.json();
      for (let i = 0; i < mesh.uvs.length / 2; i++) {
        const u = mesh.uvs[i * 2],
          v = mesh.uvs[i * 2 + 1];
        // Pixel-center range makes bilinear filtering an affine U/V gradient;
        // independently colored vertices are the same field without a texture.
        mesh.uvs[i * 2] = 0.25 + 0.5 * u;
        mesh.uvs[i * 2 + 1] = 0.25 + 0.5 * v;
        if (vertexOracle) {
          mesh.colors[i * 4] *= decode(32) + u * (decode(192) - decode(32));
          mesh.colors[i * 4 + 1] *= decode(64) + v * (decode(224) - decode(64));
          mesh.colors[i * 4 + 2] *= decode(128);
        }
      }
      await route.fulfill({ response, json: mesh });
    });
  };
}

export async function run(ctx) {
  requireSwiftShaderBaseline(meta.name);
  const authored = await capture(ctx, "strength=1&team=0", "soldier-materials-authored");
  const remapped = await capture(ctx, "strength=1&team=0&reverseMaterials");
  ctx.check(
    "material table permutation and matching ID remap preserve exact pixels",
    authored.data.equals(remapped.data),
  );
  const blue = await capture(ctx, "strength=1&team=0&surface=blue", "soldier-materials-blue");
  const red = await capture(ctx, "strength=1&team=1&surface=blue");
  const bodyBlue = regionAverage(blue, [0.43, 0.57, 0.3, 0.58]);
  const bodyRed = regionAverage(red, [0.43, 0.57, 0.3, 0.58]);
  const shieldBlue = regionAverage(blue, [0.3, 0.43, 0.3, 0.62]);
  const shieldRed = regionAverage(red, [0.3, 0.43, 0.3, 0.62]);
  const bodyFactionDiff = dist(bodyBlue, bodyRed);
  const shieldFactionDiff = dist(shieldBlue, shieldRed);
  const armband = changedArea(blue, red, 30);

  ctx.check(
    "soldier-materials: body and shield do not carry faction tint",
    bodyFactionDiff < 5 && shieldFactionDiff < 5,
    JSON.stringify({
      bodyBlue,
      bodyRed,
      bodyFactionDiff,
      shieldBlue,
      shieldRed,
      shieldFactionDiff,
    }),
  );
  ctx.check(
    "soldier-materials: only a tiny armband-sized region changes by faction",
    armband.changed > 8 && armband.share > 0 && armband.share < 0.012,
    JSON.stringify({
      changedPixels: armband.changed,
      changedShare: Number(armband.share.toFixed(5)),
      totalPixels: armband.total,
    }),
  );
  const unmaskedBlue = await capture(ctx, "strength=0&team=0&surface=blue");
  const unmaskedRed = await capture(ctx, "strength=0&team=1&surface=blue");
  ctx.check(
    "explicit mask disabled: ordinary blue is identical for both factions",
    unmaskedBlue.data.equals(unmaskedRed.data),
  );
  const differentSeed = await capture(ctx, "strength=0&team=0&surface=blue&seed=123");
  ctx.check(
    "seed cannot change uniform surface color",
    unmaskedBlue.data.equals(differentSeed.data),
  );
  const rough = await capture(ctx, "strength=0&surface=gray&roughness=1&metallic=1");
  const noKey = await capture(ctx, "strength=0&surface=gray&roughness=1&metallic=1&keyOff");
  const unlitFace = regionAverage(rough, [0.46, 0.51, 0.44, 0.48]);
  const unlitFaceWithoutKey = regionAverage(noKey, [0.46, 0.51, 0.44, 0.48]);
  ctx.check(
    "unlit front plane receives fill but no directional specular",
    dist(unlitFace, unlitFaceWithoutKey) === 0 && Math.min(...unlitFace) > 10,
    JSON.stringify({ unlitFace, unlitFaceWithoutKey }),
  );
  const smooth = await capture(
    ctx,
    "strength=0&surface=gray&roughness=0&metallic=1",
    "soldier-materials-metal",
  );
  const dielectric = await capture(ctx, "strength=0&surface=gray&roughness=0&metallic=0");
  const roughnessResponse = changedArea(rough, smooth, 10);
  const metallicResponse = changedArea(smooth, dielectric, 10);
  ctx.check(
    "same-color roughness changes rendered response with faction tint disabled",
    roughnessResponse.changed > 100,
    JSON.stringify(roughnessResponse),
  );
  ctx.check(
    "same-color metallic changes rendered response with faction tint disabled",
    metallicResponse.changed > 100,
    JSON.stringify(metallicResponse),
  );
  const plain = await capture(ctx, "strength=0");
  const color = [32, 96, 192];
  const linearColor = color.map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const mapped = await capture(
    ctx,
    "strength=0",
    null,
    textureCase((material) => ({ ...material, textures: { baseColor: true } }), "baseColor", color),
  );
  const factor = await capture(
    ctx,
    "strength=0",
    null,
    textureCase(
      (material) => ({
        ...material,
        baseColor: material.baseColor.map((value, c) => (c < 3 ? value * linearColor[c] : value)),
      }),
      null,
      color,
    ),
  );
  const baseError = maxPixelError(mapped, factor);
  ctx.check(
    "raw base texture matches linear scalar oracle (one sRGB decode)",
    baseError <= 1,
    `${baseError} maximum byte error`,
  );
  const withMR = (material) => ({
    ...material,
    metallic: 0.8,
    textures: { metallicRoughness: true },
  });
  const mr = await capture(ctx, "strength=0", null, textureCase(withMR, "orm", [0, 64, 192]));
  const mrOtherRed = await capture(
    ctx,
    "strength=0",
    null,
    textureCase(withMR, "orm", [255, 64, 192]),
  );
  const mrFactor = await capture(
    ctx,
    "strength=0",
    null,
    textureCase(
      (material) => ({
        ...material,
        roughness: (material.roughness * 64) / 255,
        metallic: (0.8 * 192) / 255,
      }),
      null,
      [255, 255, 255],
    ),
  );
  ctx.check("MR-only map ignores unrelated red occlusion channel", mr.data.equals(mrOtherRed.data));
  ctx.check(
    "raw MR G/B match independent scalar factors",
    maxPixelError(mr, mrFactor) <= 1,
    `${maxPixelError(mr, mrFactor)} maximum byte error`,
  );
  const withAO = (material) => ({
    ...material,
    occlusionStrength: 0.5,
    textures: { occlusion: true },
  });
  const ao = await capture(ctx, "strength=0", null, textureCase(withAO, "orm", [64, 0, 0]));
  const aoOtherGB = await capture(
    ctx,
    "strength=0",
    null,
    textureCase(withAO, "orm", [64, 255, 255]),
  );
  const aoZero = await capture(
    ctx,
    "strength=0",
    null,
    textureCase(
      (material) => ({
        ...material,
        occlusionStrength: 0,
        textures: { occlusion: true },
      }),
      "orm",
      [64, 0, 0],
    ),
  );
  ctx.check("occlusion-only map ignores unrelated G/B channels", ao.data.equals(aoOtherGB.data));
  ctx.check(
    "zero occlusion strength preserves unoccluded scalar image",
    plain.data.equals(aoZero.data),
  );
  ctx.check(
    "authored occlusion strength changes visible surfaces",
    changedArea(plain, ao, 10).changed > 100,
  );
  const normal = await capture(
    ctx,
    "strength=0",
    null,
    textureCase(
      (material) => ({
        ...material,
        normalScale: 0.7,
        textures: { normal: true },
      }),
      "normal",
      [255, 0, 128],
      "nearest",
    ),
  );
  ctx.check(
    "normal map transported without claiming posed normal shading before04c",
    normal.data.equals(plain.data),
  );
  ctx.check(
    "normal image has complete authored-size mip chain before04c",
    JSON.stringify(normal.rawStats.imageTextures) ===
      JSON.stringify([{ channel: "normal", width: 4, height: 2, mipLevels: 3 }]),
    JSON.stringify(normal.rawStats.imageTextures),
  );
  ctx.check(
    "non-mip source sampler allocates only level zero",
    JSON.stringify(mapped.rawStats.imageTextures) ===
      JSON.stringify([{ channel: "baseColor", width: 4, height: 2, mipLevels: 1 }]),
    JSON.stringify(mapped.rawStats.imageTextures),
  );
  ctx.check(
    "textured material slots retain one draw for this appearance",
    mapped.rawStats.drawCalls === plain.rawStats.drawCalls && mapped.rawStats.drawCalls === 1,
    JSON.stringify({ plain: plain.rawStats.drawCalls, textured: mapped.rawStats.drawCalls }),
  );
  const gradient = await capture(ctx, "strength=0", null, uvGradientCase(false));
  const gradientOracle = await capture(ctx, "strength=0", null, uvGradientCase(true));
  ctx.check(
    "asymmetric filtered texture follows UV0 without flip/rotation",
    maxPixelError(gradient, gradientOracle) <= 2,
    `${maxPixelError(gradient, gradientOracle)} maximum byte error against vertex gradient`,
  );
  await capture(
    ctx,
    "strength=0&catalog=/assets/soldiers/candidates/blender-reference/catalog.json&class=40&clip=bend",
    "soldier-materials-blender-checker",
  );
}
