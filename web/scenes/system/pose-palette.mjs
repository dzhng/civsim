import { fileURLToPath } from "node:url";

export const meta = {
  name: "pose-palette",
  kind: "flow",
  world: "isolated-local-palette-compute",
  tier: "quick",
  snapshots: [],
  describe:
    "Bounded Three/raw shared pose-kernel numerical feasibility; no production playback or visual acceptance.",
};

export async function run(ctx) {
  const page = await ctx.newPage();
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  await page.route(`${ctx.target}/__pose-palette`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Pose palette probe</title><canvas width=16 height=16></canvas>",
    }),
  );
  try {
    await page.goto(`${ctx.target}/__pose-palette`);
    const report = await page.evaluate(async (root) => {
      const module = (path) => import(`/@fs${root}${path}`);
      const { SoldierPosePalette } = await module(
        "packages/photoreal-renderer/src/battle/posePalette.ts",
      );
      const threeUrl = performance
        .getEntriesByType("resource")
        .find((entry) => /\/(?:three_webgpu|three\.webgpu)\.js(?:\?|$)/.test(entry.name))?.name;
      if (!threeUrl) throw new Error("production Three dependency URL missing");
      const THREE = await import(threeUrl);
      const T = THREE.TSL;
      const { bakeLocalAnimation, decodeLocalSample, resolveLocalSample } = await module(
        "packages/soldier-assets/src/localAnimation.ts",
      );
      const {
        blendLocalPoses,
        composeMaskedLocals,
        sampleRigLocalPose,
        localPoseToJointMatrices,
        mat4Identity,
      } = await module("packages/soldier-assets/src/localPose.ts");
      const { PlaybackPacker } = await module("packages/renderer-core/src/playbackPacking.ts");
      const { packRigPaletteData } = await module("packages/renderer-core/src/rigPaletteData.ts");
      const { POSE_PALETTE_HELPERS_WGSL, posePaletteFunctionWgsl } = await module(
        "packages/renderer-core/src/posePaletteWgsl.ts",
      );
      const { createFrameShell } = await module("packages/renderer-core/src/frameShell.ts");
      const { poseSoldierMesh } = await module("packages/soldier-assets/src/skin.ts");
      const renderer = new THREE.WebGPURenderer();
      await renderer.init();
      const threeShaders = [];
      const createShader = renderer.backend.device.createShaderModule.bind(renderer.backend.device);
      renderer.backend.device.createShaderModule = (descriptor) => {
        threeShaders.push(descriptor.code);
        return createShader(descriptor);
      };
      const shell = await createFrameShell(document.querySelector("canvas"), {
        sun: { sunAzimuth: 0, sunElevation: 0.5 },
      });
      const checks = [];
      const check = (name, ok, detail) => checks.push({ name, ok, detail });
      const trigInput = new Float32Array([0.9 * 0.83, Math.cos(0.9), Math.sin(0.9), 0.9 * 0.17]);
      const trigIn = new THREE.StorageBufferAttribute(trigInput, 4);
      const trigOut = new THREE.StorageBufferAttribute(1, 4);
      const trigRead = T.storage(trigIn, "vec4", 1).toReadOnly();
      const trigWrite = T.storage(trigOut, "vec4", 1);
      const trigFn = T.wgslFn(
        "fn trigProbe(input:vec4f)->vec4f { return vec4f(sin(input.x),acos(input.y),atan2(input.z,input.y),sin(input.w)); }",
      );
      const trigCompute = T.Fn(() =>
        trigWrite.element(0).assign(trigFn(trigRead.element(0))),
      )().compute(1);
      renderer.compute(trigCompute);
      const trigValues = new Float32Array(await renderer.getArrayBufferAsync(trigOut));
      const trigExpected = [
        Math.sin(trigInput[0]),
        Math.acos(trigInput[1]),
        Math.atan2(trigInput[2], trigInput[1]),
        Math.sin(trigInput[3]),
      ];
      check("trig operation residual diagnostic", true, {
        actual: Array.from(trigValues),
        expected: trigExpected,
        residual: trigExpected.map((value, i) => trigValues[i] - value),
      });
      trigCompute.dispose();
      renderer._attributes.delete(trigIn);
      renderer._attributes.delete(trigOut);
      const sineInputs = Float32Array.from({ length: 1025 }, (_, i) => (i * Math.PI) / 2048);
      const sineInput = new THREE.StorageBufferAttribute(sineInputs, 1);
      const sineOutput = new THREE.StorageBufferAttribute(sineInputs.length, 1);
      const sineRead = T.storage(sineInput, "float", sineInputs.length).toReadOnly();
      const sineWrite = T.storage(sineOutput, "float", sineInputs.length);
      const sineFn = T.wgslFn("fn sineProbe(x:f32)->f32 { return paletteSin(x); }", [
        T.wgsl(POSE_PALETTE_HELPERS_WGSL),
      ]);
      const sineCompute = T.Fn(() =>
        sineWrite.element(T.instanceIndex).assign(sineFn(sineRead.element(T.instanceIndex))),
      )().compute(sineInputs.length);
      renderer.compute(sineCompute);
      const sineValues = new Float32Array(await renderer.getArrayBufferAsync(sineOutput));
      const sineResidual = Math.max(
        ...sineInputs.map((x, i) => Math.abs(sineValues[i] - Math.sin(x))),
      );
      check("bounded Float32 sine approximation", sineResidual < 1e-6, {
        points: sineInputs.length,
        maxError: sineResidual,
      });
      sineCompute.dispose();
      renderer._attributes.delete(sineInput);
      renderer._attributes.delete(sineOutput);
      const unit = { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] };
      const hostile = {
        bones: [-1, 0, 0, 1].map((parent, i) => ({
          name: `joint-${i}`,
          parent,
          bind: { ...unit, T: [i * 0.17, i * 0.23, i * 0.11] },
          inverseBind: Array.from(mat4Identity()),
        })),
        clips: [
          {
            name: "gait",
            duration: 1,
            loop: true,
            tracks: {
              0: { T: { times: [0, 1], values: [0, 0, 0, 0.6, -0.2, 0.3] } },
              1: { R: { times: [0, 1], values: [0, 0, 0, 1, 0, 0, Math.sin(0.6), Math.cos(0.6)] } },
              2: {
                T: {
                  times: [0, 0.371, 1],
                  values: [0, 0, 0, 0, 2, 0, 0, 3, 0],
                  interpolation: "STEP",
                },
                R: {
                  times: [0, 0.371, 1],
                  values: [0, 0, 0, 1, Math.sin(0.4), 0, 0, Math.cos(0.4), 0, 0, 0, -1],
                  interpolation: "STEP",
                },
              },
              3: {
                S: {
                  times: [0, 0.29, 1],
                  values: [1, 1, 1, 1.1, 1.1, 1.1, 0.8, 0.8, 0.8],
                  interpolation: "STEP",
                },
              },
            },
          },
          {
            name: "action",
            duration: 1,
            loop: false,
            tracks: {
              0: { T: { times: [0, 1], values: [-0.3, 0.2, 0.1, -0.1, -0.4, 0.3] } },
              3: { R: { times: [0, 1], values: [0, 0, 0, 1, 0, Math.sin(0.9), 0, Math.cos(0.9)] } },
            },
          },
        ],
      };
      const mounted = await (
        await fetch("/assets/soldiers/candidates/blender-reference/mounted/skeleton.json")
      ).json();
      for (const [name, quaternion] of [
        ["near-parallel", [0, Math.sin(0.03), 0, Math.cos(0.03)]],
        ["outside-near-parallel", [0, Math.sqrt(1 - 0.99949 ** 2), 0, 0.99949]],
        ["half-turn", [1, 0, 0, 0]],
        ["antipodal", [0, 0, 0, -1]],
      ])
        hostile.clips.push({
          name,
          duration: 1,
          loop: false,
          tracks: { 3: { R: { times: [0, 1], values: [0, 0, 0, 1, ...quaternion] } } },
        });
      const mountedMesh = await (
        await fetch("/assets/soldiers/candidates/blender-reference/mounted/tier-0.mesh.json")
      ).json();
      // Valid admitted near-unit endpoints exercise the CPU slerp contract,
      // including hierarchy amplification rather than only a quaternion component.
      hostile.clips.push({
        name: "near-unit",
        duration: 1,
        loop: false,
        tracks: Object.fromEntries(
          [0, 1, 3].map((joint) => [
            joint,
            {
              R: {
                times: [0, 1],
                values: [
                  0,
                  0,
                  0,
                  1.000099,
                  0,
                  Math.sin(0.7) * 1.000099,
                  0,
                  Math.cos(0.7) * 1.000099,
                ],
              },
            },
          ]),
        ),
      });
      const syntheticMesh = {
        positions: new Float32Array([0.4, -0.2, 0.7]),
        normals: new Float32Array([0, 0, 1]),
        tangents: new Float32Array([1, 0, 0, -1]),
        joints: new Uint32Array([0, 1, 2, 3]),
        weights: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      };
      async function rawPalette(buffers, functionCode, bones, count, stepBase) {
        const device = shell.device;
        const gpu = buffers.map((data, i) => {
          const buffer = device.createBuffer({
            label: `palette-probe-raw-${i}`,
            size: Math.max(16, data.byteLength),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
          });
          if (data.byteLength) device.queue.writeBuffer(buffer, 0, data);
          return buffer;
        });
        const readback = device.createBuffer({
          size: count * bones * 64,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        try {
          const types = ["vec4f", "u32", "mat4x4f", "vec4u", "vec4f", "mat4x4f"];
          const declarations = types
            .map(
              (type, i) =>
                `@group(0) @binding(${i}) var<storage, ${i === 5 ? "read_write" : "read"}> data${i}: array<${type}>;`,
            )
            .join("\n");
          const shader = device.createShaderModule({
            code: `${declarations}\n${POSE_PALETTE_HELPERS_WGSL}\n${functionCode}\n@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u) { preparePosePalette(&data0,&data1,&data2,&data3,&data4,&data5,id.x,${count}u,${stepBase}u); }`,
          });
          const info = await shader.getCompilationInfo();
          check(
            "raw WGSL compiles",
            !info.messages.some((message) => message.type === "error"),
            info.messages.map((message) => message.message),
          );
          const pipeline = await device.createComputePipelineAsync({
            layout: "auto",
            compute: { module: shader },
          });
          const group = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: gpu.map((buffer, binding) => ({ binding, resource: { buffer } })),
          });
          shell.drawFrame({
            precompute(encoder) {
              const pass = encoder.beginComputePass();
              pass.setPipeline(pipeline);
              pass.setBindGroup(0, group);
              pass.dispatchWorkgroups(Math.ceil(count / 64));
              pass.end();
              encoder.copyBufferToBuffer(gpu[5], 0, readback, 0, count * bones * 64);
            },
            passes: [],
          });
          await readback.mapAsync(GPUMapMode.READ);
          return new Float32Array(readback.getMappedRange()).slice();
        } finally {
          readback.destroy();
          for (const buffer of gpu) buffer.destroy();
        }
      }
      async function threePalette(rig, animation, inputs, mask) {
        const owner = new SoldierPosePalette(renderer, rig, animation, {
          41: {
            manifest: {
              presentation: { riderUpperBodyJoints: mask.map((joint) => rig.bones[joint].name) },
            },
          },
        });
        try {
          await owner.initialize({ clip: animation.clips[0].name, phase: 0 });
          const callsBefore = renderer.info.compute.calls;
          owner.upload(
            inputs.length,
            (index) => inputs[index].playback,
            () => owner.metadata.upperMaskOffsets.get(41),
            () => {},
          );
          const main = threeShaders.at(-1).split("@compute")[1];
          check(
            "Three dispatch owns an explicit kernel statement",
            renderer.info.compute.calls === callsBefore + 1 &&
              /preparePosePalette\(\s*&/.test(main),
            {
              dispatchCalls: renderer.info.compute.calls - callsBefore,
              storageArguments: (main.match(/&NodeBuffer/g) ?? []).length,
            },
          );
          const result = new Float32Array(await renderer.getArrayBufferAsync(owner.columns.value));
          return result.slice(0, inputs.length * animation.bones * 16);
        } finally {
          owner.dispose();
        }
      }
      const error = (a, b) => a.reduce((max, value, i) => Math.max(max, Math.abs(value - b[i])), 0);
      try {
        for (const [name, rig, mesh] of [
          ["hostile-step", hostile, syntheticMesh],
          ["authored-mounted", mounted, mountedMesh],
        ]) {
          const animation = bakeLocalAnimation(rig),
            bones = rig.bones.length;
          const clips = rig.clips.map((clip) => clip.name),
            baseClip = clips[0],
            actionClip = clips[1];
          const mask =
            name === "hostile-step"
              ? [3]
              : rig.bones
                  .map((bone, i) => (/spine|arm|head/i.test(bone.name) ? i : -1))
                  .filter((i) => i >= 0);
          check(
            `${name}: fixture has an upper mask and nonadjacent ancestor`,
            mask.length > 0 && rig.bones.some((bone, i) => bone.parent >= 0 && bone.parent < i - 1),
            { mask, names: rig.bones.map((b) => b.name) },
          );
          const { metadata, inverseBinds, stepBase, upperMaskOffsets } = packRigPaletteData(
            rig,
            animation,
            {
              41: {
                manifest: {
                  presentation: {
                    riderUpperBodyJoints: mask.map((joint) => rig.bones[joint].name),
                  },
                },
              },
            },
          );
          const maskOffset = upperMaskOffsets.get(41);
          const sample = (clip, phase) => ({ clip, phase });
          const source = (clip, phase) => ({ kind: "clip", sample: sample(clip, phase) });
          const frozen = {
            kind: "frozen",
            locals: Object.freeze(
              Array.from(
                blendLocalPoses(
                  sampleRigLocalPose(rig, baseClip, 0.37),
                  sampleRigLocalPose(rig, actionClip, 0.64),
                  0.43,
                ),
              ),
            ),
          };
          const deathSource = {
            kind: "frozen",
            locals: Object.freeze(
              Array.from(
                composeMaskedLocals(
                  Float64Array.from(frozen.locals),
                  sampleRigLocalPose(rig, actionClip, 0.92),
                  mask,
                ),
              ),
            ),
          };
          const cases = [
            ...[0, 0.29 - 1e-10, 0.29, 0.371 - 1e-10, 0.371, 0.371 + 1e-10, 0.618, 1].map(
              (phase) => ({
                name: `sample-${phase}`,
                base: {
                  source: source(baseClip, phase),
                  destination: sample(baseClip, phase),
                  weight: 1,
                },
              }),
            ),
            ...clips.slice(2).flatMap((clip) =>
              (clip === "near-unit" ? [0, 0.25, 0.75, 1] : [0, 0.001, 0.5, 0.999, 1]).map(
                (phase) => ({
                  name: `${clip}-${phase}`,
                  base: {
                    source: source(clip, phase),
                    destination: sample(clip, phase),
                    weight: 1,
                  },
                }),
              ),
            ),
            ...[0, 0.37, 1].flatMap((weight) => [
              {
                name: `frozen-base-${weight}`,
                base: { source: frozen, destination: sample(actionClip, 0.83), weight },
              },
              {
                name: `full-body-death-${weight}`,
                base: { source: deathSource, destination: sample(actionClip, 1), weight },
              },
              {
                name: `upper-entry-${weight}`,
                base: {
                  source: source(baseClip, 0.13),
                  destination: sample(actionClip, 0.77),
                  weight: 0.38,
                },
                riderUpperBody: {
                  source: source(actionClip, 0.2),
                  destination: sample(actionClip, 0.9),
                  weight,
                },
              },
              {
                name: `upper-exit-${weight}`,
                base: {
                  source: source(baseClip, 0.13),
                  destination: sample(actionClip, 0.77),
                  weight: 0.38,
                },
                riderUpperBody: { source: frozen, destination: { kind: "base" }, weight },
              },
            ]),
          ];
          const inputs = cases.map(({ name, ...playback }) => ({
            playback: { appearanceId: 41, ...playback },
            upperMaskOffset: maskOffset,
          }));
          const packer = new PlaybackPacker(rig, animation);
          const prepared = packer.prepare(
            inputs.length,
            (index) => inputs[index].playback,
            (index) => inputs[index].upperMaskOffset,
          );
          const snapshots = new Float32Array(
            Math.max(1, prepared.requiredSnapshotSlots) * bones * 12,
          );
          for (const upload of prepared.uploads)
            snapshots.set(upload.data, upload.slot * bones * 12);
          const buffers = [
            animation.data,
            metadata,
            inverseBinds,
            prepared.controls,
            snapshots,
            new Float32Array(cases.length * bones * 16),
          ];
          const readSource = (value) =>
            value.kind === "frozen"
              ? Float64Array.from(value.locals)
              : decodeLocalSample(
                  animation,
                  resolveLocalSample(animation, value.sample.clip, value.sample.phase),
                );
          const readSample = (value) =>
            decodeLocalSample(animation, resolveLocalSample(animation, value.clip, value.phase));
          const expected = inputs.map(({ playback }) => {
            const base = blendLocalPoses(
              readSource(playback.base.source),
              readSample(playback.base.destination),
              Math.fround(playback.base.weight),
            );
            const upper = playback.riderUpperBody;
            return localPoseToJointMatrices(
              rig,
              upper
                ? composeMaskedLocals(
                    base,
                    blendLocalPoses(
                      readSource(upper.source),
                      upper.destination.kind === "base" ? base : readSample(upper.destination),
                      Math.fround(upper.weight),
                    ),
                    mask,
                  )
                : base,
            );
          });
          const functionCode = posePaletteFunctionWgsl(bones);
          const raw = await rawPalette(buffers, functionCode, bones, cases.length, stepBase);
          const three = await threePalette(rig, animation, inputs, mask);
          check(`${name}: substrates share exact palette bytes`, error(raw, three) === 0, {
            max: error(raw, three),
          });
          for (let i = 0; i < cases.length; i++) {
            const actual = three.subarray(i * bones * 16, (i + 1) * bones * 16);
            const matrixError = error(actual, expected[i]);
            const referenceMesh = poseSoldierMesh(mesh, expected[i]);
            const actualMesh = poseSoldierMesh(mesh, actual);
            const geometryError = Math.max(
              ...["positions", "normals", "tangents"].map((key) =>
                error(actualMesh[key], referenceMesh[key]),
              ),
            );
            check(
              `${name}/${cases[i].name}: GPU palette agrees with CPU composition`,
              Number.isFinite(matrixError) && matrixError <= 1e-5 && geometryError <= 1e-5,
              { matrixError, geometryError },
            );
          }
        }
      } finally {
        shell.destroy();
        renderer.dispose();
      }
      return checks;
    }, root);
    for (const result of report) ctx.check(result.name, result.ok, result.detail);
  } finally {
    await page.close();
  }
}
