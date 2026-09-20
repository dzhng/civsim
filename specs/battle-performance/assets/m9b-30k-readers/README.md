# The30k gate reads the renderer it is testing

Workerd66b0115 integrates as9dde7b5c. Source remains the default production route;
the harness explicitly selects raw only for its existing Menu lab build. Actual
prepared grass visibility comes from the same flags used by route/draw. Resident
records do not imply enabled rendering. Raw residency and layer counts feed the
existing floors; absent GPU-routed triangle estimates remain null. No draw work,
quality, sampling budget, camera path or production backend switch changed.

All19 prior ctx.check label/predicate pairs are AST-identical; one metric/renderer
provenance check is added (the non-GPU branch accounts for one pair not run here).
The150-rAF window,75-sample minimum and33ms threshold remain unchanged. Raw GPU
readings deduplicate identified completed frames and seed out the cached reading
before the window; source keeps its explicitly uncorrelated render-pass sum.
These different GPU metrics cannot establish a direct speedup ratio.

Root21focused tests and web TypeScript pass. Independent review found no
regression; its test execution was sandbox-blocked. Worker broader suite had771
passes and the known sparse missing campaign fixture, not a full green run. Root
reproduced/fixed route validation accepting inherited object names. The deleted
new helper test misleadingly said unknown routes read nothing while asserting a
raw count; route validation belongs once at entry, and readers receive that known
route. No standing assertion was removed or weakened.

## Hardware verdict: source passes; raw remains red

Owned CPU worker was stopped while each measurement ran, then resumed in finally.
No owned build/test/GPU job overlapped. Both runs use hardware Chrome, original
1280×800 viewport, original spawn/pause/camera/grass workload. Process inventories
are retained; this is the standing floor, not a quiet-host five-minute benchmark.

Source passes all19 executed checks. Raw passes18/19: content, pixels, camera
paths and33ms metrics pass, but the mid stop collects74 distinct GPU frames where
75 are required. Vista collects150. The raw GPU medians are9.10/9.69ms; pan, zoom
and wheel rAF p95 are17.44/19.83/21.94ms. Source GPU medians11.77/13.43ms retain
their different render-pass-only scope. Each route has30560 soldiers,585 scenery,
992334 base grass records and unchanged resident coverage. These results do not
claim raw floor success or a causal source/raw performance gain.

## Follow-up diagnosis, not a replacement acceptance run

A single mid-camera telemetry probe records150 rAF rows. In2.498s, rendered frame
IDs advance94→169 and correlated completions93→168:75 actual frames, with no
unmeasured submissions, cursor gaps or evictions. Presentation interval median
is33.33ms (about30FPS), so missing sample cadence is not lost GPU events. The
original74-sample failure remains authoritative; this diagnostic's75 does not
replace it. CPU preparation median18.35ms, of which facade upload preparation
reports14.79ms, is the leading target. Do not add CPU and await metrics: async
continuations overlap those accounting views.

All30560 are main-view impostors and L3 shadow casters at this pose; shadow mesh
count is24144400 triangles. Next action: attribute CPU upload preparation before
choosing the optimization. Keep actual frame cadence distinct from browser rAF;
the existing rAF motion floor alone does not prove60 presented frames per second.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| mistyped route rejection | Newly added test omitted inherited object property names; constructor was accepted | constructor and __proto__ reject, along with ordinary typos | Use own-key membership; carried-in to root integration, red reproduced. |
| unknown-route helper test (removed) | Name claimed no reading but expected a900000 raw count for an invalid route | Route entry validation is the single contract; no unsupported helper fallback claim | Test encoded a contradiction and duplicated the boundary, not a real extra caller; review correction. |
| GPU deduplication/seed tests (new) | Mutation without dedupe counts cached frames; without seed counts pre-window frame | Four/two tests reject those mutations respectively | Real completed-sample cardinality, no window extension. |
| rawGrassField visibility (new) | Counts alone cannot distinguish disabled retained buffers | Prepared disabled field retains records while route/draw issue no layer calls | Verify actual rendering intent without inventing content. |

All other tests add coverage; no original floor, snapshot, or gameplay stat changed.
