import { AudioMixer, type AmbientAudioSettings } from "./AudioMixer";
import { WindBed } from "./beds/WindBed";
import { VALLEY_REVERB_SEED, VALLEY_REVERB_WET_GAIN, buildValleyImpulseResponse } from "./reverb";

export const MEADOW_MASTER_VOICING = {
  lowshelfFrequency: 220,
  lowshelfGain: 2.5,
  highshelfFrequency: 9000,
  highshelfGain: -3,
  compressorThreshold: -16,
  compressorKnee: 22,
  compressorRatio: 3.2,
  compressorAttack: 0.02,
  compressorRelease: 0.35,
} as const;

export type AmbientAudioContext = BaseAudioContext & {
  resume?: () => Promise<void>;
  suspend?: () => Promise<void>;
  close?: () => Promise<void>;
};

export type AmbientRealtimeAudioContextConstructor = new (
  contextOptions?: AudioContextOptions,
) => AmbientAudioContext;

export type AmbientOfflineAudioContextConstructor = new (
  numberOfChannels: number,
  length: number,
  sampleRate: number,
) => AmbientAudioContext;

export type AmbientAudioContextConstructor =
  | AmbientRealtimeAudioContextConstructor
  | AmbientOfflineAudioContextConstructor;

export type AmbientAudioEngineOptions =
  | {
      AudioContext: AmbientRealtimeAudioContextConstructor;
      audioContextArgs?: [] | [AudioContextOptions];
      settings?: AmbientAudioSettings;
    }
  | {
      AudioContext: AmbientOfflineAudioContextConstructor;
      audioContextArgs: [number, number, number];
      settings?: AmbientAudioSettings;
    };

type ResolvedAudioEngineOptions = {
  AudioContext: AmbientAudioContextConstructor;
  audioContextArgs?: [] | [AudioContextOptions] | [number, number, number];
  settings?: AmbientAudioSettings;
};

export interface AmbientAudioGraphInspection {
  masterChain: string[];
  connections: string[];
  lowshelf: { frequency: number; gain: number };
  highshelf: { frequency: number; gain: number };
  compressor: { threshold: number; knee: number; ratio: number; attack: number; release: number };
  reverb: { wetGain: number; bufferDuration: number; bufferChannels: number };
  sendLevels: Record<string, number>;
  hasReverbSendBus: boolean;
}

export class AmbientAudioEngine {
  readonly ctx: AmbientAudioContext;
  readonly mixer: AudioMixer;
  readonly masterGain: GainNode;
  readonly lowshelf: BiquadFilterNode;
  readonly highshelf: BiquadFilterNode;
  readonly compressor: DynamicsCompressorNode;
  readonly reverbInput: GainNode;
  readonly reverbConvolver: ConvolverNode;
  readonly reverbWet: GainNode;
  readonly monitorNode: AudioNode;
  readonly windBed: WindBed;

  private disposed = false;
  private activeOneShots = 0;

  private constructor(
    ctx: AmbientAudioContext,
    mixer: AudioMixer,
    nodes: {
      masterGain: GainNode;
      lowshelf: BiquadFilterNode;
      highshelf: BiquadFilterNode;
      compressor: DynamicsCompressorNode;
      reverbInput: GainNode;
      reverbConvolver: ConvolverNode;
      reverbWet: GainNode;
      windBed: WindBed;
    },
    private readonly graphConnections: string[],
  ) {
    this.ctx = ctx;
    this.mixer = mixer;
    this.masterGain = nodes.masterGain;
    this.lowshelf = nodes.lowshelf;
    this.highshelf = nodes.highshelf;
    this.compressor = nodes.compressor;
    this.reverbInput = nodes.reverbInput;
    this.reverbConvolver = nodes.reverbConvolver;
    this.reverbWet = nodes.reverbWet;
    this.monitorNode = nodes.compressor;
    this.windBed = nodes.windBed;
  }

  static create(options: AmbientAudioEngineOptions): AmbientAudioEngine {
    const ctx = createAudioContext(options);

    const masterGain = ctx.createGain();
    const reverbInput = ctx.createGain();
    reverbInput.gain.value = 1;
    const mixer = new AudioMixer(ctx, masterGain, reverbInput, options.settings);

    const lowshelf = ctx.createBiquadFilter();
    lowshelf.type = "lowshelf";
    lowshelf.frequency.value = MEADOW_MASTER_VOICING.lowshelfFrequency;
    lowshelf.gain.value = MEADOW_MASTER_VOICING.lowshelfGain;

    const highshelf = ctx.createBiquadFilter();
    highshelf.type = "highshelf";
    highshelf.frequency.value = MEADOW_MASTER_VOICING.highshelfFrequency;
    highshelf.gain.value = MEADOW_MASTER_VOICING.highshelfGain;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = MEADOW_MASTER_VOICING.compressorThreshold;
    compressor.knee.value = MEADOW_MASTER_VOICING.compressorKnee;
    compressor.ratio.value = MEADOW_MASTER_VOICING.compressorRatio;
    compressor.attack.value = MEADOW_MASTER_VOICING.compressorAttack;
    compressor.release.value = MEADOW_MASTER_VOICING.compressorRelease;

    const reverbConvolver = ctx.createConvolver();
    reverbConvolver.buffer = buildValleyImpulseResponse(ctx, VALLEY_REVERB_SEED);
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = VALLEY_REVERB_WET_GAIN;
    const windBed = new WindBed(ctx, mixer);

    const graphConnections: string[] = [];
    connect("masterGain->lowshelf", masterGain, lowshelf, graphConnections);
    connect("lowshelf->highshelf", lowshelf, highshelf, graphConnections);
    connect("highshelf->compressor", highshelf, compressor, graphConnections);
    connect("compressor->destination", compressor, ctx.destination, graphConnections);
    connect("reverbInput->reverbConvolver", reverbInput, reverbConvolver, graphConnections);
    connect("reverbConvolver->reverbWet", reverbConvolver, reverbWet, graphConnections);
    connect("reverbWet->masterGain", reverbWet, masterGain, graphConnections);

    if (ctx.state === "running") {
      void ctx.suspend?.();
    }

    return new AmbientAudioEngine(
      ctx,
      mixer,
      {
        masterGain,
        lowshelf,
        highshelf,
        compressor,
        reverbInput,
        reverbConvolver,
        reverbWet,
        windBed,
      },
      graphConnections,
    );
  }

  get ok(): boolean {
    return !this.disposed;
  }

  get mounted(): boolean {
    return this.ok && this.ctx.state !== "closed";
  }

  get activeNodes(): number {
    return this.activeOneShots + this.windBed.activeNodes;
  }

  async resume(): Promise<void> {
    if (!this.mounted) return;
    await this.ctx.resume?.();
  }

  async suspend(): Promise<void> {
    if (!this.mounted) return;
    await this.ctx.suspend?.();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.windBed.stop();
    this.mixer.disconnect();
    for (const node of [
      this.masterGain,
      this.lowshelf,
      this.highshelf,
      this.compressor,
      this.reverbInput,
      this.reverbConvolver,
      this.reverbWet,
    ]) {
      node.disconnect();
    }
    await this.ctx.close?.();
  }

  inspectGraph(): AmbientAudioGraphInspection {
    return {
      masterChain: ["masterGain", "lowshelf", "highshelf", "compressor", "destination"],
      connections: [...this.graphConnections],
      lowshelf: { frequency: this.lowshelf.frequency.value, gain: this.lowshelf.gain.value },
      highshelf: { frequency: this.highshelf.frequency.value, gain: this.highshelf.gain.value },
      compressor: {
        threshold: this.compressor.threshold.value,
        knee: this.compressor.knee.value,
        ratio: this.compressor.ratio.value,
        attack: this.compressor.attack.value,
        release: this.compressor.release.value,
      },
      reverb: {
        wetGain: this.reverbWet.gain.value,
        bufferDuration: this.reverbConvolver.buffer?.duration ?? 0,
        bufferChannels: this.reverbConvolver.buffer?.numberOfChannels ?? 0,
      },
      sendLevels: Object.fromEntries(
        Object.entries(this.mixer.reverbSendGains).map(([bed, gain]) => [bed, gain.gain.value]),
      ),
      hasReverbSendBus:
        this.graphConnections.includes("reverbInput->reverbConvolver") &&
        this.graphConnections.includes("reverbConvolver->reverbWet") &&
        this.graphConnections.includes("reverbWet->masterGain"),
    };
  }

  playTestTone(
    options: { frequency?: number; durationSeconds?: number; level?: number; when?: number } = {},
  ): void {
    if (!this.mounted) return;
    const now = this.ctx.currentTime;
    const start = Math.max(now, options.when ?? now);
    const duration = Math.max(0.01, options.durationSeconds ?? 0.22);
    const stop = start + duration;
    const frequency = Math.max(20, options.frequency ?? 440);
    const level = Math.max(0, Math.min(1, options.level ?? 0.18));

    const oscillator = this.ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.012);
    gain.gain.setValueAtTime(level, Math.max(start + 0.012, stop - 0.035));
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);

    oscillator.connect(gain);
    gain.connect(this.mixer.bedInput("test"));

    this.activeOneShots++;
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      this.activeOneShots = Math.max(0, this.activeOneShots - 1);
    };
    oscillator.start(start);
    oscillator.stop(stop + 0.01);
  }
}

function connect(label: string, source: AudioNode, destination: AudioNode, log: string[]): void {
  source.connect(destination);
  log.push(label);
}

function createAudioContext(options: ResolvedAudioEngineOptions): AmbientAudioContext {
  const args = options.audioContextArgs ?? [];
  if (args.length === 3) {
    const AudioContextCtor = options.AudioContext as AmbientOfflineAudioContextConstructor;
    return new AudioContextCtor(args[0], args[1], args[2]);
  }
  const AudioContextCtor = options.AudioContext as AmbientRealtimeAudioContextConstructor;
  return new AudioContextCtor(args[0]);
}
