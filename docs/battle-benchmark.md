# Battle benchmark

Choose **Battle Benchmark** in the main menu. It prepares a seeded battle at
contact, then runs five minutes of live combat with a repeatable action-following
camera. The tour owns game input so manual orders or zoom changes cannot make a
run easier. Cancel remains available. Campaign saves and custom battle setups
are not part of the benchmark's state.

Preparation advances real simulation ticks in bounded chunks while retaining a
valid displayed frame. Those ticks run in the battle authority (see
[docs/battle-authority.md](battle-authority.md)), so preparation does not spend
the drawing thread's time, and cancelling it remains serviced throughout. The
initial contact view is rendered and settled before timing starts. The authority
holds that exact contact tick throughout settling and resumes only when the
recording clock starts; a run that overshoots its declared start is rejected. Camera
movement during the timed window is measured as it happens; newly encountered
grass, model detail or shader work is not warmed away.

The results distinguish elapsed real time from simulation time. Frame cadence and
tick cadence are independent, so a smooth chart is not evidence that the
simulation kept up. A slow machine can fall behind the simulation clock; five
minutes on the chart does not prove five minutes of simulated combat elapsed. Frame times are animation-callback
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
current-callback work occurs after the recorded interval. GPU query results arrive later and are matched by submission identity, never by
whichever timing resolved most recently. The final report freezes at run end and
keeps pending or missing results and cursor gaps visible. GPU pass times exclude
uploads, copies, queue wait and presentation, and must not be added to CPU time
as a frame total.
