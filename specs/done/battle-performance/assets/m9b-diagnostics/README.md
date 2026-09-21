# Installed raw scene diagnostics

Worker53c07952 integrates asd3147865. The facade reports real expected/actual
populations, committed terrain/scenery/water, existing grass residency, overlay
content and installed depth. Camera and frame identity publish together only when
a receipt succeeds. A failed readiness step cannot move the camera onto an older
frame ID. Disposed/uninstalled worlds report absence; historical presented camera
remains identified as history. Requested allocation bytes keep their existing
logical-resource scope, not physical VRAM.

Depth attachment and pipeline state share one owner with unchanged values. This
refactor adds no GPU work. Seating, draw totals and GPU-routed grass triangle
counts are explicitly unavailable. Root rejected a rotating per-frame seating
sweep: it combined different moving populations and never completed large frozen
ones. No such scan ships. Existing grass residency and coverage remain real.

Root36 focused and42 live tests pass, plus web TypeScript. Independent review
found no actionable regression (75focused checks and live TypeScript passed).
Worker broader tests had752passes and one missing sparse campaign fixture; no
full-suite pass is claimed. Root shortened runtime obligation prose. An attempted
projection-identity cleanup failed one assertion because the uniform schema tag
and scene projector label mean different things; it was reverted, preserving the
camera3d contract and the original assertion.

## Hardware and image boundary

Hardware Chrome, CSS1440×900/DPR2, tick30/hash15927906182668164452,15560 soldiers:
28initial checks pass. Actual camera/frame pairing, installed depth dimensions,
resource bytes, content owners, resize2560×1600 and disposal are exercised. No
browser errors and zero retained tracked resources. This is a correctness check,
not timing acceptance or the30k population gate. Shared snapCheck writes only
scratch evidence; no tracked golden or threshold changed.

Initial image comparisons:7.5 and7.884923 are pixel exact;7.75 differs at9300pixels,
max58, meanAbsRGB0.0032752codes. The fixed-build repeat returns through all three
zooms to7.75. All four repeated battlefield regions (y<1330) are exact; first and
returned7.75 are full-frame exact between arms. Remaining middle-stop differences
are entirely the minimap viewport outline at[2458,1515,2660,1767]. Both arms show
the same minimap difference when returning to their initial camera.

The candidate's original first shot differs from its unchanged-build first repeat
by exactly the original9300pixels/max58, demonstrating that this discrepancy can
occur without a code change. Crowd, shadow and overlay diagnostics match between
arms. The precise transient cause is not fully attributed; this is not a promise
of deterministic first-frame pixels or stable motion. No further repeat was used
to seek a passing performance result. The reports retain both runs and full
comparisons; original scratch PNGs remain available.

Fresh [visual review](critique.md) finds no one-sided defect. Shared crowd/grass
readability issues remain with their existing feature gates. This pass completes
the producer diagnostics, not full seating/draw verification or source/raw parity.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| facade readiness-failure camera test (new) | Restoring the earlier assignment publishes the moved camera despite a failed receipt | Previous camera and frame1 remain paired after post-draw readiness rejection | Publish the record at successful receipt production; carried-in, worker mutation reproduced. |
| facade existing fake scene and nativeSceneLifecycle/nativeShadowScene mocks | Fixed minimal scene stats and camera key | Mutable actual content and preparedCamera; existing lifecycle assertions retained | Distinguish prepared input from presented output; rebuilt-on-fakes, original lifecycle expectations unchanged. |
| nativeFrameLifecycle attachment/pipeline tests | Existing resource/lifecycle assertions | Also compare published depth with the descriptor passed to createTexture and pass clear, through resize/disposal | New producer coverage; existing pins unchanged. |

Other tests add new diagnostics coverage (content changes, failed replacement,
null observations, reader isolation, comparison backend identity); no old numerical
threshold, snapshot, unit stat or gameplay behavior was repinned.
