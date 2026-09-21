import { nativeGpuScope } from "../../../../packages/battle-renderer/src/gpuScope";
import { createSceneLifecycle } from "../../../../packages/battle-renderer/src/sceneLifecycle";
import { beginGpuAdmission } from "../../../../packages/battle-renderer/src/gpuAdmission";
import { frame, target, type Gpu, type FramePass, type Frame, type Target } from "vgpu";
import type { VgpuEnvironment } from "./environment";
import { createVgpuPost } from "./post";
import { destroyVgpuTarget } from "./targetLifetime";
import {
  frameCamera,
  type FrameCameraSnapshot,
} from "../../../../packages/battle-renderer/src/frameCamera";
import type { BattlePostGradeUniforms } from "../../../../packages/game-renderer/src/environment/postParameters";
/** Frame/Target own scene/post encoding; pose dispatches precede this frame through vgpu's public API. */
export class VgpuBattleFrame {
  private readonly life: ReturnType<typeof createSceneLifecycle>;
  private view?: {
    snapshot: FrameCameraSnapshot;
    observer: readonly [number, number, number];
    grade: BattlePostGradeUniforms;
  };
  get width() {
    return this.resources.width;
  }
  get height() {
    return this.resources.height;
  }
  private constructor(
    private readonly gpu: Gpu,
    private readonly environment: VgpuEnvironment,
    readonly samples: 1 | 4,
    private readonly format: GPUTextureFormat,
    readonly camera: ReturnType<Gpu["device"]["createBuffer"]>,
    private resources: Awaited<ReturnType<typeof frameResources>>,
  ) {
    this.life = createSceneLifecycle(() =>
      releaseAll([() => this.camera.destroy(), () => this.resources.dispose()]),
    );
  }
  static async create(
    gpu: Gpu,
    environment: VgpuEnvironment,
    width: number,
    height: number,
    samples: 1 | 4,
    format: GPUTextureFormat,
  ) {
    const camera = gpu.device.createBuffer({ size: 192, usage: ["uniform", "copy_dst"] });
    try {
      return new VgpuBattleFrame(
        gpu,
        environment,
        samples,
        format,
        camera,
        await frameResources(gpu, width, height, samples, format),
      );
    } catch (error) {
      try {
        camera.destroy();
      } catch (cleanup) {
        throw new AggregateError([error, cleanup], "Frame camera cleanup failed");
      }
      throw error;
    }
  }
  async resize(width: number, height: number) {
    this.life.idle();
    if (width === this.width && height === this.height) return;
    return this.life.run(async () => {
      let next: Awaited<ReturnType<typeof frameResources>> | undefined;
      try {
        next = await frameResources(this.gpu, width, height, this.samples, this.format);
        this.life.check();
        if (this.view) this.writeCamera(this.view, next);
        const previous = this.resources;
        this.resources = next;
        next = undefined;
        try {
          previous.dispose();
        } catch (error) {
          this.life.dispose();
          throw error;
        }
      } catch (error) {
        try {
          next?.dispose();
        } catch (cleanup) {
          throw new AggregateError([error, cleanup], "Frame resize and cleanup failed");
        }
        throw error;
      }
    });
  }

  get hdr() {
    this.life.check();
    return this.resources.target.color.gpu;
  }
  setCamera(
    snapshot: FrameCameraSnapshot,
    observer: readonly [number, number, number],
    grade: BattlePostGradeUniforms,
  ) {
    this.life.check();
    const view: NonNullable<VgpuBattleFrame["view"]> = {
      snapshot: {
        ...snapshot,
        camera3d: { ...snapshot.camera3d, target: [...snapshot.camera3d.target] },
      },
      observer: [...observer],
      grade: { ...grade },
    };
    this.writeCamera(view, this.resources);
    this.view = view;
  }
  private writeCamera(
    view: NonNullable<VgpuBattleFrame["view"]>,
    resources: VgpuBattleFrame["resources"],
  ) {
    const state = frameCamera(view.snapshot, resources.width, resources.height);
    resources.post.setGrade(view.grade, this.environment.exposure);
    this.camera.write(state.bytes);
    this.environment.setView(state.view, view.observer);
    this.environment.sky.setRays(state.rays);
  }
  async render(
    output: Target,
    prepare: () => void,
    draw: (pass: FramePass) => void,
    bloom: boolean,
    beforeWorld?: (current: Frame) => void,
    postEnabled = true,
  ) {
    return this.life.run(async () => {
      prepare();
      const r = this.resources;
      await frame(this.gpu, (current) => {
        beforeWorld?.(current);
        nativeGpuScope(this.gpu.device.gpu, "main", () => {
          current.pass({ target: r.target, clear: [0, 0, 0, 1], clearDepth: 0 }, (pass) => {
            this.environment.sky.drawBackground(pass);
            draw(pass);
          });
        });
        nativeGpuScope(this.gpu.device.gpu, "post", () =>
          r.post.encode(current, output, bloom, postEnabled),
        );
      }).done;
    });
  }
  dispose() {
    this.life.dispose();
  }
}
function releaseAll(releases: (() => void)[]) {
  const errors: unknown[] = [];
  for (const release of releases.splice(0).reverse())
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  if (errors.length) throw new AggregateError(errors, "Frame resource cleanup failed");
}

async function frameResources(
  gpu: Gpu,
  width: number,
  height: number,
  samples: 1 | 4,
  format: GPUTextureFormat,
) {
  const owned: (() => void)[] = [];
  const dispose = () => releaseAll(owned);
  const finish = beginGpuAdmission(gpu.device.gpu);
  try {
    const hdr = target(gpu, {
      size: [width, height],
      format: "rgba16float",
      depth: "depth32float",
      msaa: samples === 4,
    });
    owned.push(() => destroyVgpuTarget(hdr));
    await finish();
    const post = await createVgpuPost(
      gpu.device.gpu,
      hdr.color.gpu.createView(),
      width,
      height,
      format,
    );
    owned.push(post.dispose);
    return { width, height, target: hdr, post, dispose };
  } catch (error) {
    await finish().catch(() => {});
    try {
      dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Frame construction and cleanup failed");
    }
    throw error;
  }
}
