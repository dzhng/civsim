export const VALLEY_REVERB_SECONDS = 3.4;
export const VALLEY_REVERB_SEED = 999;
export const VALLEY_REVERB_WET_GAIN = 0.34;
export const VALLEY_REVERB_DECAY_POWER = 2.6;
export const VALLEY_REVERB_DECAY_EXPONENT = 2.1;
export const VALLEY_REVERB_DARKENING_COEFFICIENT = 0.3;
export const VALLEY_REVERB_STEREO_SEED_OFFSET = 7;

export const VALLEY_EARLY_REFLECTION_SECONDS = 0.35;
export const VALLEY_EARLY_REFLECTIONS = [
  { seconds: 0.031, widthSeconds: 0.004, gain: 2.4 },
  { seconds: 0.068, widthSeconds: 0.005, gain: 1.9 },
  { seconds: 0.121, widthSeconds: 0.008, gain: 1.4 },
  { seconds: 0.205, widthSeconds: 0.012, gain: 1.1 },
] as const;

export function buildValleyImpulseResponse(ctx: BaseAudioContext, seed: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * VALLEY_REVERB_SECONDS));
  const channelCount = supportsStereoIr(ctx) ? 2 : 1;
  const buffer = ctx.createBuffer(channelCount, length, ctx.sampleRate);

  for (let channel = 0; channel < channelCount; channel++) {
    const samples = buffer.getChannelData(channel);
    const random = rng(seed + channel * VALLEY_REVERB_STEREO_SEED_OFFSET);
    for (let i = 0; i < length; i++) {
      const u = i / length;
      let envelope =
        Math.pow(1 - u, VALLEY_REVERB_DECAY_POWER) * Math.exp(-u * VALLEY_REVERB_DECAY_EXPONENT);
      const seconds = i / ctx.sampleRate;
      if (seconds < VALLEY_EARLY_REFLECTION_SECONDS) {
        envelope *= earlyReflectionGain(seconds);
      }
      samples[i] = (random() * 2 - 1) * envelope;
    }

    let lowpass = 0;
    for (let i = 0; i < length; i++) {
      lowpass += (samples[i] - lowpass) * VALLEY_REVERB_DARKENING_COEFFICIENT;
      samples[i] = lowpass;
    }
  }

  return buffer;
}

function earlyReflectionGain(seconds: number): number {
  let gain = 1;
  for (const reflection of VALLEY_EARLY_REFLECTIONS) {
    gain +=
      reflection.gain *
      Math.exp(-Math.pow((seconds - reflection.seconds) / reflection.widthSeconds, 2));
  }
  return gain;
}

function supportsStereoIr(ctx: BaseAudioContext): boolean {
  return (ctx.destination.maxChannelCount || ctx.destination.channelCount || 1) >= 2;
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
