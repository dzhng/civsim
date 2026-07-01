// The lighting mood as a swappable preset — the warmth (or coolness) that the
// aesthetics creed says lives in the *environment*, never the albedo. The same
// neutral water albedo (waterPalette) times one of these presets is warm at
// golden hour and a pale cool sliver under overcast; the reference's dusk mood is
// this preset, not a dark material. Each preset also carries the sun direction so
// glint and diffuse agree with the mood.

export interface WaterEnvironment {
  id: 'golden' | 'dusk' | 'overcast';
  /** Sun direction (radians) for this mood. */
  sunAzimuth: number;
  sunElevation: number;
  /** Warm/cool key (sun) light — also tints the sun glint. */
  keyColor: [number, number, number];
  /** Cool sky fill lifting the shadows. */
  fillColor: [number, number, number];
  /** Aerial-perspective haze colour (used by Slice 6). */
  hazeColor: [number, number, number];
  /** Overall exposure — dusk is dim, not dark-albedo'd. */
  exposure: number;
}

const SUN_TOWARD_VIEW = Math.PI / 2; // up the frame centre on the lab camera

export const WATER_ENVIRONMENTS: Record<WaterEnvironment['id'], WaterEnvironment> = {
  golden: {
    id: 'golden',
    sunAzimuth: SUN_TOWARD_VIEW,
    sunElevation: 0.5,
    keyColor: [1.0, 0.86, 0.62],
    fillColor: [0.46, 0.58, 0.78],
    hazeColor: [0.82, 0.80, 0.70],
    exposure: 1.18,
  },
  dusk: {
    id: 'dusk',
    sunAzimuth: SUN_TOWARD_VIEW,
    sunElevation: 0.24,
    keyColor: [1.0, 0.6, 0.34],
    fillColor: [0.34, 0.40, 0.56],
    hazeColor: [0.72, 0.58, 0.5],
    exposure: 0.86,
  },
  overcast: {
    id: 'overcast',
    sunAzimuth: SUN_TOWARD_VIEW,
    sunElevation: 0.6,
    keyColor: [0.78, 0.82, 0.86],
    fillColor: [0.72, 0.76, 0.82],
    hazeColor: [0.84, 0.86, 0.88],
    exposure: 1.0,
  },
};

function vec3(c: [number, number, number]): string {
  return `vec3f(${c[0].toFixed(3)}, ${c[1].toFixed(3)}, ${c[2].toFixed(3)})`;
}

/** WGSL constants injected into the water shader for a chosen preset. */
export function waterEnvironmentWgsl(env: WaterEnvironment): string {
  return `
const WATER_KEY = ${vec3(env.keyColor)};
const WATER_FILL = ${vec3(env.fillColor)};
const WATER_HAZE = ${vec3(env.hazeColor)};
const WATER_EXPOSURE = ${env.exposure.toFixed(3)};
`;
}
