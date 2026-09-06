import { PNG } from "pngjs";
import { fileURLToPath } from "node:url";
import { requireSwiftShaderBaseline } from "./_swiftshader-baseline.ts";

export const meta = {
  name: "battle-model-palette",
  kind: "flow",
  tier: "full",
  snapshots: [],
  world: "production-mounted-composite-palette",
  describe:
    "Production beauty/shadow CPU-pose parity and live palette resource replacement; numerical evidence, not art acceptance.",
};

export async function run(ctx) {
  requireSwiftShaderBaseline(meta.name);
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(
      `${ctx.target}/renderer/battle-models?ref=1&catalog=/assets/soldiers/candidates/blender-reference/catalog.json`,
    );
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    await page.evaluate(() => window.__battleModels.freeze());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    await page.evaluate(
      async (root) => {
        const h = window.__battleModels,
          w = h.world,
          renderer = w.world.renderer;
        const module = (path) => import(`/@fs${root}${path}`);
        const threeUrl = performance
          .getEntriesByType("resource")
          .find((entry) => /\/three_webgpu\.js\?/.test(entry.name))?.name;
        if (!threeUrl) throw new Error("production Three dependency missing");
        const THREE = await import(threeUrl);
        const { evaluatePlaybackPose } = await module(
          "packages/crowd-runtime/src/actionTimeline.ts",
        );
        const { posedBundle } = await module("web/scenes/models/_posed-bundle.ts");
        const { bakeLocalAnimation } = await module(
          "packages/soldier-assets/src/localAnimation.ts",
        );
        const human = structuredClone(w.soldierAssets[40]);
        const source = structuredClone(w.soldierAssets[41]);
        const upperJoints = source.rig.bones
          .filter((bone) => /spine|arm|head/.test(bone.name))
          .map((bone) => bone.name);
        if (upperJoints.length < 2) throw new Error("authored mounted upper chain missing");
        // Manual diagnostic41 has no gameplay bindings. This test-only mask drives
        // the approved bounded composition without claiming production gait readiness.
        source.manifest.presentation = { riderUpperBodyJoints: upperJoints };
        const playback = {
          appearanceId: 41,
          base: {
            source: { kind: "clip", sample: { clip: "gait", phase: 0.18 } },
            destination: { clip: "gait", phase: 0.71 },
            weight: 0.41,
          },
          riderUpperBody: {
            source: { kind: "clip", sample: { clip: "rider-action", phase: 0.32 } },
            destination: { kind: "base" },
            weight: 0.38,
          },
        };
        const cpu = posedBundle(source, playback);
        h.set({
          classId: 41,
          clip: "gait",
          phase: 0.18,
          formation: false,
          yaw: 0.45,
          pitch: 1.15,
          zoom: 150,
          target: [0, 0, 1],
        });
        while (h.stats().pendingDraw) await new Promise(requestAnimationFrame);
        const camera = structuredClone(w.stats().camera);
        const baseInstance = {
          x: 0,
          y: 0,
          elevation: 0,
          facing: Math.PI / 2,
          classId: 41,
          faction: 0,
          alive: true,
          seed: 0,
          mounted: true,
          lod: 0,
          clip: "gait",
          phase: 0.71,
          playback,
        };
        const original = w.crowd;
        const device = renderer.backend.device;
        const buffers = [];
        let failAllocation = false;
        let failAccounting = false;
        const createStorageInfo = renderer.info.createStorageAttribute.bind(renderer.info);
        renderer.info.createStorageAttribute = (attribute) => {
          if (failAccounting && attribute.name.startsWith("soldier-palette-")) {
            failAccounting = false;
            throw new Error("deliberate failure before palette accounting");
          }
          return createStorageInfo(attribute);
        };
        const createBuffer = device.createBuffer.bind(device);
        device.createBuffer = (descriptor) => {
          const label = descriptor.label ?? "";
          if (failAllocation && label === "soldier-palette-output") {
            failAllocation = false;
            throw new Error("deliberate palette allocation failure");
          }
          const buffer = createBuffer(descriptor);
          if (label.startsWith("soldier-palette-")) {
            const record = { label, bytes: descriptor.size, destroyed: 0 };
            buffers.push(record);
            const destroy = buffer.destroy.bind(buffer);
            buffer.destroy = () => {
              record.destroyed++;
              destroy();
            };
          }
          return buffer;
        };
        const resources = () => ({
          live: buffers.filter((buffer) => !buffer.destroyed).length,
          liveBytes: buffers
            .filter((buffer) => !buffer.destroyed)
            .reduce((sum, buffer) => sum + buffer.bytes, 0),
          created: buffers.length,
          destroyed: buffers.reduce((sum, buffer) => sum + buffer.destroyed, 0),
          duplicateDestroy: buffers.some((buffer) => buffer.destroyed > 1),
        });
        const create = (assets) => original.constructor.create(renderer, w.world.scene, assets);
        const crowd = await create({ 41: source });
        original.dispose();
        w.crowd = crowd;
        w.soldierAssets = { 41: source };
        const depthShader = device.createShaderModule({
          code: `
        @group(0) @binding(0) var depth: texture_depth_2d;
        @group(0) @binding(1) var<storage,read_write> output: array<f32>;
        @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u) {
          let size=textureDimensions(depth); if(id.x>=size.x*size.y){return;}
          output[id.x]=textureLoad(depth,vec2i(i32(id.x%size.x),i32(id.x/size.x)),0);
        }`,
        });
        const depthPipeline = device.createComputePipeline({
          layout: "auto",
          compute: { module: depthShader },
        });
        async function shadowDepth() {
          const shadow = w.world.sunLight.shadow;
          const texture = renderer.backend.get(shadow.map.depthTexture).texture;
          const size = texture.width * texture.height * 4;
          const output = device.createBuffer({
            size,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
          });
          const readback = device.createBuffer({
            size,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          });
          try {
            const bind = device.createBindGroup({
              layout: depthPipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: texture.createView({ aspect: "depth-only" }) },
                { binding: 1, resource: { buffer: output } },
              ],
            });
            const encoder = device.createCommandEncoder(),
              pass = encoder.beginComputePass();
            pass.setPipeline(depthPipeline);
            pass.setBindGroup(0, bind);
            pass.dispatchWorkgroups(Math.ceil(size / 4 / 64));
            pass.end();
            encoder.copyBufferToBuffer(output, 0, readback, 0, size);
            device.queue.submit([encoder.finish()]);
            await readback.mapAsync(GPUMapMode.READ);
            return new Float32Array(readback.getMappedRange().slice(0));
          } finally {
            readback.destroy();
            output.destroy();
          }
        }
        async function draw(count, oracle = false, playbacks, readDepth = true) {
          const instance = oracle
            ? { ...baseInstance, clip: "oracle", phase: 0, playback: undefined }
            : baseInstance;
          w.drawInstances(
            Array.from({ length: count }, (_, index) => ({
              ...instance,
              playback: playbacks ? playbacks[index] : instance.playback,
            })),
            camera,
          );
          w.render();
          await w.settlePresentedFrame();
          return {
            shadow: readDepth ? Array.from(await shadowDepth()) : undefined,
            stats: w.crowd.stats(),
          };
        }
        window.__paletteProbe = {
          draw,
          async identity(mode) {
            if (mode !== "oracle") {
              const shifted = { ...human, animation: structuredClone(human.animation) };
              // Same rig, distinct sampled data. Root local translation adds a
              // known world-X displacement under the unrotated instance transform.
              for (
                let offset = 0;
                offset < shifted.animation.data.length;
                offset += shifted.animation.bones * 12
              )
                shifted.animation.data[offset] += 0.75;
              if (mode === "negative") shifted.animation = human.animation;
              const assets = { 40: human, 43: shifted, 44: { ...human } };
              const replacement = await create(assets);
              w.crowd.dispose();
              w.crowd = replacement;
              w.soldierAssets = assets;
            }
            const instances = [40, mode === "oracle" ? 40 : 43, 44].map((classId, index) => ({
              ...baseInstance,
              classId,
              mounted: false,
              playback: undefined,
              clip: "bend",
              phase: 0.37,
              x: (index - 1) * 1.5 + (mode === "oracle" && index === 1 ? 0.75 : 0),
            }));
            w.drawInstances(instances, camera);
            w.render();
            await w.settlePresentedFrame();
            return {
              shadow: Array.from(await shadowDepth()),
              stats: w.crowd.stats(),
              resources: resources(),
            };
          },
          async snapshots() {
            const frozen = Array.from({ length: 3 }, () => ({
              appearanceId: 41,
              base: {
                source: {
                  kind: "frozen",
                  locals: Object.freeze(Array.from(evaluatePlaybackPose(source, playback))),
                },
                destination: { clip: "gait", phase: 0.71 },
                weight: 0,
              },
            }));
            const first = await draw(3, false, frozen);
            const repeated = await draw(3, false, frozen, false);
            const shrunk = await draw(1, false, frozen.slice(0, 1), false);
            const departed = await draw(1, false, undefined, false);
            const reentered = await draw(1, false, frozen.slice(0, 1), false);
            return {
              first,
              repeated: repeated.stats.palettes[0],
              shrunk: shrunk.stats.palettes[0],
              departed: departed.stats.palettes[0],
              reentered: reentered.stats.palettes[0],
            };
          },
          async lifecycle() {
            const before = resources(),
              sceneCount = w.world.scene.children.length;
            failAllocation = true;
            let admissionError = "";
            try {
              await create({ 41: source });
            } catch (error) {
              admissionError = error.message;
            }
            const rejected = resources();
            const retainedScene = w.world.scene.children.length === sceneCount && w.crowd === crowd;
            failAccounting = true;
            let accountingError = "";
            let unexpected;
            try {
              unexpected = await create({ 41: source });
            } catch (error) {
              accountingError = error.message;
            } finally {
              unexpected?.dispose();
            }
            const unversioned = resources();
            failAllocation = true;
            let growthError = "";
            try {
              await draw(1025);
            } catch (error) {
              growthError = error.message;
            }
            w.render();
            await w.settlePresentedFrame();
            const failed = { stats: w.crowd.stats(), shadow: Array.from(await shadowDepth()) };
            const recovery = await draw(1);
            return {
              before,
              rejected,
              admissionError,
              retainedScene,
              accountingError,
              unversioned,
              growthError,
              failed,
              recovery,
              recoveredResources: resources(),
            };
          },
          async oracle() {
            const replacement = await create({ 41: cpu });
            w.crowd.dispose();
            w.crowd = replacement;
            w.soldierAssets = { 41: cpu };
            const result = await draw(1, true);
            return { ...result, resources: resources() };
          },
        };
      },
      fileURLToPath(new URL("../../../", import.meta.url)),
    );
    const canvas = page.locator("#renderer-canvas");
    const empty = await page.evaluate(() => window.__paletteProbe.draw(0));
    const actual = await page.evaluate(() => window.__paletteProbe.draw(1));
    const actualImage = PNG.sync.read(await canvas.screenshot());
    const grown = await page.evaluate(() => window.__paletteProbe.draw(257));
    const grownImage = PNG.sync.read(await canvas.screenshot());
    ctx.check(
      "same-pose growth preserves production beauty pixels",
      Buffer.compare(actualImage.data, grownImage.data) === 0,
    );
    ctx.check(
      "growth prepares every visible instance",
      grown.stats.palettes[0].visible === 257 && grown.stats.palettes[0].capacity >= 257,
      grown.stats.palettes,
    );
    const lifecycle = await page.evaluate(() => window.__paletteProbe.lifecycle());
    ctx.check(
      "partial initial allocation rejects without orphan buffers or scene nodes",
      lifecycle.admissionError === "deliberate palette allocation failure" &&
        lifecycle.retainedScene &&
        lifecycle.before.live === lifecycle.rejected.live &&
        !lifecycle.rejected.duplicateDestroy,
      {
        before: lifecycle.before,
        rejected: lifecycle.rejected,
        error: lifecycle.admissionError,
        retainedScene: lifecycle.retainedScene,
      },
    );
    ctx.check(
      "failed live growth suppresses the whole crowd and preserves the original error",
      lifecycle.growthError === "deliberate palette allocation failure" &&
        lifecycle.failed.stats.uploadFailed &&
        lifecycle.failed.stats.meshDrawCalls === 0 &&
        lifecycle.failed.stats.visible === 0,
      { error: lifecycle.growthError, stats: lifecycle.failed.stats },
    );
    ctx.check(
      "allocated but unaccounted palette buffer is retired without masking its error",
      lifecycle.accountingError === "deliberate failure before palette accounting" &&
        lifecycle.unversioned.live === lifecycle.before.live &&
        !lifecycle.unversioned.duplicateDestroy,
      { error: lifecycle.accountingError, resources: lifecycle.unversioned },
    );
    ctx.check(
      "next complete upload recovers the production crowd",
      !lifecycle.recovery.stats.uploadFailed &&
        lifecycle.recovery.stats.visible === 1 &&
        lifecycle.recoveredResources.live === 6 &&
        !lifecycle.recoveredResources.duplicateDestroy,
      { stats: lifecycle.recovery.stats, resources: lifecycle.recoveredResources },
    );
    const snapshots = await page.evaluate(() => window.__paletteProbe.snapshots());
    const snapshotBytes = snapshots.first.stats.palettes[0].bones * 48;
    ctx.check(
      "snapshot growth uploads only new immutable poses and reentry after retirement",
      snapshots.first.stats.palettes[0].snapshotUploadedBytes === snapshotBytes * 3 &&
        snapshots.repeated.snapshotUploadedBytes === 0 &&
        snapshots.shrunk.snapshotUploadedBytes === 0 &&
        snapshots.shrunk.residentSnapshots === 1 &&
        snapshots.departed.residentSnapshots === 0 &&
        snapshots.reentered.snapshotUploadedBytes === snapshotBytes &&
        snapshots.reentered.snapshotSlotHighWater === 3,
      {
        first: snapshots.first.stats.palettes[0],
        repeated: snapshots.repeated,
        shrunk: snapshots.shrunk,
        departed: snapshots.departed,
        reentered: snapshots.reentered,
      },
    );
    const oracle = await page.evaluate(() => window.__paletteProbe.oracle());
    const oracleImage = PNG.sync.read(await canvas.screenshot());
    const depth = (a, b) => {
      let foreground = 0,
        mismatch = 0,
        max = 0;
      for (let i = 0; i < a.length; i++) {
        if (Math.abs(a[i] - empty.shadow[i]) > 1e-7 || Math.abs(b[i] - empty.shadow[i]) > 1e-7) {
          foreground++;
          const error = Math.abs(a[i] - b[i]);
          max = Math.max(max, error);
          if (error > 1e-6) mismatch++;
        }
      }
      return { foreground, mismatch, max };
    };
    const growthDepth = depth(actual.shadow, grown.shadow),
      cpuDepth = depth(actual.shadow, oracle.shadow);
    ctx.check(
      "failed live upload leaves no stale production shadow",
      depth(empty.shadow, lifecycle.failed.shadow).foreground === 0,
    );
    ctx.check(
      "recovered palette restores original shadow",
      depth(actual.shadow, lifecycle.recovery.shadow).mismatch === 0,
    );
    ctx.check(
      "replacing the admitted crowd retires old palette storage exactly once",
      oracle.resources.live === 6 &&
        !oracle.resources.duplicateDestroy &&
        oracle.resources.destroyed > 6,
      oracle.resources,
    );
    ctx.check(
      "growth preserves the actual production shadow map",
      growthDepth.foreground > 4 && growthDepth.mismatch === 0,
      growthDepth,
    );
    ctx.check(
      "frozen composed locals preserve the actual shadow after snapshot-buffer growth",
      depth(actual.shadow, snapshots.first.shadow).mismatch === 0,
      depth(actual.shadow, snapshots.first.shadow),
    );
    ctx.check(
      "actual shadow agrees with independently CPU-posed mesh",
      cpuDepth.foreground > 4 && cpuDepth.mismatch === 0,
      cpuDepth,
    );
    let changed = 0,
      severe = 0,
      maxChannel = 0;
    for (let i = 0; i < actualImage.data.length; i += 4) {
      const error = Math.max(
        ...[0, 1, 2].map((channel) =>
          Math.abs(actualImage.data[i + channel] - oracleImage.data[i + channel]),
        ),
      );
      if (error) changed++;
      if (error > 2) severe++;
      maxChannel = Math.max(maxChannel, error);
    }
    ctx.check("production beauty agrees with CPU-posed mesh", severe === 0, {
      changed,
      severe,
      maxChannel,
    });
    const identity = await page.evaluate(() => window.__paletteProbe.identity("actual"));
    const identityImage = PNG.sync.read(await canvas.screenshot());
    const identityOracle = await page.evaluate(() => window.__paletteProbe.identity("oracle"));
    const identityOracleImage = PNG.sync.read(await canvas.screenshot());
    const negative = await page.evaluate(() => window.__paletteProbe.identity("negative"));
    const negativeImage = PNG.sync.read(await canvas.screenshot());
    const pixelErrors = (a, b) => {
      let severe = 0;
      for (let pixel = 0; pixel < a.data.length; pixel += 4)
        if (
          [0, 1, 2].some(
            (channel) => Math.abs(a.data[pixel + channel] - b.data[pixel + channel]) > 2,
          )
        )
          severe++;
      return severe;
    };
    const identityDepth = depth(identity.shadow, identityOracle.shadow);
    ctx.check(
      "distinct animation data stays independent while a third appearance shares its original",
      identity.stats.palettes.length === 2 &&
        identity.stats.palettes
          .map((group) => group.visible)
          .sort()
          .join() === "1,2" &&
        identity.resources.live === 12 &&
        pixelErrors(identityImage, identityOracleImage) === 0 &&
        identityDepth.mismatch === 0,
      {
        groups: identity.stats.palettes,
        resources: identity.resources,
        severePixels: pixelErrors(identityImage, identityOracleImage),
        depth: identityDepth,
      },
    );
    ctx.check(
      "aliased-animation negative control visibly fails the independent displacement oracle",
      pixelErrors(negativeImage, identityOracleImage) > 50 &&
        depth(negative.shadow, identityOracle.shadow).mismatch > 4,
      {
        severePixels: pixelErrors(negativeImage, identityOracleImage),
        depth: depth(negative.shadow, identityOracle.shadow),
      },
    );
  } finally {
    await page.close();
  }
}
