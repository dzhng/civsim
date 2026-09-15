import {
  CLASS_SPACING,
  UNIT_INFO,
  currentUnitFiles,
} from "@packages/game-renderer/src/battle/unitInfoLayout";
import type { BattleTimeControl } from "./battleSimTime";
import type { BattleFreeze } from "./battleFreeze";
import { Input, type OrderSink } from "./input";
import { createBattleOrders, type BattleOrders } from "./battleOrders";
import { groupMoveDests, type UnitSnap } from "./orders";
import type { BattleWorld } from "./battleWorld";

/** Radii the sim's own pick rule is asked with: selection is forgiving, naming an
 * enemy to attack is not. Both questions go to the authority that owns the rule. */
const SELECT_PICK_RADIUS = 30;
const ORDER_PICK_RADIUS = 25;

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
  time: BattleTimeControl,
  freeze: BattleFreeze,
): BattleControls {
  const { camera, canvas, sim, signal, stride } = world;
  let showPaths = false;
  let pursueOn = false;
  let fireOn = true;
  let orders: BattleOrders;

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "p") time.paused = !time.paused;
      if (event.key === "1") time.timeScale = 1;
      if (event.key === "3") time.timeScale = 3;
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

  const sink: OrderSink = {
    unitsInScreenRect: (x0: number, y0: number, x1: number, y1: number) => {
      const info = world.unitInfo();
      const units: number[] = [];
      for (let unit = 0; unit < sim.unitCount(); unit++) {
        if (
          info[unit * stride + UNIT_INFO.team] !== 0 ||
          info[unit * stride + UNIT_INFO.alive] === 0
        )
          continue;
        const [wx, wy] = unitCenter(unit);
        const [sx, sy] = camera.worldToScreen(wx, wy, world.renderer.heightAt(wx, wy));
        const rect = canvas.getBoundingClientRect();
        const x = sx + rect.left,
          y = sy + rect.top;
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) units.push(unit);
      }
      return units;
    },
    pickUnit: async (x: number, y: number) => {
      const unit = await sim.pick(x, y, SELECT_PICK_RADIUS);
      return unit >= 0 && world.unitInfo()[unit * stride + UNIT_INFO.team] === 0 ? unit : -1;
    },
    allUnits: () => {
      const info = world.unitInfo();
      const units: number[] = [];
      for (let unit = 0; unit < sim.unitCount(); unit++) {
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
        sim.send({
          kind: "move",
          unit,
          x: x + dx,
          y: y + dy,
          facing: info[unit * stride + UNIT_INFO.facing],
        });
      }
      orders.markFlash(selected);
    },
    // The sim owns "which unit is at this point", so the click is resolved by the
    // authority and the order follows on its answer. The cost is the round trip,
    // not a second copy of the pick rule on this thread.
    orderPoint: (
      units: number[],
      x: number,
      y: number,
      shift: boolean,
      double: boolean,
      alt: boolean,
    ) => {
      if (myUnits(units).length === 0) return;
      void sim.pick(x, y, ORDER_PICK_RADIUS).then((target) => {
        if (signal.aborted) return;
        const selected = myUnits(units);
        if (selected.length === 0) return;
        const info = world.unitInfo();
        const enemy =
          target >= 0 &&
          info[target * stride + UNIT_INFO.team] !== 0 &&
          info[target * stride + UNIT_INFO.alive] > 0;
        if (!shift)
          selected.forEach((unit) => sim.send({ kind: "pace", unit, pace: double ? 1 : 0 }));
        if (enemy) {
          if (shift) {
            selected.forEach((unit) =>
              sim.send({
                kind: "enqueue",
                unit,
                mode: 1,
                x: target,
                y: 0,
                facing: 0,
                hasFacing: 0,
              }),
            );
            orders.markFlash(selected);
          } else if (selected.length === 1) {
            sim.send({ kind: "attack", unit: selected[0], target });
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
            sim.send({
              kind: "enqueue",
              unit: destination.u,
              mode: alt ? 2 : 0,
              x: destination.x,
              y: destination.y,
              facing,
              hasFacing: alt ? 0 : 1,
            });
          orders.markFlash(selected);
        } else orders.groupMove(selected, x, y, alt ? "disengage" : "move");
      });
    },
    orderLine: (units, line, queued) => orders.orderLine(units, line, queued),
    togglePace: (units: number[]) => {
      const selected = myUnits(units);
      const info = world.unitInfo();
      const anyWalk = selected.some((unit) => info[unit * stride + UNIT_INFO.running] < 0.5);
      selected.forEach((unit) => sim.send({ kind: "pace", unit, pace: anyWalk ? 1 : 0 }));
    },
    reform: (units: number[]) =>
      myUnits(units).forEach((unit) => sim.send({ kind: "reform", unit })),
    toggleKite: (units: number[]) => {
      const selected = myUnits(units);
      const info = world.unitInfo();
      const anyOff = selected.some((unit) => info[unit * stride + UNIT_INFO.evadeAuto] < 0.5);
      selected.forEach((unit) => sim.send({ kind: "evadeAuto", unit, on: anyOff }));
    },
    togglePursue: (units: number[]) => {
      pursueOn = !pursueOn;
      myUnits(units).forEach((unit) => sim.send({ kind: "pursue", unit, on: pursueOn }));
    },
    toggleFire: (units: number[]) => {
      fireOn = !fireOn;
      myUnits(units).forEach((unit) => sim.send({ kind: "fireAtWill", unit, on: fireOn }));
    },
  };
  const input = new Input(canvas, camera, sink, signal, world.cameraRig.apply);
  orders = createBattleOrders({
    freeze,
    input,
    myUnits,
    time,
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
        time.paused = !time.paused;
      },
      setSpeed: (scale) => {
        time.paused = false;
        time.timeScale = scale;
      },
      togglePaths: () => {
        showPaths = !showPaths;
      },
    },
  };
}
