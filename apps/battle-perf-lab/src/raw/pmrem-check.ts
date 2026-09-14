import * as THREE from "three/webgpu";
import { texture, textureCubeUV, uv, float } from "three/tsl";
import { SkyModel } from "../../../../packages/photoreal-renderer/src/atmosphere/skyModel";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import {
  SKY_LUT_WIDTH,
  SKY_LUT_HEIGHT,
} from "../../../../packages/game-renderer/src/environment/skyParameters";
import { decodeFloat16, readHdrTexture, compareHdr } from "../numericalReadback";
import { createRawPmrem } from "./pmrem";
import { createTypegpuPmrem } from "../../candidates/typegpu/pmrem";
const backend = new URLSearchParams(location.search).get("backend") ?? "raw";
if (!["raw", "typegpu"].includes(backend)) throw new Error("Unknown PMREM backend");
const createPmrem = backend === "typegpu" ? createTypegpuPmrem : createRawPmrem;
import { cubeUvWGSL } from "../shaders/pmrem";
import { fullscreenWGSL } from "../shared/postShader";

// Pinned Three 0.185.1 public PMREM output for the canonical 384x192 input.
// Keep the atlas rectangles independent of the candidate's generation helpers.
const rectangles = [
  [0, 0, 192, 128],
  [0, 128, 96, 64],
  [0, 192, 48, 32],
  [48, 192, 48, 32],
  [96, 192, 48, 32],
  [144, 192, 48, 32],
  [192, 192, 48, 32],
  [240, 192, 48, 32],
  [288, 192, 48, 32],
];
function region(pixels: number[], rectangle: number[]) {
  const [x, y, width, height] = rectangle;
  const result: number[] = [];
  for (let row = y; row < y + height; row++)
    result.push(...pixels.slice((row * 336 + x) * 4, (row * 336 + x + width) * 4));
  return result;
}
const passes = (value: ReturnType<typeof compareHdr>) =>
  value.nonfinite === 0 && value.maxAbs <= 0.004 && value.maxRelative <= 0.001;

async function sampleCandidate(device: GPUDevice, atlas: GPUTexture, data: Float32Array) {
  const output = device.createTexture({
    size: [data.length / 4, 1],
    format: "rgba16float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const inputs = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });
  new Float32Array(inputs.getMappedRange()).set(data);
  inputs.unmap();
  try {
    const module = device.createShaderModule({
      code:
        fullscreenWGSL +
        cubeUvWGSL +
        `
@group(0) @binding(0) var atlas:texture_2d<f32>;
@group(0) @binding(1) var linear:sampler;
@group(0) @binding(2) var<storage,read> samples:array<vec4f>;
@fragment fn fragment(v:VertexOut)->@location(0) vec4f {
  let s=samples[u32(v.position.x)];
  return vec4f(samplePmrem(atlas,linear,normalize(s.xyz),s.w,6.0),1);
}`,
    });
    const pipeline = await device.createRenderPipelineAsync({
      layout: "auto",
      vertex: { module, entryPoint: "vertex" },
      fragment: { module, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
      primitive: { topology: "triangle-list" },
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: atlas.createView() },
        {
          binding: 1,
          resource: device.createSampler({ minFilter: "linear", magFilter: "linear" }),
        },
        { binding: 2, resource: { buffer: inputs } },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: output.createView(), loadOp: "clear", storeOp: "store" }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    return await readHdrTexture(device, output);
  } finally {
    inputs.destroy();
    output.destroy();
  }
}
async function sampleReference(
  renderer: THREE.WebGPURenderer,
  atlas: THREE.Texture,
  data: Float32Array,
) {
  const input = new THREE.DataTexture(data, data.length / 4, 1, THREE.RGBAFormat, THREE.FloatType);
  input.needsUpdate = true;
  const output = new THREE.RenderTarget(data.length / 4, 1, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
  });
  const material = new THREE.NodeMaterial();
  material.fog = false;
  material.lights = false;
  const value = texture(input, uv());
  // Pinned PMREMUtils returns vec3; @types currently erases this function's result type.
  material.colorNode = textureCubeUV(
    texture(atlas),
    value.rgb.normalize(),
    value.a,
    float(1 / 336),
    float(1 / 256),
    float(6),
  ) as THREE.Node<"vec3">;
  try {
    renderer.setRenderTarget(output);
    new THREE.QuadMesh(material).render(renderer);
    renderer.setRenderTarget(null);
    return Array.from(
      (await renderer.readRenderTargetPixelsAsync(output, 0, 0, data.length / 4, 1)) as Uint16Array,
      decodeFloat16,
    );
  } finally {
    input.dispose();
    output.dispose();
    material.dispose();
  }
}
async function run() {
  if (!navigator.gpu) throw new Error("WebGPU unavailable");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("GPU adapter unavailable");
  const device = await adapter.requestDevice();
  const errors: string[] = [];
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const renderer = new THREE.WebGPURenderer();
  renderer.toneMapping = THREE.NoToneMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const results = [];
  try {
    await renderer.init();
    for (const environment of Object.values(CIVSIM_ENVIRONMENTS)) {
      const sky = new SkyModel(environment);
      const source = device.createTexture({
        size: [SKY_LUT_WIDTH, SKY_LUT_HEIGHT],
        format: "rgba16float",
        usage:
          GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
      });
      let reference: THREE.RenderTarget | undefined;
      let candidate: Awaited<ReturnType<typeof createRawPmrem>> | undefined;
      try {
        sky.bake(renderer);
        const input = (await renderer.readRenderTargetPixelsAsync(
          sky.lut,
          0,
          0,
          SKY_LUT_WIDTH,
          SKY_LUT_HEIGHT,
        )) as Uint16Array;
        device.queue.writeTexture({ texture: source }, input, { bytesPerRow: SKY_LUT_WIDTH * 8 }, [
          SKY_LUT_WIDTH,
          SKY_LUT_HEIGHT,
        ]);
        const sameInput = compareHdr(
          await readHdrTexture(device, source),
          Array.from(input, decodeFloat16),
        );
        if (sameInput.maxAbs !== 0 || sameInput.nonfinite)
          throw new Error("Candidate LUT upload differs from reference texels");
        reference = generator.fromEquirectangular(sky.lut.texture);
        candidate = await createPmrem(device, source);
        if (
          reference.width !== 336 ||
          reference.height !== 256 ||
          candidate.width !== 336 ||
          candidate.height !== 256 ||
          candidate.maxMip !== 6
        )
          throw new Error("Unexpected PMREM dimensions");
        const actual = await readHdrTexture(device, candidate.texture);
        // Pinned WebGPUTextureUtils.copyTextureToBuffer returns 256-byte-padded rows.
        const referenceReadback = (await renderer.readRenderTargetPixelsAsync(
          reference,
          0,
          0,
          336,
          256,
        )) as Uint16Array;
        const referenceStride = (Math.ceil((336 * 8) / 256) * 256) / 2;
        const expected = Array.from({ length: 336 * 256 * 4 }, (_, i) =>
          decodeFloat16(
            referenceReadback[Math.floor(i / (336 * 4)) * referenceStride + (i % (336 * 4))],
          ),
        );
        const lods = rectangles.map((rectangle, lod) => ({
          lod,
          rectangle,
          ...compareHdr(region(actual, rectangle), region(expected, rectangle)),
        }));
        const directions: number[][] = [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ];
        for (const x of [-1, 1])
          for (const y of [-1, 1]) for (const z of [-1, 1]) directions.push([x, y, z]);
        directions.push(
          [1, 1, 0.0001],
          [1, 1.0001, 0],
          [1.0001, 1, 0],
          [-1, -1, 0.0001],
          [0, 1, 1.0001],
          [0, 1.0001, 1],
          [...sky.params.sunDirection],
        );
        const roughness = [0, 0.05, 0.21, 0.305, 0.4, 0.6, 0.8, 1];
        const samples = new Float32Array(
          directions.flatMap((direction) => roughness.flatMap((r) => [...direction, r])),
        );
        const sampled = compareHdr(
          await sampleCandidate(device, candidate.texture, samples),
          await sampleReference(renderer, reference.texture, samples),
        );
        const finite = {
          actual: actual.every(Number.isFinite),
          reference: expected.every(Number.isFinite),
        };
        candidate.dispose();
        candidate.dispose();
        candidate = undefined;
        const sourceAfter = compareHdr(
          await readHdrTexture(device, source),
          Array.from(input, decodeFloat16),
        );
        results.push({
          preset: environment.id,
          sameInput,
          finite,
          lods,
          directions,
          roughness,
          sampled,
          borrowedSourceUnchanged: sourceAfter.maxAbs === 0 && sourceAfter.nonfinite === 0,
          passed:
            finite.actual &&
            finite.reference &&
            lods.every(passes) &&
            passes(sampled) &&
            sourceAfter.maxAbs === 0 &&
            sourceAfter.nonfinite === 0,
        });
      } finally {
        candidate?.dispose();
        reference?.dispose();
        source.destroy();
        sky.dispose();
      }
    }
    return {
      passed: results.every((r) => r.passed) && errors.length === 0,
      results,
      errors,
      scope:
        "Native PMREM numerical component only; strict initial HDR tolerances, no full-backend parity or performance claim",
    };
  } catch (error) {
    return { passed: false, error: String(error), results, errors };
  } finally {
    generator.dispose();
    renderer.dispose();
    device.destroy();
  }
}
const report = { backend, ...(await run()) };
document.querySelector("#result")!.textContent = JSON.stringify(report, null, 2);
Object.assign(window, { __pmrem: report });
