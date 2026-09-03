import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import { factionForTeam } from "@packages/game-renderer/src/battle/factionColors";
import { STANDARD_SIZE_TIERS } from "@packages/game-renderer/src/models/shared/standardAsset";
import type { BattleReadoutInstance } from "@packages/photoreal-renderer/src/battle/readoutLayer";
import type { BattleStandardInstance } from "@packages/photoreal-renderer/src/battle/standardLayer";
import { UNIT_CLASS_BY_KEY, UnitClass } from "./classData";
import { READOUT_GALLERY, type BannerChip } from "./readoutState";
import type { BattleWorld } from "./battleWorld";

const MISSILE_CLASS_IDS = [
  UNIT_CLASS_BY_KEY[UnitClass.Archers],
  UNIT_CLASS_BY_KEY[UnitClass.Skirmishers],
  UNIT_CLASS_BY_KEY[UnitClass.HorseArchers],
  UNIT_CLASS_BY_KEY[UnitClass.ArtilleryCrew],
] as number[];
const READOUT_SCALE = 0.8;
const READOUT_MIN_CLOTH_PX = 30;
const READOUT_TACTICAL_ZOOM = 1.1;
const GALLERY_UNIT_FOR_STATE = [2, 0, 3, 4];
const STANDARD_CLOTH_TARGET_PX = 16;
const STANDARD_MIN_SCALE = 1.6;
const STANDARD_MAX_SCALE = 5;
const STANDARD_NEAR_HIDE_PX = 260;

export class BattleUnitPresentation {
  private anchorX = new Float32Array(0);
  private anchorY = new Float32Array(0);
  private sumX = new Float32Array(0);
  private sumY = new Float32Array(0);
  private aliveCount = new Uint32Array(0);
  private readonly galleryMode = new URLSearchParams(location.search).get("test") === "readouts";

  constructor(private world: BattleWorld) {}

  beginFrame(unitCount: number): void {
    if (this.aliveCount.length < unitCount) {
      this.anchorX = new Float32Array(unitCount);
      this.anchorY = new Float32Array(unitCount);
      this.sumX = new Float32Array(unitCount);
      this.sumY = new Float32Array(unitCount);
      this.aliveCount = new Uint32Array(unitCount);
    }
    this.anchorX.fill(-Infinity, 0, unitCount);
    this.anchorY.fill(-Infinity, 0, unitCount);
    this.sumX.fill(0, 0, unitCount);
    this.sumY.fill(0, 0, unitCount);
    this.aliveCount.fill(0, 0, unitCount);
  }

  addSoldier(unit: number, x: number, y: number, unitCount: number): void {
    if (unit >= unitCount) return;
    this.sumX[unit] += x;
    this.sumY[unit] += y;
    this.aliveCount[unit]++;
  }

  finishFrame(unitCount: number): void {
    for (let unit = 0; unit < unitCount; unit++) {
      if (this.aliveCount[unit] > 0) {
        this.anchorX[unit] = this.sumX[unit] / this.aliveCount[unit];
        this.anchorY[unit] = this.sumY[unit] / this.aliveCount[unit];
      }
    }
  }

  update(selectedUnits: number[]): void {
    const { camera, game, renderer, stride } = this.world;
    const info = this.world.unitInfo();
    const selected = selectedUnits.length > 0 ? selectedUnits[0] : -1;
    const showReadouts = camera.zoom > READOUT_TACTICAL_ZOOM;
    const standards: BattleStandardInstance[] = [];
    const readouts: BattleReadoutInstance[] = [];
    for (let unit = 0; unit < game.unit_count(); unit++) {
      const offset = unit * stride;
      if (info[offset + UNIT_INFO.alive] === 0) continue;
      const anchorX =
        this.anchorX[unit] > -Infinity ? this.anchorX[unit] : info[offset + UNIT_INFO.centerX];
      const anchorY =
        this.anchorY[unit] > -Infinity ? this.anchorY[unit] : info[offset + UNIT_INFO.centerY];
      const galleryIndex = this.galleryMode ? GALLERY_UNIT_FOR_STATE.indexOf(unit) : -1;
      const gallery = galleryIndex >= 0 ? READOUT_GALLERY[galleryIndex].state : undefined;
      const isSelected = unit === selected;
      const team = info[offset + UNIT_INFO.team];
      const groundZ = renderer.heightAt(anchorX, anchorY);
      const tier = STANDARD_SIZE_TIERS["battle-unit"];
      const pxPerWorld = renderer.pxPerWorldAt(anchorX, anchorY, groundZ);
      const pxPerClothWidth = pxPerWorld * tier.clothWidth;
      const scale = standardScale(pxPerClothWidth, isSelected);
      if (pxPerClothWidth * STANDARD_MIN_SCALE > STANDARD_NEAR_HIDE_PX) continue;
      standards.push({
        unitId: unit,
        x: anchorX,
        y: anchorY,
        z: groundZ,
        yaw: camera.yaw + Math.PI / 2,
        scale,
        factionId: factionForTeam(team === 0 ? 0 : 1).id,
        selected: isSelected,
      });
      if (!showReadouts) continue;
      if (this.galleryMode && !gallery) continue;
      const chips = gallery ? gallery.chips : unitChips(info, offset);
      if (chips.length === 0) continue;
      if (!this.galleryMode && pxPerClothWidth < READOUT_MIN_CLOTH_PX) continue;
      readouts.push({
        unitId: unit,
        x: anchorX,
        y: anchorY,
        z: groundZ + tier.poleHeight * scale,
        worldPerPx: READOUT_SCALE / Math.max(0.001, pxPerWorld),
        chips,
      });
    }
    renderer.setUnitReadouts(standards, readouts);
  }
}

function standardScale(pxPerClothWidth: number, selected: boolean): number {
  const legible = STANDARD_CLOTH_TARGET_PX / Math.max(0.001, pxPerClothWidth);
  const scale = Math.min(STANDARD_MAX_SCALE, Math.max(STANDARD_MIN_SCALE, legible));
  return scale * (selected ? 1.04 : 1);
}

function unitChips(info: Float32Array, offset: number): BannerChip[] {
  const chips: BannerChip[] = [];
  const classId = info[offset + UNIT_INFO.classId];
  const mode = info[offset + UNIT_INFO.mode];
  if (info[offset + UNIT_INFO.routing] > 0.5) chips.push({ text: "ROUT", kind: "bad" });
  else if (mode === 2) chips.push({ text: "DIS", title: "disengaging" });
  else if (mode === 1) chips.push({ text: "ATK", title: "attacking" });
  if (info[offset + UNIT_INFO.charge] === 2)
    chips.push({ text: "CHG!", kind: "hot", title: "charging" });
  if (info[offset + UNIT_INFO.pursue] > 0.5)
    chips.push({ text: "PUR", title: "pursue: latch onto contact" });
  if (info[offset + UNIT_INFO.evadeAuto] > 0.5)
    chips.push({ text: "KITE", title: "kiting reflex on" });
  if (info[offset + UNIT_INFO.frameSpeed] < 0.3 && info[offset + UNIT_INFO.engaged] > 0)
    chips.push({ text: "BRC", title: "braced: planted mass" });
  if (info[offset + UNIT_INFO.stamina] < 0.35)
    chips.push({ text: "TIRED", kind: "bad", title: "winded" });
  if (info[offset + UNIT_INFO.squeezed] > 0.5)
    chips.push({ text: "SQZ", title: "squeezed into a corridor" });
  if (info[offset + UNIT_INFO.waiting] > 0.5)
    chips.push({ text: "WAIT", title: "queued behind friends" });
  if (info[offset + UNIT_INFO.pressure] > 0.55)
    chips.push({ text: "CRUSH", kind: "bad", title: "crushed in the press: no room, evade dying" });
  if (MISSILE_CLASS_IDS.includes(classId) && info[offset + UNIT_INFO.ammo] === 0)
    chips.push({ text: "AMMO!", kind: "bad", title: "quivers empty" });
  if (info[offset + UNIT_INFO.engaged] > 0)
    chips.push({
      text: `⚔${info[offset + UNIT_INFO.engaged]}`,
      kind: "hot",
      title: "men trading blows",
    });
  return chips;
}
