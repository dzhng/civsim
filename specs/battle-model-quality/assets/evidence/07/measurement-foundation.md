# Animated budget measurement

The frame and allocation instruments work on the actual hardware. The asset
budget is **not accepted**. Exact immutable interruption-pose reuse now passes
the foot baseline; mounted/detail and display-resolution limits remain open.
Do not raise the33ms threshold.

## Historical pre-optimization result

[Production-cadence run](production-cadence-red.json), Apple M5 Pro hardware
(browser identifies `apple / metal-3`),1280×800 drawing buffer,30,000 submitted
foot archers, fixed production daylight, workbench camera/culling/shadows/post.
The scene uses the real battle clock and shared catch-up cap, then updates the
controller once from the latest observation, exactly as `BattleCrowd` does.
This excludes real simulation, WASM extraction, HUD and other battle UI cost.
Positions are a static synthetic formation; poses and observations advance.

| View | Steady GPU-queue median | Burst GPU-queue median | Burst cadence p95, uninstrumented |
| --- | --- | --- | --- |
| close |16.75ms |16.30ms |200.00ms |
| mid |15.04ms |17.10ms |200.00ms |
| vista |15.53ms |16.96ms |183.33ms |

All frame-correlated timing coverage checks pass, with no renderer warnings or
page errors. The six cadence failures affect both timed and uninstrumented
burst rows. Observation/pose preparation reaches roughly170ms; CPU medians
alone conceal the stalls. Culling/LOD counts, per-frame component costs, advanced
simulation ticks, controller storage and allocation-phase states remain in the
report rather than being transcribed here. The game clock may drop excess
backlog when capped; this is not an uncapped simulation throughput measurement.

Run from the feature worktree:

```sh
BUDGET_SOLDIERS=30000 BUDGET_FRAMES=120 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome VERIFY_URL=http://127.0.0.1:5174 SCENARIO_REPORT_JSON=../throwaway/07-budget-production-cadence.json node web/scene.mjs battle-model-budget
```

## Post-optimization and camera admission

[Exact pose reuse](frozen-capture.md) shares a pose only when every animation
input and appearance identity matches. It does not quantize motion. The
[strict temporal repeat](temporal-reuse-repeat.json) passes after integration.
The same [close chart stress](capture-reuse.json) now has16.67ms cadence p95
in all rows; this isolates the controller change from camera changes.

The chart camera is not gameplay framing. The [gameplay close run](gameplay-close.json)
uses the actual battle camera/rig and terrain-clearance owners, a fixed1024m
flat field large enough for30k mounted bodies, and production grass/scenery.
Its default synthetic rig range is explicit in the report, not a claim to
reproduce a particular battle map's army-derived framing. At1280×800 the foot
run passes all33ms checks. The [mounted baseline](mounted-gameplay-close.json)
has a33.33ms uninstrumented interruption cadence p95 failure; its timed row
passes. Neither result establishes the final detail envelope.

The isolated [35-bone sweep](mounted-bones.json) passes every frame gate at30k.
The [geometry sweep](mounted-geometry-red.json) does not: cadence p95 reaches
66.67ms with2,304/576/144 triangles. Both [512px](mounted-texture512.json) and
[2048px](mounted-texture2048.json) map sweeps each have one33.33ms cadence failure;
neither establishes an accepted texture maximum. These are one-variable
brackets, not proof that their combined costs pass. The owning slice now places
the demonstrated perspective-LOD correction before final art limits.

## Instruments and limits

Scene-owned markers bracket animation compute and all rendering submissions.
Results retain their original frame ID; a bounded readback ring reports drops
instead of waiting in the frame loop or recycling cached time. The value is
GPU-queue elapsed, including CPU submission gaps, not active-pass time. CPU
preparation/submission and rAF cadence are separate; do not sum overlapping CPU
and GPU time. Bookkeeping/readback overhead can affect rAF and is not all part
of the measured production CPU interval.

Metal skips empty compute passes. The [first smoke](timestamp-smoke-red.json)
therefore rejected all timestamps. A single no-op invocation in each marker
fixes that, proven by actual readbacks and the [corrected smoke](timestamp-smoke-fixed.json).
No cached Three timestamp is substituted. The marker overhead remains present
in timed rows and absent in matched control rows.

Allocation accounting runs separately after timing. It observes fresh crowd
generations, including eager initialization, lazy first draws and replacement
overlap. It does not include allocations that predate installation. Queue writes
include whole-device traffic, including existing world buffers. Requested/API-live
bytes are not physical VRAM; opaque texture formats remain explicitly unknown.
Mapped-at-creation capacity is not a claim that every byte was written. The
frozen-repeat phase intentionally resubmits retained poses. A separate60-tick
interruption sequence now records changed palette and snapshot uploads at the
last measured camera. The [admission smoke](allocation-advance-smoke.json) uses
35 bones, four influences, denser keys and three locally generated64px maps;
actual uploaded dimensions and nonzero new-snapshot uploads pass. This is
instrument admission at256 bodies, not30k budget acceptance.

## Rejected workload and review

The [uncapped observation experiment](uncapped-observations-red.json) replayed
every missed tick. That does not match production, which observes the latest
state once after capped simulation catch-up. Its amplified stalls cannot support
a production optimization claim. The current result above supersedes it.

Independent review caught the clock mismatch and allocation-scope overclaims;
the harness now imports the real clock/shared cap, names the fixed allocation
camera, records per-phase states and labels frozen uploads honestly. Production's
cap remains4; moving its constant did not change scheduling. Eight frame-probe,
six allocation-probe, six synthetic-fixture and four existing clock tests pass;
typecheck passes. Probe lifecycle tests cover missing/stale timing rather than
making performance assertions on fake hardware. Synthetic geometry tests prove
conserved motion, not art quality. No simulation rule or existing test threshold
changed. The known installed CLI/model mismatch prevents that review channel;
independent agent and integrating code reviews cover this checkpoint instead.

No images are presented for aesthetic acceptance in this numerical checkpoint.
The [synthetic fixture](synthetic-fixture.md) is ready for controlled sweeps.
Both display-resolution measurement
and the complete measured envelope remain open.

The gameplay-camera/texture/advancing-allocation harness pass passes typecheck
and20 focused fixture/probe tests. Independent read-only review found the fixed
camera and texture inputs valid, and identified the former vista-only frozen
allocation gap; the current smoke covers its correction. This pass introduces
no production visual change and accepts no model appearance. Actual perspective
LOD changes require their own production image and independent critique gates.
The unchanged [standing30k/foliage benchmark](standing-post-reuse.json) also
passes after the controller optimization; this does not waive the live-animation
cadence failures above. Review also corrected replacement measurement to retain
the current pose after the advancing sequence, rather than resubmit its old pose.
