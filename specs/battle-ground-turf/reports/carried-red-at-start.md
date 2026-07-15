# Carried snapshot state at slice 00

Captured on 2026-07-16 from commit `9a18f22e` with:

`VERIFY_URL=http://localhost:5176 bun run verify`

The production gate carried five red checks before slice 00 could claim a clean
suite:

- `banner-gallery` — `banner-chips-row` and `banner-chips-max` pixel baselines.
- `banner-gallery` — the pinned-time pan assertion and `battle-readout-pan-end`
  baseline (the published time advanced).
- `battle-smoke` — `battle-initial` differed by 858 pixels (0.0838%).

All other checks in the packaged gate passed, including battle renderer identity,
LOD readability, selection at DPR 1/2, battle smoke behavior, and the other
snapshots. Slice 00 does not touch the production world: `git diff` contains no
existing battle snapshot and no production terrain consumer. These five failures
remain carried-red and were not blessed.
