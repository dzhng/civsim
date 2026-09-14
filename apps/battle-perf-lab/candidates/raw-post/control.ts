import { readHdrTexture, unpackRgba16fRows } from "../../src/numericalReadback";
// Isolated Three control: both pipelines receive the same half-float HDR texels.
import * as THREE from "three/webgpu";
import { texture, uv } from "three/tsl";
import { BattlePostChain } from "../../../../packages/photoreal-renderer/src/post/postChain";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import type { BattlePostGradeUniforms } from "../../../../packages/game-renderer/src/environment/postParameters";

export interface PostAdapter {
  setGrade(grade: BattlePostGradeUniforms, exposure: number): void;
  render(bloom?: boolean): Promise<GPUTexture>;
  dispose(): void;
}
export type PostFactory = (
  device: GPUDevice,
  input: GPUTextureView,
  width: number,
  height: number,
  outputFormat: GPUTextureFormat,
) => Promise<PostAdapter>;

const WIDTH = 127,
  HEIGHT = 95;
function syntheticHdr(width: number, height: number) {
  const result = new Uint16Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let rgb = [(x / (width - 1)) * 4, (y / (height - 1)) * 2, (1 - x / (width - 1)) * 0.8];
      if (y < 12) rgb = [1, 1, 1].map(() => 0.98 + (x / (width - 1)) * 0.85);
      if (x > 76 && x < 90 && y > 38 && y < 54) rgb = [18, 7, 2];
      if (x < 16 && y > 72) rgb = [0, 0, 0];
      if (x > 110 && y > 70) rgb = [0.004, 0.01, 0.002];
      for (let c = 0; c < 4; c++)
        result[(y * width + x) * 4 + c] = THREE.DataUtils.toHalfFloat(c === 3 ? 1 : rgb[c]);
    }
  return result;
}
function compare(actual: number[], expected: number[]) {
  let maxAbs = 0,
    squared = 0,
    nonfinite = 0,
    worst = 0,
    overOneDisplayCode = 0;
  for (let i = 0; i < actual.length; i++) {
    const diff = Math.abs(actual[i] - expected[i]);
    if (!Number.isFinite(diff)) nonfinite++;
    if (diff > maxAbs) {
      maxAbs = diff;
      worst = i;
    }
    squared += diff * diff;
    if (diff > 1 / 255) overOneDisplayCode++;
  }
  return {
    maxAbs,
    rmse: Math.sqrt(squared / actual.length),
    nonfinite,
    overOneDisplayCode,
    worst: {
      x: Math.floor(worst / 4) % WIDTH,
      y: Math.floor(worst / (4 * WIDTH)),
      channel: worst % 4,
      actual: actual[worst],
      expected: expected[worst],
    },
  };
}
export async function runPostControl(factory: PostFactory, backend: string) {
  const errors: string[] = [];
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("Hardware WebGPU unavailable");
  const device = await adapter.requestDevice();
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const renderer = new THREE.WebGPURenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  await renderer.init();
  const texels = syntheticHdr(WIDTH, HEIGHT);
  const input = device.createTexture({
    size: [WIDTH, HEIGHT],
    format: "rgba16float",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
  });
  device.queue.writeTexture({ texture: input }, texels, { bytesPerRow: WIDTH * 8 }, [
    WIDTH,
    HEIGHT,
  ]);
  const dataTexture = new THREE.DataTexture(
    texels,
    WIDTH,
    HEIGHT,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
  );
  dataTexture.colorSpace = THREE.LinearSRGBColorSpace;
  dataTexture.minFilter = THREE.LinearFilter;
  dataTexture.magFilter = THREE.LinearFilter;
  dataTexture.needsUpdate = true;
  const material = new THREE.NodeMaterial();
  material.fragmentNode = texture(dataTexture, uv());
  const quad = new THREE.QuadMesh(material);
  const scene = new THREE.Scene();
  scene.add(quad);
  const reference = new THREE.RenderTarget(WIDTH, HEIGHT, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
  });
  const results = [];
  try {
    for (const env of Object.values(CIVSIM_ENVIRONMENTS)) {
      const control = new BattlePostChain(renderer, scene, quad.camera, env.id);
      const raw = await factory(device, input.createView(), WIDTH, HEIGHT, "rgba16float");
      try {
        for (const changed of [false, true]) {
          if (changed)
            control.setGradeUniforms({
              strength: 1.3,
              saturationBoost: 0.8,
              contrast: 0.35,
              splitTone: 0.6,
              shadowLift: 1.3,
            });
          const exposure = env.physical.exposure * (changed ? 0.67 : 1);
          renderer.toneMappingExposure = exposure;
          raw.setGrade(control.stats().grade.uniforms, exposure);
          for (const bloom of [false, true, false]) {
            control.setBloomEnabled(bloom);
            const output = await raw.render(bloom);
            renderer.setRenderTarget(reference);
            control.render(scene, quad.camera);
            renderer.setRenderTarget(null);
            // Pinned Three preserves 256-byte row padding in public readback.
            const expectedRaw = (await renderer.readRenderTargetPixelsAsync(
              reference,
              0,
              0,
              WIDTH,
              HEIGHT,
            )) as Uint16Array;
            const expected = unpackRgba16fRows(expectedRaw, WIDTH, HEIGHT);
            results.push({
              preset: env.id,
              changed,
              bloom,
              ...compare(await readHdrTexture(device, output), expected),
            });
          }
        }
      } finally {
        control.dispose();
        raw.dispose();
        raw.dispose();
      }
    }
    // Exercise recreation on borrowed input after prior owner disposal.
    const replacement = await factory(device, input.createView(), WIDTH, HEIGHT, "rgba16float");
    replacement.dispose();
    let disposedGuard = false;
    try {
      await replacement.render();
    } catch {
      disposedGuard = true;
    }
    const report = {
      passed:
        results.every((r) => r.nonfinite === 0 && r.maxAbs <= 1 / 255) &&
        errors.length === 0 &&
        disposedGuard,
      backend,
      adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture },
      framebuffer: [WIDTH, HEIGHT],
      results,
      errors,
      disposedGuard,
      scope:
        "synthetic HDR numerical control against actual BattlePostChain; no battle visual or performance claim",
    };
    document.querySelector("#result")!.textContent = JSON.stringify(report, null, 2);
    Object.assign(window, { __rawPostCheck: report });
  } catch (error) {
    Object.assign(window, { __rawPostCheck: { passed: false, error: String(error), errors } });
    document.querySelector("#result")!.textContent = String(error);
  } finally {
    reference.dispose();
    material.dispose();
    dataTexture.dispose();
    renderer.dispose();
    input.destroy();
    device.destroy();
  }
}
