# tick/03 — Budget checkpoint (measure, decide)

## Contract unlocked

An honest fork in the ladder: after the pure-perf slices, measure against
the locked budget (30k fighting ≤ 25 ms, native release, on the
implementing machine) and decide the rest of the tick track's fate with
David.

## What to do

Current decision: proceed with exact native parallelism experiments. The
qualifying developed window remains near 39 ms after the pure reductions;
targeting, projection and weapon repel dominate. Sleeping cannot remove
those engaged-contact costs and would change behavior, so it is not the
next lever. Independent weapon-repel search and whole-unit steering passes
can be implemented concurrently, but their timing and integration are
serialized. Each must preserve the original hashes at 1/2/8 threads and
demonstrate useful gain before being retained. Projection follows only if
the smaller pass justifies the concurrency machinery. The complete scaled
sweep remains a required checkpoint deliverable; this decision does not
claim that telemetry or the budget has passed.

- Run tick/00's full sweep (15.5k, 30k, 60k; idle and fighting).
  `profile_tick idle [soldiers]` uses the same spawn grid with commanders
  disabled, two fresh 600-tick runs, and per-repeat mean/stddev and hashes.
  Here `idle` means commanders disabled: the fixed grid can still produce
  initial contact at larger sizes. Each repeat reports `max_living_fighting`,
  sampled outside the tick timer, so contact cannot be mistaken for idle cost.
  Omitting the target sweeps all three sizes. Record the
  ledger rows and the 30k → 60k ratio (July: fighting cost ×2.71 for ×1.97
  soldiers — has it improved?).
- Validate what the measured window represents. The exact expanded spawn
  grid reaches first contact much earlier than the generated-only battle;
  the initial 30k window contained a minimum of only 49 living fighters.
  The developed window starts no earlier than tick 1500 and measures 300
  ticks: reconnaissance found over 30k living soldiers and roughly 3.4k
  living fighters across 20 units there. The standing gate retains the
  opening window and also requires the developed window to meet 25 ms with
  at least 30k still alive. A cheap opening skirmish alone does not establish
  the broad fighting budget. See [window evidence](../../assets/developed-window.md).
- **If ≤ 25 ms at 30k fighting:** the gate flips green; tick/04 and tick/05
  become optional headroom. Present the numbers to David (non-blocking,
  about five minutes per house style): stop the tick track here, or continue
  for headroom or 60k ambitions. Record the call in the README.
- **If still > 25 ms:** the behavior track opens per the July interview
  ("everything on the table"). Pick the next slice by measured deficit —
  tick/04 sleeping if idle-adjacent cost dominates, tick/05 parallelism if
  the engaged front is irreducible — and record the reasoning. A lower sim
  Hz as a product fallback is also David's call here, made on vibes at the
  candidate rate; the worker track does not imply it.
- Either way: if the 60k trend worsened, flag it — the deferred 60k
  projection work (investigation recommendation 3) may need to enter the
  spec as a slice.

## Must stay green

Everything; the checkpoint extends measurement coverage, never simulation behavior.

Harness validation: `cargo check -p sim --bin profile_tick` and the release
build passed. Both fresh `idle 15500` repeats retained 15,560 living soldiers
and hash `ed293ec75fc41bcb`; both `fighting 30500` repeats retained the existing
opening-window hash `a0bce061b5e99c62`. Independent read-only review found no
issues. These checks ran alongside other workspace work, so their timings
are not budget evidence; the paired sweep must use the identical harness
for the original baseline and the candidate.
