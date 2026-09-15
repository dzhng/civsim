import { fileURLToPath } from 'node:url';
import base from './pmrem.vite.config.mts';

const field = fileURLToPath(new URL('../grassField.ts', import.meta.url));
const provider = fileURLToPath(new URL('../CaptureGrassResidency.ts', import.meta.url));
const residency = '../../../packages/game-renderer/src/battle/battleGrassResidency';

/** Only the native lab field consumes resolved publications; the provider's
 * own production import and all ordinary battle imports remain untouched. */
export function nativeReplayResidencyPlugin() {
  return {
    name: 'native-replay-grass-publications',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      return importer?.split('?')[0] === field &&
        (source === residency || source === `${residency}.ts`)
        ? provider
        : null;
    },
  };
}

// Build scene and control together so both retain the same publication queue.
// This does not replace the production menu renderer.
export default {
  ...base,
  plugins: [...(base.plugins ?? []), nativeReplayResidencyPlugin()],
  build: {
    outDir: fileURLToPath(new URL('../../../../throwaway/native-replay/dist', import.meta.url)),
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./replayControl.ts', import.meta.url)),
      formats: ['es' as const],
      fileName: 'replay-control',
    },
  },
};
