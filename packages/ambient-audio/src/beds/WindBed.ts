import type { AudioMixer } from "../AudioMixer";
import { clamp, clamp01 } from "../scalar";

export interface WindBedControl {
  speed: number;
  gust: number;
  grassNear: number;
}

type WindBand = {
  filter: BiquadFilterNode;
  gain: GainNode;
};

type WindBedNodes = {
  pinkSource: AudioBufferSourceNode;
  whiteSource: AudioBufferSourceNode;
  low: WindBand;
  mid: WindBand;
  hiss: WindBand;
  whis: WindBand;
  rustleFilter: BiquadFilterNode;
  rustleGain: GainNode;
};

type WindTargets = {
  lowGain: number;
  midGain: number;
  hissGain: number;
  whisGain: number;
  midFrequency: number;
  hissFrequency: number;
  rustleGain: number;
};

const PINK_SECONDS = 9;
const WHITE_SECONDS = 7;
const PINK_SEED = 4242;
const WHITE_SEED = 1234;
const RAMP_SECONDS = 0.018;

// Active graph: 2 BufferSource + 5 BiquadFilter + 5 Gain nodes.
export const WIND_BED_FIXED_NODE_COUNT = 12;

export class WindBed {
  private readonly pinkNoise: AudioBuffer;
  private readonly whiteNoise: AudioBuffer;
  private control: WindBedControl = { speed: 0, gust: 0, grassNear: 0 };
  private nodes: WindBedNodes | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly mixer: AudioMixer,
  ) {
    this.pinkNoise = makeNoiseBuffer(ctx, PINK_SECONDS, true, PINK_SEED);
    this.whiteNoise = makeNoiseBuffer(ctx, WHITE_SECONDS, false, WHITE_SEED);
  }

  get activeNodes(): number {
    return this.nodes ? WIND_BED_FIXED_NODE_COUNT : 0;
  }

  start(when = this.ctx.currentTime): void {
    if (this.nodes) return;

    const pinkSource = this.ctx.createBufferSource();
    pinkSource.buffer = this.pinkNoise;
    pinkSource.loop = true;

    const low = this.createBand("lowpass", 150, 0.8);
    const mid = this.createBand("bandpass", 520, 0.7);
    const hiss = this.createBand("bandpass", 2600, 0.9);
    const whis = this.createBand("bandpass", 1450, 8.0);
    for (const band of [low, mid, hiss, whis]) {
      pinkSource.connect(band.filter);
      band.filter.connect(band.gain);
      band.gain.connect(this.mixer.bedInput("wind"));
    }

    const whiteSource = this.ctx.createBufferSource();
    whiteSource.buffer = this.whiteNoise;
    whiteSource.loop = true;

    const rustleFilter = this.ctx.createBiquadFilter();
    rustleFilter.type = "bandpass";
    rustleFilter.frequency.value = 4200;
    rustleFilter.Q.value = 0.6;
    const rustleGain = this.ctx.createGain();
    whiteSource.connect(rustleFilter);
    rustleFilter.connect(rustleGain);
    rustleGain.connect(this.mixer.bedInput("grass"));

    this.nodes = { pinkSource, whiteSource, low, mid, hiss, whis, rustleFilter, rustleGain };
    this.applyTargets(computeTargets(this.control), true);
    pinkSource.start(Math.max(0, when));
    whiteSource.start(Math.max(0, when));
  }

  stop(when = this.ctx.currentTime): void {
    if (!this.nodes) return;
    const nodes = this.nodes;
    this.nodes = null;

    stopSource(nodes.pinkSource, when);
    stopSource(nodes.whiteSource, when);

    for (const node of [
      nodes.pinkSource,
      nodes.whiteSource,
      nodes.low.filter,
      nodes.low.gain,
      nodes.mid.filter,
      nodes.mid.gain,
      nodes.hiss.filter,
      nodes.hiss.gain,
      nodes.whis.filter,
      nodes.whis.gain,
      nodes.rustleFilter,
      nodes.rustleGain,
    ]) {
      node.disconnect();
    }
  }

  setWind(control: WindBedControl): void {
    this.control = {
      speed: Math.max(0, finite(control.speed)),
      gust: clamp(finite(control.gust), 0, 1.5),
      grassNear: clamp01(control.grassNear),
    };
    this.applyTargets(computeTargets(this.control), false);
  }

  private createBand(type: BiquadFilterType, frequency: number, q: number): WindBand {
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    return { filter, gain };
  }

  private applyTargets(targets: WindTargets, immediate: boolean): void {
    if (!this.nodes) return;
    const now = this.ctx.currentTime;
    setParam(this.nodes.low.gain.gain, targets.lowGain, now, immediate);
    setParam(this.nodes.mid.gain.gain, targets.midGain, now, immediate);
    setParam(this.nodes.hiss.gain.gain, targets.hissGain, now, immediate);
    setParam(this.nodes.whis.gain.gain, targets.whisGain, now, immediate);
    setParam(this.nodes.mid.filter.frequency, targets.midFrequency, now, immediate);
    setParam(this.nodes.hiss.filter.frequency, targets.hissFrequency, now, immediate);
    setParam(this.nodes.rustleGain.gain, targets.rustleGain, now, immediate);
  }
}

function computeTargets(control: WindBedControl): WindTargets {
  const s = Math.max(0, finite(control.speed));
  const gust = clamp(finite(control.gust), 0, 1.5);
  const grassNear = clamp01(control.grassNear);
  return {
    lowGain: 0.035 + 0.052 * clamp(s / 6, 0, 1.6),
    midGain: 0.014 + 0.048 * clamp(s / 5, 0, 1.7),
    hissGain: 0.004 + 0.03 * clamp((s - 0.6) / 5, 0, 1.6),
    whisGain: 0.028 * clamp((s - 3.4) / 4.0, 0, 1) * clamp(gust, 0, 1.4),
    midFrequency: 420 + 190 * clamp(s / 6, 0, 1.5),
    hissFrequency: 2100 + 1900 * clamp(s / 6, 0, 1.5),
    rustleGain: 0.006 + 0.036 * clamp((s - 0.4) / 4.5, 0, 1.5) * grassNear,
  };
}

function setParam(param: AudioParam, value: number, now: number, immediate: boolean): void {
  param.cancelScheduledValues(now);
  if (immediate) {
    param.setValueAtTime(value, now);
    return;
  }
  param.setTargetAtTime(value, now, RAMP_SECONDS);
}

function stopSource(source: AudioBufferSourceNode, when: number): void {
  try {
    source.stop(Math.max(0, when));
  } catch {
    // BufferSourceNode stop throws if a host already ended it; cleanup still matters.
  }
}

function makeNoiseBuffer(
  ctx: BaseAudioContext,
  seconds: number,
  pink: boolean,
  seed: number,
): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const random = rng(seed);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = random() * 2 - 1;
    if (pink) {
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.22;
    } else {
      data[i] = white * 0.42;
    }
  }
  return buffer;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}


