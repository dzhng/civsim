import { frameCamera, type FrameCameraSnapshot } from "../frameCamera";
import type { BattlePostGradeUniforms } from "../../../../packages/game-renderer/src/environment/postParameters";
import type { RawEnvironment } from "./environment";
import { RawBattlePost } from "./post";

/** One native HDR frame: borrowed device/environment, owned attachments/camera/post.
 * Scene layers encode into the same reverse-Z depth and multisampled color target.
 * This is an integration surface, not a complete or rankable battle backend. */
export class RawBattleFrame {
  readonly cameraLayout: GPUBindGroupLayout;
  readonly cameraGroup: GPUBindGroup;
  private readonly camera: GPUBuffer;
  /** Borrowed resolved linear HDR output for integration readback. */
  readonly hdr: GPUTexture;
  private readonly color: GPUTexture;
  private readonly depth: GPUTexture;
  private readonly post: RawBattlePost;
  private readonly release: (() => void)[] = [];
  private disposed = false;
  constructor(
    private readonly device: GPUDevice,
    private readonly environment: RawEnvironment,
    readonly width: number,
    readonly height: number,
    readonly samples: 1 | 4,
    outputFormat: GPUTextureFormat,
  ) {
    const own = <T extends { destroy(): void }>(r: T): T => {
      this.release.push(() => r.destroy());
      return r;
    };
    try {
      this.camera = own(
        device.createBuffer({ size: 192, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
      );
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
      this.hdr = own(
        device.createTexture({
          size: [width, height],
          format: "rgba16float",
          usage:
            GPUTextureUsage.RENDER_ATTACHMENT |
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_SRC,
        }),
      );
      this.color =
        samples === 1
          ? this.hdr
          : own(
              device.createTexture({
                size: [width, height],
                format: "rgba16float",
                sampleCount: samples,
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
              }),
            );
      this.depth = own(
        device.createTexture({
          size: [width, height],
          format: "depth32float",
          sampleCount: samples,
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        }),
      );
      this.post = new RawBattlePost(device, this.hdr.createView(), width, height, outputFormat);
      this.release.push(() => this.post.dispose());
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  setCamera(
    snapshot: FrameCameraSnapshot,
    observer: readonly [number, number, number],
    grade: BattlePostGradeUniforms,
  ) {
    this.assertLive();
    const camera = frameCamera(snapshot, this.width, this.height);
    this.device.queue.writeBuffer(this.camera, 0, camera.bytes);
    this.environment.setView(camera.view, observer);
    this.environment.sky.setRays(camera.rays);
    this.post.setGrade(grade, this.environment.exposure);
  }
  encode(
    encoder: GPUCommandEncoder,
    output: GPUTextureView,
    draw: (pass: GPURenderPassEncoder, camera: GPUBindGroup) => void,
    bloom: boolean,
  ) {
    this.assertLive();
    this.environment.sky.encodeBackground(encoder, this.color.createView());
    const pass = encoder.beginRenderPass({
      label: "native composed scene",
      colorAttachments: [
        {
          view: this.color.createView(),
          resolveTarget: this.samples === 4 ? this.hdr.createView() : undefined,
          loadOp: "load",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.depth.createView(),
        depthClearValue: 0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    try {
      draw(pass, this.cameraGroup);
    } finally {
      pass.end();
    }
    this.post.encode(encoder, output, bloom);
  }
  private assertLive() {
    if (this.disposed) throw new Error("Native frame is disposed");
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const release of this.release.reverse()) release();
  }
}
