import * as THREE from "three/webgpu";
import { shadow, vec3 } from "three/tsl";
import { RawSunShadow } from "./shadow";
import { shadowPcfWgsl, shadowVisibilityWgsl } from "../shaders/shadow";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "../../../../packages/game-renderer/src/environment/physicalEnvironment";
import { configureSunShadows } from "../../../../packages/photoreal-renderer/src/battle/shadowRig";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import {
  viewMatrix,
  projMatrix,
  type Camera3DParams,
} from "../../../../packages/renderer-core/src/camera3d";
import { multiply } from "../../../../packages/renderer-core/src/mat4";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../numericalReadback";
import { encodeRgba8Base64 } from "../imageTransport";

// Isolate fit, depth rasterization, normal bias and the real PCF graph before
// integrating shadow sampling with the already-verified environment materials.
async function run() {
  const releases: (() => void)[] = [];
  const own = <T extends { dispose(): void } | { destroy(): void }>(r: T): T => {
    releases.push(() => ("dispose" in r ? r.dispose() : r.destroy()));
    return r;
  };
  try {
    const width = 768,
      height = 512;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw Error("No GPU");
    const device = own(await adapter.requestDevice());
    const errors: string[] = [];
    device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
    const renderer = own(new THREE.WebGPURenderer({ antialias: false, reversedDepthBuffer: true }));
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    await renderer.init();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(1, 1, 1);
    const env = CIVSIM_ENVIRONMENTS.golden,
      physical = photorealEnvironment(env);
    const sun = new THREE.DirectionalLight();
    sun.position.set(...physical.sunDirection);
    scene.add(sun, sun.target);
    const rig = own(configureSunShadows(renderer, sun, env, "single"));
    const cameraLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }],
    });
    const native = own(new RawSunShadow(device, env));
    const shadowCameraGroup = device.createBindGroup({
      layout: cameraLayout,
      entries: [{ binding: 0, resource: { buffer: native.camera } }],
    });
    const boxGeometry = own(new THREE.BoxGeometry(2, 2, 4));
    boxGeometry.translate(0, 0, 2);
    const casterMaterial = own(new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }));
    const box = new THREE.Mesh(boxGeometry, casterMaterial);
    box.castShadow = true;
    box.layers.set(1);
    sun.shadow.camera.layers.enable(1);
    scene.add(box);
    const planeGeometry = own(new THREE.PlaneGeometry(40, 40));
    const receiverMaterial = own(new THREE.MeshBasicNodeMaterial());
    receiverMaterial.colorNode = vec3(shadow(sun));
    const plane = new THREE.Mesh(planeGeometry, receiverMaterial);
    plane.receiveShadow = true;
    scene.add(plane);
    const reference = own(new THREE.RenderTarget(width, height, { type: THREE.HalfFloatType }));
    const output = own(
      device.createTexture({
        size: [width, height],
        format: "rgba16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      }),
    );
    const mainCamera = own(
      device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
    );
    const mainGroup = device.createBindGroup({
      layout: cameraLayout,
      entries: [{ binding: 0, resource: { buffer: mainCamera } }],
    });
    const lightLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } },
      ],
    });
    const lightGroup = device.createBindGroup({
      layout: lightLayout,
      entries: [
        { binding: 0, resource: { buffer: native.state } },
        { binding: 1, resource: native.depth.createView() },
        { binding: 2, resource: native.comparison },
      ],
    });
    const vertex = `struct Camera {vp:mat4x4f}; @group(0) @binding(0) var<uniform> camera:Camera;
      struct V {@builtin(position) clip:vec4f,@location(0) world:vec3f};
      @vertex fn vertex(@location(0) p:vec3f)->V {return V(camera.vp*vec4f(p,1),p);}`;
    const receiver = `${vertex}
      struct Sun {vp:mat4x4f,settings:vec4f}; @group(1) @binding(0) var<uniform> sun:Sun;
      @group(1) @binding(1) var depth:texture_depth_2d;
      @group(1) @binding(2) var compare:sampler_comparison;
      fn shadowPcf${shadowPcfWgsl}
      fn shadowVisibility${shadowVisibilityWgsl}
      @fragment fn fragment(v:V)->@location(0) vec4f {
        let shade=shadowVisibility(depth,compare,sun.vp,sun.settings,v.world,vec3f(0,0,1),v.clip.xy);
        return vec4f(vec3f(shade),1);
      }`;
    const vertexLayout: GPUVertexBufferLayout = {
      arrayStride: 12,
      attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
    };
    const depthModule = device.createShaderModule({ code: vertex });
    const depthPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraLayout] }),
      vertex: { module: depthModule, entryPoint: "vertex", buffers: [vertexLayout] },
      primitive: { cullMode: "none" },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "greater-equal",
      },
    });
    const module = device.createShaderModule({ code: receiver });
    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraLayout, lightLayout] }),
      vertex: { module, entryPoint: "vertex", buffers: [vertexLayout] },
      fragment: { module, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
      primitive: { cullMode: "none" },
    });
    const upload = (geometry: THREE.BufferGeometry) => {
      const unindexed = geometry.toNonIndexed();
      const array = unindexed.getAttribute("position").array;
      const buffer = own(
        device.createBuffer({
          size: array.byteLength,
          usage: GPUBufferUsage.VERTEX,
          mappedAtCreation: true,
        }),
      );
      new Float32Array(buffer.getMappedRange()).set(array);
      buffer.unmap();
      unindexed.dispose();
      return { buffer, count: array.length / 3 };
    };
    const cube = upload(boxGeometry),
      ground = upload(planeGeometry);
    const camera = new THREE.PerspectiveCamera(),
      results = [];
    let firstActual: number[] | undefined, firstExpected: number[] | undefined;
    for (const [label, pitch, distance, rect] of [
      ["local", 0.65, 18, [-20, -20, 40, 40]],
      ["local-repeat", 0.65, 18, [-20, -20, 40, 40]],
      ["horizon", 0.2, 26, [-20, -20, 40, 40]],
      ["whole-map", 0.65, 18, [-220, -180, 440, 360]],
    ] as const) {
      rig.setWorldRect([...rect]);
      const fit = native.setWorldRect(rect);
      const params: Camera3DParams = {
        target: [0, 0, 0],
        distance,
        pitch,
        yaw: -Math.PI / 2,
        fovY: 0.8,
        aspect: width / height,
        near: 0.1,
        far: 3000,
      };
      applyCamera3d(camera, params);
      device.queue.writeBuffer(mainCamera, 0, multiply(projMatrix(params), viewMatrix(params)));
      const encoder = device.createCommandEncoder();
      native.encode(encoder, (pass) => {
        pass.setPipeline(depthPipeline);
        pass.setBindGroup(0, shadowCameraGroup);
        pass.setVertexBuffer(0, cube.buffer);
        pass.draw(cube.count);
      });
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: output.createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 1, g: 1, b: 1, a: 1 },
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, mainGroup);
      pass.setBindGroup(1, lightGroup);
      pass.setVertexBuffer(0, ground.buffer);
      pass.draw(ground.count);
      pass.end();
      device.queue.submit([encoder.finish()]);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      renderer.setRenderTarget(reference);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      const actual = Array.from(await readHdrTexture(device, output));
      const raw = await renderer.readRenderTargetPixelsAsync(reference, 0, 0, width, height);
      if (!(raw instanceof Uint16Array)) throw Error("Expected half output");
      const expected = Array.from(unpackRgba16fRows(raw, width, height));
      const bytes = (a: number[]) =>
        encodeRgba8Base64(Uint8Array.from(a, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255)));
      const sourceVp = new THREE.Matrix4().multiplyMatrices(
        sun.shadow.camera.projectionMatrix,
        sun.shadow.camera.matrixWorldInverse,
      );
      const shadowPixels = (data: number[]) =>
        data.reduce((n, v, i) => n + (i % 4 === 0 && v < 0.9 ? 1 : 0), 0);
      const repeat =
        label === "local-repeat"
          ? {
              actual: compareHdr(actual, firstActual!),
              expected: compareHdr(expected, firstExpected!),
            }
          : null;
      if (label === "local") {
        firstActual = actual;
        firstExpected = expected;
      }
      results.push({
        actualShadowPixels: shadowPixels(actual),
        expectedShadowPixels: shadowPixels(expected),
        repeat,
        label,
        width,
        height,
        comparison: compareHdr(actual, expected),
        projectionMax: Math.max(
          ...fit.viewProjection.map((v, i) => Math.abs(v - sourceVp.elements[i])),
        ),
        actualRgba: bytes(actual),
        expectedRgba: bytes(expected),
      });
    }
    return {
      results,
      errors,
      passed:
        errors.length === 0 &&
        results.every(
          (r) =>
            r.comparison.nonfinite === 0 &&
            r.comparison.maxAbs <= 1 / 255 &&
            r.actualShadowPixels > 100 &&
            r.expectedShadowPixels > 100 &&
            (!r.repeat || (r.repeat.actual.maxAbs === 0 && r.repeat.expected.maxAbs === 0)),
        ),
    };
  } finally {
    for (const release of releases.reverse()) release();
  }
}
run()
  .then((result) => Object.assign(window, { __frameCheck: result }))
  .catch((error) =>
    Object.assign(window, {
      __frameCheck: { passed: false, error: String(error), stack: error.stack },
    }),
  );
