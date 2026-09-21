# Verification change ledger

The cutover changes renderer ownership, not simulation mechanics. Thresholds were
not lowered to obtain passing results. Historical Three-internal experiments are
retired explicitly; their removal is not evidence that an equivalent visual
experiment passed on the new renderer.

| Test / group | Previous behavior | Current behavior | Why |
| --- | --- | --- | --- |
| battleActionAdapter / battleCrowd | Recorded positional Three `draw` arguments and separate readout calls | Inspects the same numerical payload through `BattlePresentation` | Renderer-neutral presentation replaces the old concrete facade; gameplay expectations retained. |
| presentation startup ordering | Synchronous draw hooks | Awaited uploads, startup callback, preparation and submission | TypeGPU admission is asynchronous. |
| frozen presentation reuse | Stubbed skipped draw | Real repeated frozen packet preserves frame/submission; empty triangles clear geometry | Tests actual facade behavior. |
| presentation cancellation | Synchronous throws | Rejected promise, no upload before admission/no submission after cancellation | Same cancellation boundary under asynchronous ownership. |
| readiness cancellation | Mocked world settlement | Cancellation between readiness submissions prevents the second submission | Pins actual GPU lifetime ordering. |
| captured environment time | Wall path sampled a second clock | Both clock modes consume the packet's captured time | A presentation must not combine two different timestamps. |
| debug blocks | Concrete draw forwarded association | `present` consumes static association; same living rectangle geometry | Owner changed, geometry expectation retained. |
| production facade lifecycle suite | Lab facade and backend selectors | Same lifetime/reload/seating/submission cases against production TypeGPU | Duplicate facade removed; backend-refusal/compile-time override cases retired with it. |
| resize admission | A rejected output resize disposed the owner | A rejected unified scene resize disposes the owner | Fixed the cutover regression, preserving old failure safety. |
| freeze barrier | Publication could settle an older displayed frame | A presentation begun after advance must complete; failure/disposal rejects wait | Red regression demonstrated old tick 10 instead of requested 72. |
| battle-input frozen pixels | Canvas locator screenshot included overlapping HUD SVG rerasterization | Nonblank actual canvas export must have exactly zero differing bytes at DPR 1/2 | Exact 3,168-byte residual was toolbar DOM; framebuffer was already stable. |
| default renderer | Three identity and diagnostics | Installed TypeGPU depth, full admitted population, actual draw count, real terrain and seating | Tests the new owner without synthetic Three stats. |
| default far audience | Assumed default close camera necessarily drew impostors | Explicit far framing must submit a real impostor audience | Keeps far coverage without making a false close-camera assumption. |
| catalog reload | Old timeline resets after accepting new rig/catalog | Same reset at same battle tick, with a new admitted crowd generation | Preserves the existing anti-cross-rig-blend policy. |
| selection boot | Waited on shell readiness plus a delay | Waits for the presented battle renderer | Prevents input setup racing initial camera/renderer setup. |
| wheel overview | Assumed initial menu camera was an overview | Explicitly frames the overview before the same wheel/grass assertions | Preserves camera behavior and strict no-dense-grass overview check. |
| renderer lifecycle | Three geometry/texture counts and optional measurements | Actual requested WebGPU buffers/textures/bytes, all zero on disposal, flat world resources across 10 cycles | Telemetry buffers are measured and excluded only from the live world plateau. |
| terrain diagnostics | Limited opaque stats / Three scene introspection | Counts/descriptors from installed mesh, water, vista and standards owners | Producer tests pin replacement rollback, defensive metadata copies and real geometry levels. |
| workbench failed catalog reload | Read removed render.soldiers | Reads real render.crowd.instances and still requires 16 retained instances | Fixes a stale assertion, not renderer behavior. |
| workbench failed material reload / equivalent reindex | Compared a 970×758 frame against a 1280×800 resized frame | Waits for completed resize, then requires exact pixel equality | Browser repro identified stale stretched baseline; no tolerance change. |
| camera/minimap/projectile snapshots | Historical placeholder assets/style | Reviewed current production images | Full-frame and crop review retained formations, projectiles and HUD; matched current-source forest control found no one-sided canopy loss. |
| workbench/action replay snapshots | Historical Three lighting/shadow images | Reviewed TypeGPU images, rerun against accepted baselines | Geometry/equipment/poses/UI retained. Current-source heavy control shows the same directional shadow/contact limitation. |

[Native test retirement details](test-retirement.md) names the replaced unit tests
and their actual production/native coverage. [Model probe retirements](retired-model-probes.json),
[system probe retirements](retired-system-probes.json), and
[historical comparison entrypoints](retired-comparisons.json) identify removed
implementation-specific experiments. Pure policies, authored assets and numerical
reference tests remain; the isolated Three shadow-camera oracle is test-only.

All 833 web unit tests passed after the owner/test migration. Production and lab
TypeScript/build checks passed. Exact browser results and limits are in the
[acceptance record](README.md); the ledger is not a substitute for those runs.

Final review adds three input regressions: delayed selected-unit pick retains exact
drag displacement without a new mousemove; stale prior picks cannot convert a new
box gesture; aborted press/release callbacks do not mutate input. The benchmark
settings browser scene verifies resolved query flags against the installed shadow
owner. The obsolete page-clock oracle is explicitly [retired](legacy-clock-audit.md),
not converted into an arbitrary passing assertion. Overlay captures now use physical
camera distances so the intended rings are actually visible, and settle the actual
framebuffer instead of composited toolbar DOM.
