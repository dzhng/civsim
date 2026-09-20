# Efficient view and shadow audiences

## Contract and question

Can audience/LOD determination scale to broad horizon views while retaining every needed visible soldier and offscreen shadow caster?

## API seam

`crowdLod.ts`, `crowdAudience.ts` and the shared projection helpers own policy. Keep separate main/shadow result lists, with stable identity, previous-level history and per-audience draw counts. Current hysteresis and mesh shadow floor are already implemented. CPU reusable compaction is the control; GPU classification/indirect submission is delegated only if matched measurements show a net win including uploads and compute. Avoid GPU-to-CPU readback for draw counts.

Freeze source/playback state from 06 and accepted model tiers. Spatial bounds must include animation/mounted extent and the light's caster volume. A soldier outside the view may remain in the shadow audience. Never cull against the main camera alone. No arbitrary soldier cap or lower-quality threshold solely to pass timing. Test stable classification at threshold reversals and disocclusion; view and shadow projections share canonical math.

## Artifact and verification

Synthetic near-plane, frustum-edge, offscreen-caster and rapid-zoom fixtures plus full 30k replay. Verify expected visible/caster sets at a small deterministic seam, then measure work at scale. Report real visible mesh/impostor counts, not simulated population as a proxy for mesh load. If existing planning is cheap, close this slice with evidence and keep it.

Visual variable: silhouette/LOD transition continuity and presence. Crop formation boundaries and silhouette rows; fix time/light/ground. Inspect every tier transition in motion. Shadow quality itself is deferred to 08. Delegated: CPU vs GPU preparation and workgroup/buffer layout after evidence, not new visual thresholds. Human-visible popping, missing troops or clipped offscreen shadows changes acceptance.

## Inherited verification and review

Keep existing camera, crowd LOD, animation/pose, grass sampling, depth, default-renderer and lifecycle checks green; run the narrow affected checks plus the standing hardware `battle-perf-30k` gate for renderer changes. Preserve its thresholds. Record pre-existing reds separately; do not re-bless unrelated failures. Simulation semantics and campaign consumers must remain unchanged.

For every visual artifact, inspect the actual candidate; use [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the matched baseline/reference, then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**. Use screenshot-regression/snapCheck for captures. Motion claims need a frame sequence/video as well as stills. Store evidence under this spec. Open review shots via preview-shots, allow about five minutes while doing other work, then record an evidence-based decision if no reply arrives and close the shots. Human feedback is non-blocking; failed acceptance is not.

## Current attribution checkpoint

The [authored-detail inspection](../assets/07-projected-detail/README.md) identifies
an uncalibrated historical policy operating on much denser current assets. Its
next step is a same-camera representation comparison, not a new threshold chosen
for timing. This shared-asset calibration can inform backend selection before
committing to renderer-specific classification changes. The quality contract and
all visible/caster preservation gates remain in force.

Candidate adoption must protect lower-size work as well as the dense near view.
Replacing the old middle mesh with a richer intermediate while only moving the
near boundary increases cost throughout the old middle interval. Evaluate the
whole representation chain and its boundaries, including any changed far/shadow
mesh cost; do not infer a global win from one tactical camera.


## Four-mesh candidate checkpoint

The [whole-roster control](../assets/07-projected-detail/roster-chain/README.md)
justifies retaining an additional mesh: replacing old far increases wide and
shadow work. Implement one coherent chain near/intermediate/middle/far, then
impostor, with proposed32/18/9/4 projected boundaries. Preserve old near, middle,
far and impostor-source bytes; add only the proven source-derived intermediate.
Update the asset schema, shared level/count policy, all Three/native consumers,
histograms and fixtures together. Campaign readers must retain their existing
appearance and gameplay behavior. Do not add a compatibility or backend switch.
Verify all transitions (including shadow-floor and impostor routing), actual
per-audience work, model/campaign consumers, the unchanged standing gate and
moving-camera/live acceptance before adopting the new default.

## Current discriminator

[Existing-L2 timing](../assets/07-l2-footprint/README.md) shows substantial savings
but unresolved readability. [Constant-color coverage controls](../assets/07-lod-coverage/README.md)
confirm thinner pike shafts independent of lighting. Test an intermediate
reduction retaining L1's component-preservation settings; material IDs alone do
not prove silhouette quality. Motion and full-catalog gates remain open.
