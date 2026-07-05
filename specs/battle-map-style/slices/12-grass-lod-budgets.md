# 12 — Grass LOD budgets at 30k

Harden the blade field's budgets so the frame holds under real load and the
budgets can't silently inflate later.

## Contract unlocked

Pinned, telemetried grass budgets: the perf envelope becomes a contract, not
a hope.

## API seam

- **Stratified near/mid/far record budgets** (salvaged pattern): when the
  record cap bites, candidates are budgeted per LOD tier by distance+hash
  stratification, never first-N grid-scan truncation.
- Blade ring: blades exist only within the LOD tiers' outer radius of the
  camera target (research convention: ~150–250 m); beyond it the terrain
  material carries grass color — the slice-16 haze eats the seam. Stochastic
  distance thinning by per-record hash (temporally stable).
- Telemetry as scene stats: records per tier, submitted triangles, draw call
  count (must stay at the tier count), screen-coverage probe (projected
  base→tip crop-intersection ratios and pixel-height percentiles), churn on
  camera moves.

## Human can run

The battle route with a stats overlay; the perf scene.

## Verification

- `perf:30k` green with full grass density on a generated seed AND on the
  heaviest hand map.
- A stats-asserting scene pins the budget numbers (deliberate re-bless to
  change them).
- Vista + close crops still pass their oracles after budgeting (thinning must
  not reintroduce speckle — the oracle's downsample-retention check is the
  guard).
- **Out of scope wrongness:** color, wind, terrain, anything not budget/perf.

## Stays green

Slices 10–11 verdicts, perf:30k, tripwires.

## Landed (2026-07-05) — BMS12-SLICE-A3B7

- Blade-field routing now applies stochastic distance thinning in the GPU
  compute route before appending visible indices. The hash source is the packed
  `bladeSeed` normalized to seed01 and remixed as `fract(seed01 * 7.13)`, not a
  large-argument sine. The fade band is derived from the active far tier:
  close-lab `20→64 m`, production `30→150 m`.
- The old ring-edge color-only dissolve is no longer the coverage policy:
  records thin out through the far tier before the hard cull. Survivors still
  get a gentle meadow albedo blend at the edge.
- `grassField.ts` owns the additive `lodStratifiedBudget` opt-in. Production
  enables it with the 110k cap and fixed quotas `48% / 37% / remainder`;
  existing callers retain the prior first-cap behavior unless opted in.
- Stats now publish per-tier route candidates, survivors, thinning drops,
  total hard-cull/thin counts, and data-owner LOD candidate/quota/drop
  telemetry. `battle-perf-30k.mjs` pins the production 110k sample budget,
  quota tuple, and vista survivor/triangle floors.
- Sandboxed verification: `node --experimental-strip-types --import
  ./tests/register-ts-extension-loader.mjs --test tests/grassField.test.ts`,
  `node --check scenes/battle/battle-perf-30k.mjs`, `bun run typecheck`,
  `bun run lint`, and `bun run format:check`.

ORCHESTRATOR-TODO: run the browser grass scenes and crop oracles, run
`perf:30k` on hardware, inspect/re-bless any battle evidence shots, and run the
`battle-terrain-elevation` tripwire.

## Landed (2026-07-05)

- Stochastic distance thinning in the GPU route (fract hash of bladeSeed,
  smoothstep over the far tier band) with a CPU stats mirror; production-only
  (same flag as the edge fade) — the ratified close-lab envelope renders full
  density (orchestrator gate fix: codex applied it universally, which broke
  the slice-10 close-gate oracle).
- Stratified near/mid/far record budgets (48/37/rest) landed additively in
  the data owner (grassField.ts, opt-in); production enables it; pure-node
  unit tests green (84 pass).
- Telemetry: per-tier candidates/survivors/thinning drops + sample quotas
  and budget drops; battle-perf-30k pins the 110k budget, quota tuple, and
  survivor floors.
- Gates: all battle scenes green; perf:30k hardware PASS (GPU median
  5.4/6.1 ms; 49k records thinned at the vista); vista shows a fully smooth
  density falloff — no coverage line at any zoom; past the ring the terrain
  carries the color (by design; zoom-3 gameplay framing has no blades).

## Feedback that would change it

A different perf target (e.g. 60 fps hardware floor) — budgets are
parameters; the stratification machinery doesn't change.
