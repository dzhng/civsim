import type { ArmyView, CityView } from './views';
import type { Territory } from './territory';

export interface CampaignDebugApi {
  tick(n: number): void;
  orderMove(army: number, kind: number, a: number, b: number): boolean;
  place(army: number, kind: number, a: number, b: number): void;
  orderSplit(army: number, mask: number): boolean;
  orderMerge(src: number, dst: number): boolean;
  battleReady(): number;
  currentTick(): number;
  encounterJson(id: number): string;
  armies(): ArmyView[];
  cities(): Record<string, CityView>;
  openCity(node: number): void;
  treasury(): number;
  save(): string;
  select(id: number): number;
  selected(): number;
  paused(): boolean;
  factionView(on?: boolean): boolean;
  fogOfWar(on?: boolean): boolean;
  project(wx: number, wy: number): [number, number];
  cam(x: number, y: number, scale: number): void;
  camGet(): { x: number; y: number; scale: number; pitchDeg: number };
  territoryAlpha(): number;
  visAt(x: number, y: number): number;
  cellInfo(x: number, y: number): ReturnType<Territory['infoAt']>;
  freeze(on?: boolean): void;
  terrStats(): { filled: number; total: number; labels: Territory['labels'] };
}

declare global {
  interface Window {
    __campaign?: CampaignDebugApi;
    __campaignReady?: boolean;
  }
}

export function installCampaignDebugApi(api: CampaignDebugApi) {
  window.__campaign = api;
  window.__campaignReady = true;
}

export function markCampaignReady(ready: boolean) {
  window.__campaignReady = ready;
}
