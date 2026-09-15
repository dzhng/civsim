import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "../../../../packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "../../../../packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import { BattleGrassField } from "../../../../packages/photoreal-renderer/src/battle/battleGrassField";
import {
  BladeFieldTransitionUniforms,
  createBladeFieldWindUniforms,
} from "../../../../packages/photoreal-renderer/src/battle/bladeFieldLayer";
import {
  productionBladeFieldProfile,
  initialBladeFieldTransition,
} from "../../../../packages/game-renderer/src/battle/battleGrassResidency";
import { flatHeightField } from "../../../../packages/game-renderer/src/terrain/heightField";
import { updateWindUniforms } from "../../../../packages/game-renderer/src/battle/windSignal";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import { viewMatrix, type Camera3DParams } from "../../../../packages/renderer-core/src/camera3d";
import { cameraUniformData } from "../../../../packages/renderer-core/src/cameraUniform";
import { createRawEnvironment } from "./environment";
import { createRawGrassField } from "./grassField";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../numericalReadback";
const W = 480,
  H = 320;
async function words(device: GPUDevice, source: GPUBuffer) {
  const b = device.createBuffer({
    size: source.size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  try {
    const e = device.createCommandEncoder();
    e.copyBufferToBuffer(source, 0, b, 0, source.size);
    device.queue.submit([e.finish()]);
    await b.mapAsync(GPUMapMode.READ);
    return new Uint32Array(b.getMappedRange().slice(0));
  } finally {
    b.destroy();
  }
}
async function run() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error("No WebGPU");
  const device = await adapter.requestDevice();
  const errors: string[] = [];
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const release: (() => void)[] = [() => device.destroy()];
  try {
    const world = await PhotorealWorld.create(document.createElement("canvas"), {
      antialias: false,
    });
    release.push(() => world.dispose());
    const renderer = world.renderer;
    renderer.setSize(W, H);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0, 0);
    const env = CIVSIM_ENVIRONMENTS.golden,
      spec = applyCivsimEnvironment(world, env, { aerialObserver: vec3(0, 0, 0) });
    for (const c of world.scene.children) if (c instanceof THREE.Mesh) c.visible = false;
    const profile = productionBladeFieldProfile(),
      wind = createBladeFieldWindUniforms();
    const source = new BattleGrassField(
      world.scene,
      profile,
      new BladeFieldTransitionUniforms(initialBladeFieldTransition(profile)),
      wind,
    );
    release.push(() => source.dispose());
    source.setSunDirection(new THREE.Vector3(...spec.sunDirection));
    const lighting = await createRawEnvironment(device, env);
    release.push(lighting.dispose);
    const cameraBuffer = device.createBuffer({
      size: 192,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    release.push(() => cameraBuffer.destroy());
    const layout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });
    const cameraGroup = device.createBindGroup({
      layout,
      entries: [{ binding: 0, resource: { buffer: cameraBuffer } }],
    });
    const native = await createRawGrassField(device, layout, lighting, profile);
    release.push(native.dispose);
    const field = flatHeightField(-64, -64, 32, 32, 4),
      grid = { ...field, tint: new Uint8Array(1024) };
    source.setTerrain(grid, field, "green-grass");
    native.setTerrain(grid, field, "green-grass");
    const output = device.createTexture({
      size: [W, H],
      format: "rgba16float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    release.push(() => output.destroy());
    const depth = device.createTexture({
      size: [W, H],
      format: "depth32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    release.push(() => depth.destroy());
    const reference = new THREE.RenderTarget(W, H, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
    });
    release.push(() => reference.dispose());
    const camera = new THREE.PerspectiveCamera(),
      results = [];
    let priorUploads: number[] | null = null;
    for (const [label, x, distance, far, replace] of [
      ["initial", 0, 24, true, false],
      ["same-revision", 0, 24, true, false],
      ["pan-ring", 100, 24, true, false],
      ["far-hidden", 100, 24, false, false],
      ["overview", 0, 900, true, false],
      ["terrain-replaced", 0, 24, true, true],
    ] as const) {
      if (replace) {
        source.setTerrain(grid, field, "green-grass");
        native.setTerrain(grid, field, "green-grass");
      }
      source.setFarVisible(far);
      native.setFarVisible(far);
      updateWindUniforms(wind, 3);
      const params: Camera3DParams = {
        target: [x, 0, 0],
        distance,
        pitch: 0.5,
        yaw: -Math.PI / 2,
        fovY: 0.8,
        aspect: W / H,
        near: 0.1,
        far: 3000,
      };
      applyCamera3d(camera, params);
      const w = {
        direction: [wind.meanDirection.value.x, wind.meanDirection.value.y] as [number, number],
        speed: wind.speed.value,
        gustPhase: wind.gustPhase.value,
        velocity: [wind.bandVelocity.value.x, wind.bandVelocity.value.y] as [number, number],
        frequency: wind.bandFrequency.value,
        sharpness: wind.bandSharpness.value,
      };
      source.update(params, H);
      await native.prepare(params, H, w, spec.sunDirection);
      source.settle(renderer);
      await native.settle();
      source.prepareRender(renderer, params);
      await native.prepare(params, H, w, spec.sunDirection);
      lighting.setView(viewMatrix(params), [0, 0, 0]);
      device.queue.writeBuffer(
        cameraBuffer,
        0,
        cameraUniformData({
          camera3d: params,
          x: 0,
          y: 0,
          zoom: 8,
          width: W,
          height: H,
          sunAzimuth: 0,
          sunElevation: 0,
        }),
      );
      const e = device.createCommandEncoder();
      native.route(e);
      const pass = e.beginRenderPass({
        colorAttachments: [
          {
            view: output.createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: [0, 0, 0, 0],
          },
        ],
        depthStencilAttachment: {
          view: depth.createView(),
          depthClearValue: 0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });
      native.draw(pass, cameraGroup);
      pass.end();
      device.queue.submit([e.finish()]);
      renderer.setRenderTarget(reference);
      renderer.render(world.scene, camera);
      renderer.setRenderTarget(null);
      const routes = [];
      const state = native.snapshot();
      for (const [i, part] of [state.base, state.ring].entries())
        if (part.visible) {
          const commands = await words(device, native.routingBuffers()[i].commands);
          for (const [tier, name] of ["near", "mid", "far"].entries()) {
            const mesh = world.scene.children.find(
              (c) =>
                c.name.endsWith(`${i ? "ring-" : ""}blades-${name}`) &&
                (i === 1 || !c.name.includes("-ring-")),
            ) as THREE.Mesh<THREE.InstancedBufferGeometry> | undefined;
            if (!mesh) throw Error(`Missing ${i}/${name}`);
            const expected = new Uint32Array(
              await renderer.getArrayBufferAsync(mesh.geometry.getIndirect()!),
            );
            routes.push({
              layer: i,
              tier,
              actual: Array.from(commands.slice(tier * 5, tier * 5 + 5)),
              expected: Array.from(expected),
              equal: commands[tier * 5] === expected[0] && commands[tier * 5 + 1] === expected[1],
            });
          }
        }
      const actual = await readHdrTexture(device, output),
        expected = unpackRgba16fRows(
          (await renderer.readRenderTargetPixelsAsync(reference, 0, 0, W, H)) as Uint16Array,
          W,
          H,
        );
      const pixels = compareHdr(actual, expected);
      const mismatches = [];
      let coverageMismatch = 0,
        maxCovered = 0;
      for (let i = 0; i < actual.length; i += 4) {
        if (actual[i + 3] !== expected[i + 3]) {
          coverageMismatch++;
          if (mismatches.length < 40)
            mismatches.push({
              x: (i / 4) % W,
              y: Math.floor(i / 4 / W),
              actual: actual.slice(i, i + 4),
              expected: expected.slice(i, i + 4),
            });
        }
        if (actual[i + 3] && expected[i + 3])
          for (let c = 0; c < 3; c++)
            maxCovered = Math.max(maxCovered, Math.abs(actual[i + c] - expected[i + c]));
      }
      const stats = native.stats(),
        unchangedUpload =
          label !== "same-revision" ||
          JSON.stringify(stats.uploads) === JSON.stringify(priorUploads);
      priorUploads = stats.uploads;
      results.push({
        label,
        width: W,
        height: H,
        actual,
        expected,
        routes,
        pixels,
        coverageMismatch,
        mismatches,
        maxCovered,
        unchangedUpload,
        uploads: stats.uploads,
        pipelines: stats.layers.map((l) => l.pipelineBuilds),
        passed:
          routes.every((r) => r.equal) &&
          unchangedUpload &&
          pixels.nonfinite === 0 &&
          coverageMismatch === 0 &&
          maxCovered <= 1 / 255,
      });
    }
    return {
      results,
      errors,
      passed: results.every((r) => r.passed) && errors.length === 0,
      scope:
        "Small authored base/ring residency history; strict component diagnostic, not full-scene parity",
    };
  } finally {
    for (const f of release.reverse()) f();
  }
}
run()
  .then((report) => Object.assign(window, { __grassFieldCheck: report }))
  .catch((error) =>
    Object.assign(window, { __grassFieldCheck: { passed: false, error: String(error) } }),
  );
