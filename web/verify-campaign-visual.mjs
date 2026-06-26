import { main } from './scenario.mjs';

process.env.VERIFY_WEBGPU = process.env.VERIFY_WEBGPU ?? '1';

const code = await main(process.argv.slice(2), {
  includeNames: ['campaign-webgpu-visual'],
});
process.exit(code);
