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

  update(input: MeadowSoundscapeInput): MeadowSoundscapeState {
    this.state = {
      windSpeed: Math.max(0, finite(input.windSpeed)),
      windGust: clamp(input.windGust, 0, 1.5),
      waterProximity: clamp01(input.waterProximity),
      waterPan: clamp(input.waterPan, -1, 1),
      grassNear: clamp01(input.grassNear),
      listenerXY: [finite(input.listenerXY[0]), finite(input.listenerXY[1])],
      dtSeconds: Math.max(0, finite(input.dtSeconds)),
    };
    return this.snapshot();
  }

  snapshot(): MeadowSoundscapeState {
    return {
      ...this.state,
      listenerXY: [this.state.listenerXY[0], this.state.listenerXY[1]],
    };
  }
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
