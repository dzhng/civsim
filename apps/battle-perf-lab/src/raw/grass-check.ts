import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "../../../../packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "../../../../packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import {
  PhotorealBladeFieldLayer,
  createBladeFieldWindUniforms,
} from "../../../../packages/photoreal-renderer/src/battle/bladeFieldLayer";
import { sampleGrassField } from "../../../../packages/game-renderer/src/battle/grassField";
import { flatHeightField } from "../../../../packages/game-renderer/src/terrain/heightField";
import { updateWindUniforms } from "../../../../packages/game-renderer/src/battle/windSignal";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import {
  eyePosition,
  viewMatrix,
  type Camera3DParams,
} from "../../../../packages/renderer-core/src/camera3d";
import { cameraUniformData } from "../../../../packages/renderer-core/src/cameraUniform";
import { createRawEnvironment } from "./environment";
import { createRawGrass, type GrassFrame } from "./grass";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../numericalReadback";

const W = 480,
  H = 320;
async function readBuffer(device: GPUDevice, source: GPUBuffer) {
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
function rgba(pixels: number[]) {
  return pixels.map((v, i) =>
    i % 4 === 3
      ? Math.round(Math.min(1, Math.max(0, v)) * 255)
      : Math.round(
          Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)) *
            255,
        ),
  );
}
async function run() {
  if (!navigator.gpu) throw new Error("WebGPU unavailable");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No adapter");
  const device = await adapter.requestDevice();
  const errors: string[] = [];
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const world = await PhotorealWorld.create(document.createElement("canvas"), { antialias: false });
  const renderer = world.renderer;
  renderer.setSize(W, H);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0, 0);
  const env = CIVSIM_ENVIRONMENTS.golden;
  const spec = applyCivsimEnvironment(world, env, { aerialObserver: vec3(0, 0, 0) });
  for (const child of world.scene.children) if (child instanceof THREE.Mesh) child.visible = false;
  const lighting = await createRawEnvironment(device, env);
  const field = flatHeightField(-96, -96, 48, 48, 4);
  const snapshot = sampleGrassField({ ...field, tint: new Uint8Array(48 * 48) }, field, {
    seed: 0x5ea72026,
    focus: { x: 0, y: 0, radius: 80 },
    fieldCellSize: 0.42,
    snapCellSize: 8,
    clumpCellSize: 1.55,
    maxRecords: 12000,
    density: 0.42,
    jitter: 0.72,
    minNormalZ: 0.45,
    lodNearRadius: 5 / 80,
    lodMidRadius: 20 / 80,
    baseHeight: 1.25,
    heightJitter: 0.5,
    baseWidth: 0.13,
    widthJitter: 0.22,
    baseBend: 0.45,
    bendJitter: 0.35,
  });
  const wind = createBladeFieldWindUniforms();
  const layer = new PhotorealBladeFieldLayer(world.scene, undefined, true, undefined, wind);
  layer.setSunDirection(spec.sunDirection);
  layer.applyPackedRecords(snapshot.packedRecords);
  const materialSet = layer.materialSet();
  const meshes = ["near", "mid", "far"].map(
    (tier) =>
      world.scene.children.find((o) =>
        o.name.endsWith(`blades-${tier}`),
      ) as THREE.Mesh<THREE.InstancedBufferGeometry>,
  );
  if (meshes.some((m) => !m)) throw new Error("Missing production grass meshes");
  const geometry = meshes.map((mesh) => ({
    positions: Float32Array.from(mesh.geometry.getAttribute("position").array),
    indices: Uint16Array.from(mesh.geometry.index!.array),
  }));
  const cameraBuffer = device.createBuffer({
    size: 192,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const cameraLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
    ],
  });
  const cameraGroup = device.createBindGroup({
    layout: cameraLayout,
    entries: [{ binding: 0, resource: { buffer: cameraBuffer } }],
  });
  const raw = await createRawGrass(
    device,
    cameraLayout,
    lighting,
    snapshot.packedRecords,
    geometry,
  );
  const output = device.createTexture({
    size: [W, H],
    format: "rgba16float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const depth = device.createTexture({
    size: [W, H],
    format: "depth32float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const reference = new THREE.RenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: true });
  const camera = new THREE.PerspectiveCamera();
  const cameraParams: Camera3DParams = {
    target: [0, 0, 0],
    distance: 24,
    pitch: 0.5,
    yaw: -Math.PI / 2,
    fovY: 0.8,
    aspect: W / H,
    near: 0.1,
    far: 3000,
  };
  applyCamera3d(camera, cameraParams);
  const eye = eyePosition(cameraParams);
  const view = viewMatrix(cameraParams);
  lighting.setView(view, [0, 0, 0]);
  device.queue.writeBuffer(
    cameraBuffer,
    0,
    cameraUniformData({
      camera3d: cameraParams,
      x: 0,
      y: 0,
      zoom: 8,
      width: W,
      height: H,
      sunAzimuth: 0,
      sunElevation: 0,
    }),
  );
  const results = [];
  let lastFrame: GrassFrame | undefined;
  let nativeWind: number[] | undefined, referenceWind: number[] | undefined;
  try {
    for (const [label, anchor, seconds, prepass, cull] of [
      ["base", [0, 0], 0, false, false],
      ["wind", [0, 0], 3, false, false],
      ["wind-prepass", [0, 0], 3, true, false],
      ["mask-wedge", [0, 0], 7, false, true],
      ["thinning", [350, 0], 11, false, false],
    ] as const) {
      updateWindUniforms(wind, seconds);
      layer.setDepthPrepass(prepass);
      layer.setRouteCullCircle(cull ? { center: [0, 0], radiusSq: 25, enabled: true } : null);
      layer.setRouteCullWedge(
        cull
          ? {
              forward: [0, 1],
              side: [1, 0],
              halfWidthSlope: 0.7,
              backMarginM: 8,
              farMarginM: 70,
              enabled: true,
            }
          : null,
      );
      layer.routeGpu(renderer, eye, anchor);
      const stats = layer.stats();
      const state: GrassFrame = {
        anchor,
        view,
        transition: stats.transition,
        thinning: stats.thinning,
        mask: stats.routeCullMask,
        wedge: stats.routeCullWedge,
        wind: {
          direction: [wind.meanDirection.value.x, wind.meanDirection.value.y],
          speed: wind.speed.value,
          gustPhase: wind.gustPhase.value,
          velocity: [wind.bandVelocity.value.x, wind.bandVelocity.value.y],
          frequency: wind.bandFrequency.value,
          sharpness: wind.bandSharpness.value,
        },
        sun: spec.sunDirection,
        rim: materialSet.rimStrength.value,
        subsurface: materialSet.subsurfaceStrength.value,
      };
      lastFrame = state;
      raw.update(state);
      const encoder = device.createCommandEncoder();
      raw.route(encoder);
      const pass = encoder.beginRenderPass({
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
      raw.draw(pass, cameraGroup, prepass);
      pass.end();
      device.queue.submit([encoder.finish()]);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      renderer.setRenderTarget(reference);
      renderer.render(world.scene, camera);
      renderer.setRenderTarget(null);
      const commands = await readBuffer(device, raw.commands);
      const routes = [];
      for (let tier = 0; tier < 3; tier++) {
        const indirect = meshes[tier].geometry.getIndirect()!;
        const expected = new Uint32Array(await renderer.getArrayBufferAsync(indirect));
        const source = materialSet.tiers![(["near", "mid", "far"] as const)[tier]].visibleIndices
          .value as THREE.StorageBufferAttribute;
        const expectedList = new Uint32Array(await renderer.getArrayBufferAsync(source)).slice(
          0,
          expected[1],
        );
        const actualList = (await readBuffer(device, raw.visible[tier])).slice(
          0,
          commands[tier * 5 + 1],
        );
        routes.push({
          tier,
          actualCommand: Array.from(commands.slice(tier * 5, tier * 5 + 5)),
          expectedCommand: Array.from(expected),
          membershipEqual:
            JSON.stringify(Array.from(actualList).sort((a, b) => a - b)) ===
            JSON.stringify(Array.from(expectedList).sort((a, b) => a - b)),
          unique: new Set(actualList).size === actualList.length,
        });
      }
      const actual = await readHdrTexture(device, output);
      const expected = unpackRgba16fRows(
        (await renderer.readRenderTargetPixelsAsync(reference, 0, 0, W, H)) as Uint16Array,
        W,
        H,
      );
      const pixels = compareHdr(actual, expected);
      const coverage = {
        actual: actual.filter((_, i) => i % 4 === 3 && actual[i] > 0.5).length,
        expected: expected.filter((_, i) => i % 4 === 3 && expected[i] > 0.5).length,
      };
      let coverageMismatch = 0,
        commonMaxAbs = 0,
        commonOverCode = 0,
        precisionDifferingPixels = 0;
      let sourcePrepassLosses = 0,
        sourcePrepassAddedCoverage = 0,
        sourcePrepassChangedRgb = 0;
      const precisionReference = label === "wind-prepass" ? referenceWind! : expected;
      for (let i = 0; i < actual.length; i += 4) {
        const a = actual[i + 3] > 0.5,
          b = expected[i + 3] > 0.5;
        if (a !== b) coverageMismatch++;
        if (a && b)
          for (let c = 0; c < 3; c++) {
            const difference = Math.abs(actual[i + c] - expected[i + c]);
            commonMaxAbs = Math.max(commonMaxAbs, difference);
            if (difference > 1 / 255) commonOverCode++;
          }
        const referenceCovered = precisionReference[i + 3] > 0.5;
        if (
          a !== referenceCovered ||
          (a &&
            referenceCovered &&
            [0, 1, 2].some((c) => Math.abs(actual[i + c] - precisionReference[i + c]) > 1 / 255))
        )
          precisionDifferingPixels++;
        if (label === "wind-prepass") {
          if (referenceCovered && !b) sourcePrepassLosses++;
          if (!referenceCovered && b) sourcePrepassAddedCoverage++;
          if (
            referenceCovered &&
            b &&
            [0, 1, 2].some((c) => expected[i + c] !== precisionReference[i + c])
          )
            sourcePrepassChangedRgb++;
        }
      }
      const nativePrepassInvariant =
        label !== "wind-prepass" || actual.every((value, index) => value === nativeWind![index]);
      if (label === "wind") {
        nativeWind = actual;
        referenceWind = expected;
      }
      const routingPassed = routes.every(
        (r) =>
          r.membershipEqual &&
          r.unique &&
          JSON.stringify(r.actualCommand) === JSON.stringify(r.expectedCommand),
      );
      const passed =
        routingPassed &&
        pixels.nonfinite === 0 &&
        coverage.actual > 100 &&
        precisionDifferingPixels <= 3 &&
        nativePrepassInvariant &&
        sourcePrepassAddedCoverage === 0 &&
        sourcePrepassChangedRgb === 0;
      results.push({
        passed,
        routingPassed,
        precisionDifferingPixels,
        nativePrepassInvariant,
        sourcePrepassLosses,
        sourcePrepassAddedCoverage,
        sourcePrepassChangedRgb,
        coverageMismatch,
        commonMaxAbs,
        commonOverCode,
        label,
        recordCount: snapshot.packedRecords.length / 16,
        routes,
        pixels,
        coverage,
        actualRgba: rgba(actual),
        expectedRgba: rgba(expected),
        width: W,
        height: H,
      });
    }
    raw.dispose();
    raw.dispose();
    let disposedGuard = false;
    try {
      raw.update(lastFrame!);
    } catch {
      disposedGuard = true;
    }
    const borrowedOutput = await readHdrTexture(device, output);
    const borrowedEnvironment = await readHdrTexture(device, lighting.sky.lut);
    const borrowedResourcesAlive =
      borrowedOutput.every(Number.isFinite) && borrowedEnvironment.every(Number.isFinite);
    return {
      disposedGuard,
      borrowedResourcesAlive,
      passed:
        disposedGuard &&
        borrowedResourcesAlive &&
        results.length === 5 &&
        results.every((r) => r.passed) &&
        errors.length === 0,
      precisionGate:
        "1/255 HDR RGB on shared coverage, at most 3 occlusion/silhouette precision pixels per 480x320 crop; prepass must preserve native beauty exactly and source holes are reported separately",
      results,
      errors,
      scope:
        "Frozen production-sampled grass component; no residency/world integration or directional shadow pass (scalar1), no performance claim",
    };
  } finally {
    raw.dispose();
    layer.dispose();
    lighting.dispose();
    output.destroy();
    depth.destroy();
    cameraBuffer.destroy();
    reference.dispose();
    world.dispose();
    device.destroy();
  }
}
try {
  const report = await run();
  Object.assign(window, { __grassCheck: report });
  document.querySelector("#result")!.textContent = JSON.stringify(
    report,
    (_, v) => (Array.isArray(v) && v.length > 100 ? `array(${v.length})` : v),
    2,
  );
} catch (error) {
  Object.assign(window, { __grassCheck: { error: String(error) } });
  document.querySelector("#result")!.textContent = String(error);
}
