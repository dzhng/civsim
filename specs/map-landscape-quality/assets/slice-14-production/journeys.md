# Campaign journey settlement and lifetime evidence

Screenshots must describe a completed presented terrain revision, not whichever
worker result happened to arrive during a fixed delay. The existing world helpers
own [campaign presentation settlement](../../../../web/scenes/worlds.mjs): fonts,
a fresh animation frame, then the current terrain request set or a terminal build
failure. This wait stays outside immediate-frame assertions, which still inspect
the frame just submitted by the camera action.

The existing [renderer lifecycle scene](../../../../web/scenes/system/renderer-lifecycle.mjs)
observes real campaign terrain geometry disposal and real terrain-worker close
events on transitions to battle. It requires exactly one disposal for every
resident geometry, an empty detail residency, a detached coarse mesh and a closed
worker before accepting the transition. Returning to campaign must create one
live terrain worker for the next cycle. The probe is scene-local and adds no
production telemetry or alternate disposal owner. The existing campaign debug
API exposes its current renderer through a read-only getter, so the probe observes
the active instance under both bundled builds and Vite hot reload. It does not
import a development source URL or retain retired worlds. Existing battle-resource
and user-agent memory checks remain.

## Change ledger

| Test | Previous behavior | New behavior | Why |
|---|---|---|---|
| campaign-production, campaign-physical-overview | Inline terrain/font waits. | Shared presentation settlement helper. | One verification owner also accounts for the next animation frame. |
| campaign-visual | Fixed 300ms waits before UI/model snapshots; stale raw-renderer wording. | Waits for presented terrain/fonts; names physical ownership. | Capture the real renderer's completed view. |
| campaign-lod | Fixed 300ms before LoD metrics and images. | Waits for current terrain residency. | Detail admission must finish before measuring the photographed revision. |
| campaign-frame | Fixed 300ms before edge measurements. | Waits for current terrain residency/fonts. | Camera coverage must be assessed on completed geometry. |
| campaign-collision | Fixed 200–300ms around settled view checks. | Waits for settlement there; immediate-frame evaluate/assertions unchanged. | Keep the first-frame guarantee distinct from completed-view evidence. |
| campaign-polish-markers | Fixed 320ms before label and selected-color evidence. | Waits for presentation settlement. | Avoid racing terrain or font readiness. |
| campaign-polish-roads | Fixed 320ms before road sampling. | Waits for presentation settlement. | Sample roads on their final presented surface. |
| campaign-map-alignment | Fixed 320ms before geographic/pixel evidence. | Waits for presentation settlement. | Geographic probes and screenshots consume completed terrain. |
| campaign-save-load, campaign-conquest | Descriptions call the migrated renderer raw WebGPU. | Descriptions name the shared physical world; predicates unchanged. | Remove stale ownership terminology. |
| full-game-rendering-performance campaign sample | Fixed 200ms before sampling; campaign report tagged raw renderer. | Settles terrain before sampling; campaign report names physical renderer. | Measure completed campaign presentation and report its actual owner. |
| Campaign boot/return guards in legacy journeys | Campaign-specific 18/22/30-second ready limits. | Uses the existing shared 60-second ready default. | Valid software boot exceeds the old guards; actual performance thresholds stay unchanged. |
| Handoff/reinforcements/lifecycle battle-ready gates | Duplicated predicates and 22/30-second guards. | Reuses the existing battleRendererReady predicate and its 60-second default. | Same full soldier-upload contract; the first handoff retry reaches this old guard after successful campaign launch. |
| battleRendererReady failure reporting | Handled renderer failures could wait until a generic timeout. | Stops on the existing fatal-renderer state; timeout includes bounded readiness/count diagnostics. | A 60-second handoff retry still failed without page errors, requiring actual state before page teardown. |
| renderer-lifecycle | Measures battle resources across ten transitions. | Also requires actual campaign terrain disposal and worker termination each transition. | Battle counters alone cannot prove campaign cleanup. |

The [first behavior batch](initial-behavior-report.json) hit the existing initial
campaign-ready guards: 18 seconds for handoff and 30 seconds for save/load. A
[longer controlled boot](controlled-boot-probe.txt) became ready at 22.075 seconds,
without a page error; at 18 seconds its UI existed while renderer readiness was
still false. The [valid real-map phase probe](software-startup-phases.json), on Chromium
SwiftShader with a fresh browser, reached readiness in 40.494 seconds. Adapter
initialization took 30.330 seconds, including 4.149 seconds for coarse terrain
preparation, 20.308 seconds for crowd preparation, and 4.886 seconds after world
creation for remaining adapter setup. GPU-world initialization itself took
5.65 milliseconds. No page errors occurred. This is a software-backend diagnostic,
not a hardware startup verdict or a reason to change frame/admission budgets.

The legacy campaign-ready overrides now use the existing shared 60-second
readiness default. The [first retry](behavior-retry-report.json) passes the full save/load round trip
with no page errors. Handoff passes campaign boot, contact and battle launch;
its next failure is the separate legacy 22-second battle-ready guard. The [shared-guard handoff retry](handoff-shared-ready-report.json) still times
out at battle readiness after 60 seconds, with no page errors. Further timeout
increases stopped. The shared helper now observes the existing fatal-error surface
and reports actual readiness/upload counts on timeout. The [diagnostic retry](handoff-state-report.json)
reaches the same 60-second limit with `__ready=false`, GPU renderer readiness true,
and all 16,000 soldiers uploaded. No fatal state or page errors occurred. The
loading surface remains present. The battle loop releases that surface only after
its first presented-frame settlement (including GPU queue completion), so this
evidence separates completed uploads from unfinished presentation. It does not
establish the cause or hardware cost. The [unchanged hardware flow](handoff-hardware-report.json)
passes every handoff and return check using installed Chrome (`apple / metal-3`),
including 16,000 uploaded soldiers, visible faction pixels, the generated terrain
contract, cleared encounters and a working campaign save after return. It keeps
the same 60-second guard. This flow derives its terrain seed from the live
campaign tick: software used `0x1a`, hardware `0x3b`, so this is evidence that the
real journey works on hardware, not a same-terrain performance comparison.
A separate matched-input diagnostic can use the existing frozen campaign tick
API; no runtime optimization or backend-policy change follows from these results.
The [hardware lifecycle run](lifecycle-hardware-report.json) passes all ten cycles.
Each transition disposes five terrain geometries exactly once, detaches coarse
terrain, clears four resident detail tiles and closes the sole terrain worker.
Battle counters remain at 33 geometries and 181 textures. No page errors occur.
The existing user-agent memory availability check passes, but its measured total
rises from 323.9 MB to 1,161.2 MB, predominantly main-page JavaScript. This is an
open retention investigation, not evidence of leak-free lifetime; no memory
threshold was added or relaxed. The remaining visual journeys are still pending.

The final independent code review found no actionable regressions after replacing
the development-only module lookup with the current-owner getter. JavaScript
syntax, scene discovery and TypeScript checks pass; browser coverage remains
bounded as reported above.

No baseline has been intentionally repinned by this preparation pass; differing
legacy images require individual inspection and fresh critique. Full slice14
acceptance remains open.

Merged checkpoint: root adopts the journey preparation and lifecycle probe with
signed shores and categorical cover. All521 web tests and typecheck pass on the
combined tree. This CPU result does not close the unrun broader browser gates.

## Follow-up diagnostic boundaries

A tick-only handoff comparison was invalid: the campaign constructor also uses
a random seed. Pin both in the temporary diagnostic and compare save/manifest
hashes before interpreting backend timing. No timeout increase follows an
unmatched run.

The three-cycle retention probe finds all six outer world objects collected,
but their Three renderers still alive after GC. Actual renderer disposal and
animation cancellation complete; pending timestamp work drains. Timestamp maps
are too small to plausibly account for roughly180MB growth. This rejects the
deferred-disposal hypothesis for the observed runs. A heap retaining path is
required before implementing a lifetime correction.

## Remaining hardware journeys

The integrated source passes all 26 checks across `campaign-conquest`,
`campaign-reinforcements`, and `menu-renderer-shell` on installed Chrome with
Apple Metal WebGPU, with zero page errors. Conquest returns from auto-resolve
to a savable campaign; reinforcements arrive and match the uploaded battle crowd;
menu, graphics settings, custom battle and campaign transitions remain functional.
No scene assertions, timeouts, or production code changed for this run. The
[compact report](remaining-journeys-report.json) preserves every check and key
journey values, with hashes for the omitted large diagnostic payloads.

These routes use real campaign geography. Controlled-fixture visual acceptance
and the handoff rerun after its semantic bitmap correction remain separate.
