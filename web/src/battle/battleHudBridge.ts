import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import { modelLookForClass } from "@packages/game-renderer/src/models/shared/soldierModel";
import { armySummary } from "./armySummary";
import { CLASS_NAMES, UNIT_CLASS_BY_KEY, UnitClass, cardThumbUrl } from "./classData";
import type { ClassSpec } from "./classData";
import type { BattleControls } from "./battleControls";
import type { Input } from "./input";
import type { BattleWorld } from "./battleWorld";
import type { SimClock } from "../shared/simClock";
import type { HudData, HudUnit } from "../ui/hud/HudPanel";
import type { ToolButtonState } from "../ui/hud/Toolbar";
import type { BattleHudHandle, BattleHudState } from "../ui/hud/BattleHud";
import type { HudStore } from "../ui/hudStore";
import { GameOver, PauseMenu } from "../ui/hud/BattleModals";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MANUAL_HTML } from "./manual";

export interface BattleHudBridge {
  checkGameover(): void;
  buildCards(): void;
  onToolbarCmd(cmd: string): void;
  tickCards(): void;
  updateHud(fps: string): void;
  updateToolbar(): void;
}

export function createBattleHudBridge(
  hud: BattleHudHandle,
  hudStore: HudStore<BattleHudState>,
  commands: {
    selected(): number[];
    togglePace(units: number[]): void;
    reform(units: number[]): void;
    togglePursue(units: number[]): void;
    toggleFire(units: number[]): void;
    toggleKite(units: number[]): void;
    togglePause(): void;
    setSpeed(scale: number): void;
    togglePaths(): void;
    victor(): number;
    showGameover(win: boolean, sub: string): void;
  },
  view: {
    classSpecs: ClassSpec[];
    clock: SimClock;
    controls: BattleControls;
    input: Input;
    world: BattleWorld;
  },
): BattleHudBridge {
  let ended = false;
  let cardUnits: number[] = [];

  const toolbarState = () => {
    const { clock, controls, input, world } = view;
    const selected = controls.myUnits(input.selected);
    const info = world.unitInfo();
    const offset = selected.length ? selected[0] * world.stride : -1;
    const classes = selected.map((unit) => info[unit * world.stride + UNIT_INFO.classId]);
    const supports = (allowed: number[]) => classes.some((classId) => allowed.includes(classId));
    const empty = selected.length === 0;
    return {
      pace: { on: offset >= 0 && info[offset + UNIT_INFO.running] > 0.5, disabled: empty },
      reform: { on: false, disabled: empty },
      pursue: { on: offset >= 0 && info[offset + UNIT_INFO.pursue] > 0.5, disabled: empty },
      fire: {
        on: offset >= 0 && selected.length > 0 && controls.fireOn(),
        disabled: empty || !supports(MISSILE_CLASS_IDS),
      },
      kite: {
        on: offset >= 0 && info[offset + UNIT_INFO.evadeAuto] > 0.5,
        disabled: empty || !supports(KITE_CLASS_IDS),
      },
      pause: { on: clock.paused, disabled: false },
      x1: { on: !clock.paused && clock.timeScale === 1, disabled: false },
      x3: { on: !clock.paused && clock.timeScale === 3, disabled: false },
      paths: { on: controls.showPaths(), disabled: false },
    } satisfies Record<string, ToolButtonState>;
  };

  const bridge: BattleHudBridge = {
    buildCards() {
      const { game, stride } = view.world;
      const info = view.world.unitInfo();
      cardUnits = [];
      const cards = [];
      for (let unit = 0; unit < game.unit_count(); unit++) {
        if (info[unit * stride + UNIT_INFO.team] !== 0) continue;
        cardUnits.push(unit);
        cards.push({
          unit,
          cls: info[unit * stride + UNIT_INFO.classId],
          look:
            info[unit * stride + UNIT_INFO.renderLook] ??
            modelLookForClass(info[unit * stride + UNIT_INFO.classId]),
          team: 0 as const,
          name: CLASS_NAMES[info[unit * stride + UNIT_INFO.classId]] ?? "?",
        });
      }
      hud.buildCards(cards);
    },
    checkGameover() {
      const victor = commands.victor();
      if (victor < 0 || ended) return;
      ended = true;
      const win = victor === 0;
      commands.showGameover(
        win,
        win
          ? "The enemy army is broken. Your army holds the field."
          : "Your army is broken. The enemy holds the field.",
      );
    },
    onToolbarCmd(cmd) {
      const selected = commands.selected();
      switch (cmd) {
        case "pace":
          commands.togglePace(selected);
          break;
        case "reform":
          commands.reform(selected);
          break;
        case "pursue":
          commands.togglePursue(selected);
          break;
        case "fire":
          commands.toggleFire(selected);
          break;
        case "kite":
          commands.toggleKite(selected);
          break;
        case "pause":
          commands.togglePause();
          break;
        case "x1":
          commands.setSpeed(1);
          break;
        case "x3":
          commands.setSpeed(3);
          break;
        case "paths":
          commands.togglePaths();
          break;
      }
      bridge.updateToolbar();
    },
    tickCards() {
      const { stride } = view.world;
      const info = view.world.unitInfo();
      const selected = new Set(view.input.selected);
      hud.cards.update(
        cardUnits.map((unit) => {
          const offset = unit * stride;
          const alive = info[offset + UNIT_INFO.alive];
          if (alive === 0) return null;
          return {
            alive,
            total: info[offset + UNIT_INFO.total],
            cohesion: info[offset + UNIT_INFO.cohesion],
            morale: info[offset + UNIT_INFO.morale],
            stamina: info[offset + UNIT_INFO.stamina],
            routing: info[offset + UNIT_INFO.routing] > 0.5,
            selected: selected.has(unit),
          };
        }),
      );
    },
    updateHud(fps) {
      const { camera, game, stride } = view.world;
      let unit: HudUnit | undefined;
      let cardUnit = -1;
      if (view.input.selected.length === 1) cardUnit = view.input.selected[0];
      else if (view.input.selected.length === 0 && view.input.mouseCss[0] >= 0) {
        const dpr = window.devicePixelRatio || 1;
        const [x, y] = camera.screenToWorld(
          view.input.mouseCss[0] * dpr,
          view.input.mouseCss[1] * dpr,
        );
        cardUnit = game.pick_unit(x, y, 25);
      }
      if (cardUnit >= 0) unit = buildHudUnit(view.classSpecs, view.world, cardUnit);
      const roster = unit
        ? undefined
        : armySummary(view.world.unitInfo(), game.unit_count(), stride);
      const data: HudData = { unit, roster };
      hudStore.set({ info: data, fps, toolbar: toolbarState() });
    },
    updateToolbar() {
      hudStore.set({ ...hudStore.get(), toolbar: toolbarState() });
    },
  };
  bridge.buildCards();
  return bridge;
}

const KITE_CLASS_IDS = [
  UNIT_CLASS_BY_KEY[UnitClass.Skirmishers],
  UNIT_CLASS_BY_KEY[UnitClass.HorseArchers],
] as number[];

const MISSILE_CLASS_IDS = [
  UNIT_CLASS_BY_KEY[UnitClass.Archers],
  UNIT_CLASS_BY_KEY[UnitClass.Skirmishers],
  UNIT_CLASS_BY_KEY[UnitClass.HorseArchers],
  UNIT_CLASS_BY_KEY[UnitClass.ArtilleryCrew],
] as number[];

function buildHudUnit(classSpecs: ClassSpec[], world: BattleWorld, unit: number): HudUnit {
  const info = world.unitInfo();
  const offset = unit * world.stride;
  const cohesion = info[offset + UNIT_INFO.cohesion];
  const fatigue = info[offset + UNIT_INFO.stamina];
  const pace = info[offset + UNIT_INFO.running] > 0.5 ? "run" : "walk";
  const classId = info[offset + UNIT_INFO.classId];
  const cls = CLASS_NAMES[classId] ?? "?";
  const side = info[offset + UNIT_INFO.team] === 0 ? "YOUR" : "ENEMY";
  const alive = info[offset + UNIT_INFO.alive];
  const total = info[offset + UNIT_INFO.total];
  const hpFrac = total > 0 ? alive / total : 0;
  const charge = info[offset + UNIT_INFO.charge] === 2 ? " · CHARGING" : "";
  const ammo = info[offset + UNIT_INFO.ammo] > 0 ? ` · ammo ${info[offset + UNIT_INFO.ammo]}` : "";
  const routing = info[offset + UNIT_INFO.routing] > 0.5 ? " · ROUTING" : "";
  const engaged =
    info[offset + UNIT_INFO.engaged] > 0 ? ` · engaged ${info[offset + UNIT_INFO.engaged]}` : "";
  const detail: string[] = [];
  const spec = classSpecs[classId];
  if (spec) {
    const pct = (value: number) => `${(value * 100).toFixed(0)}%`;
    detail.push(
      `cost ${spec.cost} gold  ` +
        `mass ${spec.mass.toFixed(1)}${spec.brace > 1 ? ` (brace x${spec.brace.toFixed(1)})` : ""}  ` +
        `block ${pct(spec.block)}  evade ${pct(spec.evade)}  train ${pct(spec.training)}`,
      `pace x${spec.paceMult.toFixed(2)}  stamina drain x${spec.drainMult.toFixed(2)}  hp ${spec.health.toFixed(1)}` +
        (spec.mounted ? ` + mount ${spec.mountHealth.toFixed(1)}` : "") +
        (spec.charges ? "  charges" : ""),
    );
    for (const weapon of spec.weapons) {
      const degrees = ((weapon.arc * 180) / Math.PI / 2).toFixed(0);
      detail.push(
        ` ${weapon.name}: ${weapon.reach.toFixed(1)}m ±${degrees}°  ` +
          `dmg ${weapon.damage.toFixed(2)} / ${weapon.interval.toFixed(1)}s` +
          (weapon.minRange > 0 ? `  (dead <${weapon.minRange.toFixed(1)}m)` : ""),
      );
    }
    if (spec.missile)
      detail.push(
        ` ${spec.missile.name}: ${spec.missile.range.toFixed(0)}m  dmg ${spec.missile.damage.toFixed(2)} / ${spec.missile.interval.toFixed(0)}s  ` +
          `ammo ${spec.missile.ammo}${spec.missile.mobileFire ? "  fires mounted" : ""}`,
      );
  }
  return {
    thumb: cardThumbUrl(modelLookForClass(classId)) || undefined,
    cls,
    meta: `${side} · ${alive}/${total} men · ${pace}${charge}${routing}${engaged}${ammo}`,
    hpFrac,
    hpColor: hpFrac > 0.5 ? "#5cba46" : hpFrac > 0.25 ? "#d6b13a" : "#cf4a3a",
    cohesion,
    fatigue,
    morale: info[offset + UNIT_INFO.morale],
    detail,
  };
}

export function mountBattleModals(
  world: BattleWorld,
  cleanups: (() => void)[],
  restartBattle: () => void,
): (win: boolean, sub: string) => void {
  const gameover = document.getElementById("gameover")!;
  gameover.style.display = "none";
  const gameoverRoot = createRoot(gameover);
  cleanups.push(() => gameoverRoot.unmount());
  const renderGameover = (win: boolean, sub: string) =>
    flushSync(() =>
      gameoverRoot.render(
        createElement(GameOver, {
          inCampaign: world.cfg.inCampaign,
          win,
          sub,
          onRestart: () => restartBattle(),
          onExit: () => world.cfg.onExit(),
          onWatch: () => {
            gameover.style.display = "none";
          },
        }),
      ),
    );
  renderGameover(true, "");
  const showGameover = (win: boolean, sub: string) => {
    renderGameover(win, sub);
    gameover.style.display = "flex";
  };

  document.getElementById("manual")!.innerHTML = MANUAL_HTML;
  document.getElementById("manual")!.style.display = "none";
  const pausemenu = document.getElementById("pausemenu")!;
  pausemenu.style.display = "none";
  const pausemenuRoot = createRoot(pausemenu);
  cleanups.push(() => pausemenuRoot.unmount());
  pausemenuRoot.render(
    createElement(PauseMenu, {
      inCampaign: world.cfg.inCampaign,
      onRestart: () => restartBattle(),
      onManual: () => {
        const manual = document.getElementById("manual")!;
        manual.style.display = manual.style.display === "block" ? "none" : "block";
        pausemenu.style.display = "none";
      },
      onExit: () => world.cfg.onExit(),
      onClose: () => {
        pausemenu.style.display = "none";
      },
    }),
  );
  document.getElementById("btn-menu")!.addEventListener(
    "click",
    () => {
      pausemenu.style.display = pausemenu.style.display === "flex" ? "none" : "flex";
    },
    { signal: world.signal },
  );
  pausemenu.addEventListener(
    "click",
    (event) => {
      if (event.target === pausemenu) pausemenu.style.display = "none";
    },
    { signal: world.signal },
  );
  return showGameover;
}
