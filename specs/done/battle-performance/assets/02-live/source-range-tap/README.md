# Source raw timestamp range hardware proof

The tap-on/off source controls use the actual map-A battle at frozen tick 30,
1440×900 CSS at DPR 2. The source and shared-helper identities are recorded in
`manifest.json`. Runs use fresh Chrome hardware browsers, separate dependency
caches and a fixed checkout; public assets remain shared read-only.

Both variants draw 15,560 soldiers with the same 53 draws, 157,587,027 triangles
and LOD counts. Public WebGPU tracing records exactly 419 queue submissions and
eight maps in each, including 56 submissions/four maps after startup. All seven
tapped source submission records have complete render/compute raw ranges; the
untapped records retain diagnostic sums with unavailable interval metrics. There
are zero browser errors. The CPU transform test additionally reconstructs the
exact original Three bundle by removing only the import/enable and CPU callback,
proving that query/batching/submission/map/poll algorithms were not changed.

Frozen repeats within each browser are byte-identical. Separate off/on launches
differ at 70 pixels (maximum 41/255); an independently rerun off/off baseline also
differs, at 75 pixels (maximum 16/255). These strict pixel differences are retained,
not re-blessed. Crops locate the differences in the crowd. This does not prove
every differing pixel has the same cause; fresh image review is owned by the
parent closeout. The existing default-impostor expectation remains a separate
known red and is not changed by this control.

The actual tap-enabled Menu five-minute control passes all ten validity checks,
including canonical contact hash, live simulation, all camera phases, advancing
primary frames and unmodified JSON export. Of 933 tracked submissions, 930 resolve
complete with both observed span and union; three remain unresolved at the terminal
snapshot. Missing/invalid/overflowed results, cursor gaps, lost events and browser
errors are all zero. The live report preserves diagnostic pass sums beside interval
metrics rather than treating overlapping sums as elapsed GPU time.

This is shared-host functional evidence with the existing muted-audio default,
not a quiet ranking or a calibrated GPU performance gate. The source tap's private
pinned-Three instrumentation debt remains documented in the source lab owner.
