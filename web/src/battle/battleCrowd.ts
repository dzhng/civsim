import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import {
  fightingFrameForTick,
  marchingStateForSpeed,
} from "@packages/crowd-runtime/src/animationState";
import {
  HEAVY_PHALANX_REST_CLASS,
  HEAVY_PHALANX_SIDEARM_CLASS,
  MEDIUM_PHALANX_REST_CLASS,
  MEDIUM_PHALANX_SIDEARM_CLASS,
  SHOCK_CAV_SIDEARM_CLASS,
} from "@packages/soldier-assets/src/soldierMesh";
import type { Game } from "../wasm/game_wasm.js";
import {
  UNIT_CLASS_KEY_BY_ID,
  UnitClass,
  validateClassSpecCatalog,
  type UnitClassKey,
} from "./classData";
import type { BattleUnitPresentation } from "./battleUnitPresentation";
import { BATTLE_TICK_DT, type BattleWorld } from "./battleWorld";

const FRAME_SHOOT = 12;
const PHALANX_REST_RENDER_CLASS: Partial<Record<UnitClassKey, number>> = {
  [UnitClass.HeavyPhalanx]: HEAVY_PHALANX_REST_CLASS,
  [UnitClass.MediumPhalanx]: MEDIUM_PHALANX_REST_CLASS,
};
const PHALANX_SIDEARM_RENDER_CLASS: Partial<Record<UnitClassKey, number>> = {
  [UnitClass.HeavyPhalanx]: HEAVY_PHALANX_SIDEARM_CLASS,
  [UnitClass.MediumPhalanx]: MEDIUM_PHALANX_SIDEARM_CLASS,
};

type MissileExportGame = Game & { loosing_ptr(): number };

export interface WeaponSpec {
  name: string;
  reach: number;
  minRange: number;
  arc: number;
  interval: number;
  damage: number;
  braced: boolean;
  charge: boolean;
}

export interface ClassSpec {
  id: number;
  key: UnitClassKey;
  name: string;
  cost: number;
  mass: number;
  radius: number;
  brace: number;
  block: number;
  evade: number;
  training: number;
  paceMult: number;
  drainMult: number;
  health: number;
  mountHealth: number;
  mounted: boolean;
  charges: boolean;
  weapons: WeaponSpec[];
  missile: {
    name: string;
    range: number;
    interval: number;
    ammo: number;
    damage: number;
    mobileFire: boolean;
  } | null;
}

export class BattleCrowd {
  readonly classSpecs: ClassSpec[];
  private readonly classBracedIndex: number[];
  private readonly classChargeIndex: number[];
  private alive = new Float32Array(0);
  private frames = new Float32Array(0);
  private renderClass = new Uint8Array(0);
  private renderFacings = new Float32Array(0);
  private renderPositions = new Float32Array(0);
  private previousRenderPositions = new Float32Array(0);
  private previousSimPositions = new Float32Array(0);
  private gaitMoving = new Uint8Array(0);
  private renderPositionTick = -1;

  constructor(
    private world: BattleWorld,
    private presentation: BattleUnitPresentation,
  ) {
    this.classSpecs = JSON.parse(world.game.class_specs());
    validateClassSpecCatalog(this.classSpecs);
    this.classBracedIndex = this.classSpecs.map((spec) =>
      spec.weapons.findIndex((weapon) => weapon.braced),
    );
    this.classChargeIndex = this.classSpecs.map((spec) =>
      spec.weapons.findIndex((weapon) => weapon.charge),
    );
  }

  draw(
    simTick: number,
    frozen: boolean,
    alpha: number,
    frameDt: number,
    selectedUnits: number[],
  ): void {
    this.buildFrame(simTick, frozen);
    this.presentation.update(selectedUnits);
    this.world.renderer.draw(
      this.renderPositions,
      this.renderFacings,
      this.frames,
      this.alive,
      this.world.game.soldier_count(),
      this.world.camera,
      this.renderClass,
      frozen ? simTick : simTick + alpha,
      frameDt,
    );
    this.drawAttackArcs(frozen);
  }

  private buildFrame(simTick: number, frozen: boolean): void {
    const { game, memory, stride } = this.world;
    const count = game.soldier_count();
    const alive = new Uint8Array(memory.buffer, game.alive_ptr(), count);
    const fighting = new Uint8Array(memory.buffer, game.fighting_ptr(), count);
    const loosing = new Float32Array(
      memory.buffer,
      (game as MissileExportGame).loosing_ptr(),
      count,
    );
    const switchCooldown = new Float32Array(memory.buffer, game.switch_cd_ptr(), count);
    const soldierUnit = new Uint32Array(memory.buffer, game.soldier_unit_ptr(), count);
    const currentWeapon = new Uint8Array(memory.buffer, game.cur_weapon_ptr(), count);
    const positions = this.world.positions();
    if (this.alive.length !== count || simTick < this.renderPositionTick) {
      this.alive = new Float32Array(count);
      this.frames = new Float32Array(count);
      this.renderClass = new Uint8Array(count);
      this.renderFacings = new Float32Array(count);
      this.renderPositions = new Float32Array(positions);
      this.previousRenderPositions = new Float32Array(positions);
      this.previousSimPositions = new Float32Array(positions);
      this.gaitMoving = new Uint8Array(count);
      this.renderPositionTick = simTick;
    }
    const renderTickDelta = Math.max(0, simTick - this.renderPositionTick);
    const updateRenderPositions = renderTickDelta > 0;
    if (updateRenderPositions) this.previousRenderPositions.set(this.renderPositions);
    const facings = this.world.facings();
    const info = this.world.unitInfo();
    const unitCount = game.unit_count();
    const atEase = new Uint8Array(unitCount);
    const running = new Uint8Array(unitCount);
    for (let unit = 0; unit < unitCount; unit++) {
      const offset = unit * stride;
      atEase[unit] = info[offset + UNIT_INFO.atEase] > 0.5 ? 1 : 0;
      running[unit] = info[offset + UNIT_INFO.running] > 0.5 ? 1 : 0;
    }
    this.presentation.beginFrame(unitCount);
    for (let soldier = 0; soldier < count; soldier++) {
      this.alive[soldier] = alive[soldier];
      const position = 2 * soldier;
      this.updatePosition(
        soldier,
        position,
        positions,
        alive,
        frozen,
        updateRenderPositions,
        renderTickDelta,
      );
      if (alive[soldier])
        this.presentation.addSoldier(
          soldierUnit[soldier],
          this.renderPositions[position],
          this.renderPositions[position + 1],
          unitCount,
        );
      this.frames[soldier] = this.animationFrame(
        soldier,
        position,
        simTick,
        renderTickDelta,
        updateRenderPositions,
        alive,
        fighting,
        loosing,
        switchCooldown,
        running,
        atEase,
        soldierUnit,
        positions,
      );
      this.applyWeaponPose(soldier, alive, currentWeapon, soldierUnit, facings, info);
    }
    this.presentation.finishFrame(unitCount);
    if (updateRenderPositions) {
      this.previousSimPositions.set(positions);
      this.renderPositionTick = simTick;
    }
  }

  private updatePosition(
    soldier: number,
    position: number,
    positions: Float32Array,
    alive: Uint8Array,
    frozen: boolean,
    update: boolean,
    tickDelta: number,
  ): void {
    if (frozen) {
      this.renderPositions[position] = positions[position];
      this.renderPositions[position + 1] = positions[position + 1];
    } else if (alive[soldier] && update) {
      const errorX = positions[position] - this.renderPositions[position];
      const errorY = positions[position + 1] - this.renderPositions[position + 1];
      const errorSquared = errorX * errorX + errorY * errorY;
      const baseAlpha = errorSquared > 0.25 ? 0.75 : 0.28;
      const alpha = tickDelta > 12 ? 1 : 1 - Math.pow(1 - baseAlpha, tickDelta);
      this.renderPositions[position] += errorX * alpha;
      this.renderPositions[position + 1] += errorY * alpha;
    } else if (!alive[soldier]) {
      this.renderPositions[position] = positions[position];
      this.renderPositions[position + 1] = positions[position + 1];
    }
  }

  private animationFrame(
    soldier: number,
    position: number,
    simTick: number,
    tickDelta: number,
    update: boolean,
    alive: Uint8Array,
    fighting: Uint8Array,
    loosing: Float32Array,
    switchCooldown: Float32Array,
    running: Uint8Array,
    atEase: Uint8Array,
    soldierUnit: Uint32Array,
    positions: Float32Array,
  ): number {
    if (!alive[soldier]) return 4;
    if (switchCooldown[soldier] > 0) return 5;
    if (loosing[soldier] > 0) return FRAME_SHOOT;
    if (fighting[soldier]) return fightingFrameForTick(simTick, soldier);
    const wasMoving = this.gaitMoving[soldier] > 0;
    const speed = update
      ? Math.hypot(
          positions[position] - this.previousSimPositions[position],
          positions[position + 1] - this.previousSimPositions[position + 1],
        ) / Math.max(tickDelta * BATTLE_TICK_DT, BATTLE_TICK_DT)
      : wasMoving
        ? 1
        : 0;
    const moving = marchingStateForSpeed(speed, wasMoving);
    this.gaitMoving[soldier] = moving ? 1 : 0;
    if (moving) return running[soldierUnit[soldier]] ? 8 + (soldier & 1) : 1 + (soldier & 1);
    return atEase[soldierUnit[soldier]] ? 6 : 0;
  }

  private applyWeaponPose(
    soldier: number,
    alive: Uint8Array,
    currentWeapon: Uint8Array,
    soldierUnit: Uint32Array,
    facings: Float32Array,
    info: Float32Array,
  ): void {
    const unit = soldierUnit[soldier];
    const classId = info[unit * this.world.stride + 13];
    this.renderFacings[soldier] = facings[soldier];
    this.renderClass[soldier] = classId;
    if (!alive[soldier]) return;
    const bracedIndex = this.classBracedIndex[classId];
    if (bracedIndex >= 0) {
      if (currentWeapon[soldier] === bracedIndex) {
        this.renderFacings[soldier] = info[unit * this.world.stride + 2];
        if (this.frames[soldier] === 6)
          this.renderClass[soldier] = renderClassFor(PHALANX_REST_RENDER_CLASS, classId);
      } else {
        this.frames[soldier] = 7;
        this.renderClass[soldier] = renderClassFor(PHALANX_SIDEARM_RENDER_CLASS, classId);
      }
    }
    const chargeIndex = this.classChargeIndex[classId];
    if (chargeIndex >= 0 && currentWeapon[soldier] !== chargeIndex)
      this.renderClass[soldier] = SHOCK_CAV_SIDEARM_CLASS;
  }

  private drawAttackArcs(frozen: boolean): void {
    const { camera, canvas, game, memory, renderer, stride } = this.world;
    if (frozen || camera.zoom <= 2.5) return;
    const triangles: number[] = [];
    const positions = this.world.positions();
    const facings = this.world.facings();
    const currentWeapon = new Uint8Array(
      memory.buffer,
      game.cur_weapon_ptr(),
      game.soldier_count(),
    );
    const soldierUnit = new Uint32Array(
      memory.buffer,
      game.soldier_unit_ptr(),
      game.soldier_count(),
    );
    const info = this.world.unitInfo();
    const [worldX0, worldY1] = camera.screenToWorld(0, 0);
    const [worldX1, worldY0] = camera.screenToWorld(canvas.width, canvas.height);
    let budget = 900;
    for (let soldier = 0; soldier < game.soldier_count() && budget > 0; soldier++) {
      if (this.frames[soldier] !== 3) continue;
      const x = positions[2 * soldier];
      const y = positions[2 * soldier + 1];
      if (x < worldX0 || x > worldX1 || y < worldY0 || y > worldY1) continue;
      const unit = soldierUnit[soldier];
      const classId = info[unit * stride + UNIT_INFO.classId];
      const weapon = this.classSpecs[classId]?.weapons[currentWeapon[soldier]];
      if (!weapon) continue;
      const team = info[unit * stride + UNIT_INFO.team];
      const [red, green, blue] = team === 0 ? [0.55, 0.85, 1.0] : [1.0, 0.72, 0.35];
      const half = Math.max(weapon.arc, 0.18) / 2;
      const segments = weapon.arc > 1.2 ? 5 : 3;
      const facing = weapon.braced ? info[unit * stride + UNIT_INFO.facing] : facings[soldier];
      const reach = weapon.reach + 0.45;
      for (let segment = 0; segment < segments; segment++) {
        const angle0 = facing - half + (segment / segments) * weapon.arc;
        const angle1 = facing - half + ((segment + 1) / segments) * weapon.arc;
        triangles.push(
          x,
          y,
          red,
          green,
          blue,
          0.26,
          x + Math.cos(angle0) * reach,
          y + Math.sin(angle0) * reach,
          red,
          green,
          blue,
          0.04,
          x + Math.cos(angle1) * reach,
          y + Math.sin(angle1) * reach,
          red,
          green,
          blue,
          0.04,
        );
      }
      budget--;
    }
    if (triangles.length) renderer.drawTris(new Float32Array(triangles), camera);
  }
}

function renderClassFor(map: Partial<Record<UnitClassKey, number>>, classId: number): number {
  const key = UNIT_CLASS_KEY_BY_ID[classId | 0];
  return key === undefined ? classId : (map[key] ?? classId);
}
