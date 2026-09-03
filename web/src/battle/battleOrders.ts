import {
  CLASS_SPACING,
  UNIT_INFO,
  currentUnitFiles,
  currentUnitRanks,
} from "@packages/game-renderer/src/battle/unitInfoLayout";
import { SELECTION_GREEN } from "@packages/game-renderer/src/overlays";
import type { Game } from "../wasm/game_wasm.js";
import type { SimClock } from "../shared/simClock";
import { pushDestRings, pushPie, SOLDIER_RING_RADIUS } from "../shared/overlays";
import type { BattleFreeze } from "./battleFreeze";
import type { Input } from "./input";
import { groupMoveDests, type UnitSnap } from "./orders";
import type { BattleTacticalLineFrame } from "./renderer";
import type { BattleWorld } from "./battleWorld";

export interface BattleOrders {
  groupMove(
    units: number[],
    x: number,
    y: number,
    kind?: "move" | "disengage",
    facing?: number,
  ): void;
  groupAttack(units: number[], target: number): void;
  markFlash(units: number[]): void;
  orderPointAttack(units: number[], target: number): void;
  previewDebug(unit: number): unknown;
  tacticalLineFrame(withPaths: boolean): BattleTacticalLineFrame;
  tickGroupAttacks(): void;
}

interface GroupAttack {
  units: number[];
  target: number;
  lastTx: number;
  lastTy: number;
}

export function createBattleOrders({
  clock,
  freeze,
  input,
  myUnits,
  soldierStartOf,
  unitCenter,
  unitInfo,
  unitSnap,
  world,
}: {
  clock: SimClock;
  freeze: BattleFreeze;
  input: Input;
  myUnits(units: number[]): number[];
  soldierStartOf(unit: number, info?: Float32Array): number;
  unitCenter(unit: number): [number, number];
  unitInfo(): Float32Array;
  unitSnap(unit: number): UnitSnap;
  world: BattleWorld;
}): BattleOrders {
  const { game, stride } = world;
  let groupAttacks: GroupAttack[] = [];
  const orderFlash = new Map<number, number>();
  const markFlash = (units: number[]) => {
    const time = performance.now();
    units.forEach((unit) => orderFlash.set(unit, time));
  };
  const tacticalLines = createBattleTacticalLines({
    clock,
    freeze,
    input,
    myUnits,
    orderFlash,
    soldierStartOf,
    unitCenter,
    unitInfo,
    unitSnap,
    world,
  });

  const groupMove: BattleOrders["groupMove"] = (units, x, y, kind = "move", facing) => {
    const selected = myUnits(units);
    if (selected.length === 0) return;
    const snaps = selected.map(unitSnap);
    let cx = 0;
    let cy = 0;
    for (const snap of snaps) {
      cx += snap.x;
      cy += snap.y;
    }
    cx /= snaps.length;
    cy /= snaps.length;
    const face = facing ?? Math.atan2(y - cy, x - cx);
    for (const destination of groupMoveDests(snaps, x, y)) {
      if (kind === "disengage")
        game.set_disengage_order(destination.u, destination.x, destination.y);
      else game.set_move_order_facing(destination.u, destination.x, destination.y, face);
    }
    markFlash(selected);
  };

  const tickGroupAttacks = () => {
    const info = unitInfo();
    groupAttacks = groupAttacks.filter((attack) => {
      const selected = myUnits(attack.units);
      if (selected.length === 0) return false;
      const targetOffset = attack.target * stride;
      if (info[targetOffset + UNIT_INFO.alive] === 0) return false;
      const [tx, ty] = unitCenter(attack.target);
      let cx = 0;
      let cy = 0;
      for (const unit of selected) {
        const [x, y] = unitCenter(unit);
        cx += x;
        cy += y;
      }
      cx /= selected.length;
      cy /= selected.length;
      const distance = Math.hypot(tx - cx, ty - cy);
      if (distance < 160) {
        selected.forEach((unit) => game.set_attack_order(unit, attack.target));
        markFlash(selected);
        return false;
      }
      if (Math.hypot(tx - attack.lastTx, ty - attack.lastTy) > 35) {
        const stop = distance - 150;
        groupMove(selected, cx + ((tx - cx) / distance) * stop, cy + ((ty - cy) / distance) * stop);
        attack.lastTx = tx;
        attack.lastTy = ty;
      }
      return true;
    });
  };

  return {
    groupMove,
    groupAttack(units, target) {
      groupAttacks.push({ units, target, lastTx: 1e9, lastTy: 1e9 });
      tickGroupAttacks();
    },
    orderPointAttack(units, target) {
      groupAttacks = groupAttacks.filter(
        (attack) => !attack.units.some((unit) => units.includes(unit)),
      );
      groupAttacks.push({ units: [...units], target, lastTx: 1e9, lastTy: 1e9 });
      tickGroupAttacks();
    },
    markFlash,
    previewDebug: tacticalLines.previewDebug,
    tacticalLineFrame: tacticalLines.frame,
    tickGroupAttacks,
  };
}

interface TacticalLineDependencies {
  clock: SimClock;
  freeze: BattleFreeze;
  input: Input;
  myUnits(units: number[]): number[];
  orderFlash: Map<number, number>;
  soldierStartOf(unit: number, info?: Float32Array): number;
  unitCenter(unit: number): [number, number];
  unitInfo(): Float32Array;
  unitSnap(unit: number): UnitSnap;
  world: BattleWorld;
}

type MissileExportGame = Game & {
  projectile_z_ptr(): number;
  projectile_vx_ptr(): number;
  projectile_vy_ptr(): number;
  projectile_vz_ptr(): number;
};

interface PreviewBounds {
  unit: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  count: number;
  files: number;
  ranks: number;
  width: number;
  depth: number;
  aspect: number;
  expectedAspect: number;
  previewFiles: number;
  previewRanks: number;
  previewShapeAspect: number;
}

const pushPreviewRings = (
  lastPreviewBounds: Map<number, PreviewBounds>,
  rings: number[],
  unit: number,
  x: number,
  y: number,
  facing: number,
  alive: number,
  files: number,
  ranks: number,
  spacing: number,
  r: number,
  g: number,
  b: number,
  a: number,
) => {
  const start = rings.length;
  pushDestRings(rings, x, y, facing, alive, files, spacing, r, g, b, a);
  if (rings.length === start) return;
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  const rx = fy;
  const ry = -fx;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let lat0 = Infinity;
  let lat1 = -Infinity;
  let back0 = Infinity;
  let back1 = -Infinity;
  for (let i = start; i < rings.length; i += 7) {
    const px = rings[i];
    const py = rings[i + 1];
    x0 = Math.min(x0, px);
    y0 = Math.min(y0, py);
    x1 = Math.max(x1, px);
    y1 = Math.max(y1, py);
    const dx = px - x;
    const dy = py - y;
    const lateral = dx * rx + dy * ry;
    const back = -(dx * fx + dy * fy);
    lat0 = Math.min(lat0, lateral);
    lat1 = Math.max(lat1, lateral);
    back0 = Math.min(back0, back);
    back1 = Math.max(back1, back);
  }
  const rankGap = 1.1;
  const width = Math.max(0.001, lat1 - lat0);
  const depth = Math.max(0.001, back1 - back0);
  const previewFiles = Math.max(1, Math.round(width / Math.max(0.001, spacing)) + 1);
  const previewRanks = Math.max(1, Math.round(depth / rankGap) + 1);
  const expectedAspect = Math.max(1, files) / Math.max(1, ranks);
  lastPreviewBounds.set(unit, {
    unit,
    x0,
    y0,
    x1,
    y1,
    count: (rings.length - start) / 7,
    files,
    ranks,
    width,
    depth,
    aspect: width / depth,
    expectedAspect,
    previewFiles,
    previewRanks,
    previewShapeAspect: previewFiles / previewRanks,
  });
};

function buildTacticalLineFrame(
  deps: TacticalLineDependencies,
  lastPreviewBounds: Map<number, PreviewBounds>,
  withPaths: boolean,
): BattleTacticalLineFrame {
  const {
    clock,
    freeze,
    input,
    myUnits,
    orderFlash,
    soldierStartOf,
    unitCenter,
    unitInfo,
    unitSnap,
    world,
  } = deps;
  const { game, stride: STRIDE } = world;
  const wasm = world.cfg.wasm;
  const positions = world.positions;
  const info = unitInfo();
  const n = game.unit_count();
  const groundCues: number[] = [];
  const rings: number[] = [];
  const effects: number[] = [];
  const showTransient = !clock.frozen || withPaths || freeze.effects;
  for (let u = 0; u < n; u++) {
    const o = u * STRIDE;
    const [ax, ay, facing, team] = [
      info[o],
      info[o + UNIT_INFO.y],
      info[o + UNIT_INFO.facing],
      info[o + UNIT_INFO.team],
    ];
    // The player's cues share the selection-ring green (one style for
    // "mine"); the enemy's keep the red accent.
    const [r, g, b] = team === 0 ? SELECTION_GREEN : [1.0, 0.55, 0.45];
    if (withPaths) {
      const fx = Math.cos(facing);
      const fy = Math.sin(facing);
      groundCues.push(ax, ay, r, g, b, 1, ax + fx * 4, ay + fy * 4, r, g, b, 1);
      groundCues.push(ax - fy * 2, ay + fx * 2, r, g, b, 1, ax + fy * 2, ay - fx * 2, r, g, b, 1);
      if (info[o + UNIT_INFO.hasTarget] > 0.5) {
        groundCues.push(
          ax,
          ay,
          r,
          g,
          b,
          1,
          info[o + UNIT_INFO.targetX],
          info[o + UNIT_INFO.targetY],
          r,
          g,
          b,
          1,
        );
      }
      // The SHIFT-queued chain BEHIND the active order: active dest -> q0 ->
      // q1 -> ... drawn dimmer than the live leg, a small diamond at each
      // waypoint. Only the player's units ever carry a queue, so this is a
      // no-op (empty array) for everyone else.
      const q = game.queued_orders(u);
      if (q.length >= 3) {
        let px = info[o + UNIT_INFO.hasTarget] > 0.5 ? info[o + UNIT_INFO.targetX] : ax;
        let py = info[o + UNIT_INFO.hasTarget] > 0.5 ? info[o + UNIT_INFO.targetY] : ay;
        const qr = r * 0.55,
          qg = g * 0.55,
          qb = b * 0.55;
        for (let j = 0; j + 2 < q.length; j += 3) {
          const qx = q[j],
            qy = q[j + 1];
          groundCues.push(px, py, qr, qg, qb, 1, qx, qy, qr, qg, qb, 1);
          const s = 2.5; // diamond waypoint marker
          groundCues.push(qx - s, qy, qr, qg, qb, 1, qx, qy + s, qr, qg, qb, 1);
          groundCues.push(qx, qy + s, qr, qg, qb, 1, qx + s, qy, qr, qg, qb, 1);
          groundCues.push(qx + s, qy, qr, qg, qb, 1, qx, qy - s, qr, qg, qb, 1);
          groundCues.push(qx, qy - s, qr, qg, qb, 1, qx - s, qy, qr, qg, qb, 1);
          px = qx;
          py = qy;
        }
      }
    }
    // Destination preview: the soldier-ring grid at the final formation
    // slots (flashes on every order; hold Space to keep them all visible).
    const age = performance.now() - (orderFlash.get(u) ?? -1e9);
    if (info[o + UNIT_INFO.hasTarget] > 0.5 && (withPaths || (showTransient && age < 2500))) {
      // Recent orders fade out (to transparent, alpha not color — a color
      // fade sinks the cue to black); Space shows them at full strength.
      const k = withPaths ? 1 : Math.max(0, 1 - age / 2500);
      const cls = info[o + UNIT_INFO.classId];
      const alive = info[o + UNIT_INFO.alive];
      const files = currentUnitFiles(info, o);
      const ranks = currentUnitRanks(info, o);
      const gf =
        info[o + UNIT_INFO.hasGoalFacing] > 0.5
          ? info[o + UNIT_INFO.goalFacing]
          : Math.atan2(info[o + UNIT_INFO.targetY] - ay, info[o + UNIT_INFO.targetX] - ax);
      pushPreviewRings(
        lastPreviewBounds,
        rings,
        u,
        info[o + UNIT_INFO.targetX],
        info[o + UNIT_INFO.targetY],
        gf,
        alive,
        files,
        ranks,
        CLASS_SPACING[cls],
        r,
        g,
        b,
        k,
      );
      groundCues.push(
        ax,
        ay,
        r * 0.8,
        g * 0.8,
        b * 0.8,
        k,
        info[o + UNIT_INFO.targetX],
        info[o + UNIT_INFO.targetY],
        r * 0.8,
        g * 0.8,
        b * 0.8,
        k,
      );
    }
    // Progress pie: WHITE = order transmitting down the line. A ground cue
    // (5-stride, draped on terrain) — the effects buffer is 6-stride with
    // per-vertex z, so pushing it there shears every later vertex.
    if (showTransient && info[o + UNIT_INFO.orderProgress] > 0)
      pushPie(groundCues, ax, ay, info[o + UNIT_INFO.orderProgress], 7, 1, 1, 1, 1);
  }
  // Right-drag preview: where every man will stand, facing the cursor —
  // the soldier-ring grid in the selection green.
  if (input.rightDrag) {
    const sel = myUnits(input.selected);
    if (sel.length > 0) {
      const snaps = sel.map(unitSnap);
      for (const dst of groupMoveDests(snaps, input.rightDrag.x, input.rightDrag.y)) {
        const o = dst.u * STRIDE;
        const cls = info[o + UNIT_INFO.classId];
        const alive = info[o + UNIT_INFO.alive];
        pushPreviewRings(
          lastPreviewBounds,
          rings,
          dst.u,
          dst.x,
          dst.y,
          input.rightDrag.facing,
          alive,
          currentUnitFiles(info, o),
          currentUnitRanks(info, o),
          CLASS_SPACING[cls],
          ...SELECTION_GREEN,
          1,
        );
      }
      // The arrow itself.
      const a = input.rightDrag;
      groundCues.push(
        a.x,
        a.y,
        ...SELECTION_GREEN,
        1,
        a.x + Math.cos(a.facing) * 14,
        a.y + Math.sin(a.facing) * 14,
        ...SELECTION_GREEN,
        1,
      );
    }
  }
  // Drag-move preview: the ring grid of every selected unit at the
  // dragged spot.
  if (input.dragDelta) {
    const [dx, dy] = input.dragDelta;
    for (const u of input.selected) {
      const o = u * STRIDE;
      const cls = info[o + UNIT_INFO.classId];
      const alive = info[o + UNIT_INFO.alive];
      if (alive === 0) continue;
      const [cx, cy] = unitCenter(u);
      pushPreviewRings(
        lastPreviewBounds,
        rings,
        u,
        cx + dx,
        cy + dy,
        info[o + UNIT_INFO.facing],
        alive,
        currentUnitFiles(info, o),
        currentUnitRanks(info, o),
        CLASS_SPACING[cls],
        ...SELECTION_GREEN,
        1,
      );
    }
  }
  // Selection rings.
  if (input.selected.length > 0) {
    const pos = positions();
    const aliveSoldiers = new Uint8Array(
      wasm.memory.buffer,
      game.alive_ptr(),
      game.soldier_count(),
    );
    for (const u of input.selected) {
      const o = u * STRIDE;
      if (info[o + UNIT_INFO.alive] === 0) continue;
      const start = soldierStartOf(u, info);
      const count = Math.max(0, Math.floor(info[o + UNIT_INFO.total]));
      const end = Math.min(start + count, aliveSoldiers.length);
      for (let i = start; i < end; i++) {
        if (aliveSoldiers[i] === 0) continue;
        const p = i * 2;
        rings.push(pos[p], pos[p + 1], SOLDIER_RING_RADIUS, ...SELECTION_GREEN, 1);
      }
    }
  }
  pushProjectiles(effects, showTransient, world);
  return {
    groundCues: new Float32Array(groundCues),
    rings: new Float32Array(rings),
    effects: new Float32Array(effects),
  };
}

function pushProjectiles(effects: number[], showTransient: boolean, world: BattleWorld): void {
  const { camera, game } = world;
  const wasm = world.cfg.wasm;
  const pCount = showTransient ? game.projectile_count() : 0;
  if (pCount > 0) {
    const missileGame = game as MissileExportGame;
    const px = new Float32Array(wasm.memory.buffer, game.projectile_x_ptr(), pCount);
    const py = new Float32Array(wasm.memory.buffer, game.projectile_y_ptr(), pCount);
    const pz = new Float32Array(wasm.memory.buffer, missileGame.projectile_z_ptr(), pCount);
    const pvx = new Float32Array(wasm.memory.buffer, missileGame.projectile_vx_ptr(), pCount);
    const pvy = new Float32Array(wasm.memory.buffer, missileGame.projectile_vy_ptr(), pCount);
    const pvz = new Float32Array(wasm.memory.buffer, missileGame.projectile_vz_ptr(), pCount);
    const pk = new Uint8Array(wasm.memory.buffer, game.projectile_kind_ptr(), pCount);
    // Effects lines carry per-vertex z (see PhotorealLineLayer
    // perVertexZ): an arrow is a true 3D segment along its velocity —
    // no screen-space tricks (a ground-plane unproject snapped every
    // above-horizon endpoint to the view centre: the fan bug).
    const dpr = window.devicePixelRatio || 1;
    const minArrowWorld = (6 * dpr) / Math.max(4, camera.zoom); // ~6px floor
    for (let i = 0; i < pCount; i++) {
      const stone = pk[i] === 2;
      if (stone) {
        const len = 1.4;
        const c = 0.25;
        effects.push(
          px[i] - len,
          py[i],
          0.4,
          c,
          c,
          c * 0.9,
          px[i] + len,
          py[i],
          0.4,
          c,
          c,
          c * 0.9,
        );
        continue;
      }
      const speed = Math.hypot(pvx[i], pvy[i], pvz[i]) || 1;
      const half = Math.max(0.8, minArrowWorld / 2);
      const dx = (pvx[i] / speed) * half;
      const dy = (pvy[i] / speed) * half;
      const dz = (pvz[i] / speed) * half;
      const z0 = Math.max(0.05, pz[i] - dz);
      const z1 = Math.max(0.05, pz[i] + dz);
      // Dark shaft (arrows read dark in flight) doubled for weight, with
      // a pale fletching tip at the tail for direction.
      const sh = 0.16;
      effects.push(
        px[i] - dx,
        py[i] - dy,
        z0,
        sh,
        sh,
        sh * 0.9,
        px[i] + dx,
        py[i] + dy,
        z1,
        sh,
        sh,
        sh * 0.9,
      );
      effects.push(
        px[i] - dx,
        py[i] - dy,
        z0 + 0.06,
        sh,
        sh,
        sh * 0.9,
        px[i] + dx,
        py[i] + dy,
        z1 + 0.06,
        sh,
        sh,
        sh * 0.9,
      );
      effects.push(
        px[i] - dx * 0.7,
        py[i] - dy * 0.7,
        (z0 + z1) / 2 + 0.03,
        0.95,
        0.92,
        0.8,
        px[i] - dx,
        py[i] - dy,
        z0 + 0.03,
        0.95,
        0.92,
        0.8,
      );
    }
  }
}

function createBattleTacticalLines(deps: TacticalLineDependencies) {
  let lastPreviewBounds = new Map<number, PreviewBounds>();
  return {
    frame: (withPaths: boolean) => {
      lastPreviewBounds = new Map();
      return buildTacticalLineFrame(deps, lastPreviewBounds, withPaths);
    },
    previewDebug: (unit: number) => lastPreviewBounds.get(unit) ?? null,
  };
}
