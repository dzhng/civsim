import type { WindBed, WindBedControl } from "./beds/WindBed";

export interface MeadowSoundscapeInput {
  windSpeed: number;
  windGust: number;
  waterProximity: number;
  waterPan: number;
  grassNear: number;
  listenerXY: [number, number];
  dtSeconds: number;
}

export interface MeadowSoundscapeState {
  windSpeed: number;
  windGust: number;
  waterProximity: number;
  waterPan: number;
  grassNear: number;
  listenerXY: [number, number];
  dtSeconds: number;
}

export const WIND_BED_DIRECTOR_MAPPING = {
  maxWindSpeed: 12,
  maxWindGust: 1.5,
  maxGrassNear: 1,
} as const;

export class AmbientAudioDirector {
  private state: MeadowSoundscapeState = {
    windSpeed: 0,
    windGust: 0,
    waterProximity: 0,
    waterPan: 0,
    grassNear: 0,
    listenerXY: [0, 0],
    dtSeconds: 0,
  };

  constructor(private readonly windBed?: WindBed) {}

  update(input: MeadowSoundscapeInput): MeadowSoundscapeState {
    this.state = {
      windSpeed: Math.max(0, finite(input.windSpeed)),
      windGust: clamp(input.windGust, 0, WIND_BED_DIRECTOR_MAPPING.maxWindGust),
      waterProximity: clamp01(input.waterProximity),
      waterPan: clamp(input.waterPan, -1, 1),
      grassNear: clamp(input.grassNear, 0, WIND_BED_DIRECTOR_MAPPING.maxGrassNear),
      listenerXY: [finite(input.listenerXY[0]), finite(input.listenerXY[1])],
      dtSeconds: Math.max(0, finite(input.dtSeconds)),
    };
    this.windBed?.setWind(mapWindBedControl(this.state));
    return this.snapshot();
  }

  snapshot(): MeadowSoundscapeState {
    return {
      ...this.state,
      listenerXY: [this.state.listenerXY[0], this.state.listenerXY[1]],
    };
  }
}

export function mapWindBedControl(state: MeadowSoundscapeState): WindBedControl {
  return {
    speed: clamp(finite(state.windSpeed), 0, WIND_BED_DIRECTOR_MAPPING.maxWindSpeed),
    gust: clamp(finite(state.windGust), 0, WIND_BED_DIRECTOR_MAPPING.maxWindGust),
    grassNear: clamp(finite(state.grassNear), 0, WIND_BED_DIRECTOR_MAPPING.maxGrassNear),
  };
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
