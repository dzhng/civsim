import { tgpu } from "typegpu";
import { initFromDevice, frame, target } from "vgpu";
import type { AppearanceBundle } from "../../../packages/soldier-assets/src/appearanceBundle";
import type { CivsimEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import { cameraUniformData } from "../../../packages/renderer-core/src/cameraUniform";
import { viewMatrix, type Camera3DParams } from "../../../packages/renderer-core/src/camera3d";
import { createTypegpuCrowd } from "../../../packages/battle-renderer/src/world/crowd";
import { createTypegpuEnvironment } from "../../../packages/battle-renderer/src/world/environment";
import { Camera, typegpuCameraLayout } from "../../../packages/battle-renderer/src/world/camera";
import { createVgpuCrowd } from "./vgpu/crowd";
import { createVgpuEnvironment } from "./vgpu/environment";
import { destroyVgpuTarget } from "./vgpu/targetLifetime";
/** Component control driver only; each library owns candidate preparation and frame encoding. */
export async function createCrowdControlBackend(
  kind: "typegpu" | "vgpu",
  device: GPUDevice,
  assets: Record<number, AppearanceBundle>,
  env: CivsimEnvironment,
  width: number,
  height: number,
  samples: 1 | 4,
) {
  const release: (() => void)[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of release.reverse()) f();
  };
  const bytes = (params: Camera3DParams) =>
    cameraUniformData({
      camera3d: params,
      x: 0,
      y: 0,
      zoom: 8,
      width,
      height,
      sunAzimuth: 0,
      sunElevation: 0,
    });
  try {
    if (kind === "typegpu") {
      const root = tgpu.initFromDevice({ device });
      release.push(() => root.destroy());
      const environment = await createTypegpuEnvironment(device, env);
      release.push(environment.dispose);
      const camera = root.createBuffer(Camera).$usage("uniform");
      release.push(() => camera.destroy());
      const group = root.createBindGroup(typegpuCameraLayout, { cam: camera });
      const output = root
        .createTexture({ size: [width, height], format: "rgba16float" })
        .$usage("render");
      release.push(() => output.destroy());
      const msaa =
        samples === 4
          ? root
              .createTexture({ size: [width, height], format: "rgba16float", sampleCount: 4 })
              .$usage("render")
          : undefined;
      if (msaa) release.push(() => msaa.destroy());
      const depth = root
          .createTexture({ size: [width, height], format: "depth32float", sampleCount: samples })
          .$usage("render"),
        shadow = root
          .createTexture({ size: [width, height], format: "depth32float" })
          .$usage("render");
      release.push(
        () => depth.destroy(),
        () => shadow.destroy(),
      );
      const crowd = await createTypegpuCrowd(device, assets, group, environment, samples);
      release.push(crowd.dispose);
      return {
        output: root.unwrap(output),
        setView(params: Camera3DParams) {
          environment.setView(viewMatrix(params), [0, 0, 0]);
          camera.write(bytes(params).buffer);
        },
        upload: crowd.upload,
        stats: () => ({
          ...crowd.stats(),
          computeSubmissionPolicy: "shared-encoder",
          auxiliaryShadowColorBytes: 0,
        }),
        async render() {
          const typed = root["~unstable"].createCommandEncoder();
          crowd.precompute(root.unwrap(typed));
          const pass = typed.beginRenderPass({
            colorAttachments: [
              {
                view: msaa ?? output,
                resolveTarget: msaa ? output : undefined,
                clearValue: [0, 0, 0, 0],
              },
            ],
            depthStencilAttachment: { view: depth, depthClearValue: 0 },
          });
          crowd.draw(pass);
          pass.end();
          const shadows = typed.beginRenderPass({
            colorAttachments: [],
            depthStencilAttachment: { view: shadow, depthClearValue: 0 },
          });
          crowd.draw(shadows, "shadow");
          shadows.end();
          typed.submit();
        },
        dispose,
      };
    }
    const gpu = await initFromDevice(device);
    release.push(() => gpu.dispose());
    const environment = await createVgpuEnvironment(gpu, env, undefined, 3);
    release.push(environment.dispose);
    const camera = gpu.device.createBuffer({ size: 192, usage: ["uniform", "copy_dst"] });
    release.push(() => camera.destroy());
    const output = target(gpu, {
        size: [width, height],
        format: "rgba16float",
        depth: "depth32float",
        msaa: samples === 4,
      }),
      shadow = target(gpu, { size: [width, height], format: "rgba8unorm", depth: "depth32float" });
    release.push(
      () => destroyVgpuTarget(output),
      () => destroyVgpuTarget(shadow),
    );
    const crowd = await createVgpuCrowd(gpu, assets, camera, environment, samples);
    release.push(crowd.dispose);
    return {
      output: output.color.gpu,
      setView(params: Camera3DParams) {
        environment.setView(viewMatrix(params), [0, 0, 0]);
        camera.write(bytes(params));
      },
      upload: crowd.upload,
      stats: () => ({
        ...crowd.stats(),
        computeSubmissionPolicy: "one-per-active-rig-plus-frame",
        auxiliaryShadowColorBytes: width * height * 4,
      }),
      async render() {
        crowd.precompute();
        await frame(gpu, (current) => {
          current.pass({ target: output, clear: [0, 0, 0, 0], clearDepth: 0 }, (pass) =>
            crowd.draw(pass),
          );
          current.pass({ target: shadow, clear: [0, 0, 0, 0], clearDepth: 0 }, (pass) =>
            crowd.draw(pass, "shadow"),
          );
        }).done;
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
