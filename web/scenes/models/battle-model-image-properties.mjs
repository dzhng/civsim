import { PNG } from "pngjs";
import { requireSwiftShaderBaseline } from "./_swiftshader-baseline.ts";

export const meta = {
  name: "battle-model-image-properties",
  kind: "visual",
  world: "production-soldier-image-material-diagnostic",
  tier: "full",
  snapshots: ["battle/image-properties/checker-near", "battle/image-properties/checker-far"],
  describe:
    "Production near/far PNG UV, sampler and channel consumption; failed image reload preserves the last good scene.",
};

function png(width, height, pixels) {
  const image = new PNG({ width, height });
  image.data = Buffer.from(pixels);
  return Array.from(PNG.sync.write(image));
}
function difference(a, b) {
  const x = PNG.sync.read(a),
    y = PNG.sync.read(b);
  let changed = 0,
    max = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    const d = Math.max(...[0, 1, 2].map((c) => Math.abs(x.data[i + c] - y.data[i + c])));
    max = Math.max(max, d);
    if (d > 2) changed++;
  }
  return { changed, max };
}

export async function run(ctx) {
  requireSwiftShaderBaseline(meta.name);
  // Expected HTTP failure has a precise URL and status. All other console or
  // page errors remain failures, including GPU validation and decode logging.
  const page = await ctx.browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  let missingImage = false,
    expected404 = 0;
  const imageUrl = `${ctx.target}/__soldier-image-probe.png`;
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (!["warning", "error"].includes(message.type())) return;
    if (missingImage && message.location().url === imageUrl && /404/.test(message.text()))
      expected404++;
    else errors.push(message.text());
  });
  const colors = [32, 64, 192, 255, 200, 40, 80, 255, 50, 180, 70, 255, 220, 180, 20, 255];
  const checker = png(2, 2, colors),
    orm = png(1, 1, [64, 128, 192, 255]);
  const normal = png(1, 1, [255, 0, 0, 255]);
  const decode = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  try {
    await page.goto(
      `${ctx.target}/renderer/battle-models?ref=1&catalog=/assets/soldiers/fixtures/placeholder-soldiers/catalog.json`,
    );
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    await page.evaluate(() => window.__battleModels.freeze());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    const captures = {};
    for (const tier of ["near", "far"])
      for (const mode of [
        "scalar",
        "checker",
        "base",
        "base-oracle",
        "repeat",
        "clamp",
        "clamp-oracle",
        "bottom-left-oracle",
        "bottom-right-oracle",
        "linear",
        "linear-oracle",
        "mr",
        "mr-oracle",
        "ao",
        "ao-oracle",
        "normal",
      ]) {
        const state = await page.evaluate(
          async ({ tier, mode, checker, orm, normal, decoded }) => {
            const h = window.__battleModels,
              w = h.world;
            h.set({
              classId: 0,
              yaw: 0.15,
              pitch: 1.15,
              zoom: 80,
              formation: false,
              clip: "idle",
              phase: 0,
            });
            while (h.stats().pendingDraw) await new Promise(requestAnimationFrame);
            await new Promise(requestAnimationFrame);
            window.__imagePropertySource ??= structuredClone(w.soldierAssets[0]);
            const bundle = structuredClone(window.__imagePropertySource),
              mesh = bundle.tiers[0];
            mesh.colors.fill(1);
            mesh.materialIds.fill(0);
            mesh.factionMasks.fill(0);
            bundle.tiers = [mesh, mesh, mesh];
            bundle.farMesh = mesh;
            if (mode === "checker") {
              // Placeholder UVs are constant. Give this diagnostic an explicit
              // planar X/Z layout, without changing geometry, normals or animation.
              const xs = [],
                zs = [];
              for (let i = 0; i < mesh.positions.length; i += 3) {
                xs.push(mesh.positions[i]);
                zs.push(mesh.positions[i + 2]);
              }
              const minX = Math.min(...xs),
                spanX = Math.max(...xs) - minX;
              const minZ = Math.min(...zs),
                spanZ = Math.max(...zs) - minZ;
              for (let i = 0; i < xs.length; i++)
                mesh.uvs.set([(xs[i] - minX) / spanX, (zs[i] - minZ) / spanZ], i * 2);
            } else
              for (let i = 0; i < mesh.uvs.length; i += 2)
                mesh.uvs.set(
                  [
                    mode === "repeat" || mode === "clamp" ? 1.25 : mode === "linear" ? 0.5 : 0.25,
                    0.25,
                  ],
                  i,
                );
            const material = {
              name: "image-control",
              baseColor: [0.7, 0.8, 0.9, 1],
              roughness: 0.8,
              metallic: 0.6,
            };
            const sampler = {
              magFilter: mode === "linear" ? "linear" : "nearest",
              minFilter: mode === "linear" ? "linear" : "nearest",
              mipmapFilter: "none",
              wrapS: mode === "repeat" ? "repeat" : "clamp-to-edge",
              wrapT: "clamp-to-edge",
            };
            const textures = {};
            const image = (bytes) => ({
              image: new Uint8Array(bytes),
              mimeType: "image/png",
              sampler,
            });
            if (["checker", "base", "repeat", "clamp", "linear"].includes(mode)) {
              textures.baseColor = image(checker);
              material.textures = { baseColor: true };
            }
            const texelOracle = [
              "base-oracle",
              "clamp-oracle",
              "bottom-left-oracle",
              "bottom-right-oracle",
            ].indexOf(mode);
            if (texelOracle >= 0 || mode === "linear-oracle") {
              const expected =
                texelOracle >= 0
                  ? decoded[texelOracle]
                  : decoded[0].map((v, i) => (v + decoded[1][i]) / 2);
              material.baseColor = material.baseColor.map((v, i) => (i < 3 ? v * expected[i] : v));
            }
            if (mode === "mr") {
              textures.orm = image(orm);
              material.textures = { metallicRoughness: true };
            }
            if (mode === "mr-oracle") {
              material.roughness *= 128 / 255;
              material.metallic *= 192 / 255;
            }
            if (mode === "ao") {
              textures.orm = image(orm);
              material.textures = { occlusion: true };
              material.occlusionStrength = 0.7;
            }
            if (mode === "normal") {
              textures.normal = image(normal);
              material.textures = { normal: true };
              material.normalScale = 2;
            }
            bundle.surface = { materials: [material], textures };
            const replacement = await w.crowd.constructor.create(w.world.renderer, w.world.scene, {
              0: bundle,
            });
            w.crowd.dispose();
            w.crowd = replacement;
            w.soldierAssets = { 0: bundle };
            if (mode === "ao-oracle") {
              // Independent scalar AO formula, preserving the existing grounding
              // node. This is an oracle only, not a separate production renderer.
              const expected = 1 + (64 / 255 - 1) * 0.7;
              for (const mesh of [
                ...replacement.buckets[0].map((b) => b.mesh),
                replacement.impostors[0].mesh,
              ]) {
                mesh.material.aoNode = mesh.material.aoNode.mul(expected);
                mesh.material.needsUpdate = true;
              }
            }
            const camera = structuredClone(w.stats().camera);
            // Hold the inspection camera fixed and explicitly select far;
            // this is material verification, not production-distance approval.
            if (tier === "far") camera.zoom = 0.9;
            w.drawInstances(
              [
                {
                  x: 0,
                  y: 0,
                  elevation: 0,
                  facing: Math.PI / 2,
                  classId: 0,
                  faction: 0,
                  alive: true,
                  frame: 0,
                  clip: "idle",
                  phase: 0,
                  seed: 0,
                  mounted: false,
                  lod: 0,
                },
              ],
              camera,
            );
            w.render();
            await w.settlePresentedFrame();
            return { lod: w.stats().lod, images: replacement.stats().surfaceImages };
          },
          {
            tier,
            mode,
            checker,
            orm,
            normal,
            decoded: [0, 4, 8, 12].map((offset) => colors.slice(offset, offset + 3).map(decode)),
          },
        );
        ctx.check(
          `${tier}/${mode}: representation`,
          tier === "far" ? state.lod.impostors === 1 : state.lod.skinned === 1,
          JSON.stringify(state),
        );
        const shot = await page.screenshot();
        captures[`${tier}/${mode}`] = shot;
        if (mode === "checker")
          await ctx.snap(page, `battle/image-properties/checker-${tier}`, {
            shot,
            threshold: 0,
            maxDiffRatio: 0,
          });
        if (mode === "normal")
          ctx.check(
            `${tier}: normal PNG transported`,
            state.images.length === 1 && state.images[0].channel === "normal",
            JSON.stringify(state.images),
          );
      }
    for (const tier of ["near", "far"]) {
      for (const mode of ["base", "clamp", "linear", "mr", "ao"]) {
        const d = difference(captures[`${tier}/${mode}`], captures[`${tier}/${mode}-oracle`]);
        ctx.check(
          `${tier}: ${mode} matches independent scalar oracle`,
          d.max <= 2, // UNORM8 atlas/output rounding; snapshots remain exact.
          JSON.stringify(d),
        );
      }
      // Normal direction is independently pinned by battle-model-normal-frame.
      for (const mode of ["checker", "base", "mr", "ao", "normal"]) {
        const d = difference(captures[`${tier}/scalar`], captures[`${tier}/${mode}`]);
        ctx.check(
          `${tier}: ${mode} has a non-vacuous response`,
          d.changed > 100,
          JSON.stringify(d),
        );
      }
      ctx.check(
        `${tier}: repeat uses wrapped first texel`,
        captures[`${tier}/repeat`].equals(captures[`${tier}/base`]),
      );
      const uvResponse = [
        "base-oracle",
        "clamp-oracle",
        "bottom-left-oracle",
        "bottom-right-oracle",
      ].map((oracle) => difference(captures[`${tier}/checker`], captures[`${tier}/${oracle}`]));
      ctx.check(
        `${tier}: checker samples more than one UV texel`,
        uvResponse.every((d) => d.changed > 100),
        JSON.stringify(uvResponse),
      );
    }

    const setup = await page.evaluate(async () => {
      const h = window.__battleModels;
      const loaded = await h.reload();
      while (h.stats().pendingDraw) await new Promise(requestAnimationFrame);
      await h.world.settlePresentedFrame();
      const catalogUrl = new URL(h.world.soldierCatalogUrl, location.href);
      const catalog = await fetch(catalogUrl).then((r) => r.json());
      const manifestUrl = new URL(catalog.appearances[0], catalogUrl);
      const manifest = await fetch(manifestUrl).then((r) => r.json());
      return { loaded, surfaceUrl: new URL(manifest.materials, manifestUrl).href };
    });
    ctx.check(
      "rollback begins from admitted full catalog",
      setup.loaded.ok,
      JSON.stringify(setup.loaded),
    );
    const before = await page.screenshot();
    const live = await page.evaluate(() => {
      const w = window.__battleModels.world;
      window.__imageRollback = {
        crowd: w.crowd,
        assets: w.soldierAssets,
        nodes: [...w.world.scene.children],
        atlases: Object.values(w.crowd.impostors).map((layer) => layer.atlas),
      };
      return {
        textures: w.world.renderer.info.memory.textures,
        nodes: w.world.scene.children.length,
        appearances: Object.keys(w.soldierAssets).length,
      };
    });
    await page.route(setup.surfaceUrl, async (route) => {
      const surface = await (await route.fetch()).json();
      for (const material of surface.materials)
        material.textures = { ...material.textures, baseColor: true };
      surface.textures.baseColor = {
        image: imageUrl,
        mimeType: "image/png",
        sampler: {
          magFilter: "nearest",
          minFilter: "nearest",
          mipmapFilter: "none",
          wrapS: "clamp-to-edge",
          wrapT: "clamp-to-edge",
        },
      };
      await route.fulfill({ json: surface });
    });
    for (const failure of ["missing", "decode"]) {
      missingImage = failure === "missing";
      await page.route(imageUrl, (route) =>
        route.fulfill({
          status: missingImage ? 404 : 200,
          contentType: "image/png",
          body: "not a PNG",
        }),
      );
      const result = await page.evaluate(async () => {
        const h = window.__battleModels,
          result = await h.reload();
        while (h.stats().pendingDraw) await new Promise(requestAnimationFrame);
        await h.world.settlePresentedFrame();
        const w = h.world;
        const previous = window.__imageRollback;
        return {
          result,
          retained:
            w.crowd === previous.crowd &&
            w.soldierAssets === previous.assets &&
            w.world.scene.children.length === previous.nodes.length &&
            previous.nodes.every((node, i) => w.world.scene.children[i] === node) &&
            Object.keys(w.crowd.impostors).length === previous.atlases.length &&
            Object.values(w.crowd.impostors).every(
              (layer, i) => layer.atlas === previous.atlases[i],
            ),
          live: {
            textures: w.world.renderer.info.memory.textures,
            nodes: w.world.scene.children.length,
            appearances: Object.keys(w.soldierAssets).length,
          },
        };
      });
      ctx.check(
        `${failure}: reload error is explicit`,
        !result.result.ok &&
          result.result.error.length > 0 &&
          (failure === "missing"
            ? result.result.error.includes("HTTP 404")
            : /decode/i.test(result.result.error)),
        JSON.stringify(result),
      );
      ctx.check(`${failure}: last good pixels retained`, before.equals(await page.screenshot()));
      ctx.check(
        `${failure}: live resources and catalog retained`,
        result.retained && JSON.stringify(live) === JSON.stringify(result.live),
        JSON.stringify({ retainedIdentities: result.retained, before: live, after: result.live }),
      );
      await page.unroute(imageUrl);
    }
    ctx.check(
      "missing image has only its expected HTTP diagnostic",
      expected404 <= 1,
      String(expected404),
    );
    ctx.check("no unexpected GPU, Three or page errors", errors.length === 0, errors);
  } finally {
    await page.close();
  }
}
