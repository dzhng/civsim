// Isolated correctness control. Three is intentionally confined to this entry;
// the TypeGPU candidate and shared WGSL contain no Three imports or calls.
import * as THREE from "three/webgpu";
import { equirectUV, normalize, texture, uv, vec3, vec4, smoothstep } from "three/tsl";
import { SkyModel } from "../../../../packages/photoreal-renderer/src/atmosphere/skyModel";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import * as sky from "../../../../packages/game-renderer/src/environment/skyParameters";
import { createTypegpuSky, type SkyRays } from "./sky";

function half(value: number) {
  const sign = value & 0x8000 ? -1 : 1,
    exponent = (value >> 10) & 31,
    mantissa = value & 1023;
  return (
    sign *
    (exponent === 0
      ? (2 ** -14 * mantissa) / 1024
      : exponent === 31
        ? mantissa
          ? NaN
          : Infinity
        : 2 ** (exponent - 15) * (1 + mantissa / 1024))
  );
}
async function read(device: GPUDevice, target: GPUTexture) {
  const bytesPerRow = Math.ceil((target.width * 8) / 256) * 256;
  const buffer = device.createBuffer({
    size: bytesPerRow * target.height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: target }, { buffer, bytesPerRow }, [
      target.width,
      target.height,
    ]);
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const raw = new Uint16Array(buffer.getMappedRange());
    return Array.from({ length: target.width * target.height * 4 }, (_, i) =>
      half(raw[(Math.floor(i / (target.width * 4)) * bytesPerRow) / 2 + (i % (target.width * 4))]),
    );
  } finally {
    buffer.destroy();
  }
}
function compare(actual: number[], expected: number[]) {
  let maxAbs = 0,
    maxRelative = 0,
    squared = 0,
    bad = 0,
    peak = 0;
  let actualNonfinite = 0,
    expectedNonfinite = 0,
    nonfiniteMismatch = 0;
  const nonfiniteCoordinates: number[] = [];
  for (let i = 0; i < actual.length; i++) {
    const difference = Math.abs(actual[i] - expected[i]);
    if (!Number.isFinite(actual[i]) || !Number.isFinite(expected[i])) {
      bad++;
      actualNonfinite += +!Number.isFinite(actual[i]);
      expectedNonfinite += +!Number.isFinite(expected[i]);
      if (!Object.is(actual[i], expected[i])) nonfiniteMismatch++;
      if (nonfiniteCoordinates.length < 24) nonfiniteCoordinates.push(i);
      continue;
    }
    maxAbs = Math.max(maxAbs, difference);
    maxRelative = Math.max(maxRelative, difference / Math.max(0.05, Math.abs(expected[i])));
    squared += difference * difference;
    peak = Math.max(peak, actual[i]);
  }
  return {
    maxAbs,
    maxRelative,
    rmse: Math.sqrt(squared / actual.length),
    nonfinite: bad,
    actualNonfinite,
    expectedNonfinite,
    nonfiniteMismatch,
    nonfiniteCoordinates,
    peak,
    samples: actual.length,
  };
}
const errors: string[] = [];
const device = await (await navigator.gpu.requestAdapter())!.requestDevice();
device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
const renderer = new THREE.WebGPURenderer();
renderer.toneMapping = THREE.NoToneMapping;
await renderer.init();
const results = [];
try {
  for (const env of Object.values(CIVSIM_ENVIRONMENTS)) {
    const control = new SkyModel(env);
    const candidate = await createTypegpuSky(device, sky.skyModelParams(env));
    try {
      control.bake(renderer);
      const expected = Array.from(
        (await renderer.readRenderTargetPixelsAsync(
          control.lut,
          0,
          0,
          sky.SKY_LUT_WIDTH,
          sky.SKY_LUT_HEIGHT,
        )) as Uint16Array,
        half,
      );
      const lut = compare(await read(device, candidate.lut), expected);
      const backgrounds = [];
      const cases: SkyRays[] = [
        { origin: [-1, 1, 0.3], dx: [2, 0, 0], dy: [0, 0, -0.8] },
        { origin: control.params.sunDirection, dx: [0, 0, 0], dy: [0, 0, 0] },
        { origin: [-1, 0.01, -0.01], dx: [0, -0.02, 0], dy: [0, 0, 0.02] },
      ];
      for (const rays of cases) {
        const target = device.createTexture({
          size: [64, 32],
          format: "rgba16float",
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        const reference = new THREE.RenderTarget(64, 32, {
          type: THREE.HalfFloatType,
          depthBuffer: false,
        });
        const material = new THREE.NodeMaterial();
        material.fog = false;
        material.lights = false;
        const dir = normalize(
          vec3(...rays.origin)
            .add(vec3(...rays.dx).mul(uv().x))
            .add(vec3(...rays.dy).mul(uv().y)),
        );
        const disc = smoothstep(
          sky.SUN_DISC_COS_OUTER,
          sky.SUN_DISC_COS_INNER,
          dir.dot(vec3(...control.params.sunDirection)),
        )
          .mul(smoothstep(-0.015, 0.01, dir.z))
          .mul(sky.SUN_DISC_RADIANCE * (1 - control.params.overcast));
        material.colorNode = vec4(
          texture(control.lut.texture, equirectUV(dir)).rgb.add(
            vec3(...control.params.sunTransmittance).mul(disc),
          ),
          1,
        );
        const quad = new THREE.QuadMesh(material);
        try {
          candidate.setRays(rays);
          const encoder = device.createCommandEncoder();
          candidate.encodeBackground(encoder, target.createView());
          device.queue.submit([encoder.finish()]);
          renderer.setRenderTarget(reference);
          quad.render(renderer);
          renderer.setRenderTarget(null);
          backgrounds.push(
            compare(
              await read(device, target),
              Array.from(
                (await renderer.readRenderTargetPixelsAsync(
                  reference,
                  0,
                  0,
                  64,
                  32,
                )) as Uint16Array,
                half,
              ),
            ),
          );
        } finally {
          target.destroy();
          reference.dispose();
          material.dispose();
        }
      }
      results.push({ preset: env.id, lut, backgrounds });
    } finally {
      control.dispose();
      candidate.dispose();
    }
  }
  // f32 atmosphere integration + half-float storage; compare every component,
  // not screenshot averages. Any relaxation needs a diagnosed numerical cause.
  const checks = results.flatMap((r) => [r.lut, ...r.backgrounds]);
  const passed =
    checks.every((c) => c.nonfinite === 0 && c.maxRelative <= 0.001 && c.maxAbs <= 0.004) &&
    errors.length === 0;
  const report = {
    passed,
    results,
    errors,
    scope:
      "linear HDR LUT and background sampling only; no PMREM, fixture parity or performance claim",
  };
  document.querySelector("#result")!.textContent = JSON.stringify(report, null, 2);
  Object.assign(window, { __typegpuSky: report });
} catch (error) {
  Object.assign(window, { __typegpuSky: { passed: false, error: String(error), errors } });
  document.querySelector("#result")!.textContent = String(error);
} finally {
  renderer.dispose();
  device.destroy();
}
