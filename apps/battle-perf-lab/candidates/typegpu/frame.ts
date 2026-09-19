import { nativeGpuScope } from "../../../../packages/battle-renderer/src/gpuScope";
import { beginGpuAdmission } from "../../../../packages/battle-renderer/src/gpuAdmission";
import { tgpu, type TgpuRenderPass, type TgpuBindGroup, type TgpuCommandEncoder } from "typegpu";
import { Camera, typegpuCameraLayout } from "./camera";
import type { TypegpuEnvironment } from "./environment";
import { createTypegpuPost } from "./post";
import { frameCamera, type FrameCameraSnapshot } from "../../../../packages/battle-renderer/src/frameCamera";
import type { BattlePostGradeUniforms } from "../../../../packages/game-renderer/src/environment/postParameters";
/** Stable camera bindings; replacement owns only attachments and their post chain. */
export class TypegpuBattleFrame {
  private disposed = false;
  private resizing = false;
  private view?: {
    snapshot: FrameCameraSnapshot;
    observer: readonly [number, number, number];
    grade: BattlePostGradeUniforms;
  };
  private readonly camera;
  readonly cameraGroup;
  private constructor(
    private readonly root: ReturnType<typeof tgpu.initFromDevice>,
    private readonly device: GPUDevice,
    private readonly environment: TypegpuEnvironment,
    readonly samples: 1 | 4,
    private readonly outputFormat: GPUTextureFormat,
    private resources: Awaited<ReturnType<typeof frameResources>>,
  ) {
    this.camera = root.createBuffer(Camera).$usage("uniform");
    try {
      this.cameraGroup = root.createBindGroup(typegpuCameraLayout, { cam: this.camera });
      root.unwrap(this.cameraGroup);
    } catch (error) {
      this.camera.destroy();
      throw error;
    }
  }
  static async create(
    device: GPUDevice,
    environment: TypegpuEnvironment,
    width: number,
    height: number,
    samples: 1 | 4,
    outputFormat: GPUTextureFormat,
  ) {
    const root = tgpu.initFromDevice({ device });
    let resources: Awaited<ReturnType<typeof frameResources>> | undefined;
    try {
      resources = await frameResources(root, device, width, height, samples, outputFormat);
      const admit = beginGpuAdmission(device);
      let frame: TypegpuBattleFrame | undefined;
      try {
        frame = new TypegpuBattleFrame(root, device, environment, samples, outputFormat, resources);
        await admit();
        return frame;
      } catch (error) {
        frame?.camera.destroy();
        await admit().catch(() => {});
        throw error;
      }
    } catch (error) {
      resources?.dispose();
      root.destroy();
      throw error;
    }
  }
  get width() {
    return this.resources.width;
  }
  get height() {
    return this.resources.height;
  }
  get cameraBuffer() {
    this.assertLive();
    return this.root.unwrap(this.camera);
  }
  get hdr() {
    this.assertLive();
    return this.root.unwrap(this.resources.hdr);
  }
  async resize(width: number, height: number) {
    this.assertLive();
    if (this.resizing) throw Error("TypeGPU frame resize already pending");
    if (width === this.width && height === this.height) return;
    this.resizing = true;
    let next: Awaited<ReturnType<typeof frameResources>> | undefined;
    try {
      next = await frameResources(
        this.root,
        this.device,
        width,
        height,
        this.samples,
        this.outputFormat,
      );
      this.assertLive();
      if (this.view) this.writeCamera(this.view, next);
      const previous = this.resources;
      this.resources = next;
      next = undefined;
      previous.dispose();
    } finally {
      next?.dispose();
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
    this.writeCamera(view, this.resources);
    this.view = view;
  }
  private writeCamera(
    view: NonNullable<TypegpuBattleFrame["view"]>,
    resources: Awaited<ReturnType<typeof frameResources>>,
  ) {
    const state = frameCamera(view.snapshot, resources.width, resources.height);
    this.camera.write(state.bytes.buffer);
    this.environment.setView(state.view, view.observer);
    this.environment.sky.setRays(state.rays);
    resources.post.setGrade(view.grade, this.environment.exposure);
  }
  createCommandEncoder() {
    this.assertLive();
    return this.root["~unstable"].createCommandEncoder();
  }
  /** Public unwrap interop for library-owned pose/sky/post encoding. */
  nativeEncoder(encoder: TgpuCommandEncoder) {
    return this.root.unwrap(encoder);
  }
  encode(
    encoder: TgpuCommandEncoder,
    output: GPUTextureView,
    draw: (pass: TgpuRenderPass, camera: TgpuBindGroup) => void,
    bloom: boolean,
    post = true,
  ) {
    this.assertLive();
    const raw = this.root.unwrap(encoder),
      r = this.resources;
    nativeGpuScope(this.device, "main", () => {
      this.environment.sky.encodeBackground(raw, this.root.unwrap(r.color).createView());
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: r.color,
            resolveTarget: this.samples === 4 ? r.hdr : undefined,
            loadOp: "load",
            storeOp: "store",
          },
        ],
        depthStencilAttachment: {
          view: r.depth,
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
    });
    nativeGpuScope(this.device, "post", () => r.post.encode(raw, output, bloom, post));
  }
  render(
    output: GPUTextureView,
    prepare: (encoder: TgpuCommandEncoder) => void,
    draw: (pass: TgpuRenderPass, camera: TgpuBindGroup) => void,
    bloom: boolean,
    post = true,
  ) {
    const encoder = this.createCommandEncoder();
    prepare(encoder);
    this.encode(encoder, output, draw, bloom, post);
    encoder.submit();
  }
  private assertLive() {
    if (this.disposed) throw Error("TypeGPU frame disposed");
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.dispose();
    this.camera.destroy();
    this.root.destroy();
  }
}
async function frameResources(
  root: ReturnType<typeof tgpu.initFromDevice>,
  device: GPUDevice,
  width: number,
  height: number,
  samples: 1 | 4,
  outputFormat: GPUTextureFormat,
) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64)
    throw Error("TypeGPU frame requires integer dimensions at least 64×64");
  const owned: (() => void)[] = [];
  const own = <T extends { destroy(): void }>(x: T) => {
    owned.push(() => x.destroy());
    return x;
  };
  const dispose = () => {
    for (const f of owned.splice(0).reverse()) f();
  };
  const admit = beginGpuAdmission(device);
  try {
    const hdr = own(
      root
        .createTexture({ size: [width, height], format: "rgba16float" })
        .$usage("render", "sampled"),
    );
    const color =
      samples === 1
        ? hdr
        : own(
            root
              .createTexture({ size: [width, height], format: "rgba16float", sampleCount: 4 })
              .$usage("render"),
          );
    const depth = own(
      root
        .createTexture({ size: [width, height], format: "depth32float", sampleCount: samples })
        .$usage("render"),
    );
    root.unwrap(hdr);
    root.unwrap(color);
    root.unwrap(depth);
    await admit();
    const post = await createTypegpuPost(
      device,
      root.unwrap(hdr).createView(),
      width,
      height,
      outputFormat,
    );
    owned.push(post.dispose);
    return { width, height, hdr, color, depth, post, dispose };
  } catch (error) {
    await admit().catch(() => {});
    dispose();
    throw error;
  }
}
