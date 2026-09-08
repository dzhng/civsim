# tick/03 — Budget checkpoint (measure, decide)

## Contract unlocked

An honest fork in the ladder: after the pure-perf slices, measure against
the locked budget (30k fighting ≤ 25 ms, native release, on the
implementing machine) and decide the rest of the tick track's fate with
David.

## What to do

- Run tick/00's full sweep (15.5k, 30k, 60k; idle and fighting). Record the
  ledger rows and the 30k → 60k ratio (July: fighting cost ×2.71 for ×1.97
  soldiers — has it improved?).
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

Everything; this slice changes nothing.
