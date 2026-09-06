import { PNG } from "pngjs";
import { requireSwiftShaderBaseline } from "./_swiftshader-baseline.ts";

const names = [
  "matte-near",
  "matte-far",
  "smooth-near",
  "smooth-far",
  "metal-near",
  "metal-far",
  "mask-blue-far",
  "mask-red-far",
  "flat-normal-far",
];
export const meta = {
  name: "battle-model-far-properties",
  kind: "visual",
  world: "battle-models-scalar-material-diagnostic",
  tier: "full",
  snapshots: names.map((name) => `battle/far-properties/${name}`),
  describe:
    "Explicit scalar and faction properties under production lighting; close far representation inspection is diagnostic, not production LOD acceptance.",
};

function changedPixels(a, b) {
  const x = PNG.sync.read(a),
    y = PNG.sync.read(b);
  let changed = 0;
  for (let i = 0; i < x.data.length; i += 4)
    if (Math.max(...[0, 1, 2].map((c) => Math.abs(x.data[i + c] - y.data[i + c]))) > 2) changed++;
  return changed;
}

export async function run(ctx) {
  requireSwiftShaderBaseline(meta.name);
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  const started = Date.now();
  try {
    await page.goto(`${ctx.target}/renderer/battle-models?ref=1`);
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    await page.evaluate(() => window.__battleModels.freeze());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    const resources = await page.evaluate(() => {
      const crowd = window.__battleModels.world.crowd;
      return Object.values(crowd.impostors).map((layer) => layer.stats().atlasMetrics);
    });
    ctx.check(
      "current catalog has twenty complete property atlases",
      resources.length === 20,
      JSON.stringify({ startupMs: Date.now() - started, resources }),
    );
    const bytes = resources.reduce((sum, r) => sum + r.allocatedBytes, 0);
    ctx.check(
      "allocation includes three mip chains and depth",
      bytes === 235929120,
      JSON.stringify({ residentBytes: bytes, replacementPeakBytes: bytes * 2 }),
    );
    const reload = await page.evaluate(async () => {
      const h = window.__battleModels,
        renderer = h.world.world.renderer;
      const beforeTextures = renderer.info.memory.textures;
      let replacementPeakTextures = 0;
      const originalDispose = h.world.crowd.dispose.bind(h.world.crowd);
      h.world.crowd.dispose = () => {
        replacementPeakTextures = renderer.info.memory.textures;
        originalDispose();
      };
      const started = performance.now();
      const result = await h.reload();
      while (h.stats().pendingDraw) await new Promise(requestAnimationFrame);
      return {
        result,
        reloadMs: performance.now() - started,
        beforeTextures,
        replacementPeakTextures,
        afterTextures: renderer.info.memory.textures,
      };
    });
    ctx.check(
      "full catalog replacement releases previous GPU textures",
      reload.result.ok && reload.afterTextures === reload.beforeTextures,
      JSON.stringify(reload),
    );
    const captures = {};
    for (const name of names) {
      const type = name.split("-")[0],
        far = name.endsWith("far");
      const diagnostic = await page.evaluate(
        async ({ type, far, name }) => {
          const h = window.__battleModels,
            world = h.world;
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
          window.__farPropertySource ??= world.soldierAssets[0];
          const source = window.__farPropertySource;
          const mesh = structuredClone(source.tiers[0]);
          // Identical geometry across tiers isolates the property transfer. It is
          // not a new asset, art claim, or near/far silhouette-quality baseline.
          mesh.colors.fill(1);
          mesh.materialIds.fill(0);
          mesh.factionMasks.fill(type === "mask" ? 1 : 0);
          if (type === "flat")
            for (let i = 0; i < mesh.normals.length; i += 3) mesh.normals.set([0, 0, 1], i);
          const bundle = {
            ...source,
            tiers: [mesh, mesh, mesh],
            farMesh: mesh,
            surface: {
              textures: {},
              materials: [
                {
                  name: "diagnostic-blue",
                  baseColor: [0.035, 0.065, 0.24, 1],
                  roughness: type === "smooth" ? 0.08 : 0.7,
                  metallic: type === "metal" ? 1 : 0,
                },
              ],
            },
          };
          const begin = performance.now();
          const replacement = await world.crowd.constructor.create(
            world.world.renderer,
            world.world.scene,
            { 0: bundle },
          );
          const replacementMs = performance.now() - begin;
          world.crowd.dispose();
          world.crowd = replacement;
          world.soldierAssets = { 0: bundle };
          const camera = structuredClone(world.stats().camera);
          if (far) camera.zoom = 0.9;
          const instance = {
            x: 0,
            y: 0,
            elevation: 0,
            facing: Math.PI / 2,
            classId: 0,
            faction: name.includes("red") ? 1 : 0,
            alive: true,
            frame: 0,
            clip: "idle",
            phase: 0,
            seed: 0,
            mounted: false,
            lod: 0,
          };
          world.drawInstances([instance], camera);
          world.render();
          await world.settlePresentedFrame();
          window.__farPropertyDraw = { camera, instance };
          return { replacementMs, lod: world.stats().lod };
        },
        { type, far, name },
      );
      ctx.check(
        `${name}: requested representation`,
        far ? diagnostic.lod.impostors === 1 : diagnostic.lod.skinned === 1,
        JSON.stringify(diagnostic),
      );
      const shot = await page.screenshot();
      captures[name] = shot;
      await ctx.snap(page, `battle/far-properties/${name}`, {
        shot,
        threshold: 0,
        maxDiffRatio: 0,
      });
      ctx.check(`${name}: frozen pixels`, shot.equals(await page.screenshot()));
      if (type === "matte") {
        await page.evaluate(async () => {
          await new Promise(requestAnimationFrame);
          const world = window.__battleModels.world,
            draw = window.__farPropertyDraw;
          world.drawInstances([{ ...draw.instance, faction: 1, seed: 0.93 }], draw.camera);
          world.render();
          await world.settlePresentedFrame();
        });
        ctx.check(
          `${name}: ordinary blue and seed do not become faction tint`,
          shot.equals(await page.screenshot()),
        );
      }
    }
    for (const tier of ["near", "far"])
      for (const property of ["smooth", "metal"])
        ctx.check(
          `${tier}: same blue color responds to ${property}`,
          changedPixels(captures[`matte-${tier}`], captures[`${property}-${tier}`]) > 100,
          String(changedPixels(captures[`matte-${tier}`], captures[`${property}-${tier}`])),
        );
    ctx.check(
      "far: explicit mask changes faction",
      changedPixels(captures["mask-blue-far"], captures["mask-red-far"]) > 100,
      String(changedPixels(captures["mask-blue-far"], captures["mask-red-far"])),
    );
    ctx.check(
      "far: authored per-pixel normals affect lighting",
      changedPixels(captures["matte-far"], captures["flat-normal-far"]) > 100,
      String(changedPixels(captures["matte-far"], captures["flat-normal-far"])),
    );
  } finally {
    await page.close();
  }
}
