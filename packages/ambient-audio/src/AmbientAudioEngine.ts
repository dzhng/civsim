import { AudioMixer, type AmbientAudioSettings } from "./AudioMixer";

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
  }

  static create(options: AmbientAudioEngineOptions): AmbientAudioEngine {
    const ctx = createAudioContext(options);

    const masterGain = ctx.createGain();
    const mixer = new AudioMixer(ctx, masterGain, options.settings);

    const lowshelf = ctx.createBiquadFilter();
    lowshelf.type = "lowshelf";
    lowshelf.frequency.value = 220;
    lowshelf.gain.value = 2.5;

    const highshelf = ctx.createBiquadFilter();
    highshelf.type = "highshelf";
    highshelf.frequency.value = 9000;
    highshelf.gain.value = -3;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 22;
    compressor.ratio.value = 3.2;
    compressor.attack.value = 0.02;
    compressor.release.value = 0.35;

    const reverbInput = ctx.createGain();
    reverbInput.gain.value = 1;
    const reverbConvolver = ctx.createConvolver();
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0;

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
      { masterGain, lowshelf, highshelf, compressor, reverbInput, reverbConvolver, reverbWet },
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
    return this.activeOneShots;
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
      hasReverbSendBus:
        this.graphConnections.includes("reverbInput->reverbConvolver") &&
        this.graphConnections.includes("reverbConvolver->reverbWet") &&
        this.graphConnections.includes("reverbWet->masterGain"),
    };
  }

  playTestTone(options: { frequency?: number; durationSeconds?: number; level?: number; when?: number } = {}): void {
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
