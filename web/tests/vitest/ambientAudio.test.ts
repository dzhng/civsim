// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";

import {
  AmbientAudioDirector,
  AmbientAudioEngine,
  BirdScheduler,
  BIRD_INTERVAL_FLOOR_SECONDS,
  MAX_CONCURRENT_BIRD_VOICES,
  VALLEY_EARLY_REFLECTION_SECONDS,
  VALLEY_REVERB_SECONDS,
  VALLEY_REVERB_SEED,
  VALLEY_REVERB_WET_GAIN,
  WATER_BED_FIXED_NODE_COUNT,
  WIND_BED_DIRECTOR_MAPPING,
  WIND_BED_FIXED_NODE_COUNT,
  buildValleyImpulseResponse,
  type AudioMixer,
  type AmbientOfflineAudioContextConstructor,
  type WindBedControl,
} from "@packages/ambient-audio/src/index.ts";
import { sampleBattleWind } from "@packages/game-renderer/src/battle/windSignal.ts";

const OfflineCtor = OfflineAudioContext as unknown as AmbientOfflineAudioContextConstructor;

describe("AmbientAudioEngine", () => {
  it("builds the meadow master graph shape", () => {
    const engine = createOfflineEngine();
    const graph = engine.inspectGraph();

    expect(graph.masterChain).toEqual([
      "masterGain",
      "lowshelf",
      "highshelf",
      "compressor",
      "destination",
    ]);
    expect(graph.connections).toEqual(
      expect.arrayContaining([
        "masterGain->lowshelf",
        "lowshelf->highshelf",
        "highshelf->compressor",
        "compressor->destination",
        "reverbInput->reverbConvolver",
        "reverbConvolver->reverbWet",
        "reverbWet->masterGain",
      ]),
    );
    expect(graph.lowshelf).toMatchObject({ frequency: 220, gain: 2.5 });
    expect(graph.highshelf).toMatchObject({ frequency: 9000, gain: -3 });
    expect(graph.compressor.threshold).toBeCloseTo(-16, 4);
    expect(graph.compressor.knee).toBeCloseTo(22, 4);
    expect(graph.compressor.ratio).toBeCloseTo(3.2, 4);
    expect(graph.reverb.wetGain).toBeCloseTo(VALLEY_REVERB_WET_GAIN, 4);
    expect(graph.reverb.bufferDuration).toBeCloseTo(VALLEY_REVERB_SECONDS, 3);
    expect(graph.sendLevels.wind).toBeCloseTo(0.32, 4);
    expect(graph.sendLevels.water).toBeCloseTo(0.16, 4);
    expect(graph.sendLevels.birds).toBeCloseTo(0.18, 4);
    expect(graph.hasReverbSendBus).toBe(true);
  });

  it("builds deterministic valley impulse responses for a seed", () => {
    const first = buildValleyImpulseResponse(
      createOfflineContext(2, VALLEY_REVERB_SECONDS),
      20_260_722,
    );
    const second = buildValleyImpulseResponse(
      createOfflineContext(2, VALLEY_REVERB_SECONDS),
      20_260_722,
    );
    const other = buildValleyImpulseResponse(
      createOfflineContext(2, VALLEY_REVERB_SECONDS),
      20_260_723,
    );

    expect(first.numberOfChannels).toBe(2);
    expect(hashBuffer(first)).toBe(hashBuffer(second));
    expect(hashBuffer(first)).not.toBe(hashBuffer(other));
  });

  it("shapes the valley impulse as decaying noise with early reflection energy", () => {
    const ir = buildValleyImpulseResponse(
      createOfflineContext(2, VALLEY_REVERB_SECONDS),
      VALLEY_REVERB_SEED,
    );
    const ch0 = ir.getChannelData(0);
    const firstHalfSecond = windowedRms(ch0, ir.sampleRate, 0, 0.5);
    const lastHalfSecond = windowedRms(ch0, ir.sampleRate, VALLEY_REVERB_SECONDS - 0.5, 0.5);
    const early = windowedRms(ch0, ir.sampleRate, 0, VALLEY_EARLY_REFLECTION_SECONDS);
    const first120Ms = windowedRms(ch0, ir.sampleRate, 0, 0.12);

    expect(firstHalfSecond).toBeGreaterThan(lastHalfSecond * 18);
    expect(early).toBeGreaterThan(0.05);
    expect(first120Ms).toBeGreaterThan(0.05);
  });

  it("routes mute through the mixer-owned master gain", () => {
    const engine = createOfflineEngine({ masterVolume: 0.72 });

    expect(engine.masterGain.gain.value).toBeCloseTo(0.72, 4);
    engine.mixer.setMuted(true);

    expect(engine.mixer.targetMasterGain).toBeCloseTo(0, 6);
    const mutedAtCreate = createOfflineEngine({ masterVolume: 0.72, muted: true });
    expect(mutedAtCreate.masterGain.gain.value).toBeCloseTo(0, 6);
  });

  it("renders the test tone as audible unmuted and silent muted", async () => {
    const unmuted = await renderTestTone(false);
    const muted = await renderTestTone(true);

    expect(unmuted).toBeGreaterThan(0.015);
    expect(muted).toBeLessThan(0.0002);
  });

  it("renders deterministic wind energy across low, mid, and high bands", async () => {
    const rendered = await renderWindBed({ windSpeed: 6, windGust: 1.1, grassNear: 1 });

    expect(rendered.activeNodesBeforeRender).toBe(WIND_BED_FIXED_NODE_COUNT);
    expect(filteredRms(rendered.samples, rendered.sampleRate, "lowpass", 180, 0.7)).toBeGreaterThan(
      0.0005,
    );
    expect(
      filteredRms(rendered.samples, rendered.sampleRate, "bandpass", 560, 0.9),
    ).toBeGreaterThan(0.00025);
    expect(
      filteredRms(rendered.samples, rendered.sampleRate, "bandpass", 3200, 0.9),
    ).toBeGreaterThan(0.00025);
  });

  it("raises high-band wind energy materially with wind speed", async () => {
    const low = await renderWindBed({ windSpeed: 2, windGust: 1.1, grassNear: 1 });
    const high = await renderWindBed({ windSpeed: 9, windGust: 1.1, grassNear: 1 });

    const lowHighBand = filteredRms(low.samples, low.sampleRate, "bandpass", 3200, 0.9);
    const highHighBand = filteredRms(high.samples, high.sampleRate, "bandpass", 3200, 0.9);
    expect(highHighBand).toBeGreaterThan(lowHighBand * 1.45);
  });

  it("renders the wind bed silent when muted", async () => {
    const rendered = await renderWindBed({
      windSpeed: 9,
      windGust: 1.2,
      grassNear: 1,
      muted: true,
      windReverbSend: 1,
    });

    expect(rms(rendered.samples)).toBeLessThan(0.0002);
  });

  it("renders a decay tail after the wind bed source stops when the send is open", async () => {
    const dry = await renderShortWindSourceTail(0);
    const wet = await renderShortWindSourceTail(1);

    expect(wet.tailRms).toBeGreaterThan(0.0008);
    expect(wet.tailRms).toBeGreaterThan(dry.tailRms * 20 + 0.0006);
  });

  it("renders the wind bed silent after stop", async () => {
    const rendered = await renderWindBed({
      windSpeed: 9,
      windGust: 1.2,
      grassNear: 1,
      stopBeforeRender: true,
    });

    expect(rendered.activeNodesBeforeRender).toBe(0);
    expect(rms(rendered.samples)).toBeLessThan(0.0002);
  });

  it("raises water RMS monotonically with proximity and scopes out at zero", async () => {
    const silent = await renderWaterBed({ waterProximity: 0, waterPan: 0 });
    const middle = await renderWaterBed({ waterProximity: 0.5, waterPan: 0 });
    const close = await renderWaterBed({ waterProximity: 1, waterPan: 0 });

    expect(silent.activeNodesBeforeRender).toBe(WATER_BED_FIXED_NODE_COUNT);
    expect(rms(stereoMixdown(silent))).toBeLessThan(0.0002);
    expect(rms(stereoMixdown(middle))).toBeGreaterThan(0.0006);
    expect(rms(stereoMixdown(close))).toBeGreaterThan(rms(stereoMixdown(middle)) * 1.9);
  });

  it("pans water toward the louder side", async () => {
    const left = await renderWaterBed({ waterProximity: 1, waterPan: -1 });
    const right = await renderWaterBed({ waterProximity: 1, waterPan: 1 });

    expect(rms(left.left)).toBeGreaterThan(rms(left.right) * 2);
    expect(rms(right.right)).toBeGreaterThan(rms(right.left) * 2);
  });

  it("renders the water bed silent when muted", async () => {
    const rendered = await renderWaterBed({
      waterProximity: 1,
      waterPan: 0,
      muted: true,
      waterReverbSend: 1,
    });

    expect(rms(stereoMixdown(rendered))).toBeLessThan(0.0002);
  });

  it("renders the water bed silent after stop", async () => {
    const rendered = await renderWaterBed({
      waterProximity: 1,
      waterPan: 0,
      stopBeforeRender: true,
    });

    expect(rendered.activeNodesBeforeRender).toBe(0);
    expect(rms(stereoMixdown(rendered))).toBeLessThan(0.0002);
  });

  it("drives deterministic wind bed automation from battle wind samples", () => {
    const first = recordBattleWindSweep();
    const second = recordBattleWindSweep();

    expect(first.controls).toEqual(second.controls);
    expect(first.targets).toEqual(second.targets);
    expect(variance(first.controls.map((control) => control.speed))).toBeGreaterThan(0);
    expect(variance(first.controls.map((control) => control.gust))).toBeGreaterThan(0);
    expect(variance(targetValues(first.targets, "lowGain"))).toBeGreaterThan(0);
    expect(variance(targetValues(first.targets, "midGain"))).toBeGreaterThan(0);
    expect(variance(targetValues(first.targets, "hissGain"))).toBeGreaterThan(0);

    for (const control of first.controls) {
      expect(control.speed).toBeGreaterThanOrEqual(0);
      expect(control.speed).toBeLessThanOrEqual(WIND_BED_DIRECTOR_MAPPING.maxWindSpeed);
      expect(control.gust).toBeGreaterThanOrEqual(0);
      expect(control.gust).toBeLessThanOrEqual(WIND_BED_DIRECTOR_MAPPING.maxWindGust);
      expect(control.grassNear).toBeGreaterThanOrEqual(0);
      expect(control.grassNear).toBeLessThanOrEqual(WIND_BED_DIRECTOR_MAPPING.maxGrassNear);
    }
  });

  it("schedules 60 simulated seconds of birds without breaking the interval floor or voice cap", () => {
    const ctx = new FakeBirdAudioContext();
    const scheduler = new BirdScheduler(ctx as unknown as BaseAudioContext, fakeBirdMixer(ctx), {
      seed: 25,
      initialDelaySeconds: 0,
      intervalRangeSeconds: 0,
      lookAheadSeconds: 60,
      maxConcurrentVoices: MAX_CONCURRENT_BIRD_VOICES,
    });

    for (let t = 0; t <= 60; t += 0.1) {
      ctx.currentTime = t;
      scheduler.tick();
    }

    const schedule = scheduler.inspectSchedule();
    expect(schedule.scheduledStarts.length).toBeGreaterThan(8);
    expect(schedule.maxObservedActiveVoices).toBeLessThanOrEqual(MAX_CONCURRENT_BIRD_VOICES);
    for (let i = 1; i < schedule.scheduledStarts.length; i++) {
      expect(schedule.scheduledStarts[i] - schedule.scheduledStarts[i - 1]).toBeGreaterThanOrEqual(
        BIRD_INTERVAL_FLOOR_SECONDS - 1e-6,
      );
    }
  });

  it("keeps the slice 41 audio CPU budget bounded through a 60s bird storm", () => {
    const bedFloor = WIND_BED_FIXED_NODE_COUNT + WATER_BED_FIXED_NODE_COUNT;
    expect(bedFloor).toBe(41);
    const ctx = new FakeBirdAudioContext();
    const scheduler = new BirdScheduler(ctx as unknown as BaseAudioContext, fakeBirdMixer(ctx), {
      seed: 41,
      initialDelaySeconds: 0,
      intervalRangeSeconds: 0,
      lookAheadSeconds: 2,
      maxConcurrentVoices: MAX_CONCURRENT_BIRD_VOICES,
    });

    for (let t = 0; t <= 60; t += 0.1) {
      ctx.currentTime = t;
      scheduler.tick();
      expect(bedFloor + scheduler.activeNodes).toBeGreaterThanOrEqual(bedFloor);
    }

    const storm = scheduler.inspectSchedule();
    expect(storm.scheduledStarts.length).toBeGreaterThan(30);
    expect(storm.maxObservedActiveVoices).toBeLessThanOrEqual(MAX_CONCURRENT_BIRD_VOICES);
    expect(storm.maxObservedActiveNodes).toBeGreaterThan(0);
    expect(storm.maxObservedActiveNodes).toBeLessThanOrEqual(MAX_CONCURRENT_BIRD_VOICES * 13);

    scheduler.setEnabled(false);
    ctx.currentTime = 62;
    scheduler.tick();
    expect(bedFloor + scheduler.activeNodes).toBe(bedFloor);

    const engine = createOfflineEngine();
    engine.windBed.start(0);
    engine.waterBed.start(0);
    const director = new AmbientAudioDirector(
      engine.windBed,
      engine.waterBed,
      engine.birdScheduler,
    );

    const samples = 1000;
    const started = globalThis.performance.now();
    for (let i = 0; i < samples; i++) {
      director.update({
        windSpeed: (i % 12) + 0.25,
        windGust: (i % 7) / 6,
        grassNear: (i % 5) / 4,
        waterProximity: (i % 10) / 9,
        waterPan: Math.sin(i * 0.07),
        birds: true,
        birdIntensity: 1,
        listenerXY: [i * 0.5, -650 + i * 0.25],
        dtSeconds: 1 / 60,
      });
    }

    const averageUpdateMs = (globalThis.performance.now() - started) / samples;
    expect(averageUpdateMs).toBeLessThan(0.1);
  });

  it("renders at least one bird phrase with transient peaks above the noise floor", async () => {
    const sampleRate = 44_100;
    const seconds = 2.5;
    const engine = AmbientAudioEngine.create({
      AudioContext: OfflineCtor,
      audioContextArgs: [1, sampleRate * seconds, sampleRate],
      settings: {
        masterVolume: 1,
        bedVolumes: { wind: 0, grass: 0, water: 0, birds: 1 },
        reverbSendLevels: { birds: 0 },
      },
      birds: { seed: 250, initialDelaySeconds: 0.1, lookAheadSeconds: 0.25 },
    });

    engine.birdScheduler.tick();
    const buffer = await (engine.ctx as unknown as OfflineAudioContext).startRendering();
    const samples = buffer.getChannelData(0);

    expect(peakAbs(samples)).toBeGreaterThan(0.01);
    expect(windowedRms(samples, sampleRate, 0, 0.08)).toBeLessThan(0.0002);
  });

  it("does not schedule birds while disabled", () => {
    const sampleRate = 44_100;
    const engine = AmbientAudioEngine.create({
      AudioContext: OfflineCtor,
      audioContextArgs: [1, sampleRate, sampleRate],
      settings: { birds: false },
      birds: {
        initialDelaySeconds: 0,
        lookAheadSeconds: 60,
      },
    });

    for (let t = 0; t <= 60; t += 1) {
      engine.birdScheduler.tick(t);
    }

    expect(engine.activeVoices).toBe(0);
    expect(engine.birdScheduler.inspectSchedule().scheduledStarts).toEqual([]);
  });
});

type ScheduledWindTarget = {
  param: string;
  value: number;
  startTime: number;
  timeConstant: number;
};

type InspectableWindBed = {
  setWind: (control: WindBedControl) => void;
  nodes: {
    low: { gain: GainNode };
    mid: { gain: GainNode };
    hiss: { gain: GainNode };
    whis: { gain: GainNode };
    rustleGain: GainNode;
  } | null;
};

function recordBattleWindSweep(): {
  controls: WindBedControl[];
  targets: ScheduledWindTarget[];
} {
  const engine = createOfflineEngine();
  const windBed = engine.windBed as unknown as InspectableWindBed;
  const controls: WindBedControl[] = [];
  const targets: ScheduledWindTarget[] = [];
  const originalSetWind = windBed.setWind.bind(engine.windBed);
  windBed.setWind = (control) => {
    originalSetWind(control);
    controls.push({ ...control });
  };

  engine.windBed.start(0);
  captureGainTargets(windBed, targets);
  const director = new AmbientAudioDirector(engine.windBed);

  for (let t = 0; t < 30; t += 0.5) {
    const wind = sampleBattleWind(0, -650, t);
    director.update({
      windSpeed: wind.speed,
      windGust: wind.gust,
      grassNear: 1,
      waterProximity: 0,
      waterPan: 0,
      listenerXY: [0, -650],
      dtSeconds: 0.5,
    });
  }

  return { controls, targets };
}

function captureGainTargets(windBed: InspectableWindBed, targets: ScheduledWindTarget[]): void {
  const nodes = windBed.nodes;
  expect(nodes).not.toBeNull();
  if (!nodes) return;

  patchSetTarget(nodes.low.gain.gain, "lowGain", targets);
  patchSetTarget(nodes.mid.gain.gain, "midGain", targets);
  patchSetTarget(nodes.hiss.gain.gain, "hissGain", targets);
  patchSetTarget(nodes.whis.gain.gain, "whisGain", targets);
  patchSetTarget(nodes.rustleGain.gain, "rustleGain", targets);
}

function patchSetTarget(param: AudioParam, name: string, targets: ScheduledWindTarget[]): void {
  const original = param.setTargetAtTime.bind(param);
  param.setTargetAtTime = ((value: number, startTime: number, timeConstant: number) => {
    targets.push({ param: name, value, startTime, timeConstant });
    return original(value, startTime, timeConstant);
  }) as AudioParam["setTargetAtTime"];
}

function targetValues(targets: ScheduledWindTarget[], param: string): number[] {
  return targets.filter((target) => target.param === param).map((target) => target.value);
}

function createOfflineEngine(
  settings: Parameters<typeof AmbientAudioEngine.create>[0]["settings"] = {},
) {
  const sampleRate = 44_100;
  return AmbientAudioEngine.create({
    AudioContext: OfflineCtor,
    audioContextArgs: [1, sampleRate, sampleRate],
    settings,
  });
}

function createOfflineContext(channels: number, seconds: number): OfflineAudioContext {
  const sampleRate = 44_100;
  return new OfflineAudioContext(channels, Math.floor(sampleRate * seconds), sampleRate);
}

async function renderTestTone(muted: boolean): Promise<number> {
  const sampleRate = 44_100;
  const seconds = 1;
  const engine = AmbientAudioEngine.create({
    AudioContext: OfflineCtor,
    audioContextArgs: [1, sampleRate * seconds, sampleRate],
    settings: { masterVolume: 0.75, muted },
  });
  engine.playTestTone({ when: 0.1, durationSeconds: 0.35, level: 0.45 });
  const buffer = await (engine.ctx as unknown as OfflineAudioContext).startRendering();
  return rms(buffer.getChannelData(0));
}

async function renderWindBed(options: {
  windSpeed: number;
  windGust: number;
  grassNear: number;
  muted?: boolean;
  stopBeforeRender?: boolean;
  windReverbSend?: number;
}): Promise<{ samples: Float32Array; sampleRate: number; activeNodesBeforeRender: number }> {
  const sampleRate = 44_100;
  const seconds = 1.25;
  const engine = AmbientAudioEngine.create({
    AudioContext: OfflineCtor,
    audioContextArgs: [1, Math.floor(sampleRate * seconds), sampleRate],
    settings: { masterVolume: 0.75, muted: options.muted ?? false },
  });
  if (options.windReverbSend !== undefined) {
    engine.mixer.setSendLevel("wind", options.windReverbSend);
  }
  const director = new AmbientAudioDirector(engine.windBed);

  engine.windBed.start(0);
  director.update({
    windSpeed: options.windSpeed,
    windGust: options.windGust,
    grassNear: options.grassNear,
    waterProximity: 0,
    waterPan: 0,
    listenerXY: [0, 0],
    dtSeconds: 1 / 60,
  });
  if (options.stopBeforeRender) engine.windBed.stop(0);

  const activeNodesBeforeRender = engine.activeNodes;
  const buffer = await (engine.ctx as unknown as OfflineAudioContext).startRendering();
  return { samples: buffer.getChannelData(0), sampleRate, activeNodesBeforeRender };
}

async function renderWaterBed(options: {
  waterProximity: number;
  waterPan: number;
  muted?: boolean;
  stopBeforeRender?: boolean;
  waterReverbSend?: number;
}): Promise<{
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  activeNodesBeforeRender: number;
}> {
  const sampleRate = 44_100;
  const seconds = 1.25;
  const engine = AmbientAudioEngine.create({
    AudioContext: OfflineCtor,
    audioContextArgs: [2, Math.floor(sampleRate * seconds), sampleRate],
    settings: {
      masterVolume: 0.75,
      muted: options.muted ?? false,
      reverbSendLevels: { water: options.waterReverbSend ?? 0 },
    },
  });
  const director = new AmbientAudioDirector(engine.windBed, engine.waterBed);

  engine.waterBed.start(0);
  director.update({
    windSpeed: 0,
    windGust: 0,
    grassNear: 0,
    waterProximity: options.waterProximity,
    waterPan: options.waterPan,
    listenerXY: [0, 0],
    dtSeconds: 1 / 60,
  });
  if (options.stopBeforeRender) engine.waterBed.stop(0);

  const activeNodesBeforeRender = engine.activeNodes;
  const buffer = await (engine.ctx as unknown as OfflineAudioContext).startRendering();
  return {
    left: buffer.getChannelData(0),
    right: buffer.getChannelData(1),
    sampleRate,
    activeNodesBeforeRender,
  };
}

async function renderShortWindSourceTail(windReverbSend: number): Promise<{ tailRms: number }> {
  const sampleRate = 44_100;
  const seconds = 1.4;
  const engine = AmbientAudioEngine.create({
    AudioContext: OfflineCtor,
    audioContextArgs: [1, Math.floor(sampleRate * seconds), sampleRate],
    settings: {
      masterVolume: 0.75,
      reverbSendLevels: { wind: windReverbSend },
    },
  });
  const source = engine.ctx.createBufferSource();
  source.buffer = makeShortWindBuffer(engine.ctx, 0.5);
  const gain = engine.ctx.createGain();
  gain.gain.value = 0.18;
  source.connect(gain);
  gain.connect(engine.mixer.bedInput("wind"));
  source.start(0);
  source.stop(0.5);

  const buffer = await (engine.ctx as unknown as OfflineAudioContext).startRendering();
  const samples = buffer.getChannelData(0);
  return { tailRms: windowedRms(samples, sampleRate, 0.72, 0.45) };
}

function makeShortWindBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let state = 12_345;
  for (let i = 0; i < data.length; i++) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) | 0;
    data[i] = (((state >>> 0) / 4294967296) * 2 - 1) * 0.5;
  }
  return buffer;
}

function hashBuffer(buffer: AudioBuffer): string {
  let hash = 0x811c9dc5;
  const word = new DataView(new ArrayBuffer(4));
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (const sample of samples) {
      word.setFloat32(0, sample, true);
      for (let byte = 0; byte < 4; byte++) {
        hash ^= word.getUint8(byte);
        hash = Math.imul(hash, 0x01000193);
      }
    }
  }
  return (hash >>> 0).toString(16);
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

function stereoMixdown(rendered: { left: Float32Array; right: Float32Array }): Float32Array {
  const out = new Float32Array(Math.min(rendered.left.length, rendered.right.length));
  for (let i = 0; i < out.length; i++) {
    out[i] = (rendered.left[i] + rendered.right[i]) * 0.5;
  }
  return out;
}

function variance(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function windowedRms(
  samples: Float32Array,
  sampleRate: number,
  startSeconds: number,
  durationSeconds: number,
): number {
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const end = Math.min(samples.length, Math.floor((startSeconds + durationSeconds) * sampleRate));
  let sum = 0;
  let count = 0;
  for (let i = start; i < end; i++) {
    sum += samples[i] * samples[i];
    count++;
  }
  return Math.sqrt(sum / Math.max(1, count));
}

function filteredRms(
  samples: Float32Array,
  sampleRate: number,
  type: "lowpass" | "bandpass",
  frequency: number,
  q: number,
): number {
  const coefficients = biquadCoefficients(type, frequency, q, sampleRate);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  let sum = 0;
  let counted = 0;
  const warmup = Math.floor(sampleRate * 0.08);
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y =
      coefficients.b0 * x +
      coefficients.b1 * x1 +
      coefficients.b2 * x2 -
      coefficients.a1 * y1 -
      coefficients.a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    if (i >= warmup) {
      sum += y * y;
      counted++;
    }
  }
  return Math.sqrt(sum / counted);
}

function biquadCoefficients(
  type: "lowpass" | "bandpass",
  frequency: number,
  q: number,
  sampleRate: number,
): { b0: number; b1: number; b2: number; a1: number; a2: number } {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const sin = Math.sin(omega);
  const cos = Math.cos(omega);
  const alpha = sin / (2 * q);
  const a0 = 1 + alpha;
  if (type === "lowpass") {
    return {
      b0: (1 - cos) / 2 / a0,
      b1: (1 - cos) / a0,
      b2: (1 - cos) / 2 / a0,
      a1: (-2 * cos) / a0,
      a2: (1 - alpha) / a0,
    };
  }
  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

function peakAbs(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

class FakeAudioParam {
  value = 0;

  setValueAtTime(value: number): FakeAudioParam {
    this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number): FakeAudioParam {
    this.value = value;
    return this;
  }

  exponentialRampToValueAtTime(value: number): FakeAudioParam {
    this.value = value;
    return this;
  }
}

class FakeAudioNode {
  connect(): FakeAudioNode {
    return this;
  }

  disconnect(): void {}
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeStereoPannerNode extends FakeAudioNode {
  pan = new FakeAudioParam();
}

class FakeOscillatorNode extends FakeAudioNode {
  frequency = new FakeAudioParam();
  type: OscillatorType = "sine";
  onended: (() => void) | null = null;

  start(): void {}

  stop(): void {}
}

class FakeBirdAudioContext {
  currentTime = 0;
  destination = new FakeAudioNode();

  createGain(): FakeGainNode {
    return new FakeGainNode();
  }

  createStereoPanner(): FakeStereoPannerNode {
    return new FakeStereoPannerNode();
  }

  createOscillator(): FakeOscillatorNode {
    return new FakeOscillatorNode();
  }
}

function fakeBirdMixer(ctx: FakeBirdAudioContext) {
  return {
    bedInput: () => ctx.destination as unknown as GainNode,
  } satisfies Pick<AudioMixer, "bedInput">;
}
