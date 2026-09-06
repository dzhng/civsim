import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import {
  ActionTimeline,
  type ActionObservation,
  type SoldierPlayback,
} from "@packages/crowd-runtime/src/actionTimeline";
import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";
import { BattleActionAdapter } from "./battleActionAdapter";
import type { BattleUnitPresentation } from "./battleUnitPresentation";
import type { BattleWorld } from "./battleWorld";

export class BattleCrowd {
  private readonly adapter: BattleActionAdapter;
  private timeline: ActionTimeline | null = null;
  private catalog: Record<number, AppearanceBundle> | null = null;
  private alive = new Float32Array(0);
  private renderPositions = new Float32Array(0);
  private renderPositionTick = -1;
  private observations: readonly ActionObservation[] = [];
  get classSpecs() {
    return this.adapter.classSpecs;
  }

  constructor(
    private world: BattleWorld,
    private presentation: BattleUnitPresentation,
  ) {
    this.adapter = new BattleActionAdapter(world.game, world.memory);
  }

  draw(
    simTick: number,
    frozen: boolean,
    alpha: number,
    frameDt: number,
    selectedUnits: number[],
  ): void {
    const assets = this.world.renderer.soldierAssets;
    if (!assets) return;
    const replaced = assets !== this.catalog;
    if (replaced) {
      // An accepted catalog replacement cannot blend samples across different rigs.
      this.catalog = assets;
      this.timeline = new ActionTimeline(assets);
    }
    const { observations, facings } = this.adapter.read(simTick);
    if (replaced || observations !== this.observations)
      this.timeline!.update(simTick, observations);
    this.observations = observations;
    const playback: SoldierPlayback[] = this.timeline!.sample(frozen ? simTick : simTick + alpha);
    this.buildPositions(simTick, frozen);
    this.presentation.update(selectedUnits);
    this.world.renderer.draw(
      this.renderPositions,
      facings,
      playback,
      this.alive,
      observations.length,
      this.world.camera,
      simTick,
      frameDt,
    );
    this.drawAttackArcs(frozen);
  }

  private buildPositions(simTick: number, frozen: boolean): void {
    const positions = this.world.positions();
    const count = this.observations.length;
    const oldCount = this.alive.length;
    if (simTick < this.renderPositionTick || count < oldCount) {
      this.alive = new Float32Array(count);
      this.renderPositions = new Float32Array(positions);
      this.renderPositionTick = simTick;
    } else if (count > oldCount) {
      this.alive = new Float32Array(count);
      const grown = new Float32Array(positions);
      grown.set(this.renderPositions);
      this.renderPositions = grown;
      if (oldCount === 0) this.renderPositionTick = simTick;
    }
    const tickDelta = Math.max(0, simTick - this.renderPositionTick);
    const update = tickDelta > 0;
    const soldierUnit = new Uint32Array(
      this.world.memory.buffer,
      this.world.game.soldier_unit_ptr(),
      count,
    );
    const unitCount = this.world.game.unit_count();
    this.presentation.beginFrame(unitCount);
    for (let soldier = 0; soldier < count; soldier++) {
      this.alive[soldier] = this.observations[soldier].alive ? 1 : 0;
      this.updatePosition(soldier, soldier * 2, positions, this.alive, frozen, update, tickDelta);
      if (this.alive[soldier])
        this.presentation.addSoldier(
          soldierUnit[soldier],
          this.renderPositions[soldier * 2],
          this.renderPositions[soldier * 2 + 1],
          unitCount,
        );
    }
    this.presentation.finishFrame(unitCount);
    if (update) this.renderPositionTick = simTick;
  }

  private updatePosition(
    soldier: number,
    position: number,
    positions: Float32Array,
    alive: Float32Array,
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
      if (!this.observations[soldier]?.alive || !this.observations[soldier].fighting) continue;
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
