import type { BattleCrowdPresentation } from "./battlePresentation";
import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import {
  ActionTimeline,
  type ActionObservation,
  type SoldierPlayback,
} from "@packages/crowd-runtime/src/actionTimeline";
import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";
import { BattleActionAdapter } from "./battleActionAdapter";
import { createLiveObservationSource } from "./battleViews";
import type { BattleUnitPresentation } from "./battleUnitPresentation";
import type { BattleWorld } from "./battleWorld";

/** Frame-local, read-only inputs for body-attached overlays, not command authority. */
export interface PresentedSoldiers {
  positions: Float32Array;
  alive: Float32Array;
  units: Uint32Array;
}

interface CrowdEndpoint {
  tick: number;
  positions: Float32Array;
  facings: Float32Array;
  observations: readonly ActionObservation[];
  units: Uint32Array;
  weapons: Uint8Array;
  unitInfo: Float32Array;
}

export class BattleCrowd {
  private readonly adapter: BattleActionAdapter;
  private timeline: ActionTimeline | null = null;
  private catalog: Record<number, AppearanceBundle> | null = null;
  private alive = new Float32Array(0);
  private renderPositions = new Float32Array(0);
  private renderFacings = new Float32Array(0);
  private unitInfo = new Float32Array(0);
  private left: CrowdEndpoint | null = null;
  private right: CrowdEndpoint | null = null;
  private fighting = new Uint8Array(0);
  private weapons = new Uint8Array(0);
  private units = new Uint32Array(0);
  private observations: readonly ActionObservation[] = [];
  get presented(): PresentedSoldiers {
    return { positions: this.renderPositions, alive: this.alive, units: this.units };
  }
  get classSpecs() {
    return this.adapter.classSpecs;
  }

  constructor(
    private world: BattleWorld,
    private presentation: BattleUnitPresentation,
  ) {
    this.adapter = new BattleActionAdapter(createLiveObservationSource(world.game, world.memory));
  }

  prepare(
    simTick: number,
    frozen: boolean,
    alpha: number,
    frameDt: number,
    selectedUnits: number[],
  ): BattleCrowdPresentation | null {
    const assets = this.world.renderer.soldierAssets;
    if (!assets) return null;
    const replaced = assets !== this.catalog;
    if (replaced) {
      // An accepted catalog replacement cannot blend samples across different rigs.
      this.catalog = assets;
      this.timeline = new ActionTimeline(assets);
    }
    const { observations, facings } = this.adapter.read(simTick);
    if (replaced || observations !== this.observations) {
      this.timeline!.update(simTick, observations);
      this.observe(simTick, observations, facings, replaced);
    }
    this.observations = observations;
    const tick = frozen ? simTick : Math.max(this.left!.tick, simTick - 1 + alpha);
    const playback: SoldierPlayback[] = this.timeline!.sample(tick);
    this.present(tick);
    const labels = this.presentation.build(selectedUnits, this.unitInfo);
    return {
      positions: this.renderPositions,
      facings: this.renderFacings,
      playback,
      alive: this.alive,
      count: observations.length,
      observationTick: simTick,
      frameDt,
      ...labels,
      triangles: this.attackArcs(frozen),
    };
  }

  private observe(
    tick: number,
    observations: readonly ActionObservation[],
    facings: Float32Array,
    replaced: boolean,
  ): void {
    const { game, memory } = this.world;
    const count = observations.length;
    const next: CrowdEndpoint = {
      tick,
      positions: new Float32Array(this.world.positions()),
      facings: new Float32Array(facings),
      observations: observations.map((observation) => ({ ...observation })),
      units: new Uint32Array(new Uint32Array(memory.buffer, game.soldier_unit_ptr(), count)),
      weapons: new Uint8Array(new Uint8Array(memory.buffer, game.cur_weapon_ptr(), count)),
      unitInfo: new Float32Array(this.world.unitInfo()),
    };
    const previous = this.right;
    if (replaced || !previous || tick < previous.tick || count < previous.observations.length) {
      this.left = next;
    } else if (tick === previous.tick) {
      // Same-boundary append has no past for the additions; old endpoints stay frozen.
      next.positions.set(previous.positions);
      next.facings.set(previous.facings);
      next.units.set(previous.units);
      next.weapons.set(previous.weapons);
      next.unitInfo.set(previous.unitInfo);
    } else {
      this.left = previous;
    }
    this.right = next;
    if (this.alive.length !== count) {
      this.alive = new Float32Array(count);
      this.renderPositions = new Float32Array(count * 2);
      this.renderFacings = new Float32Array(count);
      this.units = new Uint32Array(count);
      this.weapons = new Uint8Array(count);
      this.fighting = new Uint8Array(count);
    }
    if (this.unitInfo.length !== next.unitInfo.length)
      this.unitInfo = new Float32Array(next.unitInfo.length);
  }

  private present(tick: number): void {
    const left = this.left!,
      right = this.right!;
    const fraction = right.tick === left.tick ? 1 : (tick - left.tick) / (right.tick - left.tick);
    const before = tick < right.tick;
    this.unitInfo.set(right.unitInfo);
    if (before) this.unitInfo.set(left.unitInfo);
    const unitCount = this.unitInfo.length / this.world.game.unit_info_stride();
    this.presentation.beginFrame(unitCount);
    for (let soldier = 0; soldier < right.observations.length; soldier++) {
      const start = soldier < left.observations.length ? left : right;
      const discrete = before ? start : right;
      const observation = discrete.observations[soldier];
      this.alive[soldier] = observation.alive ? 1 : 0;
      this.fighting[soldier] = observation.fighting ? 1 : 0;
      this.units[soldier] = discrete.units[soldier];
      this.weapons[soldier] = discrete.weapons[soldier];
      const position = soldier * 2;
      for (let axis = 0; axis < 2; axis++)
        this.renderPositions[position + axis] =
          start.positions[position + axis] +
          (right.positions[position + axis] - start.positions[position + axis]) * fraction;
      const angle = right.facings[soldier] - start.facings[soldier];
      this.renderFacings[soldier] =
        fraction === 1
          ? right.facings[soldier]
          : start.facings[soldier] + Math.atan2(Math.sin(angle), Math.cos(angle)) * fraction;
      if (this.alive[soldier])
        this.presentation.addSoldier(
          this.units[soldier],
          this.renderPositions[soldier * 2],
          this.renderPositions[soldier * 2 + 1],
          unitCount,
        );
    }
    this.presentation.finishFrame(unitCount);
  }

  private attackArcs(frozen: boolean): Float32Array {
    const { camera, canvas, stride } = this.world;
    if (frozen || camera.zoom <= 2.5) return new Float32Array();
    const triangles: number[] = [];
    const positions = this.renderPositions;
    const facings = this.renderFacings;
    const currentWeapon = this.weapons;
    const soldierUnit = this.units;
    const info = this.unitInfo;
    const [worldX0, worldY1] = camera.screenToWorld(0, 0) ?? [-Infinity, Infinity];
    const [worldX1, worldY0] = camera.screenToWorld(canvas.width, canvas.height) ?? [
      Infinity,
      -Infinity,
    ];
    let budget = 900;
    for (let soldier = 0; soldier < this.alive.length && budget > 0; soldier++) {
      if (!this.alive[soldier] || !this.fighting[soldier]) continue;
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
      const facing = facings[soldier];
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
    return new Float32Array(triangles);
  }
}
