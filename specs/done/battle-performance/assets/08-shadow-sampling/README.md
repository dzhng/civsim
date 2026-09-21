# Outside-volume sampling candidate: not adopted

Candidate7fcc3ba2 adds an early return before the five explicit-level shadow taps
when the existing map-volume predicate is false. Coordinate math, bias and inside
sampling remain unchanged. All three full-frame single/High/off comparisons are
pixel-exact at tick30/hash15927906182668164452, CSS1440×900 DPR2; no page errors.
Root TypeScript passes; worker reports46 focused checks and independent review.

The predeclared ABBA screen required both candidate medians to beat both controls
at each pose. It **fails at both poses**:

| Pose | Control first / last, ms | Candidate first / second, ms |
| --- | --- | --- |
| Tactical |17.003 /16.959 |16.864 /16.980 |
| Horizon |9.423 /6.688 |7.448 /7.430 |

These are complete final-submission GPU spans,180 measured camera steps after60
warmup steps. Every step joins its real submission identity with no missing query
or cursor gap. The tactical path additionally renders intermediate submissions;
all-window event counts match356 across all arms (horizon180). Their interval-union
work totals are retained as diagnostics; they are not wall-clock FPS or sums of
overlapping pass times. Frozen simulation and fixed figures make this a bounded
GPU camera-cost screen, not the final live benchmark.

Owned builds/tests/GPU jobs were serialized. External applications heavily loaded
the host; process snapshots are retained. The reverse-order control reverses the
initial apparent horizon win. Neither improvement nor regression is established
reliably enough for adoption. Do not repeat this experiment just to seek a win.
Candidate code stays outside production, with its branch and evidence retained.
