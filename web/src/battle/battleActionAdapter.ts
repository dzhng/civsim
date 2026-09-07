import {
  ACTION_TICK_SECONDS,
  type ActionObservation,
} from "@packages/crowd-runtime/src/actionTimeline";
import { APPEARANCE_DESCRIPTORS } from "@packages/soldier-assets/src/appearance";
import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import type { Game } from "../wasm/game_wasm.js";
import { createBattleViews, MOTOR_TRAVEL } from "./battleViews";
import { validateClassSpecCatalog } from "./classData";
import type { ClassSpec } from "./classData";

/** Actual battle state only; action priorities and clocks belong to ActionTimeline. */
export class BattleActionAdapter {
  readonly classSpecs: ClassSpec[];
  private readonly releaseDuration: number;
  private readonly views: ReturnType<typeof createBattleViews>;
  private motorTravel = new Float64Array(0);
  private tick = -1;
  private observations: ActionObservation[] = [];
  private facings = new Float32Array(0);
  private readonly variants = APPEARANCE_DESCRIPTORS.map((descriptor, appearanceId) => ({
    ...descriptor.selection,
    appearanceId,
  }));

  constructor(
    private readonly game: Game,
    private readonly memory: WebAssembly.Memory,
  ) {
    this.views = createBattleViews(game, memory);
    this.releaseDuration = game.loosing_duration();
    this.classSpecs = JSON.parse(game.class_specs());
    validateClassSpecCatalog(this.classSpecs);
  }

  reset(): void {
    this.tick = -1;
    this.motorTravel = new Float64Array(0);
    this.observations = [];
  }

  read(tick: number) {
    const count = this.game.soldier_count();
    if (tick < this.tick || count < this.observations.length) this.reset();
    if (tick === this.tick && count === this.observations.length)
      return { observations: this.observations, facings: this.facings };
    const motorTravel = this.views.motorTravel();
    const facings = this.views.facings();
    const health = this.views.health(),
      mountHealth = this.views.mountHealth();
    const info = this.views.unitInfo(),
      stride = this.game.unit_info_stride();
    const alive = new Uint8Array(this.memory.buffer, this.game.alive_ptr(), count);
    // Packed presentation-only branch outputs; bit order belongs to Game::posture_ptr.
    const posture = new Uint8Array(this.memory.buffer, this.game.posture_ptr(), count);
    const fighting = new Uint8Array(this.memory.buffer, this.game.fighting_ptr(), count);
    const releases = new Float32Array(this.memory.buffer, this.game.loosing_ptr(), count);
    const weapons = new Uint8Array(this.memory.buffer, this.game.cur_weapon_ptr(), count);
    const units = new Uint32Array(this.memory.buffer, this.game.soldier_unit_ptr(), count);
    const elapsed = (tick - this.tick) * ACTION_TICK_SECONDS;
    const previousCount = this.motorTravel.length / MOTOR_TRAVEL.stride;
    const observations: ActionObservation[] = [];
    const renderFacings = new Float32Array(facings);
    for (let soldier = 0; soldier < count; soldier++) {
      if (tick === this.tick && soldier < this.observations.length) {
        observations.push(this.observations[soldier]);
        renderFacings[soldier] = this.facings[soldier];
        continue;
      }
      const offset = units[soldier] * stride;
      const classId = info[offset + UNIT_INFO.classId];
      const spec = this.classSpecs[classId];
      const hedge = spec.weapons.findIndex((weapon) => weapon.braced);
      const charge = spec.weapons.findIndex((weapon) => weapon.charge);
      const heldHedge = hedge >= 0 && weapons[soldier] === hedge;
      const atEase = info[offset + UNIT_INFO.atEase] > 0.5;
      const state =
        (hedge >= 0 && !heldHedge) || (charge >= 0 && weapons[soldier] !== charge)
          ? "sidearm"
          : heldHedge && atEase
            ? "atEase"
            : "primary";
      const appearance = this.variants.find(
        (variant) => variant.unitClass === classId && variant.state === state,
      );
      if (!appearance) throw new Error(`No appearance for gameplay class ${classId}`);
      // Weapon pose affects facing/appearance, never overwrites the chosen action.
      if (alive[soldier] && heldHedge) renderFacings[soldier] = info[offset + UNIT_INFO.facing];
      const measured = soldier < previousCount && elapsed > 0;
      const travel = soldier * MOTOR_TRAVEL.stride;
      const dx = measured
        ? motorTravel[travel + MOTOR_TRAVEL.x] - this.motorTravel[travel + MOTOR_TRAVEL.x]
        : 0;
      const dy = measured
        ? motorTravel[travel + MOTOR_TRAVEL.y] - this.motorTravel[travel + MOTOR_TRAVEL.y]
        : 0;
      const path = measured
        ? motorTravel[travel + MOTOR_TRAVEL.path] - this.motorTravel[travel + MOTOR_TRAVEL.path]
        : 0;
      const cos = Math.cos(renderFacings[soldier]);
      const sin = Math.sin(renderFacings[soldier]);
      observations.push({
        appearanceId: appearance.appearanceId,
        alive: alive[soldier] !== 0,
        health: health[soldier],
        mountHealth: mountHealth[soldier],
        speedMps: measured ? path / elapsed : 0,
        forwardMps: measured ? (dx * cos + dy * sin) / elapsed : 0,
        lateralMps: measured ? (dx * sin - dy * cos) / elapsed : 0,
        routing: info[offset + UNIT_INFO.routing] > 0.5,
        incapacitated: (posture[soldier] & 1) !== 0,
        guardedFacing: (posture[soldier] & (heldHedge ? 4 : 2)) !== 0,
        atEase,
        pikeReady: heldHedge,
        fighting: fighting[soldier] !== 0,
        releaseTtl: releases[soldier],
        releaseAgeSeconds:
          releases[soldier] > 0 ? Math.max(0, this.releaseDuration - releases[soldier]) : 0,
      });
    }
    this.motorTravel = new Float64Array(motorTravel);
    this.tick = tick;
    this.observations = observations;
    this.facings = renderFacings;
    return { observations, facings: renderFacings };
  }
}
