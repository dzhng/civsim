import {
  lookAt,
  multiply,
  invert,
  orthographicReverseZ,
} from "../../../../packages/renderer-core/src/mat4";
import {
  singleShadowFit,
  SINGLE_MAP_SIZE,
  SHADOW_BIAS,
  SHADOW_NORMAL_BIAS,
  shadowRadiusForTurbidity,
} from "../../../../packages/game-renderer/src/battle/shadowPolicy";
import type { CivsimEnvironment } from "../../../../packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "../../../../packages/game-renderer/src/environment/physicalEnvironment";

/** One existing whole-map directional depth pass. Owns depth/uniform buffers;
 * the world owns caster selection and binds the same pose with a distinct camera. */
export class RawSunShadow {
  readonly depth: GPUTexture;
  readonly comparison: GPUSampler;
  readonly state: GPUBuffer;
  readonly camera: GPUBuffer;
  private readonly owned: { destroy(): void }[] = [];
  private disposed = false;
  constructor(
    private readonly device: GPUDevice,
    private readonly environment: CivsimEnvironment,
  ) {
    const own = <T extends { destroy(): void }>(r: T): T => {
      this.owned.push(r);
      return r;
    };
    try {
      this.depth = own(
        device.createTexture({
          label: "native sun depth",
          size: [SINGLE_MAP_SIZE, SINGLE_MAP_SIZE],
          format: "depth32float",
          usage:
            GPUTextureUsage.RENDER_ATTACHMENT |
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_SRC,
        }),
      );
      this.camera = own(
        device.createBuffer({
          label: "native sun camera",
          size: 192,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
      );
      this.state = own(
        device.createBuffer({
          label: "native sun sampling",
          size: 80,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
      );
      this.comparison = device.createSampler({
        compare: "greater-equal",
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  setWorldRect(rect: readonly [number, number, number, number]) {
    this.assertLive();
    const spec = photorealEnvironment(this.environment);
    const fit = singleShadowFit(rect, spec.sunDirection);
    // Three's directional shadow camera retains its default +Y up axis.
    const view = lookAt(fit.position, fit.target, [0, 1, 0]);
    const projection = orthographicReverseZ(
      fit.left,
      fit.right,
      fit.top,
      fit.bottom,
      fit.near,
      fit.far,
    );
    const viewProjection = multiply(projection, view),
      inverse = invert(viewProjection);
    if (!inverse) throw Error("Singular shadow projection");
    const camera = new Float32Array(48);
    camera.set(viewProjection);
    camera.set(inverse, 16);
    camera.set(fit.position, 32);
    camera[35] = fit.near;
    camera.set(fit.target.slice(0, 2), 36);
    camera[38] = camera[39] = SINGLE_MAP_SIZE;
    camera[43] = fit.far;
    this.device.queue.writeBuffer(this.camera, 0, camera);
    const state = new Float32Array(20);
    state.set(viewProjection);
    state.set(
      [
        SHADOW_BIAS,
        SHADOW_NORMAL_BIAS,
        shadowRadiusForTurbidity(this.environment.physical.turbidity),
        1,
      ],
      16,
    );
    this.device.queue.writeBuffer(this.state, 0, state);
    return { view, projection, viewProjection, near: fit.near, mapSize: SINGLE_MAP_SIZE };
  }
  encode(encoder: GPUCommandEncoder, draw: (pass: GPURenderPassEncoder) => void) {
    this.assertLive();
    const pass = encoder.beginRenderPass({
      label: "native directional shadow",
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.depth.createView(),
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
  }
  private assertLive() {
    if (this.disposed) throw Error("Native shadow is disposed");
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const resource of this.owned.reverse()) resource.destroy();
  }
}
