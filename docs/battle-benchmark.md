# Battle benchmark

Choose **Battle Benchmark** in the main menu. It prepares a seeded battle at
contact, then runs five minutes of live combat with a repeatable action-following
camera. The tour owns game input so manual orders or zoom changes cannot make a
run easier. Cancel remains available. Campaign saves and custom battle setups
are not part of the benchmark's state.

Preparation advances real simulation ticks in bounded chunks while retaining a
valid displayed frame. The initial contact view is rendered and settled before
timing starts. Camera movement during the timed window is measured as it happens;
newly encountered grass, model detail or shader work is not warmed away.

The results distinguish elapsed real time from simulation time. A slow machine
can fall behind the simulation clock; five minutes on the chart does not prove
five minutes of simulated combat elapsed. Frame times are animation-callback
cadence, not a physical input-to-display measurement. FPS lows come from the
slowest raw intervals, and chart bins preserve their minimum and maximum, so a
single hitch cannot disappear in an average. Export JSON retains raw intervals,
camera phases and workload identity for comparison.

A cancelled, interrupted or early-ending run stays partial. Compare complete
runs with the same scenario/camera version, graphics settings, physical render
resolution and start-state identity. Preparation time is reported separately;
an incomplete recording has unavailable metrics rather than an invented zero.

The raw frame record pairs an incoming callback interval with work performed in
that callback. To attribute a gap, inspect the preceding callback’s CPU work;
current-callback work occurs after the recorded interval. GPU timings require
submission correlation and must not be added to CPU time as a frame total.
