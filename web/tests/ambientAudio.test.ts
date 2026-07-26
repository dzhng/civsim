import { describe, expect, it } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";

import {
  AmbientAudioEngine,
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

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}
