export type AmbientAudioBed = "wind" | "grass" | "water" | "birds" | "test";

export type AmbientBedVolumes = Partial<Record<AmbientAudioBed, number>>;

export interface AmbientAudioSettings {
  masterVolume?: number;
  muted?: boolean;
  bedVolumes?: AmbientBedVolumes;
  rampTimeConstant?: number;
}

const BED_IDS: AmbientAudioBed[] = ["wind", "grass", "water", "birds", "test"];
const DEFAULT_RAMP_SECONDS = 0.018;

export class AudioMixer {
  readonly masterGain: GainNode;
  readonly submixGains: Readonly<Record<AmbientAudioBed, GainNode>>;

  private volume: number;
  private muted: boolean;
  private readonly rampTimeConstant: number;

  constructor(
    private readonly ctx: BaseAudioContext,
    masterGain: GainNode,
    settings: AmbientAudioSettings = {},
  ) {
    this.masterGain = masterGain;
    this.volume = clamp01(settings.masterVolume ?? 0.7);
    this.muted = settings.muted ?? false;
    this.rampTimeConstant = Math.max(0.001, settings.rampTimeConstant ?? DEFAULT_RAMP_SECONDS);

    const submixes = {} as Record<AmbientAudioBed, GainNode>;
    for (const bed of BED_IDS) {
      const gain = this.ctx.createGain();
      gain.gain.value = clamp01(settings.bedVolumes?.[bed] ?? 1);
      gain.connect(this.masterGain);
      submixes[bed] = gain;
    }
    this.submixGains = submixes;
    this.masterGain.gain.value = this.targetMasterGain;
  }

  get masterVolume(): number {
    return this.volume;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get targetMasterGain(): number {
    return this.muted ? 0 : this.volume;
  }

  setMasterVolume(volume: number): void {
    this.volume = clamp01(volume);
    this.rampParam(this.masterGain.gain, this.targetMasterGain);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.rampParam(this.masterGain.gain, this.targetMasterGain);
  }

  setBedVolume(bed: AmbientAudioBed, volume: number): void {
    this.rampParam(this.submixGains[bed].gain, clamp01(volume));
  }

  bedInput(bed: AmbientAudioBed): GainNode {
    return this.submixGains[bed];
  }

  disconnect(): void {
    for (const gain of Object.values(this.submixGains)) {
      gain.disconnect();
    }
  }

  private rampParam(param: AudioParam, value: number): void {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, this.rampTimeConstant);
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
