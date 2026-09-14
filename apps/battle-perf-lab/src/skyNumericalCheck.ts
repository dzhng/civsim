import { decodeFloat16, readHdrTexture, compareHdr } from "./numericalReadback";
// Shared numerical control. Three is confined to this harness, never candidate runtimes.
import * as THREE from "three/webgpu";
import { equirectUV, normalize, texture, uv, vec3, vec4, smoothstep } from "three/tsl";
import { SkyModel } from "../../../packages/photoreal-renderer/src/atmosphere/skyModel";
import { CIVSIM_ENVIRONMENTS } from "../../../packages/game-renderer/src/environment/environment";
import * as sky from "../../../packages/game-renderer/src/environment/skyParameters";
import type { SkyRays } from "./shaders/physicalSky";
export const SKY_CHECK_SIZE = [64, 32] as const;
export interface SkyCheckCandidate {
  lut: GPUTexture;
  renderBackground(rays: SkyRays): Promise<GPUTexture>;
  dispose(): void;
}
export type SkyCheckFactory = (
  device: GPUDevice,
  params: sky.SkyModelParams,
) => Promise<SkyCheckCandidate>;

export async function runSkyNumericalCheck(createCandidate: SkyCheckFactory) {
  const errors: string[] = [];
  if (!navigator.gpu) throw new Error("WebGPU is unavailable");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("WebGPU adapter is unavailable");
  const device = await adapter.requestDevice();
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const renderer = new THREE.WebGPURenderer();
  renderer.toneMapping = THREE.NoToneMapping;
  const results = [];
  const borrowedDeviceChecks: boolean[] = [];
  try {
    await renderer.init();
    for (const env of Object.values(CIVSIM_ENVIRONMENTS)) {
      const control = new SkyModel(env);
      let candidate: SkyCheckCandidate | undefined;
      try {
        candidate = await createCandidate(device, sky.skyModelParams(env));
        control.bake(renderer);
        const expected = Array.from(
          (await renderer.readRenderTargetPixelsAsync(
            control.lut,
            0,
            0,
            sky.SKY_LUT_WIDTH,
            sky.SKY_LUT_HEIGHT,
          )) as Uint16Array,
          decodeFloat16,
        );
        const lut = compareHdr(await readHdrTexture(device, candidate.lut), expected);
        const backgrounds = [];
        const cases: SkyRays[] = [
          { origin: [-1, 1, 0.3], dx: [2, 0, 0], dy: [0, 0, -0.8] },
          { origin: control.params.sunDirection, dx: [0, 0, 0], dy: [0, 0, 0] },
          { origin: [-1, 0.01, -0.01], dx: [0, -0.02, 0], dy: [0, 0, 0.02] },
        ];
        for (const rays of cases) {
          const reference = new THREE.RenderTarget(...SKY_CHECK_SIZE, {
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
            const target = await candidate.renderBackground(rays);
            renderer.setRenderTarget(reference);
            quad.render(renderer);
            renderer.setRenderTarget(null);
            backgrounds.push(
              compareHdr(
                await readHdrTexture(device, target),
                Array.from(
                  (await renderer.readRenderTargetPixelsAsync(
                    reference,
                    0,
                    0,
                    ...SKY_CHECK_SIZE,
                  )) as Uint16Array,
                  decodeFloat16,
                ),
              ),
            );
          } finally {
            reference.dispose();
            material.dispose();
          }
        }
        results.push({ preset: env.id, lut, backgrounds });
      } finally {
        control.dispose();
        candidate?.dispose();
        device.pushErrorScope("validation");
        const probe = device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST });
        try {
          device.queue.writeBuffer(probe, 0, new Uint32Array([0x5eed]));
          await device.queue.onSubmittedWorkDone();
        } finally {
          probe.destroy();
        }
        borrowedDeviceChecks.push((await device.popErrorScope()) === null);
      }
    }
    // f32 atmosphere integration + half-float storage; compare every component,
    // not screenshot averages. Any relaxation needs a diagnosed numerical cause.
    const checks = results.flatMap((r) => [r.lut, ...r.backgrounds]);
    const passed =
      checks.every((c) => c.nonfinite === 0 && c.maxRelative <= 0.001 && c.maxAbs <= 0.004) &&
      errors.length === 0 &&
      borrowedDeviceChecks.every(Boolean);
    const report = {
      passed,
      results,
      borrowedDeviceChecks,
      errors,
      scope:
        "linear HDR LUT and background sampling only; no PMREM, fixture parity or performance claim",
    };
    return report;
  } catch (error) {
    return { passed: false, error: String(error), errors };
  } finally {
    renderer.dispose();
    device.destroy();
  }
}
