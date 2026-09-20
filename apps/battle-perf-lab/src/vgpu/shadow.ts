import type { Camera3DParams } from "../../../../packages/renderer-core/src/camera3d";
import { target, sampler, type Gpu, type Frame, type FramePass } from "vgpu";
import { NativeShadowFrame } from "../../../../packages/battle-renderer/src/shadowData";
import { SUN_CASCADE_RECORD_FLOATS } from "../../../../packages/battle-renderer/src/shaders/shadow";
import { SINGLE_MAP_SIZE } from "../../../../packages/game-renderer/src/battle/shadowPolicy";
import type { CivsimEnvironment } from "../../../../packages/game-renderer/src/environment/environment";
import { destroyVgpuTarget } from "./targetLifetime";
/** Public Frame depth pass; unused RGBA8 attachment is a pinned vgpu API cost. */
export function createVgpuSunShadow(gpu: Gpu, environment: CivsimEnvironment) {
  const owned: (() => void)[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of owned.reverse()) f();
  };
  const live = () => {
    if (disposed) throw Error("vgpu shadow disposed");
  };
  try {
    const output = target(gpu, {
      size: [SINGLE_MAP_SIZE, SINGLE_MAP_SIZE],
      format: "rgba8unorm",
      depth: "depth32float",
    });
    owned.push(() => destroyVgpuTarget(output));
    if (!output.depth) throw Error("vgpu shadow target omitted depth");
    const camera = gpu.device.createBuffer({ size: 192, usage: ["uniform", "copy_dst"] });
    owned.push(() => camera.destroy());
    // Single map only: this discarded candidate binds the shared cascade RECORD
    // (96 bytes), not the world's two-record receiver block.
    const state = gpu.device.createBuffer({
      size: SUN_CASCADE_RECORD_FLOATS * 4,
      usage: ["uniform", "copy_dst"],
    });
    owned.push(() => state.destroy());
    const comparison = sampler(gpu, {
      compare: "greater-equal",
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    const frameData = new NativeShadowFrame(environment, "single", (data) => {
      // A cold frame still publishes its (empty) record, so the receiver never
      // samples uninitialized uniform memory.
      state.write(data.receiver.slice(0, SUN_CASCADE_RECORD_FLOATS));
      for (const fitted of data.cascades) camera.write(fitted.camera);
    });
    return {
      depth: output.depth,
      camera,
      state,
      comparison,
      unusedColorBytes: SINGLE_MAP_SIZE * SINGLE_MAP_SIZE * 4,
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
      encode(current: Frame, draw: (pass: FramePass) => void) {
        live();
        current.pass({ target: output, clearDepth: 0 }, draw);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
