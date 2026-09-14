# Menu benchmark verification

`live-run.json` contains the complete original-renderer diagnostic and browser error list. The actual menu launched the scenario, prepared to tick 9000, ran the entire 300-second wall-time camera tour, and displayed/exported results. Start hash 9928381812590497427 matches the independent same-seed scout. Preparation took 106.6 seconds and is excluded from recorded intervals. All 1,172 intervals are valid; no browser errors were observed.

This is a functional and attribution diagnostic: other CPU work occurred on the host. It is not a quiet repeated performance acceptance run. Average 3.91 FPS, 1% low 2.30 FPS, 0.1% low 1.97 FPS, minimum 1.88 / maximum 7.50 FPS, p99 399.98 ms. Mean loop CPU 253.77 ms comprises simulation 204.19 ms and rendering 49.19 ms. Every measured frame advanced four ticks; 156.3 simulation seconds elapsed in 300.1 wall seconds. Simulation remains live but falls behind, and the report exposes that difference.

The benchmark uses the optimized release WASM build (`web/package.json` owns the command), not a debug build. Its SHA-256 was `ffd7a918715590608f2bfbbc9281c3da8d0d9e2842d76f520818940616a9de95`. These results cannot establish that changing rendering alone reaches the target.

`benchmark-results.png` records the first complete result UI. Independent visual review found excessive decimal precision and controls below the initial viewport; the revised layout is under verification. Later visual runs deliberately take camera snapshots and are not clean timing runs.

The preparation browser contract was first red (`preparation-red.txt`): the engine repeatedly submitted historical intermediate views. `preparation-green.txt` verifies that preparation advances real ticks while retaining the ready view, game input cannot alter the workload, cancellation stays partial with unavailable FPS, JSON export agrees, and navigation returns to the actual menu. No existing performance threshold changed.

`visual-run.json` and the numbered camera PNGs capture a second complete live run with screenshots deliberately interrupting observation. All six phases have samples; achieved distance spans 45.001–899.739 m and pitch reaches 0.15 radians. Every retained callback submitted a new primary frame. Both the near-to-wide traversal and low horizon angle retain battle content in the reviewed views. The second run is for framing/UI review only: screenshot work and concurrent CPU profiling preparation make its FPS unsuitable for a speed comparison.

`cpu-replay.json` records the same release WASM and exact start hash in a separate CPU-only run. It confirms expensive simulation without rendering, but high shared-host load prevents a clean cross-runtime comparison. Browser and CPU-only results do not justify changing gameplay mechanics.

Independent integration review found no actionable regressions after the deployment rewrite correction. The first result capture’s visible issues were addressed with a scrolling report body, persistent action footer, rounded tooltip values and direct camera-phase labels. Full-precision values remain in JSON.

Fresh visual critique accepted the revised UI and horizon/return framing as usable benchmark evidence. Remaining limitations are a cramped wrapped readout and compressed 16.67/33.33 ms reference lines on the very slow diagnostic scale; neither hides a spike or a control. Stills do not verify continuous motion.

The non-blocking human review showed the revised result, initial contact view and horizon view together in Preview. No override arrived during independent work; the fresh visual review supports retaining this layout/framing. Preview was closed afterward. This resolves the presentation checkpoint, not the continuous-motion or performance gates.

`gpu-smoke.json` verifies asynchronous pass-to-submission attribution in an ordinary production battle. It contains 59 complete and 5 pending records, no dropped submissions and no browser errors. Mean completed GPU pass work was main 21.68 ms, post 21.58 ms, shadows 2.75 ms, pose 0.66 ms and grass 0.72 ms. Timings are diagnostic and exclude uploads, copies, queue wait and physical presentation.

## Full menu gate with correlated GPU records

`complete/report.json` is the first complete report from the durable full-menu scene with all agent builds and other GPU workloads held during timing. All checks pass (`complete/checks.txt`). The start state matches the scout; all six phases and near/wide/horizon camera ranges are present; every retained callback submitted a fresh primary frame; export preserves the raw report and the action footer fits the initial viewport. This is one controlled run, not repeated acceptance evidence.

The run records 300.138 wall seconds, 118.6 simulation seconds, 2.962 average FPS, 1.617 FPS 1% low and 1.225 FPS 0.1% low. There are 886 complete submission-matched GPU results and four explicitly unresolved terminal submissions, with no lost events or cursor gaps. End-of-run reports intentionally do not wait for unresolved GPU queries.

`regression-comparison.json` records all three normal-entry failures on both current code and untouched starting source. They are existing failures, not waived thresholds: the default camera no longer guarantees an impostor tier, the smoke camera test assumes horizon rays hit ground, and DPR1 frozen image bytes vary. The other tested input/pose/renderer contracts pass.
