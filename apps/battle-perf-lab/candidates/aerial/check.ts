// Control uses the real production fog hook, world-position varying and camera eye.
import * as THREE from "three/webgpu";
import { uniform, uv, vec4 } from "three/tsl";
import { aerialPerspectiveNode } from "../../../../packages/photoreal-renderer/src/atmosphere/aerialPerspective";
import { SkyModel } from "../../../../packages/photoreal-renderer/src/atmosphere/skyModel";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import {
  SKY_LUT_WIDTH,
  SKY_LUT_HEIGHT,
  type Rgb,
} from "../../../../packages/game-renderer/src/environment/skyParameters";
import { aerialWgsl } from "../../src/shaders/aerial";
import { equirectUvWgsl } from "../../src/shaders/physicalSky";
import { fullscreenWGSL } from "../../src/shared/postShader";
import { readHdrTexture, unpackRgba16fRows } from "../../src/numericalReadback";

const WIDTH = 33,
  HEIGHT = 3;
interface Probe {
  name: string;
  position: Rgb;
  eye: Rgb;
  focus: Rgb;
  alpha: number;
}
function probes(sun: Rgb): Probe[] {
  const eye: Rgb = [0, -300, 120],
    focus: Rgb = [0, 0, 0];
  const positions: [string, Rgb][] = [
    ["near", [40, 0, 5]],
    ["ground-139m", [139, 0, 0]],
    ["ground-141m", [141, 0, 0]],
    ["far-low", [1500, 0, 0]],
    ["far-raised", [1500, 0, 500]],
    ["horizon", [2500, 0, 120]],
    ["upward", [1000, 0, 1000]],
    ["downward", [300, 0, -150]],
    ["very-far", [5000, 0, 10]],
  ];
  return [
    ...positions.map(([name, position], i) => ({
      name,
      position,
      eye,
      focus,
      alpha: [0, 0.37, 0.8, 1][i % 4],
    })),
    {
      name: "different-ground-focus",
      position: [1500, 0, 0],
      eye,
      focus: [1450, 0, 0],
      alpha: 0.37,
    },
    { name: "eye-as-focus", position: [1500, 0, 0], eye, focus: eye, alpha: 0.8 },
    {
      name: "sunward",
      position: [sun[0] * 1700, sun[1] * 1700, sun[2] * 1700 + 100],
      eye: [0, 0, 100],
      focus,
      alpha: 0.37,
    },
    {
      name: "away-from-sun",
      position: [-sun[0] * 1700, -sun[1] * 1700, -sun[2] * 1700 + 100],
      eye: [0, 0, 100],
      focus,
      alpha: 0.8,
    },
  ];
}
async function run() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("WebGPU unavailable");
  const device = await adapter.requestDevice();
  const errors: string[] = [];
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const renderer = new THREE.WebGPURenderer();
  renderer.toneMapping = THREE.NoToneMapping;
  const reference = new THREE.RenderTarget(WIDTH, HEIGHT, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
  });
  const target = device.createTexture({
    size: [WIDTH, HEIGHT],
    format: "rgba16float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const params = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const sampler = device.createSampler({ minFilter: "linear", magFilter: "linear" });
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera();
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(9), 3);
  geometry.setAttribute("position", positions);
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 2, 1, 0, -1], 2));
  const material = new THREE.NodeMaterial();
  const surface = uniform(new THREE.Vector4()),
    observer = uniform(new THREE.Vector3());
  material.fragmentNode = surface;
  material.vertexNode = vec4(uv().x.mul(2).sub(1), uv().y.mul(-2).add(1), 0, 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const results = [];
  try {
    await renderer.init();
    for (const env of Object.values(CIVSIM_ENVIRONMENTS)) {
      const sky = new SkyModel(env);
      const lut = device.createTexture({
        size: [SKY_LUT_WIDTH, SKY_LUT_HEIGHT],
        format: "rgba16float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      try {
        sky.bake(renderer);
        // Upload exact control LUT bytes; this isolates aerial math from sky-port precision.
        const skyBytes = (await renderer.readRenderTargetPixelsAsync(
          sky.lut,
          0,
          0,
          SKY_LUT_WIDTH,
          SKY_LUT_HEIGHT,
        )) as Uint16Array;
        device.queue.writeTexture({ texture: lut }, skyBytes, { bytesPerRow: SKY_LUT_WIDTH * 8 }, [
          SKY_LUT_WIDTH,
          SKY_LUT_HEIGHT,
        ]);
        scene.fogNode = aerialPerspectiveNode(sky, env, observer);
        material.needsUpdate = true;
        const module = device.createShaderModule({
          code:
            fullscreenWGSL +
            `
          fn equirectUv${equirectUvWgsl}
          fn aerial${aerialWgsl(env)}
          struct Params {surface:vec4f,position:vec4f,camera:vec4f,observer:vec4f};
          @group(0) @binding(0) var<uniform> p:Params;
          @group(0) @binding(1) var lut:texture_2d<f32>;
          @group(0) @binding(2) var linear:sampler;
          @fragment fn fragment(v:VertexOut)->@location(0) vec4f {return aerial(p.surface,p.position.xyz,p.camera.xyz,p.observer.xyz,lut,linear);}
        `,
        });
        const pipeline = device.createRenderPipeline({
          layout: "auto",
          vertex: { module, entryPoint: "vertex" },
          fragment: { module, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
        });
        const group = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: params } },
            { binding: 1, resource: lut.createView() },
            { binding: 2, resource: sampler },
          ],
        });
        const checks = [];
        for (const probe of probes(sky.params.sunDirection)) {
          const rgba: [number, number, number, number] = [2, 0.15, 0.03, probe.alpha];
          surface.value.set(...rgba);
          observer.value.set(...probe.focus);
          camera.position.set(...probe.eye);
          camera.updateMatrixWorld();
          for (let i = 0; i < 3; i++) positions.setXYZ(i, ...probe.position);
          positions.needsUpdate = true;
          device.queue.writeBuffer(
            params,
            0,
            new Float32Array([...rgba, ...probe.position, 0, ...probe.eye, 0, ...probe.focus, 0]),
          );
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: target.createView(),
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store",
              },
            ],
          });
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, group);
          pass.draw(3);
          pass.end();
          device.queue.submit([encoder.finish()]);
          renderer.setRenderTarget(reference);
          renderer.render(scene, camera);
          renderer.setRenderTarget(null);
          const expected = unpackRgba16fRows(
            (await renderer.readRenderTargetPixelsAsync(
              reference,
              0,
              0,
              WIDTH,
              HEIGHT,
            )) as Uint16Array,
            WIDTH,
            HEIGHT,
          );
          const actual = await readHdrTexture(device, target);
          let maxAbs = 0,
            nonfinite = 0,
            alphaMismatch = 0;
          for (let i = 0; i < actual.length; i++) {
            const diff = Math.abs(actual[i] - expected[i]);
            if (!Number.isFinite(diff)) nonfinite++;
            maxAbs = Math.max(maxAbs, diff);
            if (
              i % 4 === 3 &&
              (actual[i] !== expected[i] ||
                actual[i] !==
                  THREE.DataUtils.fromHalfFloat(THREE.DataUtils.toHalfFloat(probe.alpha)))
            )
              alphaMismatch++;
          }
          checks.push({
            name: probe.name,
            maxAbs,
            nonfinite,
            alphaMismatch,
            actual: actual.slice(0, 4),
            expected: expected.slice(0, 4),
          });
        }
        results.push({ preset: env.id, checks });
      } finally {
        lut.destroy();
        sky.dispose();
      }
    }
    return {
      passed:
        results.every((p) =>
          p.checks.every((c) => c.maxAbs <= 0.004 && c.nonfinite === 0 && c.alphaMismatch === 0),
        ) && errors.length === 0,
      results,
      errors,
      framebuffer: [WIDTH, HEIGHT],
      adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture },
      scope:
        "isolated production fog-node numerical control, identical sky bytes; no full-renderer or performance claim",
    };
  } finally {
    geometry.dispose();
    material.dispose();
    reference.dispose();
    renderer.dispose();
    target.destroy();
    params.destroy();
    device.destroy();
  }
}
try {
  const report = await run();
  Object.assign(window, { __aerialCheck: report });
  document.querySelector("#result")!.textContent = JSON.stringify(report, null, 2);
} catch (error) {
  Object.assign(window, { __aerialCheck: { passed: false, error: String(error) } });
  document.querySelector("#result")!.textContent = String(error);
}
