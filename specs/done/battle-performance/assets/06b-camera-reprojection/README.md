# Camera-only audience refresh

A camera-only render now reselects visible soldiers and shadow casters from
owned submitted state. The same copied visibility inputs drive invalidation in
Three and the native candidates. Repeated or time-only preparations keep the
existing pose buffers. Native scenes now install the shared fitted shadow before
selecting its casters.

CrowdFrameSnapshot reuses scalar and mutable playback shells, preserving endpoint
sample identity and sharing readonly frozen pose arrays. It replaces native
impostor-only copies with one owned submitted frame. Pending asynchronous uploads
retain that storage through disposal until their last read has settled.

## Evidence and limits

- `camera-reprojection-before.json`: the production browser scenario fails on
  e4160932's source crowd/world. Changed camera performs zero pose refreshes;
  mutating a caller-owned soldier leaks into its retained position.
- `camera-reprojection.json`: candidate passes all four checks and has no page
  errors. Twenty-two ordinary draws perform twenty-two uploads; unchanged
  renders add zero, one changed camera adds one, repeating that camera adds zero.
- `production-work-count.json`: separate production hardware probe at
  2880×1800 with 15,560 men confirms the same ownership/work-count contract.
- Each backend directory stores its complete eight-state hardware report and
  four settled source/actual PNG pairs. All 24 states match main/shadow population
  and tier histograms. No GPU/page errors; zero tracked textures/buffers remain.
  Identical image bytes are shared with relative symlinks.
- Independent visual review inspected all 12 settled pairs: no confirmed missing
  formations, broad shadow/grounding mismatch, or terrain/grass loss. Distant
  shadow details occupy too few pixels for a fine shadow-quality verdict.
- 25 native ownership/lifecycle/scene tests and 20 source snapshot/LOD/seating/fit
  tests pass. Web, raw, TypeGPU, vgpu and native-test TypeScript checks pass.
  Independent review found one asynchronous disposal lifetime defect; its fix
  and post-await regression were reviewed clean.

These are correctness and work-count controls. Pixel differences remain in the
reports; no baseline is repinned. Still images and equal work counts do not
establish smooth motion, live FPS, or net savings after shadow cost. The standing
30k gate and complete matched performance comparison remain separate evidence.

## Test change ledger

The existing native corpse-refresh fixture now supplies a complete valid
playback value; its expected behavior is unchanged. New tests pin camera-only
admission of newly visible bodies, unchanged-view upload avoidance, copied
mutable input, view changes during asynchronous upload, and disposal while a
mesh still reads its admitted state. The new production scene is red on the old
implementation and green on the candidate. Existing gate thresholds are intact.

The standing hardware gate's candidate report is `standing-30k.json`. Its
unchanged 33 ms timing assertions pass: mid/vista GPU medians 11.80/14.72 ms and
pan/zoom/wheel rAF p95s 23.71/24.16/24.93 ms. The overall gate is **red** on two
grass-record assertions: the vista combines whole-map and resident records while
the check expects only the old one-million-record field. The previous-source run in `standing-30k-before.json` fails the same two
assertions with identical grass accounting. These failures are not waived or
repinned here.
This paused-simulation gate does not establish live battle performance.

A further gate audit found that requested close zooms 24/28 both settled at 8 in
both reports. Those rows do not prove the requested close-view coverage. The next
pass must distinguish base accepted records from focus accepted/allocated records
and verify actual camera endpoints while preserving the locked timing and content
floors. Neither this checkpoint nor these sequential runs claim a frame-time
speedup; host conditions were not controlled for comparative ranking.
