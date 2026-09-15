import { createTypegpuSunShadow } from "../candidates/typegpu/shadow";
import { createVgpuSunShadow } from "./vgpu/shadow";
import { tgpu } from "typegpu";
import { initFromDevice, target } from "vgpu";
import type { AppearanceBundle } from "../../../packages/soldier-assets/src/appearanceBundle";
import type { CivsimEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import type { BattlePostGradeUniforms } from "../../../packages/game-renderer/src/environment/postParameters";
import type { CrowdInstance } from "../../../packages/crowd-runtime/src/instanceData";
import type { CrowdAudiencePlan } from "./crowdData";
import type { PhotorealBattleGroundMesh } from "../../../packages/game-renderer/src/battle/groundPass";
import type { FrameCameraSnapshot } from "./frameCamera";
import { createTypegpuEnvironment } from "../candidates/typegpu/environment";
import { createTypegpuCrowd } from "../candidates/typegpu/crowd";
import { createTypegpuTerrain } from "../candidates/typegpu/terrain";
import { TypegpuBattleFrame } from "../candidates/typegpu/frame";
import { createVgpuEnvironment } from "./vgpu/environment";
import { createVgpuCrowd } from "./vgpu/crowd";
import { createVgpuTerrain } from "./vgpu/terrain";
import { VgpuBattleFrame } from "./vgpu/frame";
import { destroyVgpuTarget } from "./vgpu/targetLifetime";
/** Lab-only backend driver; fixtures and Three oracle remain in the shared frame control. */
export async function createFrameControlBackend(
  backend: "typegpu" | "vgpu",
  device: GPUDevice,
  env: CivsimEnvironment,
  assets: Record<number, AppearanceBundle>,
  ground: PhotorealBattleGroundMesh,
  width: number,
  height: number,
  samples: 1 | 4,
  shadowRect?: readonly [number, number, number, number],
) {
  const release: (() => void)[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of release.reverse()) f();
  };
  try {
    if (backend === "typegpu") {
      const root = tgpu.initFromDevice({ device });
      release.push(() => root.destroy());
      const shadow = shadowRect ? createTypegpuSunShadow(device, env) : undefined;
      if (shadow) {
        release.push(shadow.dispose);
        shadow.setWorldRect(shadowRect!);
      }
      const environment = await createTypegpuEnvironment(device, env, undefined, samples, shadow);
      release.push(environment.dispose);
      const frame = await TypegpuBattleFrame.create(
        device,
        environment,
        width,
        height,
        samples,
        "rgba16float",
      );
      release.push(() => frame.dispose());
      const crowd = await createTypegpuCrowd(
        device,
        assets,
        frame.cameraGroup,
        environment,
        samples,
      );
      release.push(crowd.dispose);
      const terrain = await createTypegpuTerrain(
        device,
        frame.cameraBuffer,
        environment,
        ground,
        null,
        { earthDistance: ground.earthDistance },
        "beauty",
        samples,
      );
      release.push(terrain.dispose);
      const output = root
        .createTexture({ size: [width, height], format: "rgba16float" })
        .$usage("render");
      release.push(() => output.destroy());
      return {
        hdr: frame.hdr,
        output: root.unwrap(output),
        upload: (instances: readonly CrowdInstance[], plan: CrowdAudiencePlan) =>
          crowd.upload(instances, plan),
        setCamera: (
          snapshot: FrameCameraSnapshot,
          observer: readonly [number, number, number],
          grade: BattlePostGradeUniforms,
        ) => frame.setCamera(snapshot, observer, grade),
        async render(bloom: boolean) {
          frame.render(
            root.unwrap(output).createView(),
            (encoder) => {
              crowd.precompute(root.unwrap(encoder));
              shadow?.encode(encoder, (pass) => crowd.draw(pass, "shadow", shadow.cameraGroup));
            },
            (pass) => {
              terrain.draw(pass);
              crowd.draw(pass);
            },
            bloom,
          );
        },
        dispose,
      };
    }
    const gpu = await initFromDevice(device);
    release.push(() => gpu.dispose());
    const shadow = shadowRect ? createVgpuSunShadow(gpu, env) : undefined;
    if (shadow) {
      release.push(shadow.dispose);
      shadow.setWorldRect(shadowRect!);
    }
    const environment = await createVgpuEnvironment(gpu, env, undefined, 3, samples, shadow);
    release.push(environment.dispose);
    const frame = await VgpuBattleFrame.create(
      gpu,
      environment,
      width,
      height,
      samples,
      "rgba16float",
    );
    release.push(() => frame.dispose());
    const crowd = await createVgpuCrowd(gpu, assets, frame.camera, environment, samples);
    release.push(crowd.dispose);
    const terrain = await createVgpuTerrain(
      gpu,
      frame.camera,
      environment,
      ground,
      null,
      { earthDistance: ground.earthDistance },
      "beauty",
      samples,
    );
    release.push(terrain.dispose);
    const output = target(gpu, { size: [width, height], format: "rgba16float" });
    release.push(() => destroyVgpuTarget(output));
    return {
      hdr: frame.hdr,
      output: output.color.gpu,
      upload: (instances: readonly CrowdInstance[], plan: CrowdAudiencePlan) =>
        crowd.upload(instances, plan),
      setCamera: (
        snapshot: FrameCameraSnapshot,
        observer: readonly [number, number, number],
        grade: BattlePostGradeUniforms,
      ) => frame.setCamera(snapshot, observer, grade),
      async render(bloom: boolean) {
        await frame.render(
          output,
          () => crowd.precompute(),
          (pass) => {
            terrain.draw(pass);
            crowd.draw(pass);
          },
          bloom,
          (current) => shadow?.encode(current, (pass) => crowd.draw(pass, "shadow", shadow.camera)),
        );
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
