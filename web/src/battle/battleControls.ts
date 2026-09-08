import {
  CLASS_SPACING,
  UNIT_INFO,
  currentUnitFiles,
} from "@packages/game-renderer/src/battle/unitInfoLayout";
import type { SimClock } from "../shared/simClock";
import type { BattleFreeze } from "./battleFreeze";
import { Input } from "./input";
import { createBattleOrders, type BattleOrders } from "./battleOrders";
import { groupMoveDests, type UnitSnap } from "./orders";
import type { BattleWorld } from "./battleWorld";

export interface BattleControls {
  input: Input;
  orders: BattleOrders;
  fireOn(): boolean;
  showPaths(): boolean;
  myUnits(units: number[]): number[];
  soldierStartOf(unit: number, info?: Float32Array): number;
  onCardSelect(unit: number, additive: boolean): void;
  toolbarCommands: {
    selected(): number[];
    togglePace(units: number[]): void;
    reform(units: number[]): void;
    togglePursue(units: number[]): void;
    toggleFire(units: number[]): void;
    toggleKite(units: number[]): void;
    togglePause(): void;
    setSpeed(scale: number): void;
    togglePaths(): void;
  };
}

export function createBattleControls(
  world: BattleWorld,
  clock: SimClock,
  freeze: BattleFreeze,
): BattleControls {
  const { camera, canvas, game, signal, stride } = world;
  let showPaths = false;
  let pursueOn = false;
  let fireOn = true;
  let orders: BattleOrders;

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "p") clock.paused = !clock.paused;
      if (event.key === "1") clock.timeScale = 1;
      if (event.key === "3") clock.timeScale = 3;
      if (event.key === " ") {
        showPaths = true;
        event.preventDefault();
      }
    },
    { signal },
  );
  window.addEventListener(
    "keyup",
    (event) => {
      if (event.key === " ") showPaths = false;
    },
    { signal },
  );

  const unitCenter = (unit: number): [number, number] => {
    const info = world.unitInfo();
    const offset = unit * stride;
    return [info[offset + UNIT_INFO.centerX], info[offset + UNIT_INFO.centerY]];
  };
  const soldierStartOf = (unit: number, info = world.unitInfo()) => {
    let start = 0;
    for (let index = 0; index < unit; index++)
      start += Math.max(0, Math.floor(info[index * stride + UNIT_INFO.total]));
    return start;
  };
  const myUnits = (units: number[]) => {
    const info = world.unitInfo();
    return units.filter(
      (unit) =>
        info[unit * stride + UNIT_INFO.team] === 0 && info[unit * stride + UNIT_INFO.alive] > 0,
    );
  };
  const unitSnap = (unit: number): UnitSnap => {
    const info = world.unitInfo();
    const [x, y] = unitCenter(unit);
    const classId = info[unit * stride + UNIT_INFO.classId];
    const files = currentUnitFiles(info, unit * stride);
    return { u: unit, x, y, r: 0.5 * files * CLASS_SPACING[classId] };
  };

  const sink = {
    unitsInRect: (x0: number, y0: number, x1: number, y1: number) => {
      const info = world.unitInfo();
      const units: number[] = [];
      for (let unit = 0; unit < game.unit_count(); unit++) {
        if (
          info[unit * stride + UNIT_INFO.team] !== 0 ||
          info[unit * stride + UNIT_INFO.alive] === 0
        )
          continue;
        const [x, y] = unitCenter(unit);
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) units.push(unit);
      }
      return units;
    },
    pickUnit: (x: number, y: number) => {
      const unit = game.pick_unit(x, y, 30);
      return unit >= 0 && world.unitInfo()[unit * stride + 6] === 0 ? unit : -1;
    },
    allUnits: () => {
      const info = world.unitInfo();
      const units: number[] = [];
      for (let unit = 0; unit < game.unit_count(); unit++) {
        if (info[unit * stride + UNIT_INFO.team] === 0 && info[unit * stride + UNIT_INFO.alive] > 0)
          units.push(unit);
      }
      return units;
    },
    dragMove: (units: number[], dx: number, dy: number) => {
      const selected = myUnits(units);
      const info = world.unitInfo();
      for (const unit of selected) {
        const [x, y] = unitCenter(unit);
        game.set_move_order_facing(unit, x + dx, y + dy, info[unit * stride + UNIT_INFO.facing]);
      }
      orders.markFlash(selected);
    },
    orderPoint: (
      units: number[],
      x: number,
      y: number,
      shift: boolean,
      double: boolean,
      alt: boolean,
    ) => {
      const selected = myUnits(units);
      if (selected.length === 0) return;
      const info = world.unitInfo();
      const target = game.pick_unit(x, y, 25);
      const enemy =
        target >= 0 &&
        info[target * stride + UNIT_INFO.team] !== 0 &&
        info[target * stride + UNIT_INFO.alive] > 0;
      if (!shift) selected.forEach((unit) => game.set_pace(unit, double ? 1 : 0));
      if (enemy) {
        if (shift) {
          selected.forEach((unit) => game.enqueue(unit, 1, target, 0, 0, 0));
          orders.markFlash(selected);
        } else if (selected.length === 1) {
          game.set_attack_order(selected[0], target);
          orders.markFlash(selected);
        } else orders.orderPointAttack(selected, target);
      } else if (shift) {
        const snaps = selected.map(unitSnap);
        let centerX = 0;
        let centerY = 0;
        for (const snap of snaps) {
          centerX += snap.x;
          centerY += snap.y;
        }
        centerX /= snaps.length;
        centerY /= snaps.length;
        const facing = Math.atan2(y - centerY, x - centerX);
        for (const destination of groupMoveDests(snaps, x, y))
          game.enqueue(
            destination.u,
            alt ? 2 : 0,
            destination.x,
            destination.y,
            facing,
            alt ? 0 : 1,
          );
        orders.markFlash(selected);
      } else orders.groupMove(selected, x, y, alt ? "disengage" : "move");
    },
    orderFacing: (units: number[], x: number, y: number, facing: number, queued: boolean) => {
      if (queued) {
        const selected = myUnits(units);
        for (const destination of groupMoveDests(selected.map(unitSnap), x, y))
          game.enqueue(destination.u, 0, destination.x, destination.y, facing, 1);
        orders.markFlash(selected);
      } else orders.groupMove(units, x, y, "move", facing);
    },
    togglePace: (units: number[]) => {
      const selected = myUnits(units);
      const info = world.unitInfo();
      const anyWalk = selected.some((unit) => info[unit * stride + UNIT_INFO.running] < 0.5);
      selected.forEach((unit) => game.set_pace(unit, anyWalk ? 1 : 0));
    },
    reform: (units: number[]) => myUnits(units).forEach((unit) => game.set_reform(unit)),
    toggleKite: (units: number[]) => {
      const selected = myUnits(units);
      const info = world.unitInfo();
      const anyOff = selected.some((unit) => info[unit * stride + UNIT_INFO.evadeAuto] < 0.5);
      selected.forEach((unit) => game.set_evade_auto(unit, anyOff ? 1 : 0));
    },
    togglePursue: (units: number[]) => {
      pursueOn = !pursueOn;
      myUnits(units).forEach((unit) => game.set_pursue(unit, pursueOn ? 1 : 0));
    },
    toggleFire: (units: number[]) => {
      fireOn = !fireOn;
      myUnits(units).forEach((unit) => game.set_fire_at_will(unit, fireOn ? 1 : 0));
    },
  };
  const input = new Input(canvas, camera, sink, signal, world.cameraRig.apply);
  orders = createBattleOrders({
    clock,
    freeze,
    input,
    myUnits,
    unitCenter,
    unitInfo: world.unitInfo,
    unitSnap,
    world,
  });

  return {
    input,
    orders,
    fireOn: () => fireOn,
    showPaths: () => showPaths,
    myUnits,
    soldierStartOf,
    onCardSelect(unit, additive) {
      input.selected = additive ? Array.from(new Set([...input.selected, unit])) : [unit];
      const [x, y] = unitCenter(unit);
      camera.setViewCenter(x, y);
      camera.clampView();
    },
    toolbarCommands: {
      selected: () => input.selected,
      togglePace: sink.togglePace,
      reform: sink.reform,
      togglePursue: sink.togglePursue,
      toggleFire: sink.toggleFire,
      toggleKite: sink.toggleKite,
      togglePause: () => {
        clock.paused = !clock.paused;
      },
      setSpeed: (scale) => {
        clock.paused = false;
        clock.timeScale = scale;
      },
      togglePaths: () => {
        showPaths = !showPaths;
      },
    },
  };
}
