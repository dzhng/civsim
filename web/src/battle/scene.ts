import { createSceneFrames } from "../shared/sceneFrames";
import type { Scene } from "../scene";
import { enterBattleScene } from "./battleLoop";
import type { BattleConfig, BattleKind, GeneratedBattleMapDescriptor } from "./battleWorld";

export type { BattleConfig, BattleKind, GeneratedBattleMapDescriptor };

export class BattleScene implements Scene {
  private cleanups: (() => void)[] = [];
  private readonly abortController = new AbortController();
  private frameFn: (now: number) => void | Promise<void> = () => {};
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
        this.cfg.game.free();
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
    this.frameFn = enterBattleScene(
      this.cfg,
      this.cleanups,
      this.restartBattle,
      this.abortController.signal,
    );
  }
}
