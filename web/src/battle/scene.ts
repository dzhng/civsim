import { createSceneFrames } from "../shared/sceneFrames";
import type { Scene } from "../scene";
import { enterBattleScene } from "./battleLoop";
import { BattleSimClient } from "./sim/battleSimClient";
import type { BattleConfig, BattleKind, GeneratedBattleMapDescriptor } from "./battleWorld";

export type { BattleConfig, BattleKind, GeneratedBattleMapDescriptor };

export class BattleScene implements Scene {
  private cleanups: (() => void)[] = [];
  private readonly abortController = new AbortController();
  private frameFn: (now: number) => void | Promise<void> = () => {};
  private sim: BattleSimClient | null = null;
  private readonly frames = createSceneFrames(
    (now) => this.frameFn(now),
    () => {
      this.abortController.abort();
      window.__ready = false;
    },
    () => {
      const errors: unknown[] = [];
      for (const fn of this.cleanups.splice(0).reverse()) {
        try {
          fn();
        } catch (error) {
          errors.push(error);
        }
      }
      this.frameFn = () => {};
      try {
        // The authority outlives the scene's own teardown so nothing reads a
        // battle that is already gone; disposing it frees the one `Game`.
        void this.sim?.dispose();
        this.sim = null;
      } catch (error) {
        errors.push(error);
      }
      if (errors.length) throw new AggregateError(errors, "Battle scene cleanup failed");
    },
  );

  constructor(private cfg: BattleConfig) {}

  private restartBattle = () => {
    (this.cfg.restart ?? (() => this.cfg.onLaunch(this.cfg.kind)))();
  };

  frame(now: number) {
    return this.frames.frame(now);
  }

  exit() {
    return this.frames.exit();
  }

  enter() {
    this.sim = new BattleSimClient(this.cfg.setup);
    this.frameFn = enterBattleScene(
      this.cfg,
      this.sim,
      this.cleanups,
      this.restartBattle,
      this.abortController.signal,
    );
  }
}
