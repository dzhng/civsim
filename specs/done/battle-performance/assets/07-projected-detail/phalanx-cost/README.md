# Single-class geometry cost remains inconclusive

This warm stationary control prepares the exact canonical contact state once,
then reloads original / 4k phalanx / 4k phalanx / original catalogs. Only the
phalanx near mesh changes. Far impostor source, other mesh tiers, materials,
animations and all other appearances remain original. Each camera warms for ten
seconds, then records ten seconds. Normal grass, shadows and post remain enabled.
Reloading occurs outside measurement and clears crowd history for both variants.

Actual consumed cameras and per-class main admissions match across all arms;
phalanx near counts are 1,230, 1,000 and 1,330 at the three selected poses. The
loaded near geometry changes from 7,984 to 4,012 triangles. State hashes remain
canonical and submitted frames advance. This establishes the intended workload
change. It does not establish a bounded intermediate LOD policy or visual quality.

GPU summaries use only submission IDs associated with recorded in-window frames.
Incomplete/missing tail measurements are excluded, never zero-filled; coverage
is explicit in summary.json. Observed GPU interval union is not physical GPU
busy time. Main/post/shadow stages may overlap and must not be added together.

| Camera tour time | Original first GPU median | Candidate first | Candidate second | Original return |
| --- | ---: | ---: | ---: | ---: |
| 0 s | 40.79 ms | 46.04 ms | 53.07 ms | 61.69 ms |
| 60 s | 36.29 ms | 36.51 ms | 45.18 ms | 48.06 ms |
| 150 s | 49.29 ms | 50.01 ms | 60.95 ms | 58.16 ms |

The original return also deteriorates substantially. This experiment cannot
separate a small geometry benefit from drift. Do not conclude that the candidate
is faster, slower, or worthless. Host sampling starts partway through the first
arm, so host-partial is explicitly incomplete; no quiet-host classification is
claimed. Reload effects and external/thermal contention are not separately
attributed. A spot pmset query reports AC power and no recorded thermal warning;
that does not prove stable GPU clocks or rule out contention.

Next isolate the larger main-geometry contribution at one stationary camera,
reusing existing buffers in the same crowd without asset reload. Temporarily
substituting existing middle geometry is a cost diagnostic only: its known visual
defects exclude it from production acceptance. Stop expanding candidate asset
work until a material geometry-cost opportunity is demonstrated.
