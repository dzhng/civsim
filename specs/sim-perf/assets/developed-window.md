# Why the budget also checks developed combat

The original first-contact rule measures ticks 575–875 in the expanded
30,560-soldier fixture, with a minimum of only 49 living fighters. That is a
valid opening-skirmish measurement, but insufficient evidence for the broad
30k fighting budget.

[Deterministic reconnaissance](developed-window.csv), against the unchanged
simulation with the same seed and spawn grid, found:

| Tick | Living soldiers | Living fighters | Units with living fighters |
|---|---:|---:|---:|
| 1500 | 30,402 | 3,359 | 20 |
| 1750 | 30,300 | 3,400 | 20 |
| 2000 | 30,178 | 3,553 | 20 |

The probe matched the first fixture's hash at tick 875
(`a0bce061b5e99c62`); tick 1500 is `3123f0024a5cfb48`. These rows are sampled
state observations, not a per-tick minimum or performance measurement.
Concurrent correctness jobs made their wall times inadmissible.

The standing budget therefore retains the opening check and adds a window
starting no earlier than tick 1500, after the same contact preparation. Both
windows must meet 25 ms; the developed window must also retain at least
30,000 living soldiers. The fixed later window samples established combat
without following the battle so far that casualties make it a smaller-army
test. Its current per-tick minimum and exact end hash come from the benchmark
output, not interpolation between reconnaissance samples.

`profile_tick fighting <soldiers> <earliest_tick>` exposes the same measurement
for interleaved comparisons. Omitting the earliest tick preserves the original
first-contact sweep; the 60k number in the standing gate remains telemetry.

## Harness verification

The completed two-repeat run prints the exact window `1500..1800`, living
population `30402 -> 30280`, per-tick minimum **3344** living fighters, and
end hash **`080c80b28e8ae3db`** in both repeats. `cargo check -p sim --bin
profile_tick` passes; independent read-only review found no defects in the
window, retained opening coverage, timing boundaries or population guard.

The observed means (40.723 and 43.165 ms) were collected while the workspace
correctness suite ran. They verify the instrument's output, but are **not an
admissible performance baseline or budget verdict**. Performance comparisons
must rebuild all variants with this same harness and verify their printed
windows and hashes; older binaries silently ignore the extra earliest-tick
argument and would compare different phases of the battle.
