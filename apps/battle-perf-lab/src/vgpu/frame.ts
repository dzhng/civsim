import { frame, target, type Gpu, type FramePass, type Frame, type Target } from "vgpu";
import type { VgpuEnvironment } from "./environment";
import { createVgpuPost } from "./post";
import { destroyVgpuTarget } from "./targetLifetime";
import { frameCamera, type FrameCameraSnapshot } from "../frameCamera";
import type { BattlePostGradeUniforms } from "../../../../packages/game-renderer/src/environment/postParameters";
/** Frame/Target own scene/post encoding; pose dispatches precede this frame through vgpu's public API. */
export class VgpuBattleFrame {
  private disposed = false;
  private constructor(
    private readonly gpu: Gpu,
    private readonly environment: VgpuEnvironment,
    readonly width: number,
    readonly height: number,
    readonly samples: 1 | 4,
    private readonly resources: Awaited<ReturnType<typeof frameResources>>,
  ) {}
  static async create(
    gpu: Gpu,
    environment: VgpuEnvironment,
    width: number,
    height: number,
    samples: 1 | 4,
    format: GPUTextureFormat,
  ) {
    return new VgpuBattleFrame(
      gpu,
      environment,
      width,
      height,
      samples,
      await frameResources(gpu, width, height, samples, format),
    );
  }
  get camera() {
    this.assertLive();
    return this.resources.camera;
  }
  get hdr() {
    this.assertLive();
    return this.resources.target.color.gpu;
  }
  setCamera(
    snapshot: FrameCameraSnapshot,
    observer: readonly [number, number, number],
    grade: BattlePostGradeUniforms,
  ) {
    this.assertLive();
    const state = frameCamera(snapshot, this.width, this.height);
    this.resources.camera.write(state.bytes);
    this.environment.setView(state.view, observer);
    this.environment.sky.setRays(state.rays);
    this.resources.post.setGrade(grade, this.environment.exposure);
  }
  async render(
    output: Target,
    prepare: () => void,
    draw: (pass: FramePass) => void,
    bloom: boolean,
    beforeWorld?: (current: Frame) => void,
  ) {
    this.assertLive();
    prepare();
    const r = this.resources;
    await frame(this.gpu, (current) => {
      beforeWorld?.(current);
      current.pass({ target: r.target, clear: [0, 0, 0, 1], clearDepth: 0 }, (pass) => {
        this.environment.sky.drawBackground(pass);
        draw(pass);
      });
      r.post.encode(current, output, bloom);
    }).done;
  }
  private assertLive() {
    if (this.disposed) throw new Error("vgpu frame disposed");
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.dispose();
  }
}
async function frameResources(
  gpu: Gpu,
  width: number,
  height: number,
  samples: 1 | 4,
  format: GPUTextureFormat,
) {
  const owned: (() => void)[] = [];
  const dispose = () => {
    for (const f of owned.reverse()) f();
  };
  try {
    const camera = gpu.device.createBuffer({ size: 192, usage: ["uniform", "copy_dst"] });
    owned.push(() => camera.destroy());
    const hdr = target(gpu, {
      size: [width, height],
      format: "rgba16float",
      depth: "depth32float",
      msaa: samples === 4,
    });
    owned.push(() => destroyVgpuTarget(hdr));
    const post = await createVgpuPost(
      gpu.device.gpu,
      hdr.color.gpu.createView(),
      width,
      height,
      format,
    );
    owned.push(post.dispose);
    return { camera, target: hdr, post, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
