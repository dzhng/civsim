# Slice 04 — Budget checkpoint (measure, decide)

## Contract unlocked

An honest fork in the ladder: after the pure-perf slices (`01`–`03`), measure
against the locked budget (30k fighting ≤ 25 ms) and decide the rest of the
spec's fate with David.

## What to do

- Run the full bench sweep (5k/15k/30k/60k, idle+fighting, per the
  investigation methodology). Record the ledger + the 60k superlinearity trend
  (baseline: 30k→60k fighting was ×2.71 for ×1.97 soldiers — has it improved?).
- **If ≤ 25 ms at 30k fighting:** the budget gate flips green; slices `05`–`07`
  become OPTIONAL headroom. Present the numbers to David (non-blocking, ~5 min
  window per house style): stop here, or continue for headroom / 60k ambitions.
  Record the call in the README.
- **If still > 25 ms:** the behavior track opens per the locked interview
  ("everything on the table"). Pick the next slice by measured deficit — `05`
  sleeping if idle-adjacent cost dominates, `06` parallelism if the engaged
  front is irreducible — and record the reasoning.
- Either way: if the 60k trend WORSENED, flag it — the deferred projection
  work (investigation rec #3) may need to enter the spec.

## Must stay green

Everything; this slice changes nothing.
