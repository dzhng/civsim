// Actual Three material is the oracle; both paths sample identical PMREM bytes.
import * as THREE from "three/webgpu";
import { uniform, uv, vec4 } from "three/tsl";
import { SkyModel } from "../../../../packages/photoreal-renderer/src/atmosphere/skyModel";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "../../../../packages/game-renderer/src/environment/physicalEnvironment";
import { standardPbrWgsl } from "../../../../packages/battle-renderer/src/shaders/standardPbr";
import { DFG_LUT_DATA, DFG_LUT_SIZE } from "../../../../packages/battle-renderer/src/shaders/dfgLut";
import { cubeUvWGSL } from "../../../../packages/battle-renderer/src/shaders/pmrem";
import { fullscreenWGSL } from "../../../../packages/battle-renderer/src/shaders/post";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../../src/numericalReadback";

type V3 = [number, number, number];
const unit = (v: V3): V3 => {
  const length = Math.hypot(...v);
  return v.map((c) => c / length) as V3;
};
const WIDTH = 33,
  HEIGHT = 3;
const materials: {
  name: string;
  base: V3;
  roughness: number;
  metal: number;
  ao: number;
  emissive?: V3;
}[] = [
  { name: "earth-dielectric", base: [0.32, 0.14, 0.045], roughness: 0.6, metal: 0, ao: 1 },
  { name: "white-smooth", base: [0.8, 0.8, 0.8], roughness: 0, metal: 0, ao: 1 },
  { name: "bronze-smooth", base: [0.7, 0.32, 0.1], roughness: 0.2, metal: 1, ao: 1 },
  { name: "bronze-rough", base: [0.7, 0.32, 0.1], roughness: 1, metal: 1, ao: 1 },
  { name: "mixed-metal", base: [0.5, 0.15, 0.07], roughness: 0.45, metal: 0.5, ao: 1 },
  { name: "occluded-earth", base: [0.32, 0.14, 0.045], roughness: 0.6, metal: 0, ao: 0.25 },
  { name: "occluded-metal", base: [0.7, 0.32, 0.1], roughness: 0.3, metal: 1, ao: 0 },
  {
    name: "emissive-dark",
    base: [0.02, 0.015, 0.01],
    roughness: 0.9,
    metal: 0,
    ao: 0.5,
    emissive: [0.5, 0.03, 0.001],
  },
];
const orientations: { name: string; n: V3; v: V3 }[] = [
  { name: "ground", n: [0, 0, 1], v: unit([0, -0.5, 1]) },
  { name: "oblique", n: unit([0.6, 0.2, 0.77]), v: unit([1, 1, 1]) },
  { name: "grazing", n: [0, 0, 1], v: unit([1, 0, 0.05]) },
];
const modes = [
  { name: "direct", sun: 1, env: 0, shadow: 1 },
  { name: "ibl", sun: 0, env: 1, shadow: 1 },
  { name: "combined-shadow", sun: 1, env: 1, shadow: 0.35 },
];
async function run() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("WebGPU unavailable");
  const device = await adapter.requestDevice();
  const errors: string[] = [];
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const renderer = new THREE.WebGPURenderer();
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  const generator = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera();
  camera.up.set(0, 0, 1);
  const light = new THREE.DirectionalLight();
  scene.add(light);
  scene.add(light.target);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 2, 1, 0, -1], 2));
  const normals = new THREE.Float32BufferAttribute(new Float32Array(9), 3);
  geometry.setAttribute("normal", normals);
  const ao = uniform(1);
  const material = new THREE.MeshStandardNodeMaterial();
  material.aoNode = ao;
  material.vertexNode = vec4(uv().x.mul(2).sub(1), uv().y.mul(-2).add(1), 0, 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const reference = new THREE.RenderTarget(WIDTH, HEIGHT, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
  });
  const target = device.createTexture({
    size: [WIDTH, HEIGHT],
    format: "rgba16float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const values = device.createBuffer({
    size: 112,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const sampler = device.createSampler({ minFilter: "linear", magFilter: "linear" });
  const dfg = device.createTexture({
    size: [DFG_LUT_SIZE, DFG_LUT_SIZE],
    format: "rg16float",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: dfg }, DFG_LUT_DATA, { bytesPerRow: DFG_LUT_SIZE * 4 }, [
    DFG_LUT_SIZE,
    DFG_LUT_SIZE,
  ]);
  const module = device.createShaderModule({
    code:
      fullscreenWGSL +
      cubeUvWGSL +
      `
 fn standard${standardPbrWgsl}
 struct Params {baseRough:vec4f,emissiveMetal:vec4f,nAo:vec4f,vGeometry:vec4f,lShadow:vec4f,sunEnv:vec4f,atlas:vec4f};
 @group(0) @binding(0) var<uniform> p:Params;
 @group(0) @binding(1) var pmrem:texture_2d<f32>;
 @group(0) @binding(2) var linear:sampler;
 @group(0) @binding(3) var dfg:texture_2d<f32>;
 @fragment fn fragment(v:VertexOut)->@location(0) vec4f {
  return vec4f(standard(p.baseRough.xyz,p.emissiveMetal.xyz,p.baseRough.w,p.vGeometry.w,p.emissiveMetal.w,p.nAo.w,p.nAo.xyz,p.vGeometry.xyz,p.lShadow.xyz,p.sunEnv.xyz,p.lShadow.w,p.sunEnv.w,pmrem,linear,p.atlas.x,dfg,linear),1);
 }`,
  });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vertex" },
    fragment: { module, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
  });
  const results = [];
  try {
    await renderer.init();
    for (const env of Object.values(CIVSIM_ENVIRONMENTS)) {
      const sky = new SkyModel(env);
      let atlas: THREE.RenderTarget | undefined;
      let nativeAtlas: GPUTexture | undefined;
      try {
        sky.bake(renderer);
        atlas = generator.fromEquirectangular(sky.lut.texture);
        const atlasRaw = (await renderer.readRenderTargetPixelsAsync(
          atlas,
          0,
          0,
          atlas.width,
          atlas.height,
        )) as Uint16Array;
        nativeAtlas = device.createTexture({
          size: [atlas.width, atlas.height],
          format: "rgba16float",
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture(
          { texture: nativeAtlas },
          atlasRaw,
          { bytesPerRow: Math.ceil((atlas.width * 8) / 256) * 256 },
          [atlas.width, atlas.height],
        );
        scene.environment = atlas.texture;
        const physical = photorealEnvironment(env);
        light.position.set(...physical.sunDirection).multiplyScalar(100);
        light.color.setRGB(...physical.sunColor);
        const group = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: values } },
            { binding: 1, resource: nativeAtlas.createView() },
            { binding: 2, resource: sampler },
            { binding: 3, resource: dfg.createView() },
          ],
        });
        const checks = [];
        for (const m of materials)
          for (const orientation of orientations)
            for (const mode of modes) {
              // Three refreshes analytic-light FRAME uniforms on its animation cadence.
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
              const emissive: V3 = m.emissive ?? [0, 0, 0];
              material.color.setRGB(...m.base);
              material.roughness = m.roughness;
              material.metalness = m.metal;
              material.emissive.setRGB(...emissive);
              ao.value = m.ao;
              for (let i = 0; i < 3; i++) normals.setXYZ(i, ...orientation.n);
              normals.needsUpdate = true;
              camera.position.set(...orientation.v).multiplyScalar(200);
              camera.lookAt(0, 0, 0);
              camera.updateMatrixWorld();
              light.intensity = physical.sunIntensity * mode.sun * mode.shadow;
              scene.environmentIntensity = physical.environmentIntensity * mode.env;
              const sun = physical.sunColor.map((c) => c * physical.sunIntensity * mode.sun);
              device.queue.writeBuffer(
                values,
                0,
                new Float32Array([
                  ...m.base,
                  m.roughness,
                  ...emissive,
                  m.metal,
                  ...orientation.n,
                  m.ao,
                  ...orientation.v,
                  0,
                  ...physical.sunDirection,
                  mode.shadow,
                  ...sun,
                  scene.environmentIntensity,
                  Math.log2(atlas.height / 4),
                  0,
                  0,
                  0,
                ]),
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
              const delta = compareHdr(actual, expected);
              checks.push({
                material: m.name,
                orientation: orientation.name,
                mode: mode.name,
                maxAbs: delta.maxAbs,
                maxRelative: delta.maxRelative,
                nonfinite: delta.nonfinite,
                actual: actual.slice(0, 3),
                expected: expected.slice(0, 3),
              });
            }
        results.push({ preset: env.id, checks });
      } finally {
        nativeAtlas?.destroy();
        atlas?.dispose();
        sky.dispose();
      }
    }
    return {
      passed:
        results.every((p) =>
          p.checks.every((c) => c.nonfinite === 0 && c.maxAbs <= 0.004 && c.maxRelative <= 0.001),
        ) && errors.length === 0,
      results,
      errors,
      adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture },
      geometryRoughness: "zero: constant planar geometric normals",
      scope:
        "opaque material-level numerical control; identical reference PMREM bytes, no fog/post/exposure; no full-scene/performance claim",
    };
  } finally {
    generator.dispose();
    renderer.dispose();
    geometry.dispose();
    material.dispose();
    reference.dispose();
    target.destroy();
    values.destroy();
    dfg.destroy();
    device.destroy();
  }
}
try {
  const report = await run();
  Object.assign(window, { __pbrCheck: report });
  document.querySelector("#result")!.textContent = JSON.stringify(report, null, 2);
} catch (error) {
  Object.assign(window, { __pbrCheck: { passed: false, error: String(error) } });
  document.querySelector("#result")!.textContent = String(error);
}
