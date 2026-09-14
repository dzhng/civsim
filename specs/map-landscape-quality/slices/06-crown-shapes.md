# 06 — Tree crown representation and scale

Status: **06A implemented; 06B close-foliage checkpoint verified, final visual acceptance remains open.** Dependencies: [01](01-surface-contract.md).

## Contract and owner

Keep the shared scenery registry as the mesh owner. Extend existing leaves/canopy representations rather than make campaign-only tree families or import the battle renderer into model code.

Slice variable: **Tree silhouette and foliage coverage across projected sizes.**

## Work

Improve the coarse crowns so they no longer read as identical attached spheres with abrupt dark patches. Preserve species silhouettes and credible trunk attachment. Add a small deterministic set of crown variants per family, with shared geometry reused by instances. Verify close leaf coverage separately from distant crown coverage. Choose representation by projected crown size with hysteresis and stable identity; do not flip the entire scene to one detail mode. Make casts/receivers follow the same representation and pose.

## Runnable checkpoint

Extend tree-canopies with family contact sheets and a planned landscape-tree-lod zoom/return scene at battle and campaign pitch.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Compare fixed tree poses at near/mid/far pixel sizes. Require recognizable crowns without alpha disappearance or a noticeable coverage dip during transitions. Repeat the sequence with a frozen owned clock. Keep detailed model snapshots unchanged unless the tree improvement intentionally affects them, then ledger the change. Report visible/submitted/shadow work.

Crop/mask: Tree-family sheet, isolated crown/trunk and transition crops. Forest density, terrain form, water and environment are frozen; large-scale planting patterns are out of scope.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Variant count, crown construction and representation thresholds are delegated within measured budgets. Static identity and the shared registry are fixed. Global MSAA changes are excluded.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: Preference for a more painted versus detailed crown changes its geometry/material profile, not ownership. Decide from the reference autonomously.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.


## Implementation checkpoints

**06A — accepted:** shared connected crown volumes, three world-stable variants,
per-instance projected detail with hysteresis, stable coverage, matching visible
and shadow cutouts, and bounded draw calls. Both map-pitch zoom/return sequences
and the existing tree-family sheets repeat exactly. The generator and unused
ellipsoid spike primitive are retired; the shared registry remains the owner.

**06B — checkpoint:** smaller, more evenly distributed leaf surfaces use the
crown's normals, preserving one coherent volume instead of lighting every card
as a disconnected plane. Front-face rendering avoids the back-facing fringes;
shadow casting remains double-sided. Close detail is 2,647 triangles per tree
versus 567 for its retained crown, with the same family/detail draw buckets.

Fresh critique accepts the volume lighting and continuous battle attachment,
but still finds small silhouette flecks and weaker large-scale lobes than the
reference. These remain in-scope visual work before slice 06 can close. Two
solid-tuft alternatives were rejected: sparse bead rows, then a polygon pile
that also failed the unchanged coverage gate. Do not replace the accepted
coverage contract to accommodate a worse candidate.

The regional tree-to-mountain size criticism belongs to slice 07's production
scale and placement review: this pass preserves species dimensions and instance
scales. Crown-hidden trunks at high pitch are an occlusion observation; battle
pitch proves continuous attachment. The final candidate and residual findings
are recorded in the crown report rather than presented as reference parity.

Evidence and the measured baseline ledger are in
[the crown report](../assets/crowns/README.md). The separate-variant draw-call
spike was rejected: instanced shape attributes restored the production battle
from 74 draws to the same 54 as pristine HEAD. Full Vitest is 427 tests / 75
files; typecheck and production build pass. The scoped 16 PNGs (20 capture calls,
including returns) repeat with zero changed pixels on SwiftShader.

The production default-battle marker/impostor assertion is a proven pristine
failure and remains outside this slice. Unrelated stale non-tree baselines are
preserved. The canonical campaign PNGs have been regenerated against the integrating worktree's current surface owner. [Merged integration evidence](../assets/crowns/integration/README.md) records exact repeats and the production campaign gate. Placement scale and forest coverage remain assigned to 07; whole-landscape shadow grounding remains assigned to 10.

**06C — silhouette candidate, independent visual acceptance pending:**
The [candidate report](../assets/crowns/finish/README.md) records a smaller
crown-only tuning pass: broad crowns expose fewer main lobes, while close leaf
surfaces sit into the crown. Aspen retains its fuller narrow crown. The same
geometry and draw budgets apply. This checkpoint must receive a fresh unprimed
visual verdict and merged regional inspection before closing 06.
