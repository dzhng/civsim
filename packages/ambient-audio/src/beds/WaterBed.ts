import type { AudioMixer } from "../AudioMixer";

type WaterBand = {
  filter: BiquadFilterNode;
  gain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
};

type WaterBedNodes = {
  pinkSource: AudioBufferSourceNode;
  bands: WaterBand[];
  lowpass: BiquadFilterNode;
  highshelf: BiquadFilterNode;
  outputGain: GainNode;
  panner: StereoPannerNode;
};

type WaterTargets = {
  gain: number;
  lowpassFrequency: number;
  pan: number;
};

const PINK_SECONDS = 9;
const PINK_SEED = 240_724;
const BURBLE_SEED = 240_725;
const RAMP_SECONDS = 0.018;
const MAX_WATER_GAIN = 0.115;
const LOWPASS_CLOSED_HZ = 640;
const LOWPASS_OPEN_RANGE_HZ = 2500;
const HIGHSHELF_FREQUENCY_HZ = 1800;
const HIGHSHELF_GAIN_DB = -8;
const BAND_FREQUENCIES_HZ = [150, 235, 390, 700, 1250, 2200] as const;

// Active graph: 1 BufferSource + 6 BiquadFilter + 6 Gain + 6 Oscillator
// + 6 LFO Gain + 1 lowpass + 1 highshelf + 1 output Gain + 1 StereoPanner.
export const WATER_BED_FIXED_NODE_COUNT = 29;

export class WaterBed {
  private readonly pinkNoise: AudioBuffer;
  private proximity01 = 0;
  private panMinus1To1 = 0;
  private nodes: WaterBedNodes | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly mixer: AudioMixer,
  ) {
    this.pinkNoise = makeNoiseBuffer(ctx, PINK_SECONDS, PINK_SEED);
  }

  get activeNodes(): number {
    return this.nodes ? WATER_BED_FIXED_NODE_COUNT : 0;
  }

  start(when = this.ctx.currentTime): void {
    if (this.nodes) return;

    const pinkSource = this.ctx.createBufferSource();
    pinkSource.buffer = this.pinkNoise;
    pinkSource.loop = true;

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = LOWPASS_CLOSED_HZ;
    lowpass.Q.value = 0.5;

    const highshelf = this.ctx.createBiquadFilter();
    highshelf.type = "highshelf";
    highshelf.frequency.value = HIGHSHELF_FREQUENCY_HZ;
    highshelf.gain.value = HIGHSHELF_GAIN_DB;

    const outputGain = this.ctx.createGain();
    outputGain.gain.value = 0;

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = 0;

    const random = rng(BURBLE_SEED);
    const bands = BAND_FREQUENCIES_HZ.map((frequency, index): WaterBand => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = frequency;
      filter.Q.value = 1.1 + index * 0.55;

      const baseGain = 0.46 / (1 + index * 0.62);
      const gain = this.ctx.createGain();
      gain.gain.value = baseGain * 0.89;

      const lfo = this.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.07 + random() * 0.22;

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = baseGain * 0.21;

      pinkSource.connect(filter);
      filter.connect(gain);
      gain.connect(lowpass);
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      return { filter, gain, lfo, lfoGain };
    });

    lowpass.connect(highshelf);
    highshelf.connect(outputGain);
    outputGain.connect(panner);
    panner.connect(this.mixer.bedInput("water"));

    this.nodes = { pinkSource, bands, lowpass, highshelf, outputGain, panner };
    this.applyTargets(computeTargets(this.proximity01, this.panMinus1To1), true);

    const start = Math.max(0, when);
    pinkSource.start(start);
    for (const band of bands) band.lfo.start(start);
  }

  stop(when = this.ctx.currentTime): void {
    if (!this.nodes) return;
    const nodes = this.nodes;
    this.nodes = null;

    stopSource(nodes.pinkSource, when);
    for (const band of nodes.bands) stopSource(band.lfo, when);

    nodes.pinkSource.disconnect();
    for (const band of nodes.bands) {
      band.filter.disconnect();
      band.gain.disconnect();
      band.lfo.disconnect();
      band.lfoGain.disconnect();
    }
    nodes.lowpass.disconnect();
    nodes.highshelf.disconnect();
    nodes.outputGain.disconnect();
    nodes.panner.disconnect();
  }

  setWater(proximity01: number, panMinus1To1: number): void {
    this.proximity01 = clamp01(proximity01);
    this.panMinus1To1 = clamp(panMinus1To1, -1, 1);
    this.applyTargets(computeTargets(this.proximity01, this.panMinus1To1), false);
  }

  private applyTargets(targets: WaterTargets, immediate: boolean): void {
    if (!this.nodes) return;
    const now = this.ctx.currentTime;
    setParam(this.nodes.outputGain.gain, targets.gain, now, immediate);
    setParam(this.nodes.lowpass.frequency, targets.lowpassFrequency, now, immediate);
    setParam(this.nodes.panner.pan, targets.pan, now, immediate);
  }
}

function computeTargets(proximity01: number, panMinus1To1: number): WaterTargets {
  const proximity = clamp01(proximity01);
  const distance01 = 1 - proximity;
  const inverseDistance = proximity <= 0 ? 0 : proximity / (0.22 + distance01 * 0.78);
  const gainCurve = proximity * inverseDistance;
  return {
    gain: MAX_WATER_GAIN * gainCurve,
    lowpassFrequency: LOWPASS_CLOSED_HZ + LOWPASS_OPEN_RANGE_HZ * proximity * proximity,
    pan: clamp(panMinus1To1, -1, 1),
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

function stopSource(source: AudioScheduledSourceNode, when: number): void {
  try {
    source.stop(Math.max(0, when));
  } catch {
    // Scheduled source cleanup can race with host completion; disconnect still matters.
  }
}

function makeNoiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const random = rng(seed);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.22;
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

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
