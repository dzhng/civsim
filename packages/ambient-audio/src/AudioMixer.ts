export type AmbientAudioBed = "wind" | "grass" | "water" | "birds" | "test";

export type AmbientBedVolumes = Partial<Record<AmbientAudioBed, number>>;
export type AmbientBedSendLevels = Partial<Record<AmbientAudioBed, number>>;

export interface AmbientAudioSettings {
  masterVolume?: number;
  muted?: boolean;
  birds?: boolean;
  bedVolumes?: AmbientBedVolumes;
  reverbSendLevels?: AmbientBedSendLevels;
  rampTimeConstant?: number;
}

const BED_IDS: AmbientAudioBed[] = ["wind", "grass", "water", "birds", "test"];
const DEFAULT_RAMP_SECONDS = 0.018;
export const DEFAULT_REVERB_SEND_LEVELS: Readonly<Record<AmbientAudioBed, number>> = {
  wind: 0.32,
  grass: 0,
  water: 0,
  birds: 0.18,
  test: 0,
};

export class AudioMixer {
  readonly masterGain: GainNode;
  readonly submixGains: Readonly<Record<AmbientAudioBed, GainNode>>;
  readonly reverbSendGains: Readonly<Record<AmbientAudioBed, GainNode>>;

  private volume: number;
  private muted: boolean;
  private readonly rampTimeConstant: number;

  constructor(
    private readonly ctx: BaseAudioContext,
    masterGain: GainNode,
    reverbInput: AudioNode,
    settings: AmbientAudioSettings = {},
  ) {
    this.masterGain = masterGain;
    this.volume = clamp01(settings.masterVolume ?? 0.7);
    this.muted = settings.muted ?? false;
    this.rampTimeConstant = Math.max(0.001, settings.rampTimeConstant ?? DEFAULT_RAMP_SECONDS);

    const submixes = {} as Record<AmbientAudioBed, GainNode>;
    const sends = {} as Record<AmbientAudioBed, GainNode>;
    for (const bed of BED_IDS) {
      const gain = this.ctx.createGain();
      gain.gain.value = clamp01(settings.bedVolumes?.[bed] ?? 1);
      gain.connect(this.masterGain);
      submixes[bed] = gain;

      const send = this.ctx.createGain();
      send.gain.value = clamp01(
        settings.reverbSendLevels?.[bed] ?? DEFAULT_REVERB_SEND_LEVELS[bed],
      );
      gain.connect(send);
      send.connect(reverbInput);
      sends[bed] = send;
    }
    this.submixGains = submixes;
    this.reverbSendGains = sends;
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

  setSendLevel(bed: AmbientAudioBed, level: number): void {
    this.rampParam(this.reverbSendGains[bed].gain, clamp01(level));
  }

  sendLevel(bed: AmbientAudioBed): number {
    return this.reverbSendGains[bed].gain.value;
  }

  bedInput(bed: AmbientAudioBed): GainNode {
    return this.submixGains[bed];
  }

  disconnect(): void {
    for (const gain of Object.values(this.submixGains)) {
      gain.disconnect();
    }
    for (const gain of Object.values(this.reverbSendGains)) {
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
