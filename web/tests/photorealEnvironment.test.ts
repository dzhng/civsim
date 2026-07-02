// Environment seam pin: every CIVSIM_ENVIRONMENTS preset maps into the
// photoreal spec, no preset is invented, and the mapping is a pure function of
// the ONE preset owner (packages/game-renderer/src/environment/environment.ts).
import assert from 'node:assert/strict';
import test from 'node:test';
import { CIVSIM_ENVIRONMENTS } from '../../packages/game-renderer/src/environment/environment.ts';
import { photorealEnvironment } from '../../packages/photoreal-renderer/src/environment.ts';

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
    assert.deepEqual(spec.sunColor, env.keyColor, `key color for ${id}`);
    assert.deepEqual(spec.skyZenithColor, env.skyZenithColor, `zenith for ${id}`);
    assert.deepEqual(spec.skyHorizonColor, env.skyHorizonColor, `horizon for ${id}`);
    assert.deepEqual(spec.groundBounceColor, env.groundBounceColor, `ground bounce for ${id}`);
    assert.deepEqual(spec.hazeColor, env.hazeColor, `haze for ${id}`);
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
  // Sun-vs-sky: overcast is the diffuse register — weakest direct sun; noon
  // is the clear neutral reference — strongest, highest sun.
  assert.ok(overcast.sunIntensity < dusk.sunIntensity, 'overcast sun weaker than dusk');
  assert.ok(overcast.sunIntensity < golden.sunIntensity, 'overcast sun weaker than golden');
  assert.ok(noon.sunIntensity >= golden.sunIntensity, 'noon sun at least golden');
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
        specA.hazeColor.join() !== specB.hazeColor.join();
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
    a.skyZenithColor[1] = 999;
    assert.equal(JSON.stringify(env), before, `spec arrays must be copies for ${id}`);
  }
});
