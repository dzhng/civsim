// Compatibility wrapper for the battle scenarios. Prefer `node scenario.mjs`
// for new work; this keeps the historical npm scripts and SNAP filters alive.
import { main } from './scenario.mjs';

const args = process.argv.slice(2);
const full = args.includes('--full');
const includeNames = [
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
