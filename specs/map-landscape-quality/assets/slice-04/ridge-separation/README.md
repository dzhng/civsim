# Ridge and valley separation

Verdict: evidence only. The existing geometry and snapshot baselines remain
unchanged. Regional separation improves in the hierarchy proposals, but their
local tooth-like crest regression remains unresolved. This does not accept or
complete slice 04.

The target is a connected range with distinct summits, saddles, branching
valleys and diminishing foothills. Every candidate uses the source geographic
envelope and coast contract from 92f229b7; material, vegetation parameters,
water, lighting, resolution, viewport, DPR and fixed time are unchanged. The
camera centers on rendered ground, so changes in elevation move its derived
target. Full frames establish geographic context and enlarged matched feature
crops expose local shape. Their metrics measure movement from the prior image,
not closeness to the landscape reference.

## Compared proposals

- [Hierarchy](hierarchy/critique.md) gates the main crest by smaller ridges.
  Fresh review prefers its clearer summits and saddles, but sees regular teeth,
  curtain-like walls and more explicit Italian horseshoes.
- [Summit field](summits/verdict.md) replaces contour crests with intersecting
  decaying summit slopes. It removes the loops but loses branching relief and
  produces sparse smooth pyramids. The implementation is removed.
- [Rounded hierarchy](rounded-hierarchy/critique.md) widens the crest cusp over
  the same hierarchy. Fresh review again prefers regional separation overall,
  but explicitly finds a local regression in angular/toothy edges. The
  [exact candidate patch](rounded-hierarchy/candidate.patch) is reproduction
  evidence only; it is not applied to product code.

Each proposal directory retains the five actual full frames, paired enlarged
feature crops, and grayscale/pixel change telemetry. `before` crops come from
the committed controls; `candidate` crops come from actual new captures. All
fifteen captures used snapCheck and completed without page errors or GPU
validation warnings. The hierarchy's Alps clay grayscale MAE is 9.54; widening
the cusp moves that to 8.80. This reduced change distance does not cancel the
freshly observed local regression.

[Review evidence](review.md) records CPU, typecheck and code review scope. No
baseline was blessed or test changed. Because no runtime change is retained,
there is no new hardware acceptance claim; candidate performance and full
production acceptance were not pursued after visual rejection.

## Resume boundary

Do not repeat contour exponent/amplitude tuning: gating preserves the enclosing
crest topology, and widening the cusp trades height/sharpness without creating
drainage exits. Do not revive simple summit cones: they erase the joined
buttresses and subsidiary ranges that the reference needs.

The next structural proposal should express connected branching slopes with
open valleys and nonuniform summits together, inside the same geographic
height envelope and single relief owner. It must first show that hierarchy in
both the close clay fixture and real Alps/Italy, then survive natural full
frames without regular grid teeth. A larger structural method remains a new
bounded comparison, not authorization for a graph/cache/schema or erosion
simulation by default.
