# Verification contracts after renderer integration

A submitted frame is not a completed frame. Traversal records the submitted
camera and terrain revision, awaits the existing GPU queue completion API, and
accepts only a still-ready matching revision. This happens at verification stops,
not in the render/timing loop. A synchronous Playwright readiness predicate is
followed by explicit asynchronous completion: returning a promise from the polling
predicate did not provide the intended truth test in the observed runner.

Battle scenes read published completed TypeGPU stats and actual clamped cameras.
Shadow softness comes from the uploaded receiver values. Earth-edge metadata comes
from the installed terrain generation, not a separately maintained preview cache.

## Baseline provenance

The five traversal images originated at 22588fa7. Since then, accepted shoreline,
water, source rock, bitmap/lighting and saddle changes accumulated. Camera tuples
and geographic landmarks remain; no props/roads disappeared because both original
and current traversal explicitly omit them. Current Alps and return images match
exactly. These updates establish integration, not final reference quality.

Shadow scenery crops originated at 09da0a56, golden full at 0b2a2b48 and golden
contact at cd4128fd. Current views preserve all groves, lake and both formations.
The passing contact baseline is retained; only the four scenery crops and full
image need updating. Requested shadow camera coordinates clamp under the current
camera owner; assertions compare completed output with that actual camera and
report both values rather than pretending the requested target was rendered.

## Turf readiness finding

The old 30s readiness limit failed while residency was advancing. Actual completed
software-GPU frames grew from 8 to 55 resident tiles in 38.6s, with sampled cells and
upload counts increasing; 476 tiles were required. Blade records were present.
A longer requested-hardware run also timed out without sufficient adapter/progress
telemetry; it is not hardware acceptance. The revised wait has an absolute bound,
requires new completed frames, reports progress counters, and rejects repeated
completed frames without residency progress. It still requires pending work to
finish and preserves grass/camera/image assertions. Runtime verification remains
pending; no test is marked passed merely because its wait is longer.

The refreshed shadow/traversal update run passes all checks, including actual
camera completion, per-preset shadow radius, on/off grove difference, bounded
admissions, idle stability, repeated 16-tile allocation plateau and DPR2. The
unchanged contact-shadow baseline is preserved. The no-update repeat also passes all checks: all ten refreshed snapshots match exactly; the retained contact crop passes its existing tolerance.
These measurements are software-GPU evidence, not hardware timing acceptance.

## Changed verification contracts

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| landscape-traversal camera stops and DPR2 | Read readiness then delayed capture; no completed-camera identity | Require a newer GPU-completed frame with requested camera and current ready revision | Submission and completion can differ during tile admission; the existing GPU completion owner now proves the capture. **moved** |
| landscape-traversal five snapshots | Images from 22588fa7 | Accepted integrated terrain/water/material appearance; unchanged cameras; repeat 0 differing pixels | Intervening accepted rendering changes listed above account for the baseline migration. **moved** |
| photoreal-shadows tier and radius | Retired nested Three stats and shadowRig identity | Installed TypeGPU tier, cascade count, map size and uploaded PCF radius | The production renderer changed on main; assertions now read its actual owner. **moved** |
| photoreal-shadows fixed-time repeat | Two captures without proving a new completed frame | Require newly published completed stats between captures | An unchanged frame is insufficient evidence of deterministic rendering. **moved** |
| photoreal-shadows framing | Fixed 400ms delay | Completed camera must match actual clamped camera; requested coordinates reported separately | Current camera limits clamp the URL target. **moved** |
| photoreal-shadows four scenery crops and golden full | Older renderer appearance | Current integrated appearance; repeat 0 differing pixels | Accepted material, water and crown consumers changed the composed frame; retained contact still passes unchanged. **moved** |

No simulation or unit-stat changes accompany these verification updates. Turf
changes are excluded from this checkpoint until their runtime contract is proven.

Review: the production delta is 17 added lines (three comments), with no new
resources or dependencies. Scene waits consume existing completion owners rather
than adding a second frame lifecycle. Independent reviews found the original
submission/completion gap and turf terminal-error gap; both were corrected. The
scoped shadow/traversal repeat proves the corrected runtime contract.

### Close turf camera finding

The partial runtime passed full and ground-only cold-boot determinism, and all476
requested focus tiles became resident. Both old close snapshots failed. Image
inspection and history establish a framing change: c90f905a's close baseline used
a low horizon view, while main's distance-based camera calibration produces a
75.673m, pitch0.497603 view for the same zoom7.86. Current grass is tiny stippling
and the horizon is outside the image. This is not an appearance-only baseline
migration. The run was deliberately cancelled after this evidence; the close
profile now selects the existing nearest endpoint, zoom8, for foreground blade
inspection. Its image acceptance and the remaining turf matrix are pending.
