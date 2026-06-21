// The sanity sweep: run every vibe scenario, pixel-checking every frame against
// its committed baseline in web/shots/baseline/vibe/<name>/. Run from web/ with
// the dev server up:
//   node vibe/all.mjs              # all scenarios, 4 at a time
//   JOBS=2 node vibe/all.mjs       # throttle parallelism
//   UPDATE_SHOTS=1 node vibe/all.mjs  # re-bless after an intended mechanics change
// A scenario exits non-zero when a frame drifts (diff in shots/diff/vibe/...);
// flip through the baselines to review. Add a row here when you add a scenario.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const webDir = dirname(dirname(fileURLToPath(import.meta.url))); // web/

// name -> shots/<name>/ ; script + env are how it's driven (class ids).
const SCENARIOS = [
  { name: 'heavy-both', script: 'duel-posture.mjs', env: { ATK: 0, DEF: 0, POSTURE: 'both' } },        // heavy v heavy, both attack
  { name: 'heavy-move-clash', script: 'move-clash.mjs', env: { ATK: 0, DEF: 0 } },                    // INVARIANT: both MOVE to each other's start — should match heavy-both minus charge
  { name: 'heavy-attack-defend', script: 'duel-posture.mjs', env: { ATK: 0, DEF: 0, POSTURE: 'hold' } }, // same heavies, one holds
  { name: 'heavy-v-phalanx-defend', script: 'duel-posture.mjs', env: { ATK: 0, DEF: 3, POSTURE: 'hold' } }, // heavy charges a holding pike wall
  { name: 'phalanx-v-heavy', script: 'duel-posture.mjs', env: { ATK: 3, DEF: 0, POSTURE: 'both' } },  // pikes outreach swords
  { name: 'pike-v-pike', script: 'duel-posture.mjs', env: { ATK: 3, DEF: 3, POSTURE: 'both' } },      // two pike walls, both attack
  { name: 'cav-v-heavy', script: 'duel-posture.mjs', env: { ATK: 6, DEF: 0, POSTURE: 'both' } },      // horse rides over swords
  { name: 'cav-v-pike', script: 'charge.mjs', env: { ATK: 6, DEF: 3 } },     // impale/charge gate: can held pikes stop horse?
  { name: 'cav-v-heavy-held', script: 'charge.mjs', env: { ATK: 6, DEF: 0 } }, // braced line vs charge
  { name: 'heavy-v-archers', script: 'missile.mjs', env: {} },
  { name: 'penetration', script: 'penetration.mjs', env: {} },               // defense: 1 column into a held line
  { name: 'multi-penetration', script: 'multi-penetration.mjs', env: {} },   // defense: 3 columns at once
  { name: 'offense', script: 'offense.mjs', env: {} },                       // offense: wide line wraps a block
  { name: 'surround', script: 'surround.mjs', env: {} },                     // 3v1: a square held, surrounded
  { name: 'surround-attack', script: 'surround.mjs', env: { ATTACK: 1 } },   // 3v1: same, but it sallies out
];

const CONCURRENCY = Math.max(1, Number(process.env.JOBS ?? 4));

function run(s) {
  return new Promise((resolve) => {
    const env = { ...process.env, NAME: s.name };
    for (const [k, v] of Object.entries(s.env)) env[k] = String(v);
    const child = spawn('node', [join('vibe', s.script)], { cwd: webDir, env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      const line = out.split('\n').reverse().find((l) => /resolved|\d+ frames|UNRESOLVED/.test(l));
      console.log(`  ${s.name.padEnd(18)} ${(line ?? `EXIT ${code}`).trim()}`);
      resolve({ name: s.name, code });
    });
  });
}

console.log(`Refreshing ${SCENARIOS.length} vibe scenarios (${CONCURRENCY} at a time)...`);
const queue = [...SCENARIOS];
const results = [];
const worker = async () => { while (queue.length) results.push(await run(queue.shift())); };
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const failed = results.filter((r) => r.code !== 0);
console.log(failed.length
  ? `\n${failed.length} scenario(s) drifted or errored: ${failed.map((r) => r.name).join(', ')}`
    + `\n  review shots/diff/vibe/<name>/, then UPDATE_SHOTS=1 to re-bless intended changes`
  : `\nall ${results.length} scenarios match their baselines`);
process.exit(failed.length ? 1 : 0);
