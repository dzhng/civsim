import { describe, expect, it } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";

import {
  AmbientAudioDirector,
  AmbientAudioEngine,
  WIND_BED_FIXED_NODE_COUNT,
  type AmbientOfflineAudioContextConstructor,
} from "../../packages/ambient-audio/src/index.ts";

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
    expect(graph.hasReverbSendBus).toBe(true);
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
    });

    expect(rms(rendered.samples)).toBeLessThan(0.0002);
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
});

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
}): Promise<{ samples: Float32Array; sampleRate: number; activeNodesBeforeRender: number }> {
  const sampleRate = 44_100;
  const seconds = 1.25;
  const engine = AmbientAudioEngine.create({
    AudioContext: OfflineCtor,
    audioContextArgs: [1, Math.floor(sampleRate * seconds), sampleRate],
    settings: { masterVolume: 0.75, muted: options.muted ?? false },
  });
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

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
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
