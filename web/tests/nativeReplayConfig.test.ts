// @vitest-environment node
import { expect, test } from 'vitest';
import { fileURLToPath } from 'node:url';
import { nativeReplayResidencyPlugin } from '../../apps/battle-perf-lab/src/replay.vite.config.mts';

test('publication alias selects only the native field importer and cannot recurse into its provider', () => {
  const plugin = nativeReplayResidencyPlugin();
  const root = new URL('../../apps/battle-perf-lab/src/', import.meta.url);
  const field = fileURLToPath(new URL('grassField.ts', root));
  const provider = fileURLToPath(new URL('CaptureGrassResidency.ts', root));
  const source = '../../../packages/game-renderer/src/battle/battleGrassResidency';
  expect(plugin.resolveId(source, field)).toBe(provider);
  expect(plugin.resolveId(`${source}.ts`, `${field}?v=1`)).toBe(provider);
  expect(plugin.resolveId(source, provider)).toBeNull();
  expect(
    plugin.resolveId(
      source,
      fileURLToPath(
        new URL('../../../packages/photoreal-renderer/src/battle/battleGrassField.ts', root),
      ),
    ),
  ).toBeNull();
  expect(plugin.resolveId('./other', field)).toBeNull();
});
