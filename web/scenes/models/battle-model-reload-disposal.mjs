export const meta = {
  name: "battle-model-reload-disposal",
  kind: "flow",
  world: "disposed-battle-model-world",
  tier: "full",
  snapshots: [],
  describe:
    "Disposing a world while catalog loading or GPU admission waits cannot install a replacement crowd.",
};

export async function run(ctx) {
  for (const stage of ["palette", "atlas", "network"]) {
    const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
    try {
      // One textureless appearance separates palette and atlas admission from images.
      await page.route("**/assets/soldiers/catalog.json", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ appearances: { 0: "appearances/heavy-sword/appearance.json" } }),
        }),
      );
      await page.goto(`${ctx.target}/renderer/battle-models?ref=1`);
      await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
        timeout: 60000,
      });
      await page.evaluate(() => window.__battleModels.freeze());
      await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
      const result = await page.evaluate(async (stage) => {
        const world = window.__battleModels.world;
        await world.settlePresentedFrame();
        await world.world.renderer.resolveTimestampsAsync("render");
        const previous = world.crowd;
        const scene = world.world.scene;
        const device = world.world.renderer.backend.device;
        const originalPop = device.popErrorScope.bind(device);
        const originalBuffer = device.createBuffer.bind(device);
        const originalFetch = window.fetch;
        let release, entered;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const reached = new Promise((resolve) => {
          entered = resolve;
        });
        let scopePops = 0,
          fetches = 0;
        const pendingGeometry = () =>
          scene.children.filter(
            (object) =>
              object.name.startsWith("battle-crowd") &&
              !Object.values(previous.buckets)
                .flat()
                .some((bucket) => bucket.mesh === object) &&
              !Object.values(previous.impostors).some((layer) => layer.mesh === object),
          );
        const paletteBuffers = [];
        device.createBuffer = (descriptor) => {
          const buffer = originalBuffer(descriptor);
          if (descriptor.label?.startsWith("soldier-palette-")) {
            const record = { destroyed: 0 };
            paletteBuffers.push(record);
            const destroy = buffer.destroy.bind(buffer);
            buffer.destroy = () => {
              record.destroyed++;
              destroy();
            };
          }
          return buffer;
        };
        device.popErrorScope = async () => {
          scopePops++;
          const atStage =
            stage === "palette"
              ? pendingGeometry().length === 0
              : stage === "atlas" && pendingGeometry().length > 0;
          const result = await originalPop();
          if (atStage) {
            entered();
            await gate;
          }
          return result;
        };
        window.fetch = async (...args) => {
          fetches++;
          const result = await originalFetch(...args);
          if (stage === "network" && String(args[0]).includes("/catalog.json")) {
            entered();
            await gate;
          }
          return result;
        };
        let rejected = false,
          error = "";
        const reload = world.reloadSoldierAssets().catch((reason) => {
          rejected = true;
          error = String(reason);
        });
        await reached;
        const pendingMeshes = pendingGeometry();
        let disposedGeometry = 0;
        for (const mesh of pendingMeshes)
          mesh.geometry.addEventListener("dispose", () => disposedGeometry++);
        const scopePopsAtDispose = scopePops;
        world.dispose();
        release();
        await reload;
        const fetchesBeforeClosedReload = fetches;
        let closedReloadRejected = false;
        try {
          await world.reloadSoldierAssets();
        } catch (reason) {
          closedReloadRejected = /disposed/i.test(String(reason));
        }
        device.popErrorScope = originalPop;
        device.createBuffer = originalBuffer;
        window.fetch = originalFetch;
        return {
          rejected,
          error,
          scopePops,
          scopePopsAtDispose,
          installedReplacement: world.crowd !== previous,
          remainingCrowdMeshes: scene.children.filter((object) =>
            object.name.startsWith("battle-crowd"),
          ).length,
          pendingMeshes: pendingMeshes.length,
          disposedGeometry,
          paletteBuffers: paletteBuffers.length,
          retiredPaletteBuffers: paletteBuffers.filter((buffer) => buffer.destroyed === 1).length,
          closedReloadRejected,
          closedReloadFetches: fetches - fetchesBeforeClosedReload,
        };
      }, stage);
      ctx.check(
        `${stage}: disposed reload rejects without installation`,
        result.rejected && /disposed/i.test(result.error) && !result.installedReplacement,
        JSON.stringify(result),
      );
      ctx.check(
        `${stage}: no crowd survives world disposal`,
        result.remainingCrowdMeshes === 0,
        JSON.stringify(result),
      );
      ctx.check(
        `${stage}: closed world rejects a later reload without fetching`,
        result.closedReloadRejected && result.closedReloadFetches === 0,
        JSON.stringify(result),
      );
      if (stage === "atlas")
        ctx.check(
          "pending replacement geometry is released",
          result.pendingMeshes > 0 && result.disposedGeometry === result.pendingMeshes,
          JSON.stringify(result),
        );
      else if (stage === "network")
        ctx.check(
          "catalog completion never prepares GPU resources after disposal",
          result.scopePops === 0,
          JSON.stringify(result),
        );
      if (stage !== "network")
        ctx.check(
          `${stage}: pending palette storage is released once`,
          result.paletteBuffers > 0 && result.retiredPaletteBuffers === result.paletteBuffers,
          JSON.stringify(result),
        );
      ctx.check(
        `${stage}: no later GPU preparation starts after disposal`,
        result.scopePops === result.scopePopsAtDispose,
        JSON.stringify(result),
      );
    } finally {
      await page.close();
    }
  }
}
