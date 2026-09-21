import type { Camera3DParams } from "../../../../../packages/renderer-core/src/camera3d";
import { nativeGpuScope } from "../../../../../packages/battle-renderer/src/gpuScope";
import { BATTLE_DEPTH_ATTACHMENT } from "../../../../../packages/battle-renderer/src/worldDepth";
import {
  NativeShadowFrame,
  SHADOW_CAMERA_FLOATS,
  type NativeShadowData,
  type NativeShadowMode,
} from "../../../../../packages/battle-renderer/src/shadowData";
import {
  CSM_CASCADES,
  CSM_MAP_SIZE,
  SINGLE_MAP_SIZE,
} from "../../../../../packages/game-renderer/src/battle/shadowPolicy";
import { SUN_SHADOW_BLOCK_FLOATS } from "../../../../../packages/battle-renderer/src/shaders/shadow";
import type { CivsimEnvironment } from "../../../../../packages/game-renderer/src/environment/environment";

/** Camera-fitted directional depth. Owns the depth array, the per-cascade caster
 *  camera buffers and the one receiver block; the world owns caster selection
 *  and binds the same pose with each cascade's own camera.
 *
 *  Resource shape follows the mode and nothing else: the fitted single map is
 *  ONE 1024 layer, High is TWO 2048 layers. Selecting single never allocates a
 *  High-sized map. Both bind the same array view to receivers, so the binding
 *  shape is fixed while the allocation is not. */
export class RawSunShadow {
  readonly depth: GPUTexture;
  readonly comparison: GPUSampler;
  /** The receiver block: one 208-byte uniform for every shadow receiver. */
  readonly state: GPUBuffer;
  /** One distinct caster camera per active cascade. Sharing a single buffer
   *  across passes would let both see the final write queued before submission. */
  readonly cameras: readonly GPUBuffer[];
  readonly mapSize: number;
  readonly layers: number;
  /** The full-array view receivers sample; layer views are attachments only. */
  readonly receiverView: GPUTextureView;
  private readonly layerViews: readonly GPUTextureView[];
  private readonly owned: { destroy(): void }[] = [];
  private disposed = false;
  private readonly frameData: NativeShadowFrame;
  constructor(
    private readonly device: GPUDevice,
    environment: CivsimEnvironment,
    readonly mode: NativeShadowMode = "single",
  ) {
    const own = <T extends { destroy(): void }>(r: T): T => {
      this.owned.push(r);
      return r;
    };
    this.layers = mode === "csm" ? CSM_CASCADES : 1;
    this.mapSize = mode === "csm" ? CSM_MAP_SIZE : SINGLE_MAP_SIZE;
    try {
      this.depth = own(
        this.device.createTexture({
          label: `native sun depth (${mode})`,
          size: [this.mapSize, this.mapSize, this.layers],
          dimension: "2d",
          format: BATTLE_DEPTH_ATTACHMENT.format,
          usage:
            GPUTextureUsage.RENDER_ATTACHMENT |
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_SRC,
        }),
      );
      this.layerViews = Array.from({ length: this.layers }, (_, layer) =>
        this.depth.createView({
          label: `native sun depth layer ${layer}`,
          dimension: "2d",
          baseArrayLayer: layer,
          arrayLayerCount: 1,
        }),
      );
      this.receiverView = this.depth.createView({
        label: "native sun depth array",
        dimension: "2d-array",
      });
      this.cameras = Array.from({ length: this.layers }, (_, layer) =>
        own(
          this.device.createBuffer({
            label: `native sun camera ${layer}`,
            size: SHADOW_CAMERA_FLOATS * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          }),
        ),
      );
      this.state = own(
        this.device.createBuffer({
          label: "native sun sampling",
          size: SUN_SHADOW_BLOCK_FLOATS * 4,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
      );
      this.comparison = this.device.createSampler({
        compare: "greater-equal",
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      this.frameData = new NativeShadowFrame(environment, mode, (data) => {
        // Every distinct caster camera and the shared block are written once
        // their inputs change; a cold frame publishes a legal empty block.
        for (const cascade of data.cascades)
          this.device.queue.writeBuffer(this.cameras[cascade.index], 0, cascade.camera);
        this.device.queue.writeBuffer(this.state, 0, data.receiver);
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
  get data(): NativeShadowData {
    return this.frameData.data;
  }

  /** Encodes one clear-to-0 depth pass per ACTIVE cascade, each labelled so a
   *  timestamp owner can price the cascades separately. A cold frame with no fit
   *  yet encodes nothing rather than drawing casters against an unfitted box. */
  encode(encoder: GPUCommandEncoder, draw: (pass: GPURenderPassEncoder, cascade: number) => void) {
    this.assertLive();
    const active = this.data.cascades;
    for (const cascade of active) {
      const label = active.length > 1 ? `shadow-cascade-${cascade.index}` : "shadow";
      nativeGpuScope(this.device, label, () => {
        const pass = encoder.beginRenderPass({
          label: `native directional shadow ${cascade.index}`,
          colorAttachments: [],
          depthStencilAttachment: {
            view: this.layerViews[cascade.index],
            depthClearValue: BATTLE_DEPTH_ATTACHMENT.clearValue,
            depthLoadOp: BATTLE_DEPTH_ATTACHMENT.loadOp,
            depthStoreOp: BATTLE_DEPTH_ATTACHMENT.storeOp,
          },
        });
        try {
          draw(pass, cascade.index);
        } finally {
          pass.end();
        }
      });
    }
  }

  /** Real textures and buffers, counted as allocated — not as configured. */
  stats() {
    return {
      mode: this.mode,
      cascades: this.data.cascades.length,
      mapSize: this.mapSize,
      layers: this.layers,
      depthBytes: this.mapSize * this.mapSize * 4 * this.layers,
      cameraBuffers: this.cameras.length,
      receiverBytes: SUN_SHADOW_BLOCK_FLOATS * 4,
    };
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
