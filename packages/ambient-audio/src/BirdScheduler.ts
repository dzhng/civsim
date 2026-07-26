import type { AudioMixer } from "./AudioMixer";

export const BIRD_INTERVAL_FLOOR_SECONDS = 1.4;
export const BIRD_INTERVAL_RANGE_SECONDS = 6.5;
export const BIRD_INITIAL_DELAY_SECONDS = 1.5;
export const BIRD_LOOKAHEAD_SECONDS = 2.0;
export const MAX_CONCURRENT_BIRD_VOICES = 4;
export const BIRD_SCHEDULER_DEFAULT_SEED = 25_260_726;

export interface BirdSchedulerOptions {
  seed?: number;
  enabled?: boolean;
  intensity?: number;
  maxConcurrentVoices?: number;
  intervalFloorSeconds?: number;
  intervalRangeSeconds?: number;
  initialDelaySeconds?: number;
  lookAheadSeconds?: number;
}

export interface BirdSchedulerInspection {
  activeVoices: number;
  activeNodes: number;
  nextCallTime: number;
  scheduledStarts: number[];
  maxObservedActiveVoices: number;
  maxObservedActiveNodes: number;
}

type BirdChirp = {
  start: number;
  duration: number;
  fromFrequency: number;
  toFrequency: number;
  level: number;
};

type BirdMixer = Pick<AudioMixer, "bedInput">;

export class BirdVoice {
  readonly startTime: number;
  readonly stopTime: number;
  readonly nodeCount: number;

  private readonly panner: StereoPannerNode;
  private readonly chirps: Array<{
    oscillator: OscillatorNode;
    gain: GainNode;
    connected: boolean;
  }> = [];
  private finished = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    output: AudioNode,
    options: {
      startTime: number;
      pan: number;
      oscillatorType: OscillatorType;
      chirps: BirdChirp[];
      onended: (voice: BirdVoice) => void;
    },
  ) {
    this.startTime = options.startTime;
    const lastChirp = options.chirps[options.chirps.length - 1];
    this.stopTime = this.startTime + lastChirp.start + lastChirp.duration + 0.03;

    this.panner = this.ctx.createStereoPanner();
    this.panner.pan.setValueAtTime(clamp(options.pan, -1, 1), this.startTime);
    this.panner.connect(output);

    for (let i = 0; i < options.chirps.length; i++) {
      const chirp = options.chirps[i];
      const chirpStart = this.startTime + chirp.start;
      const chirpEnd = chirpStart + chirp.duration;
      const oscillator = this.ctx.createOscillator();
      oscillator.type = options.oscillatorType;
      oscillator.frequency.setValueAtTime(Math.max(220, chirp.fromFrequency), chirpStart);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(220, chirp.toFrequency),
        chirpEnd,
      );

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, chirpStart);
      gain.gain.linearRampToValueAtTime(chirp.level, chirpStart + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, chirpEnd);

      oscillator.connect(gain);
      gain.connect(this.panner);
      const node = { oscillator, gain, connected: true };
      this.chirps.push(node);
      oscillator.onended = () => {
        this.disconnectChirp(i);
        if (i === options.chirps.length - 1) {
          this.finish(options.onended);
        }
      };
      oscillator.start(chirpStart);
      oscillator.stop(chirpEnd + 0.02);
    }

    this.nodeCount = 1 + options.chirps.length * 2;
  }

  get activeNodes(): number {
    if (this.finished) return 0;
    let count = 1;
    for (const chirp of this.chirps) {
      if (chirp.connected) count += 2;
    }
    return count;
  }

  cleanup(now = this.ctx.currentTime, onended?: (voice: BirdVoice) => void): boolean {
    if (this.finished) return true;
    if (now < this.stopTime) return false;
    this.finish(onended);
    return true;
  }

  disconnect(): void {
    this.finish();
  }

  private finish(onended?: (voice: BirdVoice) => void): void {
    if (this.finished) return;
    this.finished = true;
    for (let i = 0; i < this.chirps.length; i++) this.disconnectChirp(i);
    this.panner.disconnect();
    onended?.(this);
  }

  private disconnectChirp(index: number): void {
    const chirp = this.chirps[index];
    if (!chirp?.connected) return;
    chirp.connected = false;
    chirp.oscillator.disconnect();
    chirp.gain.disconnect();
  }
}

export class BirdScheduler {
  private readonly random: () => number;
  private readonly maxConcurrentVoices: number;
  private readonly intervalFloorSeconds: number;
  private readonly intervalRangeSeconds: number;
  private readonly lookAheadSeconds: number;
  private readonly voices = new Set<BirdVoice>();
  private readonly scheduledStarts: number[] = [];

  private enabled: boolean;
  private intensity: number;
  private nextCallTime: number;
  private maxObservedActiveVoices = 0;
  private maxObservedActiveNodes = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly mixer: BirdMixer,
    options: BirdSchedulerOptions = {},
  ) {
    this.random = rng(options.seed ?? BIRD_SCHEDULER_DEFAULT_SEED);
    this.enabled = options.enabled ?? true;
    this.intensity = clamp01(options.intensity ?? 1);
    this.maxConcurrentVoices = Math.max(
      1,
      Math.floor(options.maxConcurrentVoices ?? MAX_CONCURRENT_BIRD_VOICES),
    );
    this.intervalFloorSeconds = Math.max(
      BIRD_INTERVAL_FLOOR_SECONDS,
      finite(options.intervalFloorSeconds ?? BIRD_INTERVAL_FLOOR_SECONDS),
    );
    this.intervalRangeSeconds = Math.max(
      0,
      finite(options.intervalRangeSeconds ?? BIRD_INTERVAL_RANGE_SECONDS),
    );
    this.lookAheadSeconds = Math.max(0, finite(options.lookAheadSeconds ?? BIRD_LOOKAHEAD_SECONDS));
    this.nextCallTime =
      this.ctx.currentTime +
      Math.max(0, finite(options.initialDelaySeconds ?? BIRD_INITIAL_DELAY_SECONDS));
  }

  get activeVoices(): number {
    return this.voices.size;
  }

  get activeNodes(): number {
    let count = 0;
    for (const voice of this.voices) count += voice.activeNodes;
    return count;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setIntensity(intensity: number): void {
    this.intensity = clamp01(intensity);
  }

  tick(observedNow = this.ctx.currentTime): void {
    if (!Number.isFinite(observedNow)) return;
    const now = this.ctx.currentTime;
    this.cleanupEnded(now);
    if (!this.enabled || this.intensity <= 0) return;

    const horizon = now + this.lookAheadSeconds;
    let guard = 0;
    while (this.nextCallTime <= horizon && guard < this.maxConcurrentVoices) {
      guard++;
      if (this.voices.size >= this.maxConcurrentVoices) break;
      const start = Math.max(this.nextCallTime, now);
      this.scheduleVoice(start);
      this.nextCallTime += this.intervalFloorSeconds + this.random() * this.intervalRangeSeconds;
    }
    this.recordMaxima();
  }

  disconnect(): void {
    for (const voice of this.voices) voice.disconnect();
    this.voices.clear();
  }

  inspectSchedule(): BirdSchedulerInspection {
    return {
      activeVoices: this.activeVoices,
      activeNodes: this.activeNodes,
      nextCallTime: this.nextCallTime,
      scheduledStarts: [...this.scheduledStarts],
      maxObservedActiveVoices: this.maxObservedActiveVoices,
      maxObservedActiveNodes: this.maxObservedActiveNodes,
    };
  }

  private scheduleVoice(startTime: number): void {
    const species = this.random();
    const chirpCount = 2 + Math.floor(this.random() * 5);
    const base = 1900 + this.random() * 2400;
    const chirps: BirdChirp[] = [];
    let offset = 0;
    for (let i = 0; i < chirpCount; i++) {
      const fromFrequency = base * (0.82 + this.random() * 0.5);
      const toFrequency =
        fromFrequency *
        (species < 0.35 ? 1.5 + this.random() : 0.55 + this.random() * 0.4);
      const duration = 0.055 + this.random() * 0.1;
      chirps.push({
        start: offset,
        duration,
        fromFrequency,
        toFrequency,
        level: (0.055 + this.random() * 0.05) * this.intensity,
      });
      offset += duration + 0.02 + this.random() * 0.09;
    }

    const voice = new BirdVoice(this.ctx, this.mixer.bedInput("birds"), {
      startTime,
      pan: (this.random() * 2 - 1) * 0.8,
      oscillatorType: species < 0.5 ? "sine" : "triangle",
      chirps,
      onended: (ended) => this.releaseVoice(ended),
    });
    this.voices.add(voice);
    this.scheduledStarts.push(startTime);
    this.recordMaxima();
  }

  private releaseVoice(voice: BirdVoice): void {
    this.voices.delete(voice);
    this.recordMaxima();
  }

  private cleanupEnded(now: number): void {
    for (const voice of [...this.voices]) {
      voice.cleanup(now, (ended) => this.releaseVoice(ended));
    }
  }

  private recordMaxima(): void {
    this.maxObservedActiveVoices = Math.max(this.maxObservedActiveVoices, this.activeVoices);
    this.maxObservedActiveNodes = Math.max(this.maxObservedActiveNodes, this.activeNodes);
  }
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

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
