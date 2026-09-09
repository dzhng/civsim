# Final retained measurements

The same harness and fixtures ran in the original pre-task simulation and
final retained build. The original uses one serial worker; retained native
execution enables `parallel` with eight Rayon workers. All before/after
load checks were below 10. Every repeated final state hash matches its
original counterpart. [Raw logs and run metadata](final-scaled-measurements.json)
preserve all means, standard deviations, population and contact counts.

| Fixture | Target | Original ms/tick | Retained ms/tick |
|---|---:|---:|---:|
| Commanders disabled | 15,500 | 4.403 | 4.396 |
| Commanders disabled | 30,500 | 12.112 | 11.791 |
| Commanders disabled | 60,000 | 20.563 | 19.994 |
| Opening contact | 15,500 | 14.884 | 13.777 |
| Opening contact | 30,500 | 21.992 | 20.459 |
| Opening contact | 60,000 | 54.440 | 52.030 |

The grid produces 15,560 / 30,560 / 60,060 soldiers. No living fighters
were observed in any commanders-disabled run. Opening combat is sparse:
minimum living fighters are 4 / 49 / 53. The developed 30k window remains
the separate broad-combat evidence; opening cost must not stand in for it.

The opening 30k→60k ratio is 2.475 original and 2.543 retained. Absolute
cost falls at both sizes, but proportional scaling is slightly worse. The
60k result is telemetry and does not reopen optimization under David's
simple-changes limit.

The first final gate measured opening 20.731 ms, developed 35.017 ms and
60k 52.166 ms; its strict 35 ms check exited 1. Developed combat retained
30,280 living soldiers with at least 3,344 fighting. This boundary result
is 0.017 ms above the threshold; the earlier qualified revised-weapon-repel
comparison measured 34.896 ms, which David explicitly accepted as sufficient.
Neither result is hidden or substituted for the other.

The actual `scripts/test-perf` entry-point run completed with exit 0:
opening 20.212 ms, developed 34.279 ms and 60k 51.482 ms. Developed combat
retains the same state hash and 30,280 living soldiers. Load was 3.330 before
and 5.542 after. [The command output and metadata](standing-gate-final.json)
record the pass. No optimization or threshold edit occurred between this
run and the earlier boundary result; both are retained to expose variation.
