// @vitest-environment node
import { expect, test } from 'vitest';
import { fileURLToPath } from 'node:url';
import { nativeReplayResidencyPlugin } from '../../apps/battle-perf-lab/src/replay.vite.config.mts';

test('publication alias selects only the native field importer and cannot recurse into its provider', () => {
  const plugin = nativeReplayResidencyPlugin();
  const packages = new URL('../../packages/', import.meta.url);
  const field = fileURLToPath(new URL('battle-renderer/src/grassField.ts', packages));
  const provider = fileURLToPath(
    new URL('../../apps/battle-perf-lab/src/CaptureGrassResidency.ts', import.meta.url),
  );
  const source = '../../game-renderer/src/battle/battleGrassResidency';
  expect(plugin.resolveId(source, field)).toBe(provider);
  expect(plugin.resolveId(`${source}.ts`, `${field}?v=1`)).toBe(provider);
  expect(plugin.resolveId(source, provider)).toBeNull();
  expect(
    plugin.resolveId(
      source,
      fileURLToPath(new URL('photoreal-renderer/src/battle/battleGrassField.ts', packages)),
    ),
  ).toBeNull();
  expect(plugin.resolveId('./other', field)).toBeNull();
});
