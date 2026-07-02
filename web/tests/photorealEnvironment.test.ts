// Environment seam pin: every CIVSIM_ENVIRONMENTS preset maps into the
// photoreal spec, no preset is invented, and the mapping is a pure function of
// the ONE preset owner (packages/game-renderer/src/environment/environment.ts).
import assert from 'node:assert/strict';
import test from 'node:test';
import { CIVSIM_ENVIRONMENTS } from '../../packages/game-renderer/src/environment/environment.ts';
import { photorealEnvironment } from '../../packages/photoreal-renderer/src/environment.ts';

const PRESET_IDS = Object.keys(CIVSIM_ENVIRONMENTS) as (keyof typeof CIVSIM_ENVIRONMENTS)[];

test('photoreal environment: every preset id maps', () => {
  assert.ok(PRESET_IDS.length >= 3, 'expected the civsim preset table');
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
    assert.equal(spec.exposure, env.exposure, `exposure for ${id}`);
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
