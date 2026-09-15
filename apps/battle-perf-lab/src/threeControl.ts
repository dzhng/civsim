import { readGrassDraws, readGroundInputs } from "./threeInspection";
import { PhotorealBattleWorld } from "../../../packages/photoreal-renderer/src/battle/battleWorld";
import type { BattleReplayAssets, BattleReplayFrame, BattleReplaySettings } from "./fixture";
import { consumeReplayFrames } from "./replayFrames";

/** Lab control: the real production world, with no menu/bootstrap or frozen-frame cache. */
export class ThreeControl {
  private disposed = false;

  private constructor(private readonly world: PhotorealBattleWorld) {}

  static async prepare(
    canvas: HTMLCanvasElement,
    assets: BattleReplayAssets,
    settings: BattleReplaySettings,
  ): Promise<ThreeControl> {
    // Preparation owns these copies; recorded buffers stay reusable by other candidates.
    const terrain = structuredClone(assets.terrain);
    const terrainOptions = structuredClone(assets.terrainOptions);
    const soldierUnit = new Uint32Array(assets.soldierUnit);
    const teams = [...assets.teams];
    const classes = [...assets.classes];
    const config = structuredClone(settings);
    const world = await PhotorealBattleWorld.create(canvas, {
      soldierCatalogUrl: assets.soldierCatalogUrl,
      environment: config.environment,
      shadows: config.shadows,
      grassQuality: config.grassQuality,
      post: config.post ? "on" : "off",
      postGrade: config.postGrade,
      gameplay: true,
    });
    try {
      const { width, height, pixelRatio } = config.viewport;
      world.setGrassVisible(config.grass);
      world.setFarGrassVisible(config.farGrass);
      world.setBloomEnabled(config.bloom);
      world.setStatic(soldierUnit, teams, classes);
      world.setTerrain(terrain, terrainOptions);
      world.resize(width, height, pixelRatio);
      return new ThreeControl(world);
    } catch (error) {
      world.dispose();
      throw error;
    }
  }

  /** Actual loaded bundles, available for capture's later content-identity checks. */
  get soldierAssets(): Readonly<PhotorealBattleWorld["soldierAssets"]> {
    return this.world.soldierAssets;
  }

  readGrassDraws() {
    return readGrassDraws(this.world);
  }

  groundInputs() {
    return readGroundInputs(this.world);
  }

  async submit(frame: BattleReplayFrame) {
    if (this.disposed) throw new Error("Three control is disposed");
    for (const command of frame.commands) {
      switch (command.method) {
        case "setTime":
          this.world.setTime(...command.args);
          break;
        case "draw":
          this.world.draw(...command.args);
          break;
        case "uploadUnitReadouts":
          this.world.uploadUnitReadouts(...command.args);
          break;
        case "drawTris":
          this.world.drawTris(...command.args);
          break;
        case "drawTacticalLines":
          this.world.drawTacticalLines(...command.args);
          break;
        case "render":
          this.world.render(...command.args);
          break;
        case "settlePresentedFrame":
          await this.world.settlePresentedFrame(...command.args);
          break;
      }
    }
    return { frameId: frame.frameId, simTick: frame.simTick, stats: this.world.stats() };
  }

  get animationFrame() {
    return this.world.world.renderer.info.frame;
  }

  waitForSubmittedWork() {
    return this.world.world.settlePresentedFrame();
  }

  async render(frame: BattleReplayFrame) {
    await this.submit(frame);
    // Explicit diagnostic drain; continuous replay only waits at captured settle commands.
    await this.waitForSubmittedWork();
    return { frameId: frame.frameId, simTick: frame.simTick, stats: this.world.stats() };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.world.dispose();
  }
}

export type ThreeReplayFrameReport = Awaited<ReturnType<ThreeControl["render"]>>;

/** Correctness replay: one frame per browser animation callback, without buffering
 * ahead. Source/observer latency remains in playback; this is not a timing oracle.
 * The caller owns control disposal, including on failure. */
export async function runThreeReplay(
  control: ThreeControl,
  frames: AsyncIterable<BattleReplayFrame>,
  frameLimit: number,
  observe: (report: ThreeReplayFrameReport) => void | Promise<void>,
) {
  return consumeReplayFrames(frames, frameLimit, async (frame) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await observe(await control.render(frame));
  });
}
