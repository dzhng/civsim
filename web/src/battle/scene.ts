import type { Scene } from "../scene";
import { enterBattleScene } from "./battleLoop";
import type { BattleConfig, BattleKind, GeneratedBattleMapDescriptor } from "./battleWorld";

export type { BattleConfig, BattleKind, GeneratedBattleMapDescriptor };

export class BattleScene implements Scene {
  private cleanups: (() => void)[] = [];
  private frameFn: (now: number) => void = () => {};

  constructor(private cfg: BattleConfig) {}

  private restartBattle = () => {
    (this.cfg.restart ?? (() => this.cfg.onLaunch(this.cfg.kind)))();
  };

  frame(now: number) {
    this.frameFn(now);
  }

  exit() {
    for (const fn of this.cleanups.reverse()) fn();
    this.cleanups = [];
    this.frameFn = () => {};
    window.__ready = false;
    this.cfg.game.free();
  }

  enter() {
    this.frameFn = enterBattleScene(this.cfg, this.cleanups, this.restartBattle);
  }
}
