import { requireSwiftShaderBaseline } from "./_swiftshader-baseline.ts";

export const meta = {
  name: "battle-model-far-admission",
  kind: "behavioral",
  world: "battle-models-gpu-admission",
  tier: "full",
  snapshots: [],
  describe:
    "A real invalid WebGPU pipeline must reject atlas preparation and retain the previous visible crowd.",
};

export async function run(ctx) {
  requireSwiftShaderBaseline(meta.name);
  // Like renderer-fault-injection, collect the expected diagnostic explicitly.
  const page = await ctx.browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  try {
    await page.goto(`${ctx.target}/renderer/battle-models?ref=1`);
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    await page.evaluate(() => window.__battleModels.freeze());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    const before = await page.screenshot();
    const result = await page.evaluate(async () => {
      const world = window.__battleModels.world,
        renderer = world.world.renderer;
      const device = renderer.backend.device;
      const original = device.createRenderPipeline.bind(device);
      let injected = false,
        rejected = false,
        message = "",
        unexpectedAtlas;
      const uncaptured = [];
      const onError = (event) => uncaptured.push(event.error.message);
      device.addEventListener("uncapturederror", onError);
      const texturesBefore = renderer.info.memory.textures;
      // Different anchor constants force a fresh bake pipeline, not reuse of a
      // previously admitted cached pipeline. Geometry remains diagnostic-only.
      const bundle = structuredClone(world.soldierAssets[0]);
      for (let i = 0; i < bundle.farMesh.positions.length; i += 3)
        bundle.farMesh.positions[i] += 0.12345;
      device.createRenderPipeline = (descriptor) => {
        if (
          !injected &&
          descriptor.fragment?.targets.length === 3 &&
          descriptor.vertex.buffers.length > 1
        ) {
          injected = true;
          return original({
            ...descriptor,
            vertex: {
              ...descriptor.vertex,
              buffers: [...descriptor.vertex.buffers, descriptor.vertex.buffers[0]],
            },
          });
        }
        return original(descriptor);
      };
      try {
        unexpectedAtlas = await world.crowd.constructor.create(renderer, world.world.scene, {
          0: bundle,
        });
      } catch (error) {
        rejected = true;
        message = String(error);
      } finally {
        device.createRenderPipeline = original;
        unexpectedAtlas?.dispose();
      }
      await new Promise(requestAnimationFrame);
      world.render();
      await world.settlePresentedFrame();
      device.removeEventListener("uncapturederror", onError);
      return {
        injected,
        rejected,
        message,
        uncaptured,
        texturesBefore,
        texturesAfter: renderer.info.memory.textures,
        targetRestored: renderer.getRenderTarget() === null,
      };
    });
    ctx.check("real invalid pipeline was injected", result.injected, JSON.stringify(result));
    ctx.check(
      "GPU admission rejects invalid pipeline submission",
      result.rejected && /atlas GPU admission failed/.test(result.message),
      result.message,
    );
    ctx.check(
      "failed preparation disposes GPU textures and restores target",
      result.texturesBefore === result.texturesAfter && result.targetRestored,
      JSON.stringify(result),
    );
    ctx.check(
      "validation is captured rather than emitted after replacement",
      result.uncaptured.length === 0,
      JSON.stringify(result.uncaptured),
    );
    ctx.check("last admitted crowd remains byte-identical", before.equals(await page.screenshot()));
    ctx.check(
      "only the deliberate nested pipeline validation diagnostic was logged",
      errors.length === 1 &&
        /Render pipeline creation failed/.test(errors[0]) &&
        /Attribute shader location \(0\) is used more than once/.test(errors[0]),
      JSON.stringify(errors),
    );
  } finally {
    await page.close();
  }
}
