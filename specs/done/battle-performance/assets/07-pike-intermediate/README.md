# Preserved-component pike intermediate candidate

This scratch candidate replaces only the heavy pike family's intermediate mesh.
Its 2,028 triangles replace 4,012; near/mid/far meshes, skeleton, animation and
material manifests are byte-identical to the published bundles. The original
source assembly and retained 2k GLB hashes match the earlier reduction proof.
The reduction keeps L1's zero detached-component omission and 12-triangle island
floor. No production asset or LOD threshold has changed.

The normal mesh validation passes with tiers 7,984 / 2,028 / 1,078 / 876,
unchanged rig/actions and retained material semantics, finite mapped tangent
frames and normalized skin weights. The current four-tier bundles were regenerated
with the real baker. An initial in-memory equality comparison encountered JSON's
normalization of negative zero; the retained proof compares the actual written
files byte for byte.

Eight actual-game diagnostic captures compare material and constant-color views
at physical 200m tactical and low-angle cameras. Camera state, visible and shadow
audiences, and draw counts match. Main geometry falls by 1,984,000 triangles:
tactical 15,845,822 → 13,861,822; low angle 15,945,302 → 13,961,302. The isolated GPU comparison below measures this candidate; no live FPS
improvement is claimed.

Fresh independent review inspected all eight frames and four crops. It found no
clear one-sided loss: overall formations remain readable (high confidence), with
no material static regression identified (moderate). Thin shafts remain dotted
in both versions; exact shaft continuity is uncertain. Image difference metrics
confirm this is a changed render, not a no-op, but are not acceptance gates.

A 48-position zoom sequence per arm spans approximately 100–300m and returns to
200m, with the battle frozen. All paired camera states, visible/shadow audiences,
shadow triangles and draw counts match. The reviewer inspected nine sampled
positions and full frames 06/12/36: no one-sided loss or abrupt representation
change was identified (moderate confidence). Intervening frames were not all
reviewed. The side-by-side video plays these sampled frames at an artificial
12 fps: it cannot establish wall-time smoothness, stutter, or animation quality.

Authored-pose diagnostics additionally override renderer-admitted pike playback
only, without changing simulation state: ready, five thrust phases and five death
phases at two cameras, giving 44 paired-arm captures. Each selects the same 2,000
pike soldiers; camera/hash/audience/shadow/draw-count checks match across 22 cases.
The first attempt used a mistaken appearance index and is excluded; the corrected
runner resolves IDs from the actual baked descriptor proof. Independent review of all 44 corrected tiles
found no convincing one-sided equipment loss or deformation (moderate confidence).
Individual joints and shaft connections remain too small/overlapped for a strong
anatomical judgment, and sampled phases do not establish interpolation quality.

Fixed build and scripts remain in `throwaway/lod-coverage-probe/` and
`throwaway/lod-intermediate-preserved/`. The only temporary build checkout was
removed. This is a candidate, not an adopted production change.
Next gates are wider roster scope
without weakening equipment readability. Live camera/simulation, all appearances,
and final default-shadow acceptance remain open.

## Isolated GPU cost

The completed control / candidate / candidate / control run contains 24 blocks
of 50 complete submission-matched GPU samples, with no warnings/errors/missing
queries. All four disposals reach zero tracked allocations after 13–14ms.
The initial six-block attempt checked allocation bytes before the scene's deferred
cleanup; it is incomplete and excluded. The completed run starts after other
owned agents/builds/tests/GPU jobs have finished.

| Camera | Main GPU control → candidate | GPU interval union control → candidate |
| --- | ---: | ---: |
| 200m tactical | 13.65 → 12.97ms | 16.46 → 15.74ms |
| 200m low angle | 13.66 → 12.88ms | 16.43 → 15.64ms |
| 600m wider, unchanged geometry | 9.27 → 9.17ms | 12.27 → 12.17ms |

These are medians of four per-arm block medians. The unchanged wider case shows
small environmental drift. Every tactical/low-angle candidate main-GPU block median remains
below every corresponding control main-GPU block median, although candidate block spread is
noticeable: tactical 12.89–13.52ms versus control 13.60–13.69ms. Do not extrapolate
a fixed 0.7ms saving to other populations or live battle phases. GPU intervals
overlap and cannot be added. Shadow geometry, audience and commands are unchanged.
The preserved-component reduction is worth broader roster testing; full live
60 FPS/default-shadow acceptance is not established.
