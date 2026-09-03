interface BattleWindSample {
  speed: number;
  gust: number;
  dirX: number;
  dirY: number;
}

interface WindVector2Like {
  x: number;
  y: number;
  set?: (x: number, y: number) => unknown;
}

interface WindUniformValue<T> {
  value: T;
}

export interface BattleWindUniforms {
  meanDirection: WindUniformValue<WindVector2Like>;
  speed: WindUniformValue<number>;
  gustPhase: WindUniformValue<number>;
  gustStrength: WindUniformValue<number>;
  bandVelocity: WindUniformValue<WindVector2Like>;
  bandFrequency: WindUniformValue<number>;
  bandSharpness: WindUniformValue<number>;
}

const DEG_TO_RAD = Math.PI / 180;
const MEAN_WIND_SPEED = 4.2;
const MEAN_WIND_FROM_RAD = 292 * DEG_TO_RAD;
const MEAN_DIR_X = Math.sin(MEAN_WIND_FROM_RAD + Math.PI);
const MEAN_DIR_Y = Math.cos(MEAN_WIND_FROM_RAD + Math.PI);
const MEAN_VEL_X = MEAN_DIR_X * MEAN_WIND_SPEED;
const MEAN_VEL_Y = MEAN_DIR_Y * MEAN_WIND_SPEED;
const SIDE_DIR_X = -MEAN_DIR_Y;
const SIDE_DIR_Y = MEAN_DIR_X;
const GUSTINESS = 1.0;
const TURBULENCE_INTENSITY = 0.19;
const BAND_ADVECTION_SCALE = 1.22;
const BAND_WAVELENGTH_M = 64;
const BAND_SPATIAL_FREQUENCY = (Math.PI * 2) / BAND_WAVELENGTH_M;
const BAND_SHARPNESS = 2.7;
const BAND_VEL_X = MEAN_VEL_X * BAND_ADVECTION_SCALE;
const BAND_VEL_Y = MEAN_VEL_Y * BAND_ADVECTION_SCALE;
const CELL_ADVECT_SPEED = MEAN_WIND_SPEED * 1.25;
const CELL_WRAP_SPAN = 1840;
const CELL_WRAP_MIN = -1280;

const GUST_CELLS = [
  {
    station: -1257.8564052842557,
    cross: -199.25208971835673,
    length: 57.66205518320203,
    width: 135.9389206324704,
    amplitude: 1.7528506783535704,
    veer: -0.08909083136357367,
  },
  {
    station: -902.4808646691963,
    cross: -88.71948227752,
    length: 37.70124653028324,
    width: 146.40398412477225,
    amplitude: 1.8371296585188248,
    veer: 0.1068707976071164,
  },
  {
    station: -382.0219716243446,
    cross: 444.7431004140526,
    length: 37.46247954200953,
    width: 167.65621560625732,
    amplitude: 2.0108183491043747,
    veer: -0.125783593445085,
  },
  {
    station: 56.97648635134101,
    cross: -353.686068370007,
    length: 32.36079859454185,
    width: 99.04961318708956,
    amplitude: 1.0165757337934338,
    veer: -0.12165534729603678,
  },
  {
    station: 352.53673346713185,
    cross: -272.7116374997422,
    length: 41.384980380069464,
    width: 125.800335269887,
    amplitude: 1.6138704770244658,
    veer: -0.003398948782123625,
  },
  {
    station: 990.1071157725528,
    cross: -124.95715306140482,
    length: 30.24378252029419,
    width: 181.06275271624327,
    amplitude: 0.9581596216070466,
    veer: 0.06721403002738953,
  },
] as const;

export function sampleBattleWind(x: number, y: number, tSeconds: number): BattleWindSample {
  const px = finiteOr(x, 0);
  const py = finiteOr(y, 0);
  const t = finiteOr(tSeconds, 0);
  const along = px * MEAN_DIR_X + py * MEAN_DIR_Y;
  const cross = px * SIDE_DIR_X + py * SIDE_DIR_Y;
  let gust = 0;
  let veer = 0;
  let gustFront = 0;

  for (const cell of GUST_CELLS) {
    const station = travellingStation(cell.station, t);
    const u = (along - station) / cell.length;
    if (u > 0.18 || u < -6.5) continue;
    const head = smoothstep(0.15, 0, u);
    const body = Math.exp(u * 2.05);
    const crossWeight = Math.exp(-Math.pow(Math.abs(cross - cell.cross) / (cell.width * 0.5), 2.3));
    const g = cell.amplitude * head * body * crossWeight * GUSTINESS;
    gust += g;
    veer += g * cell.veer;
    gustFront += cell.amplitude * Math.exp(-Math.abs(u) * 9) * crossWeight * GUSTINESS;
  }

  const band = windBandAnalytic(px, py, t);
  const bandGust = clamp(0.8 + band * 0.95, 0.05, 2.3);
  const turbulence = turbulence2(px, py, t);
  let vx = MEAN_VEL_X * bandGust + turbulence.x;
  let vy = MEAN_VEL_Y * bandGust + turbulence.y;

  const gustGain = 1 + gust * 0.85;
  const angle = veer * 0.85;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const rx = (vx * ca - vy * sa) * gustGain;
  const ry = (vx * sa + vy * ca) * gustGain;
  const speed = Math.hypot(rx, ry);
  const invSpeed = speed > 1e-9 ? 1 / speed : 0;
  vx = rx;
  vy = ry;

  return {
    speed,
    gust: clamp(gust + Math.max(0, band) * 0.35 + gustFront * 0.18, 0, 3.6),
    dirX: vx * invSpeed,
    dirY: vy * invSpeed,
  };
}

export function windProfile(height: number): number {
  const z = Math.max(finiteOr(height, 0), 0.015);
  return Math.log((z + 0.06) / 0.06) * 0.19523;
}

export function createWindUniforms(): BattleWindUniforms;
export function createWindUniforms<T extends BattleWindUniforms>(target: T): T;
export function createWindUniforms<T extends BattleWindUniforms>(
  target?: T,
): BattleWindUniforms | T {
  const uniforms = target ?? {
    meanDirection: { value: { x: MEAN_DIR_X, y: MEAN_DIR_Y } },
    speed: { value: MEAN_WIND_SPEED },
    gustPhase: { value: 0 },
    gustStrength: { value: 0 },
    bandVelocity: { value: { x: BAND_VEL_X, y: BAND_VEL_Y } },
    bandFrequency: { value: BAND_SPATIAL_FREQUENCY },
    bandSharpness: { value: BAND_SHARPNESS },
  };
  return updateWindUniforms(uniforms, 0);
}

export function updateWindUniforms<T extends BattleWindUniforms>(
  uniforms: T,
  tSeconds: number,
): T {
  const t = finiteOr(tSeconds, 0);
  const origin = sampleBattleWind(0, 0, t);
  writeVec2(uniforms.meanDirection.value, MEAN_DIR_X, MEAN_DIR_Y);
  uniforms.speed.value = MEAN_WIND_SPEED;
  uniforms.gustPhase.value = t * Math.hypot(BAND_VEL_X, BAND_VEL_Y);
  uniforms.gustStrength.value = origin.gust;
  writeVec2(uniforms.bandVelocity.value, BAND_VEL_X, BAND_VEL_Y);
  uniforms.bandFrequency.value = BAND_SPATIAL_FREQUENCY;
  uniforms.bandSharpness.value = BAND_SHARPNESS;
  return uniforms;
}

function windBandAnalytic(x: number, y: number, t: number): number {
  const qx = x - BAND_VEL_X * t;
  const qy = y - BAND_VEL_Y * t;
  const along = qx * MEAN_DIR_X + qy * MEAN_DIR_Y;
  const cross = qx * SIDE_DIR_X + qy * SIDE_DIR_Y;
  const phase =
    along * BAND_SPATIAL_FREQUENCY +
    Math.sin(cross * 0.045) * 0.85 +
    Math.sin((along + cross * 0.55) * 0.019) * 0.3;
  const wave = Math.sin(phase);
  const crest = Math.pow(smoothstep(0.05, 1.0, wave), BAND_SHARPNESS);
  const trough = Math.pow(smoothstep(0.05, 1.0, -wave), 1.2);
  return clamp(crest * 1.8 - trough * 0.85, -0.8, 1.8);
}

function turbulence2(x: number, y: number, t: number): { x: number; y: number } {
  const q1x = (x - MEAN_VEL_X * t) * 0.0125;
  const q1y = (y - MEAN_VEL_Y * t) * 0.0125;
  const n1 = pn2(q1x, q1y);
  const n1b = pn2(q1x + 3.7, q1y - 1.9);
  const q2x = q1x * 2.6;
  const q2y = q1y * 2.6;
  const n2 = pn2(q2x + 11, q2y + 5);
  const n2b = pn2(q2x - 7, q2y + 13);
  return {
    x: (n1 + n2 * 0.79) * MEAN_WIND_SPEED * TURBULENCE_INTENSITY,
    y: (n1b + n2b * 0.79) * MEAN_WIND_SPEED * TURBULENCE_INTENSITY,
  };
}

function travellingStation(initialStation: number, t: number): number {
  const offset = positiveModulo(
    initialStation - CELL_WRAP_MIN + CELL_ADVECT_SPEED * t,
    CELL_WRAP_SPAN,
  );
  return CELL_WRAP_MIN + offset;
}

function pn2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = smoother(fx);
  const uy = smoother(fy);
  const a = dotGrad(ix, iy, fx, fy);
  const b = dotGrad(ix + 1, iy, fx - 1, fy);
  const c = dotGrad(ix, iy + 1, fx, fy - 1);
  const d = dotGrad(ix + 1, iy + 1, fx - 1, fy - 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 1.42;
}

function dotGrad(ix: number, iy: number, x: number, y: number): number {
  const angle = hash12(ix, iy) * Math.PI * 2;
  return Math.cos(angle) * x + Math.sin(angle) * y;
}

function hash12(x: number, y: number): number {
  let px = fract(x * 0.1031);
  let py = fract(y * 0.1031);
  let pz = fract(x * 0.1031);
  const d = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += d;
  py += d;
  pz += d;
  return fract((px + py) * pz);
}

function smoother(x: number): number {
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function writeVec2(target: WindVector2Like, x: number, y: number): void {
  if (target.set) {
    target.set(x, y);
    return;
  }
  target.x = x;
  target.y = y;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
