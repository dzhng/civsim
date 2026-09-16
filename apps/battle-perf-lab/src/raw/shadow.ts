import type { Camera3DParams } from "../../../../packages/renderer-core/src/camera3d";
import { NativeShadowFrame } from "../shadowData";
import { SINGLE_MAP_SIZE } from "../../../../packages/game-renderer/src/battle/shadowPolicy";
import type { CivsimEnvironment } from "../../../../packages/game-renderer/src/environment/environment";

/** One camera-fitted directional depth pass. Owns depth/uniform buffers;
 * the world owns caster selection and binds the same pose with a distinct camera. */
export class RawSunShadow {
  readonly depth: GPUTexture;
  readonly comparison: GPUSampler;
  readonly state: GPUBuffer;
  readonly camera: GPUBuffer;
  private readonly owned: { destroy(): void }[] = [];
  private disposed = false;
  private readonly frameData: NativeShadowFrame;
  constructor(
    private readonly device: GPUDevice,
    environment: CivsimEnvironment,
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
      this.frameData = new NativeShadowFrame(environment, (data) => {
        device.queue.writeBuffer(this.camera, 0, data.camera);
        device.queue.writeBuffer(this.state, 0, data.state);
      });
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  setWorldRect(
    rect: readonly [number, number, number, number],
    elevation?: readonly [number, number],
  ) {
    this.assertLive();
    return this.frameData.setWorldRect(rect, elevation);
  }
  update(camera: Camera3DParams) {
    this.assertLive();
    return this.frameData.update(camera);
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
