// Compatibility wrapper for the WebGPU campaign visual scene. Prefer
// `VERIFY_WEBGPU=1 node scene.mjs campaign-webgpu-visual` for new work.
import { main } from './scene.mjs';

process.env.VERIFY_WEBGPU ??= '1';

const code = await main(process.argv.slice(2), {
  includeNames: ['campaign-webgpu-visual'],
});
process.exit(code);
