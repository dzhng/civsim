import { nativeGpuScope } from "../gpuScope";
import { beginGpuAdmission } from "../gpuAdmission";
import { frameCamera, type FrameCameraSnapshot } from "../frameCamera";
import type { BattlePostGradeUniforms } from "../../../game-renderer/src/environment/postParameters";
import type { RawEnvironment } from "./environment";
import { RawBattlePost } from "./post";
import { BATTLE_DEPTH_ATTACHMENT, battleDepthReversed } from "../worldDepth";

/** One native HDR frame: borrowed device/environment, owned attachments/camera/post.
 * Scene layers encode into the same reverse-Z depth and multisampled color target.
 * This is an integration surface, not a complete or rankable battle backend. */
export class RawBattleFrame {
  readonly cameraLayout: GPUBindGroupLayout;
  readonly cameraGroup: GPUBindGroup;
  private readonly camera: GPUBuffer;
  private attachments: ReturnType<RawBattleFrame["createAttachments"]>;
  private disposed = false;
  private resizing = false;
  private view?: {
    snapshot: FrameCameraSnapshot;
    observer: readonly [number, number, number];
    grade: BattlePostGradeUniforms;
  };
  get width() {
    return this.attachments.width;
  }
  get height() {
    return this.attachments.height;
  }
  /** Borrowed until successful resize or disposal; callers must reacquire its view. */
  get hdr() {
    return this.attachments.hdr;
  }
  constructor(
    private readonly device: GPUDevice,
    private readonly environment: RawEnvironment,
    width: number,
    height: number,
    readonly samples: 1 | 4,
    private readonly outputFormat: GPUTextureFormat,
  ) {
    this.camera = device.createBuffer({
      size: 192,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    try {
      this.cameraLayout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" },
          },
        ],
      });
      this.cameraGroup = device.createBindGroup({
        layout: this.cameraLayout,
        entries: [{ binding: 0, resource: { buffer: this.camera } }],
      });
      this.attachments = this.createAttachments(width, height);
    } catch (error) {
      this.camera.destroy();
      throw error;
    }
  }
  private createAttachments(width: number, height: number) {
    const release: (() => void)[] = [];
    const dispose = () => {
      for (const destroy of release.splice(0).reverse()) destroy();
    };
    const own = (descriptor: GPUTextureDescriptor) => {
      const texture = this.device.createTexture(descriptor);
      release.push(() => texture.destroy());
      return texture;
    };
    try {
      const hdr = own({
        size: [width, height],
        format: "rgba16float",
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_SRC,
      });
      const color =
        this.samples === 1
          ? hdr
          : own({
              size: [width, height],
              format: "rgba16float",
              sampleCount: this.samples,
              usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
      const depthDescriptor: GPUTextureDescriptor = {
        size: [width, height],
        format: BATTLE_DEPTH_ATTACHMENT.format,
        sampleCount: this.samples,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      };
      const depth = own(depthDescriptor);
      const post = new RawBattlePost(
        this.device,
        hdr.createView(),
        width,
        height,
        this.outputFormat,
      );
      release.push(() => post.dispose());
      return { width, height, hdr, color, depth, depthDescriptor, post, dispose };
    } catch (error) {
      dispose();
      throw error;
    }
  }
  /** Concurrent requests reject; callers await each resize. Rendering may continue
   * using the old bundle until admission finishes. Same-size calls allocate nothing. */
  async resize(width: number, height: number): Promise<void> {
    this.assertLive();
    if (this.resizing) throw new Error("Native frame resize already pending");
    if (width === this.width && height === this.height) return;
    this.resizing = true;
    const finish = beginGpuAdmission(this.device);
    let next: ReturnType<RawBattleFrame["createAttachments"]> | undefined;
    try {
      next = this.createAttachments(width, height);
      await finish();
      this.assertLive();
      if (this.view) this.writeCamera(this.view, next);
      const previous = this.attachments;
      this.attachments = next;
      next = undefined;
      previous.dispose();
    } catch (error) {
      await finish().catch(() => {});
      next?.dispose();
      throw error;
    } finally {
      this.resizing = false;
    }
  }
  setCamera(
    snapshot: FrameCameraSnapshot,
    observer: readonly [number, number, number],
    grade: BattlePostGradeUniforms,
  ) {
    this.assertLive();
    const view = {
      snapshot: {
        ...snapshot,
        camera3d: {
          ...snapshot.camera3d,
          target: [...snapshot.camera3d.target] as [number, number, number],
        },
      },
      observer: [...observer] as [number, number, number],
      grade: { ...grade },
    };
    this.writeCamera(view, this.attachments);
    this.view = view;
  }
  private writeCamera(
    view: NonNullable<RawBattleFrame["view"]>,
    target: RawBattleFrame["attachments"],
  ) {
    const camera = frameCamera(view.snapshot, target.width, target.height);
    target.post.setGrade(view.grade, this.environment.exposure);
    this.device.queue.writeBuffer(this.camera, 0, camera.bytes);
    this.environment.setView(camera.view, view.observer);
    this.environment.sky.setRays(camera.rays);
  }

  encode(
    encoder: GPUCommandEncoder,
    output: GPUTextureView,
    draw: (pass: GPURenderPassEncoder, camera: GPUBindGroup) => void,
    bloom: boolean,
    postEnabled = true,
  ) {
    this.assertLive();
    nativeGpuScope(this.device, "main", () => {
      this.environment.sky.encodeBackground(encoder, this.attachments.color.createView());
      const pass = encoder.beginRenderPass({
        label: "native composed scene",
        colorAttachments: [
          {
            view: this.attachments.color.createView(),
            resolveTarget: this.samples === 4 ? this.hdr.createView() : undefined,
            loadOp: "load",
            storeOp: "store",
          },
        ],
        depthStencilAttachment: {
          view: this.attachments.depth.createView(),
          depthClearValue: BATTLE_DEPTH_ATTACHMENT.clearValue,
          depthLoadOp: BATTLE_DEPTH_ATTACHMENT.loadOp,
          depthStoreOp: BATTLE_DEPTH_ATTACHMENT.storeOp,
        },
      });
      try {
        draw(pass, this.cameraGroup);
      } finally {
        pass.end();
      }
    });
    nativeGpuScope(this.device, "post", () =>
      this.attachments.post.encode(encoder, output, bloom, postEnabled),
    );
  }
  /** The depth buffer this frame has actually allocated and the convention its
   *  passes use, derived from their descriptors and shared pipeline policy. */
  depthStats() {
    const { depthDescriptor: descriptor, width, height } = this.attachments;
    const samples = descriptor.sampleCount ?? 1;
    return {
      owner: "raw-battle-frame" as const,
      installed: !this.disposed,
      format: descriptor.format,
      samples,
      width,
      height,
      clearValue: BATTLE_DEPTH_ATTACHMENT.clearValue,
      loadOp: BATTLE_DEPTH_ATTACHMENT.loadOp,
      storeOp: BATTLE_DEPTH_ATTACHMENT.storeOp,
      reversed: battleDepthReversed(),
      // depth32float, one 4-byte sample per pixel per MSAA sample.
      requestedBytes: this.disposed ? 0 : width * height * 4 * samples,
    };
  }
  private assertLive() {
    if (this.disposed) throw new Error("Native frame is disposed");
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.attachments.dispose();
    this.camera.destroy();
  }
}
