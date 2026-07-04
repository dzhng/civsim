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

## Feedback that would change it

A different perf target (e.g. 60 fps hardware floor) — budgets are
parameters; the stratification machinery doesn't change.
