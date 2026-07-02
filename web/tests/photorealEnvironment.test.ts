// Environment seam pin: every CIVSIM_ENVIRONMENTS preset maps into the
// photoreal spec, no preset is invented, and the mapping is a pure function of
// the ONE preset owner (packages/game-renderer/src/environment/environment.ts).
import assert from 'node:assert/strict';
import test from 'node:test';
import { CIVSIM_ENVIRONMENTS } from '../../packages/game-renderer/src/environment/environment.ts';
import { photorealEnvironment } from '../../packages/photoreal-renderer/src/environment.ts';
import {
  overcastFromTurbidity,
  mieScale,
  skyModelParams,
  transmittanceToSun,
} from '../../packages/photoreal-renderer/src/atmosphere/skyModel.ts';
import { aerialParams } from '../../packages/photoreal-renderer/src/atmosphere/aerialPerspective.ts';

const PRESET_IDS = Object.keys(CIVSIM_ENVIRONMENTS) as (keyof typeof CIVSIM_ENVIRONMENTS)[];

test('photoreal environment: every preset id maps', () => {
  assert.ok(PRESET_IDS.length >= 4, 'expected the civsim preset table (incl. noon)');
  for (const id of PRESET_IDS) {
    const spec = photorealEnvironment(CIVSIM_ENVIRONMENTS[id]);
    assert.equal(spec.id, id, 'spec id must be the preset id, never invented');
    // Sun direction derives from the preset azimuth/elevation and is unit length.
    const env = CIVSIM_ENVIRONMENTS[id];
    const len = Math.hypot(...spec.sunDirection);
    assert.ok(Math.abs(len - 1) < 1e-9, `sun direction unit length for ${id}`);
    assert.ok(Math.abs(spec.sunDirection[2] - Math.sin(env.sunElevation)) < 1e-9, `sun elevation for ${id}`);
    assert.ok(
      Math.abs(Math.atan2(spec.sunDirection[1], spec.sunDirection[0]) - env.sunAzimuth) < 1e-9,
      `sun azimuth for ${id}`,
    );
    // Physical fields come straight from the owner, never a parallel table.
    // Since 10a the sun colour is the SKY MODEL's transmittance-derived light
    // (physics from sun elevation + turbidity), never the authored keyColor.
    assert.deepEqual(spec.sunColor, skyModelParams(env).sunLightColor, `sun colour for ${id}`);
    // Slice 09: the physical block on the ONE owner is the parameterization.
    assert.equal(spec.exposure, env.physical.exposure, `exposure for ${id}`);
    assert.equal(spec.sunIntensity, env.physical.sunIntensity, `sun intensity for ${id}`);
    assert.equal(spec.turbidity, env.physical.turbidity, `turbidity for ${id}`);
    assert.ok(spec.sunIntensity > 0 && spec.exposure > 0 && spec.turbidity > 0, `physical fields positive for ${id}`);
  }
});

test('photoreal environment: sun direction round-trips to the preset angles', () => {
  for (const id of PRESET_IDS) {
    const env = CIVSIM_ENVIRONMENTS[id];
    const [x, y, z] = photorealEnvironment(env).sunDirection;
    const elevation = Math.asin(z);
    const azimuth = Math.atan2(y, x);
    assert.ok(Math.abs(elevation - env.sunElevation) < 1e-9, `elevation round-trip for ${id}`);
    assert.ok(Math.abs(azimuth - env.sunAzimuth) < 1e-9, `azimuth round-trip for ${id}`);
  }
});

test('photoreal environment: the preset registers order physically', () => {
  const spec = (id: keyof typeof CIVSIM_ENVIRONMENTS) => photorealEnvironment(CIVSIM_ENVIRONMENTS[id]);
  const golden = spec('golden');
  const dusk = spec('dusk');
  const noon = spec('noon');
  const overcast = spec('overcast');
  // Exposure monotonicity: dusk is the dim register (dim exposure, never
  // dark albedos); the three day presets sit above it.
  assert.ok(dusk.exposure < overcast.exposure, 'dusk dimmer than overcast');
  assert.ok(dusk.exposure < golden.exposure, 'dusk dimmer than golden');
  assert.ok(dusk.exposure < noon.exposure, 'dusk dimmer than noon');
  // Sun-vs-sky: overcast is the diffuse register — weakest direct sun. The
  // physically meaningful ordering is DELIVERED ground irradiance
  // (intensity × sun height), monotone noon > golden > dusk > overcast —
  // the raw intensity knob may compensate a low sun (golden's warm boost).
  assert.ok(overcast.sunIntensity < dusk.sunIntensity, 'overcast sun weaker than dusk');
  assert.ok(overcast.sunIntensity < golden.sunIntensity, 'overcast sun weaker than golden');
  const groundIrradiance = (s: ReturnType<typeof spec>) => s.sunIntensity * s.sunDirection[2];
  assert.ok(groundIrradiance(noon) > groundIrradiance(golden), 'noon delivers the strongest sun');
  assert.ok(groundIrradiance(golden) > groundIrradiance(dusk), 'golden delivers more sun than dusk');
  assert.ok(groundIrradiance(dusk) > groundIrradiance(overcast), 'dusk delivers more sun than overcast');
  assert.ok(noon.sunDirection[2] > golden.sunDirection[2], 'noon sun higher than golden');
  assert.ok(golden.sunDirection[2] > dusk.sunDirection[2], 'golden sun higher than dusk');
  // Turbidity monotonicity: clear noon < golden < dusk < overcast (heavy fog).
  assert.ok(noon.turbidity < golden.turbidity, 'noon clearest');
  assert.ok(golden.turbidity < dusk.turbidity, 'golden clearer than dusk');
  assert.ok(dusk.turbidity < overcast.turbidity, 'overcast haziest');
});

test('photoreal environment: swapping presets moves sun/haze/exposure deterministically', () => {
  const ids = [...PRESET_IDS];
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      const specA = photorealEnvironment(CIVSIM_ENVIRONMENTS[a]);
      const specB = photorealEnvironment(CIVSIM_ENVIRONMENTS[b]);
      const moved =
        specA.sunDirection.join() !== specB.sunDirection.join() ||
        specA.sunIntensity !== specB.sunIntensity ||
        specA.exposure !== specB.exposure ||
        specA.turbidity !== specB.turbidity;
      assert.ok(moved, `presets ${a} and ${b} must map to different physical light`);
      // Deterministic: re-mapping after the swap reproduces the first spec.
      assert.deepEqual(photorealEnvironment(CIVSIM_ENVIRONMENTS[a]), specA, `swap back to ${a} is deterministic`);
    }
  }
});

test('photoreal environment: pure function of the preset', () => {
  for (const id of PRESET_IDS) {
    const env = CIVSIM_ENVIRONMENTS[id];
    const before = JSON.stringify(env);
    const a = photorealEnvironment(env);
    const b = photorealEnvironment(env);
    assert.deepEqual(a, b, `two calls must agree for ${id}`);
    assert.equal(JSON.stringify(env), before, `preset must not be mutated for ${id}`);
    // The spec owns fresh arrays — mutating it must not write through to the owner.
    a.sunColor[0] = 999;
    a.sunDirection[1] = 999;
    assert.equal(JSON.stringify(env), before, `spec arrays must be copies for ${id}`);
  }
});

// --- Slice 10a: the physical sky model (sun elevation + turbidity drive it) ---

test('sky model: pure, deterministic preset mapping', () => {
  for (const id of PRESET_IDS) {
    const env = CIVSIM_ENVIRONMENTS[id];
    const before = JSON.stringify(env);
    const a = skyModelParams(env);
    const b = skyModelParams(env);
    assert.deepEqual(a, b, `two calls must agree for ${id}`);
    assert.equal(JSON.stringify(env), before, `preset must not be mutated for ${id}`);
    assert.equal(a.id, id);
    assert.equal(a.turbidity, env.physical.turbidity, `turbidity from the ONE owner for ${id}`);
    // Sun direction matches the preset angles (same convention as the spec).
    assert.ok(Math.abs(a.sunDirection[2] - Math.sin(env.sunElevation)) < 1e-9, `sun z for ${id}`);
    // Transmittance is max-channel-normalized linear rgb in (0, 1].
    assert.ok(Math.abs(Math.max(...a.sunTransmittance) - 1) < 1e-9, `transmittance peak for ${id}`);
    assert.ok(a.sunTransmittance.every((c) => c > 0 && c <= 1), `transmittance range for ${id}`);
  }
});

test('sky model: sun tint warms as the sun drops (physics, not authored keys)', () => {
  const warmth = (id: keyof typeof CIVSIM_ENVIRONMENTS) => {
    const t = skyModelParams(CIVSIM_ENVIRONMENTS[id]).sunTransmittance;
    return t[0] / t[2]; // R/B — higher = warmer
  };
  // dusk (el 0.24) warmer than golden (0.5) warmer than noon (1.22).
  assert.ok(warmth('dusk') > warmth('golden'), 'dusk sun warmer than golden');
  assert.ok(warmth('golden') > warmth('noon'), 'golden sun warmer than noon');
  assert.ok(warmth('golden') > 1.3, 'golden sun visibly warm');
  assert.ok(warmth('noon') < 1.5, 'noon sun near-neutral');
});

test('sky model: turbidity drives overcastness and mie', () => {
  // Overcastness: only the overcast preset reads as overcast.
  assert.equal(overcastFromTurbidity(CIVSIM_ENVIRONMENTS.overcast.physical.turbidity), 1, 'overcast fully overcast');
  for (const id of ['golden', 'noon', 'dusk'] as const) {
    assert.equal(overcastFromTurbidity(CIVSIM_ENVIRONMENTS[id].physical.turbidity), 0, `${id} reads clear`);
  }
  // Monotone axes.
  assert.ok(mieScale(2.0) < mieScale(2.6), 'mie monotone in turbidity');
  assert.ok(mieScale(2.6) < mieScale(9.0), 'overcast carries the most mie');
  assert.ok(overcastFromTurbidity(5.0) < overcastFromTurbidity(7.0), 'overcastness monotone');
});

test('sky model: overcast sun light is desaturated toward grey', () => {
  const overcast = skyModelParams(CIVSIM_ENVIRONMENTS.overcast);
  const spreadT =
    Math.max(...overcast.sunTransmittance) - Math.min(...overcast.sunTransmittance);
  const spreadL = Math.max(...overcast.sunLightColor) - Math.min(...overcast.sunLightColor);
  assert.ok(spreadL < spreadT * 0.05, 'overcast kills the direct sun tint');
  const golden = skyModelParams(CIVSIM_ENVIRONMENTS.golden);
  assert.deepEqual(golden.sunLightColor, golden.sunTransmittance, 'clear presets keep the physical tint');
});

test('sky model: transmittance responds to sun height and turbidity', () => {
  const up: readonly [number, number, number] = [0, 0, 1];
  const low: readonly [number, number, number] = [0, Math.cos(0.15), Math.sin(0.15)];
  const clearUp = transmittanceToSun(up, 2.0);
  const clearLow = transmittanceToSun(low, 2.0);
  // Lower sun → relatively less blue survives (warmer tint after normalizing).
  assert.ok(clearLow[2] < clearUp[2], 'low sun sheds more blue');
  const hazyLow = transmittanceToSun(low, 6.0);
  assert.ok(hazyLow[2] <= clearLow[2] + 1e-9, 'turbidity never adds blue back');
});

// --- Slice 10b: the ONE aerial-perspective owner (turbidity drives the haze) ---

test('aerial: pure, deterministic preset mapping with physical ordering', () => {
  for (const id of PRESET_IDS) {
    const env = CIVSIM_ENVIRONMENTS[id];
    const a = aerialParams(env);
    assert.deepEqual(a, aerialParams(env), `deterministic for ${id}`);
    assert.ok(a.extinction.every((c) => c > 0), `positive extinction for ${id}`);
    assert.ok(a.visibilityKm > 0, `positive visibility for ${id}`);
  }
  const vis = (id: keyof typeof CIVSIM_ENVIRONMENTS) =>
    aerialParams(CIVSIM_ENVIRONMENTS[id]).visibilityKm;
  // Visibility monotone with clarity: noon clearest … overcast heaviest.
  assert.ok(vis('noon') > vis('golden'), 'noon clearer than golden');
  assert.ok(vis('golden') > vis('dusk'), 'golden clearer than dusk');
  assert.ok(vis('dusk') > vis('overcast'), 'dusk clearer than overcast');
  // David's locked moods: golden subtle far haze, overcast HEAVY fog
  // swallowing layered ranges. "Heavy" is judged at the ranges' distance —
  // the vista eye parks ~1 km out, blockers sit 2.5–4 km out, so overcast
  // needs T < ~0.25 there (V < 8 km) while golden's near field stays clear.
  assert.ok(vis('golden') > 20, `golden haze stays subtle (V=${vis('golden')}km)`);
  assert.ok(vis('overcast') < 5, `overcast fog swallows ranges (V=${vis('overcast')}km)`);
});

test('aerial: clear presets scatter blue-first, overcast fog is near-neutral', () => {
  const spectralRatio = (id: keyof typeof CIVSIM_ENVIRONMENTS) => {
    const [r, , b] = aerialParams(CIVSIM_ENVIRONMENTS[id]).extinction;
    return b / r;
  };
  // Rayleigh dominates the clear presets (blue extinguishes ~2x+ red);
  // droplet fog flattens the spectrum for overcast.
  assert.ok(spectralRatio('noon') > 2.0, 'noon aerial is rayleigh-blue');
  assert.ok(spectralRatio('golden') > 1.5, 'golden aerial leans blue');
  assert.ok(spectralRatio('overcast') < 1.3, 'overcast fog is spectrally near-neutral');
});
