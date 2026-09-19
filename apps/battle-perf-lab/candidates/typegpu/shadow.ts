import type { Camera3DParams } from "../../../../packages/renderer-core/src/camera3d";
import { tgpu, d, type TgpuRenderPass } from "typegpu";
import { shadowPcfWgsl, shadowVisibilityWgsl } from "../../../../packages/battle-renderer/src/shaders/shadow";
import { Camera, typegpuCameraLayout } from "./camera";
import { NativeShadowFrame } from "../../../../packages/battle-renderer/src/shadowData";
import { SINGLE_MAP_SIZE } from "../../../../packages/game-renderer/src/battle/shadowPolicy";
import type { CivsimEnvironment } from "../../../../packages/game-renderer/src/environment/environment";
export const SunSampling = d.struct({ vp: d.mat4x4f, settings: d.vec4f });
export const sunSamplingLayout = tgpu.bindGroupLayout({
  sun: { uniform: SunSampling, visibility: ["fragment"] },
  depth: { texture: d.textureDepth2d(), visibility: ["fragment"] },
  compare: { sampler: "comparison", visibility: ["fragment"] },
});
const shadowPcf = tgpu.fn(
  [d.textureDepth2d(), d.comparisonSampler(), d.vec2f, d.f32, d.vec2f, d.f32],
  d.f32,
)(shadowPcfWgsl);
export const shadowVisibility = tgpu
  .fn(
    [d.textureDepth2d(), d.comparisonSampler(), d.mat4x4f, d.vec4f, d.vec3f, d.vec3f, d.vec2f],
    d.f32,
  )(shadowVisibilityWgsl)
  .$uses({ shadowPcf });
/** Owns depth/camera/sampling; caster pass deliberately binds no sampled depth. */
export function createTypegpuSunShadow(device: GPUDevice, environment: CivsimEnvironment) {
  const root = tgpu.initFromDevice({ device });
  const owned: { destroy(): void }[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const r of owned.reverse()) r.destroy();
    root.destroy();
  };
  const own = <T extends { destroy(): void }>(r: T) => {
    owned.push(r);
    return r;
  };
  const live = () => {
    if (disposed) throw Error("TypeGPU shadow disposed");
  };
  try {
    const depth = own(
      root
        .createTexture({ size: [SINGLE_MAP_SIZE, SINGLE_MAP_SIZE], format: "depth32float" })
        .$usage("render", "sampled"),
    );
    const camera = own(root.createBuffer(Camera).$usage("uniform"));
    const state = own(root.createBuffer(SunSampling).$usage("uniform"));
    const comparison = root.createComparisonSampler({
      compare: "greater-equal",
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    const cameraGroup = root.createBindGroup(typegpuCameraLayout, { cam: camera });
    const samplingGroup = root.createBindGroup(sunSamplingLayout, {
      sun: state,
      depth: depth.createView(),
      compare: comparison,
    });
    const frameData = new NativeShadowFrame(environment, (data) => {
      camera.write(data.camera.buffer);
      state.write(data.state.buffer);
    });
    return {
      depth,
      camera,
      state,
      comparison,
      cameraGroup,
      samplingGroup,
      setWorldRect(
        rect: readonly [number, number, number, number],
        elevation?: readonly [number, number],
      ) {
        live();
        return frameData.setWorldRect(rect, elevation);
      },
      update(camera: Camera3DParams) {
        live();
        return frameData.update(camera);
      },
      encode(
        encoder: ReturnType<(typeof root)["~unstable"]["createCommandEncoder"]>,
        draw: (pass: TgpuRenderPass) => void,
      ) {
        live();
        const pass = encoder.beginRenderPass({
          colorAttachments: [],
          depthStencilAttachment: {
            view: depth,
            depthClearValue: 0,
            depthLoadOp: "clear",
            depthStoreOp: "store",
          },
        });
        try {
          draw(pass);
        } finally {
          pass.end();
        }
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
