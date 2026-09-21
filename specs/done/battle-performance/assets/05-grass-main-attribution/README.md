# Grass beauty cost in a fixed-state control

The fixed enabled Three build at 98fc8a45 runs grass on/off/off/on at generated
seed 7, tick 30, 1440×900 CSS and DPR 2. Simulation is paused, fixed-time freezing
is released and every recorded frame has a distinct real submission. All four
state hashes remain 15927906182668164452 and all sampled submissions have complete
GPU ranges. The existing bounded telemetry is polled every 250 ms without adding
queries or waiting for GPU completion. Raw host observations accompany every arm.

Ten-second tactical and horizon holds precede twenty seconds of the production
combined camera path. Only grass changes; shadows, far-grass preference, bloom,
crowd and physical resolution stay fixed. First camera-boundary work is included.
This is a feature diagnostic, not a backend ranking or final acceptance workload.

| Phase | Grass-on GPU union median (two runs) | Grass-off median (two runs) |
| --- | --- | --- |
| Tactical | 12.91 / 12.72 ms | 8.50 / 8.38 ms |
| Horizon | 17.47 / 17.64 ms | 12.25 / 12.23 ms |
| Combined | 16.80 / 19.39 ms | 11.83 / 11.66 ms |

The stationary comparisons identify a repeatable several-millisecond whole-grass
cost in this fixture. They do not separate vertex work, shading, receiver work,
routing or residency. The second grass-on moving run is noisier and reports a
different late grass count; do not treat its delta as identical-content shader
cost. Counter snapshots are asynchronous and do not establish exact per-draw work.

Crucially this tick-30 fixture is **not** the contact-window benchmark state. At
sampled tactical views no main-view soldiers are visible; horizon samples mostly
use L2 soldiers. It cannot subtract grass cost from the live benchmark's 44 ms main
pass. It instead motivates checking the much larger L0 crowd workload at contact.
Disabled grass is not an acceptable product result. No visuals or thresholds were
changed or approved by this experiment.
