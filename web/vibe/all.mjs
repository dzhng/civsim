// The sanity sweep: run every vibe scenario, refreshing all of
// web/vibe/shots/<name>/ in one command. Run from web/ with the dev server up:
//   node vibe/all.mjs            # all scenarios, 4 at a time
//   JOBS=2 node vibe/all.mjs     # throttle parallelism
// Each scenario clears and rewrites its own shots folder; flip through them
// after. Add a row here when you add a scenario.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const webDir = dirname(dirname(fileURLToPath(import.meta.url))); // web/

// name -> shots/<name>/ ; script + env are how it's driven (class ids).
const SCENARIOS = [
  { name: '1v1', script: '1v1.mjs', env: {} },                       // heavy vs heavy
  { name: 'phalanx-v-heavy', script: '1v1.mjs', env: { A: 3, B: 0 } },
  { name: 'cav-v-heavy', script: '1v1.mjs', env: { A: 6, B: 0 } },
  { name: 'cav-v-pike', script: 'charge.mjs', env: { ATK: 6, DEF: 3 } },     // points stop horse
  { name: 'cav-v-heavy-held', script: 'charge.mjs', env: { ATK: 6, DEF: 0 } }, // braced line vs charge
  { name: 'heavy-v-archers', script: 'missile.mjs', env: {} },
  { name: 'rout-heavy', script: 'rout.mjs', env: { A: 0, B: 0 } },           // watch a rout flee home
  { name: 'rout-cav-heavy', script: 'rout.mjs', env: { A: 6, B: 0 } },
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
      const line = out.split('\n').reverse().find((l) => /resolved|frames ->|UNRESOLVED/.test(l));
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
  ? `\n${failed.length} scenario(s) errored: ${failed.map((r) => r.name).join(', ')}`
  : `\nall ${results.length} scenarios refreshed -> web/vibe/shots/`);
process.exit(failed.length ? 1 : 0);
