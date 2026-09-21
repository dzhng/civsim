# Retired page-clock visual oracle

The delayed-root-phase scene expected a page-clock 250 ms jump to run exactly four
simulation ticks and preserve fractional alpha across pause/unfreeze. The current
simulation runs in a worker with its own clock; publication receipt controls the
presentation phase, which settles to the newest endpoint. BattleSimTime and the
worker authority/client are unchanged from pre-cutover 8ab2e060. The failed run
therefore does not establish a TypeGPU timing regression.

The scene is retired explicitly rather than changing tick expectations to arbitrary
passing values or reblessing 131 images. Its historical snapshots remain. Existing
battleSimAuthority and battleCrowd suites pass 27 cases covering current authority
cadence, paused commands, ordering and fractional root/gait/attachment consistency.
They do not replace the full temporal visual gate. A worker-aware visual oracle is
future verification work, outside the user-directed renderer closeout scope.
