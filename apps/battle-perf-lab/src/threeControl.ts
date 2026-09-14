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
      world.resize(width, height, pixelRatio);
      world.setGrassVisible(config.grass);
      world.setFarGrassVisible(config.farGrass);
      world.setBloomEnabled(config.bloom);
      world.setStatic(soldierUnit, teams, classes);
      world.setTerrain(terrain, terrainOptions);
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

  render(frame: BattleReplayFrame) {
    if (this.disposed) throw new Error("Three control is disposed");
    this.world.setTime(frame.timeSeconds);
    this.world.draw(
      frame.positions,
      frame.facings,
      frame.playback,
      frame.alive,
      frame.count,
      frame.camera,
      frame.frameDt,
    );
    this.world.uploadUnitReadouts(frame.standards, frame.readouts);
    // This method submits the complete world, including environment/grass/shadows/post.
    this.world.drawTacticalLines(frame.tacticalLines, frame.camera);
    return { frameId: frame.frameId, simTick: frame.simTick, stats: this.world.stats() };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.world.dispose();
  }
}

export type ThreeReplayFrameReport = ReturnType<ThreeControl["render"]>;

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
    await observe(control.render(frame));
  });
}
