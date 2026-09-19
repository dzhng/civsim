# M6a — bounded cascade data and submission contract

This materializes M6 before implementation. It depends on M1b; final browser
acceptance also depends on the terrain and production crowd/atlas gates. The
selected raw world remains the sole battle resource owner. No campaign change.

## Existing High behavior to preserve

The pinned Three0.185.1 `CSMShadowNode` and `CSMFrustum`, reached through
`packages/photoreal-renderer/src/battle/shadowRig.ts`, are the reference. High is
not an alias for the fitted single map: it is two2048 depth maps, practical splits
with lambda0.5, maximum receiver depth1500, light margin300, shadow near/far1/2500,
normal bias0.6, and depth bias multiplied by cascade index+1. Environment turbidity
still owns PCF radius. The source enables fading.

For camera near n and capped far f=min(cameraFar,1500), the internal break is
half the sum of the uniform and logarithmic half-range depths, divided by f;
the second break is1. Use the actual resolved finite camera projection and
renderer-core view/projection math. Never invert an infinite far endpoint and
silently substitute an arbitrary camera. A renderer-neutral cascade policy owns
breaks, eight frustum corners per slice, square extents, texel-snapped light-space
centers, matrices and the matching culling views.

Source extents use the larger far-plane or near-to-far diagonal, with a fade
margin. Its extent margin uses max(cameraFar,1500), whereas its split and receiver
fade use min(cameraFar,1500). Preserve and explicitly test that distinction before
calling the source/native behavior equivalent; do not casually normalize it.
Source light centers snap with floor, not rounding. Its light orientation uses
world Y-up; native must verify the resulting basis against that actual reference,
not assume the battle camera's Z-up basis is interchangeable.

Receiver depth is (-viewZ-n)/(f-n). Each cascade interval [a,b] has center(a+b)/2;
choose its nearest interval edge e and margin0.25*e². Extend the near edge by half
the margin, and extend the far edge likewise except on the last cascade. Within
that range, subtract the shadow deficit weighted by the clamped edge-distance /
margin. The first cascade's nearest half has weight1. The final cascade fades to
unshadowed at its far limit. Exercise zero-margin boundaries explicitly: no NaN
may leak into a fragment. Keep the current five-tap PCF and reverse-Z sampling.
The original whole-map outside-volume discrepancy remains a separate A/B/C item.

## Resources and ownership

Use one depth32float 2D-array texture: one1024 layer for single, two2048 layers for
High. A layer view is a render attachment; a full array view is the receiver
binding. Off allocates no sun depth resources. High's depth storage is32MiB before
backend overhead. Do not allocate two High maps when single is selected.

Keep the existing192-byte caster camera format, with one distinct buffer and
bind group per active cascade. Never overwrite one camera buffer twice before a
single submission: both passes would see the final queued write. The sampler
remains greater-equal with current linear comparison filtering.

One fixed224-byte receiver uniform is enough for both modes:

| Byte offset | Data | Writer / reader |
| --- | --- | --- |
| 0,96 | Two96-byte cascade records | CPU fit packing / all shadow receivers |
| record+0 | mat4x4 world-to-shadow clip matrix | Same matrix as caster pass |
| record+64 | vec4 depth bias, normal bias, PCF radius, reserved | Shared shadow/environment policy / PCF |
| record+80 | vec4 interval start, end, reserved, reserved | Shared split owner / High blend |
| 192 | vec4 world-to-view Z row | Canonical frame camera / receiver linear depth |
| 208 | vec4 near, capped far, active count, reserved | Resolved camera/mode / receiver routing |

The inactive record is initialized; code must never sample its nonexistent layer.
Single samples its sole map directly, with the existing fitted bias and depth
bounds, without cascade blending. This layout changes the binding shape even in
single mode, so default equivalence needs a real pixel and depth control.

## Per-frame ordering

1. Resolve the canonical camera and environment. Derive all active fits and
   receiver state before any crowd admission, including the first cold frame.
2. Build the main plus cascade audience from those same fits. Reuse the current
   union admission and pose computation; never evaluate animation separately per
   cascade. Record per-cascade work honestly, including repeated union draws.
3. Upload each distinct caster camera and the shared receiver block once its
   inputs change, within the current admission/lifetime policy.
4. Encode each shadow layer's clear-to0 and caster draw, then scene receivers,
   transparent/effects and post in their existing order. No receiver samples an
   uninitialized or previous-generation layer.
5. Resize/environment/graphics replacement and failure follow world admission
   and disposal. Retain resources referenced by submitted work until the existing
   completion owner releases them. Counters describe real textures/buffers.

## Verification and reslicing

First prove pure split/corner/basis/fit and packed-layout behavior against the
pinned source for close, wide, horizon and boundary cameras, plus sun changes.
Tests should compare projections and world-point coverage, not just copied magic
constants. Test offscreen casters and first-frame audience coherence. Keep one
policy owner; the source reference remains a test oracle, not a production port.

Then prove real default and High depth/receiver output, per-layer views, cold
start, unchanged-camera reuse, resize/reload/failure/disposal. Use existing
snapCheck paths, matched source/native captures, slow and fast pan/zoom/reversal
sequences, and unprimed visual review. Preserve original thresholds and inherited
failures. GPU timestamps must label each cascade and join intervals correctly.
Measure the incremental High and default costs separately; only default enters
the user's final net-shadow equation. If source parity exposes an existing source
bug, record and resolve it explicitly instead of redefining High silently.
