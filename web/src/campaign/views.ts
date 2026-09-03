import { type Campaign, type InitOutput } from "../wasm/game_wasm.js";
import type { ArmyView, CityView } from "@packages/game-renderer/src/campaign/entityFrame";

export interface CampaignViews {
  armies: ArmyView[];
  cities: Map<number, CityView>;
  roadLevels: Uint8Array;
  ownerHash: number;
  stackUnitCap: number;
}

export function readCampaignViews(
  campaign: Campaign,
  wasm: InitOutput,
  edgeCount: number,
): CampaignViews {
  const mem = wasm.memory.buffer;
  const an = campaign.army_count();
  const armyStride = campaign.army_info_stride();
  const baseStride = campaign.army_info_base_stride();
  const classSlots = campaign.army_class_slots();
  const af = new Float32Array(mem, campaign.army_info_ptr(), an * armyStride);
  const armies: ArmyView[] = [];
  for (let i = 0; i < an; i++) {
    const o = i * armyStride;
    armies.push({
      id: af[o],
      x: af[o + 1],
      y: af[o + 2],
      faction: af[o + 3],
      soldiers: af[o + 4],
      stance: af[o + 5],
      pieKind: af[o + 6],
      pieFrac: af[o + 7],
      marching: af[o + 8] > 0,
      encounter: af[o + 9],
      moraleCap: af[o + 10],
      mine: af[o + 11] > 0,
      unitCount: af[o + 12],
      roster: Array.from(af.subarray(o + baseStride, o + baseStride + classSlots)),
      unitsByClass: Array.from(af.subarray(o + baseStride + classSlots, o + armyStride)),
    });
  }

  const roadLevels = new Uint8Array(mem, campaign.road_levels_ptr(), edgeCount);
  const cn = campaign.city_count();
  const cityStride = campaign.city_info_stride();
  const cf = new Float32Array(mem, campaign.city_info_ptr(), cn * cityStride);
  const cities = new Map<number, CityView>();
  let ownerHash = 0;
  for (let i = 0; i < cn; i++) {
    const o = i * cityStride;
    cities.set(cf[o], { owner: cf[o + 1], garrison: cf[o + 2], queue: cf[o + 3] });
    ownerHash = (Math.imul(ownerHash, 31) + cf[o] * 7 + cf[o + 1]) | 0;
  }

  return { armies, cities, roadLevels, ownerHash, stackUnitCap: campaign.army_stack_unit_cap() };
}
