// Compatibility wrapper for the battle scenes. Prefer `node scene.mjs`
// for new work; this keeps the historical npm scripts and SNAP filters alive.
import { main } from './scene.mjs';

process.env.VERIFY_GPU ??= '1';

const args = process.argv.slice(2);
const full = args.includes('--full');
const includeNames = [
  'battle-renderer-default',
  'battle-smoke',
  'battle-lod',
  'battle-selection',
  'banner-gallery',
  ...(full ? ['battle-cavalry-plow', 'battle-ai'] : []),
];

main(args, { includeNames }).then((code) => process.exit(code)).catch((error) => {
  console.error(error.message);
  process.exit(2);
});
