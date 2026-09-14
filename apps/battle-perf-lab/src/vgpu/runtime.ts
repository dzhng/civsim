import { frame, init, surface, type Frame, type Gpu, type Surface } from "vgpu";
import type { BattleReplaySettings } from "../fixture";

/** Candidate device/frame lifetime. Full battle passes are not implemented here yet. */
export class VgpuBattleRuntime {
  readonly errors: string[] = [];
  private disposed = false;
  private removeErrorListener: () => void;

  private constructor(
    readonly gpu: Gpu,
    readonly output: Surface,
  ) {
    this.removeErrorListener = gpu.onError((error) => this.errors.push(String(error)));
    void gpu.gpu.lost.then((info) => {
      if (!this.disposed) this.errors.push(`Device lost: ${info.reason}: ${info.message}`);
    });
  }

  static async create(canvas: HTMLCanvasElement, settings: Pick<BattleReplaySettings, "viewport">) {
    const gpu = await init({ powerPreference: "high-performance" });
    try {
      const { width, height, pixelRatio } = settings.viewport;
      return new VgpuBattleRuntime(
        gpu,
        surface(gpu, canvas, {
          size: [width, height],
          dpr: pixelRatio,
          autoResize: false,
          label: "battle-vgpu-candidate",
        }),
      );
    } catch (error) {
      gpu.dispose();
      throw error;
    }
  }

  submit(encode: (current: Frame) => void): Frame {
    if (this.disposed) throw new Error("vgpu candidate is disposed");
    if (this.errors.length) throw new Error(this.errors.join("\n"));
    return frame(this.gpu, encode);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.removeErrorListener();
    this.gpu.dispose();
  }
}
