import assert from 'node:assert/strict';
import { test } from 'vitest';
import { requireSwiftShaderBaseline } from '../scenes/models/_swiftshader-baseline.ts';

test('model baselines reject missing GPU flags and hardware before capture', () => {
  for (const env of [
    {},
    { VERIFY_GPU: '0' },
    { VERIFY_GPU: '1', VERIFY_GPU_ADAPTER: 'hardware' },
  ]) {
    assert.throws(
      () => requireSwiftShaderBaseline('model-scene', env),
      /model-scene:.*VERIFY_GPU=1.*no screenshots were taken/,
    );
  }
});

test("model baselines accept the scene runner's SwiftShader configurations", () => {
  for (const env of [{ VERIFY_GPU: '1' }, { VERIFY_GPU: '1', VERIFY_GPU_ADAPTER: 'swiftshader' }]) {
    assert.doesNotThrow(() => requireSwiftShaderBaseline('model-scene', env));
  }
});
