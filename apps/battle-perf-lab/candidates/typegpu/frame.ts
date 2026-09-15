import { tgpu, type TgpuRenderPass, type TgpuBindGroup } from "typegpu";
import { Camera, typegpuCameraLayout } from "./camera";
import type { TypegpuEnvironment } from "./environment";
import { createTypegpuPost } from "./post";
import { frameCamera, type FrameCameraSnapshot } from "../../src/frameCamera";
import type { BattlePostGradeUniforms } from "../../../../packages/game-renderer/src/environment/postParameters";
/** Typed frame resources and one submission; components borrow its camera and pass. */
export class TypegpuBattleFrame {
  private disposed = false;
  private constructor(
    private readonly root: ReturnType<typeof tgpu.initFromDevice>,
    private readonly environment: TypegpuEnvironment,
    readonly width: number,
    readonly height: number,
    readonly samples: 1 | 4,
    private readonly resources: Awaited<ReturnType<typeof frameResources>>,
  ) {}
  static async create(
    device: GPUDevice,
    environment: TypegpuEnvironment,
    width: number,
    height: number,
    samples: 1 | 4,
    outputFormat: GPUTextureFormat,
  ) {
    const root = tgpu.initFromDevice({ device });
    try {
      return new TypegpuBattleFrame(
        root,
        environment,
        width,
        height,
        samples,
        await frameResources(root, device, width, height, samples, outputFormat),
      );
    } catch (error) {
      root.destroy();
      throw error;
    }
  }
  get cameraBuffer() {
    this.assertLive();
    return this.root.unwrap(this.resources.camera);
  }
  get cameraGroup() {
    this.assertLive();
    return this.resources.group;
  }
  get hdr() {
    this.assertLive();
    return this.root.unwrap(this.resources.hdr);
  }
  setCamera(
    snapshot: FrameCameraSnapshot,
    observer: readonly [number, number, number],
    grade: BattlePostGradeUniforms,
  ) {
    this.assertLive();
    const state = frameCamera(snapshot, this.width, this.height);
    this.resources.camera.write(state.bytes.buffer);
    this.environment.setView(state.view, observer);
    this.environment.sky.setRays(state.rays);
    this.resources.post.setGrade(grade, this.environment.exposure);
  }
  render(
    output: GPUTextureView,
    prepare: (encoder: GPUCommandEncoder) => void,
    draw: (pass: TgpuRenderPass, camera: TgpuBindGroup) => void,
    bloom: boolean,
  ) {
    this.assertLive();
    const encoder = this.root["~unstable"].createCommandEncoder(),
      raw = this.root.unwrap(encoder);
    prepare(raw);
    const r = this.resources;
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
      depthStencilAttachment: { view: r.depth, depthClearValue: 0 },
    });
    try {
      draw(pass, r.group);
    } finally {
      pass.end();
    }
    r.post.encode(raw, output, bloom);
    encoder.submit();
  }
  private assertLive() {
    if (this.disposed) throw new Error("TypeGPU frame disposed");
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.dispose();
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
  const owned: (() => void)[] = [];
  const own = <T extends { destroy(): void }>(x: T) => {
    owned.push(() => x.destroy());
    return x;
  };
  const dispose = () => {
    for (const f of owned.reverse()) f();
  };
  try {
    const camera = own(root.createBuffer(Camera).$usage("uniform")),
      group = root.createBindGroup(typegpuCameraLayout, { cam: camera });
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
    const post = await createTypegpuPost(
      device,
      root.unwrap(hdr).createView(),
      width,
      height,
      outputFormat,
    );
    owned.push(post.dispose);
    return { camera, group, hdr, color, depth, post, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
