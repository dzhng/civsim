import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

export const meta = {
  name: "raw-pose-palette",
  kind: "flow",
  world: "raw-authored-pose-fixture",
  tier: "quick",
  snapshots: [],
  describe: "Actual raw palette skinning and depth versus CPU-posed authored geometry.",
};

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 384, height: 384 } });
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  await page.route(`${ctx.target}/__raw-palette`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}canvas{width:384px;height:384px}</style><canvas></canvas>",
    }),
  );
  try {
    await page.goto(`${ctx.target}/__raw-palette`);
    await page.evaluate(async (root) => {
      const module = (path) => import(`/@fs${root}${path}`);
      const { createFrameShell } = await module("packages/renderer-core/src/frameShell.ts");
      const { chartCamera3d } = await module("packages/renderer-core/src/camera3d.ts");
      const { SkinnedCrowdPipeline } = await module(
        "packages/renderer-core/src/skinnedPipeline.ts",
      );
      const { decodeSoldierMesh } = await module("packages/soldier-assets/src/appearanceBundle.ts");
      const { bakeLocalAnimation } = await module("packages/soldier-assets/src/localAnimation.ts");
      const { evaluatePlaybackPose } = await module("packages/crowd-runtime/src/actionTimeline.ts");
      const { localPoseToJointMatrices, sampleRigLocalPose, mat4Identity } = await module(
        "packages/soldier-assets/src/localPose.ts",
      );
      const { poseSoldierMesh } = await module("packages/soldier-assets/src/skin.ts");
      // This fixture authors local data from the committed Blender source; it is
      // not an old-format runtime reader or a replacement loader.
      const load = async (name) => {
        const json = async (file) =>
          (await fetch(`/assets/soldiers/candidates/blender-reference/${name}/${file}`)).json();
        const [rig, meshJson, material, manifest] = await Promise.all([
          json("skeleton.json"),
          json("tier-0.mesh.json"),
          json("materials.json"),
          json("appearance.json"),
        ]);
        const mesh = decodeSoldierMesh(meshJson);
        return {
          rig,
          animation: bakeLocalAnimation(rig),
          manifest,
          tiers: [mesh, mesh, mesh],
          farMesh: mesh,
          surface: {
            textures: {},
            materials: material.materials.map((m) => ({ ...m, textures: undefined })),
          },
        };
      };
      const bundle = await load("human"),
        mounted = await load("mounted");
      // Explicit test presentation mask uses the Blender rider hierarchy. This
      // isolates layered composition without inventing a gameplay action table.
      mounted.manifest.presentation = {
        riderUpperBodyJoints: ["rider-spine", "rider-arm", "rider-head"],
      };
      // Same joint layout, genuinely different authored local data. The rig's
      // CPU channels and GPU bake change together; a sparse ID shares the original.
      const shiftedRig = structuredClone(bundle.rig);
      shiftedRig.bones[0].bind.T[0] += 0.28;
      for (const clip of shiftedRig.clips) {
        clip.loop = true;
        const translation = clip.tracks[0]?.T;
        if (translation)
          translation.values = translation.values.map(
            (value, i) => value + (i % 3 === 0 ? 0.28 : 0),
          );
      }
      const shifted = { ...bundle, rig: shiftedRig, animation: bakeLocalAnimation(shiftedRig) };
      const catalog = { 0: bundle, 1: mounted, 5: shifted, 17: bundle };
      const rig = bundle.rig;
      const shell = await createFrameShell(document.querySelector("canvas"), {
        sun: { sunAzimuth: 0.7, sunElevation: 0.6 },
      });
      const device = shell.device;
      const errors = [];
      device.addEventListener("uncapturederror", (event) => errors.push(event.error.message));
      // Production discards depth after its final consumer. Keep that same pass's
      // attachment only for this bounded post-pass numerical readback.
      const createCommandEncoder = device.createCommandEncoder.bind(device);
      device.createCommandEncoder = (descriptor) => {
        const encoder = createCommandEncoder(descriptor);
        const beginRenderPass = encoder.beginRenderPass.bind(encoder);
        encoder.beginRenderPass = (descriptor) =>
          beginRenderPass(
            descriptor.depthStencilAttachment
              ? {
                  ...descriptor,
                  depthStencilAttachment: {
                    ...descriptor.depthStencilAttachment,
                    depthStoreOp: "store",
                  },
                }
              : descriptor,
          );
        return encoder;
      };
      let depth;
      const createTexture = device.createTexture.bind(device);
      device.createTexture = (descriptor) => {
        const texture = createTexture(
          descriptor.format === "depth32float"
            ? { ...descriptor, usage: descriptor.usage | GPUTextureUsage.COPY_SRC }
            : descriptor,
        );
        if (descriptor.format === "depth32float") depth = texture;
        return texture;
      };
      const records = [];
      const createBuffer = device.createBuffer.bind(device);
      device.createBuffer = (descriptor) => {
        const buffer = createBuffer(descriptor);
        if (descriptor.label?.startsWith("skinned-")) {
          const record = { label: descriptor.label, size: descriptor.size, destroyed: 0 };
          records.push(record);
          const destroy = buffer.destroy.bind(buffer);
          buffer.destroy = () => {
            record.destroyed++;
            destroy();
          };
        }
        return buffer;
      };
      shell.resize({ width: 384, height: 384, dpr: 1 });
      const camera = { x: 0.45, y: 0, zoom: 65, pitch: 1, yaw: 0.25 };
      const camera3d = chartCamera3d(camera, 384);
      camera3d.target[2] = 1.2;
      shell.setCamera({ ...camera, camera3d });
      const gpu = await SkinnedCrowdPipeline.create(shell, catalog);
      let oracle;
      const clip = (phase) => ({ clip: "bend", phase });
      const sources = [
        clip(0.371),
        {
          appearanceId: 0,
          base: {
            source: { kind: "clip", sample: clip(0.17) },
            destination: clip(0.83),
            weight: 0.4,
          },
        },
        {
          appearanceId: 0,
          base: {
            source: {
              kind: "frozen",
              locals: Object.freeze(Array.from(sampleRigLocalPose(rig, "bend", 0.31))),
            },
            destination: clip(0.93),
            weight: 0.37,
          },
        },
        clip(1),
      ];
      const gait = { clip: "gait", phase: 0.41 },
        action = { clip: "rider-action", phase: 0.73 };
      const mountedPlayback = {
        appearanceId: 1,
        base: { source: { kind: "clip", sample: gait }, destination: gait, weight: 1 },
        riderUpperBody: {
          source: { kind: "clip", sample: { ...action, phase: 0.1 } },
          destination: action,
          weight: 0.63,
        },
      };
      const frozenUpper = Object.freeze(
        Array.from(sampleRigLocalPose(mounted.rig, "rider-action", 0.27)),
      );
      const cases = sources.map((source) => [{ classId: 0, source }]);
      cases.push(
        [{ classId: 1, source: mountedPlayback }],
        [
          {
            classId: 1,
            source: {
              ...mountedPlayback,
              riderUpperBody: {
                source: { kind: "frozen", locals: frozenUpper },
                destination: { kind: "base" },
                weight: 0.44,
              },
            },
          },
        ],
      );
      const frozen = (phase) => ({
        appearanceId: 0,
        base: {
          source: {
            kind: "frozen",
            locals: Object.freeze(Array.from(sampleRigLocalPose(rig, "bend", phase))),
          },
          destination: clip(0.91),
          weight: 0.38,
        },
      });
      const growing = [frozen(0.12), frozen(0.35), frozen(0.72)];
      cases.push(
        growing.map((source, i) => ({
          classId: i === 2 ? 17 : 0,
          source,
          x: (i - 1) * 1.7,
          lod: i,
        })),
        [{ classId: 0, source: growing[0] }],
        [
          { classId: 0, source: clip(0.54), x: -1.7 },
          { classId: 5, source: clip(0.54) },
          { classId: 17, source: clip(0.54), x: 1.7, lod: 2 },
        ],
        [{ classId: 5, source: clip(1) }],
      );
      window.rawPaletteCaseCount = cases.length;
      const instance = {
        x: 0,
        y: 0,
        facing: Math.PI / 2,
        classId: 0,
        faction: 0,
        alive: true,
        seed: 0,
        mounted: false,
        lod: 0,
        clip: "bend",
        phase: 0,
      };
      window.rawPaletteRender = async (index, cpu) => {
        let pipeline = gpu;
        const inputs = [];
        if (cpu) {
          oracle?.dispose();
          const posedCatalog = {};
          cases[index].forEach(({ source, classId, ...placement }, item) => {
            const bundle = catalog[classId],
              mesh = bundle.tiers[0],
              rig = bundle.rig;
            const playback =
              "base" in source
                ? source
                : {
                    appearanceId: classId,
                    base: {
                      source: { kind: "clip", sample: source },
                      destination: source,
                      weight: 1,
                    },
                  };
            const posed = poseSoldierMesh(
              mesh,
              localPoseToJointMatrices(rig, evaluatePlaybackPose(bundle, playback)),
            );
            const identityRig = {
              bones: rig.bones.map((bone) => ({
                ...bone,
                parent: -1,
                bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] },
                inverseBind: mat4Identity(),
              })),
              clips: [{ name: "static", duration: 0, loop: false, tracks: {} }],
            };
            const posedMesh = { ...mesh, ...posed };
            posedCatalog[item] = {
              ...bundle,
              rig: identityRig,
              animation: bakeLocalAnimation(identityRig),
              tiers: [posedMesh, posedMesh, posedMesh],
            };
            inputs.push({ ...instance, ...placement, classId: item, clip: "static" });
          });
          oracle = await SkinnedCrowdPipeline.create(shell, posedCatalog);
          pipeline = oracle;
        } else
          for (const { source, ...placement } of cases[index])
            inputs.push({
              ...instance,
              ...placement,
              ...("base" in source ? { playback: source } : source),
            });
        pipeline.upload(inputs);
        shell.drawFrame({
          clear: { r: 0.02, g: 0.02, b: 0.02, a: 1 },
          precompute: (encoder) => pipeline.precompute(encoder),
          passes: [
            {
              id: "raw-palette",
              role: "world-opaque",
              phase: "world-depth",
              depth: "read-write",
              draw: (pass) => pipeline.draw(pass),
            },
          ],
        });
        const readback = device.createBuffer({
          size: 384 * 384 * 4,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        try {
          const encoder = device.createCommandEncoder();
          encoder.copyTextureToBuffer(
            { texture: depth, aspect: "depth-only" },
            { buffer: readback, bytesPerRow: 384 * 4 },
            [384, 384],
          );
          device.queue.submit([encoder.finish()]);
          await readback.mapAsync(GPUMapMode.READ);
          return {
            depth: Array.from(new Float32Array(readback.getMappedRange())),
            stats: pipeline.stats(),
          };
        } finally {
          readback.destroy();
        }
      };
      window.closeRawPalette = () => {
        gpu.dispose();
        oracle?.dispose();
        shell.destroy();
        return {
          allocations: records.length,
          allDestroyedOnce: records.every((record) => record.destroyed === 1),
          errors,
        };
      };
    }, root);
    const count = await page.evaluate(() => window.rawPaletteCaseCount);
    for (let index = 0; index < count; index++) {
      const gpu = await page.evaluate((index) => window.rawPaletteRender(index, false), index);
      ctx.check(
        `raw pose ${index}: one palette per submitted mesh occurrence`,
        gpu.stats.rigVariants === 3 &&
          gpu.stats.posePalettes.reduce((sum, palette) => sum + palette.instances, 0) ===
            ([6, 8].includes(index) ? 3 : 1),
        gpu.stats.posePalettes,
      );
      if (index === 6)
        ctx.check(
          "raw growth keeps three immutable snapshot sources resident",
          gpu.stats.posePalettes[0].residentSnapshots === 3,
          gpu.stats.posePalettes[0],
        );
      if (index === 7)
        ctx.check(
          "raw shrink reuses the retained immutable source without upload",
          gpu.stats.posePalettes[0].snapshotUploadBytes === 0,
          gpu.stats.posePalettes[0],
        );
      const gpuImage = PNG.sync.read(await page.locator("canvas").screenshot());
      const cpu = await page.evaluate((index) => window.rawPaletteRender(index, true), index);
      const cpuImage = PNG.sync.read(await page.locator("canvas").screenshot());
      let depthError = 0,
        pixelError = 0,
        foreground = 0;
      for (let i = 0; i < gpu.depth.length; i++) {
        depthError = Math.max(depthError, Math.abs(gpu.depth[i] - cpu.depth[i]));
        if (gpu.depth[i] > 0) foreground++;
        for (let channel = 0; channel < 3; channel++)
          pixelError = Math.max(
            pixelError,
            Math.abs(gpuImage.data[i * 4 + channel] - cpuImage.data[i * 4 + channel]),
          );
      }
      ctx.check(`raw pose ${index}: authored body reaches real depth`, foreground > 1000, {
        foreground,
      });
      ctx.check(`raw pose ${index}: visible weighted result matches CPU oracle`, pixelError <= 2, {
        pixelError,
      });
      ctx.check(`raw pose ${index}: depth matches CPU oracle`, depthError <= 1e-6, { depthError });
    }
    const disposed = await page.evaluate(() => window.closeRawPalette());
    ctx.check(
      "raw pose resource generations are released exactly once",
      disposed.allDestroyedOnce,
      disposed,
    );
    ctx.check(
      "raw pose commands pass actual GPU validation",
      disposed.errors.length === 0,
      disposed.errors,
    );
  } finally {
    await page.close();
  }
}
