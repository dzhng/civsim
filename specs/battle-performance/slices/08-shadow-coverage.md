# Readable default tactical shadows

## Contract and question

At the screenshot's projected soldier size, do visible sun-direction shadows ground troops by default, within recovered frame budget?

## API seam

`shadowRig.ts` (or its selected-backend successor) owns coverage, resolution, fit and caster views; the environment owns sun direction/strength. `crowdAudience` consumes those views. Before changing settings, measure world units per texel, projected shadow footprint, receiver normal/bias and caster submissions at the reproduced pose. The active branch defaults to the shared view-relevant fit in `SingleShadowPolicy`, using one 1024² map. The whole-map fit is the historical baseline and unposed fallback. Existing two-cascade 2048² mode remains a control, not an automatic fix.

The [canonical terrain diagnostic](../assets/08-shadow-fit/canonical-default.json) queries the production Game's generated terrain and calls the current shared fit owner: a 2400×1600 world produces a 2964.441-unit light-space extent, or 2.894962 world units per texel at 1024². Normal bias is 0.6 world units. This records the former whole-map policy, not the active fitted map. It is CPU geometry evidence, not a current readability or cost result.

The [historical tactical controls](../assets/08-tactical-shadow-controls/README.md) show why the former default was inadequate. The [view-fit captures](../assets/08-view-fit-candidate/README.md) instead show attached directional grounding at about0.233 world units per texel, with merged row-shadow bands still flagged. That fit is now [shared](../assets/08-shared-shadow-policy/README.md) by Three and the [native adapters](../assets/08-native-shadow-fit/README.md); those older artifact notes describe their capture-time integration state. Current full Menu runs exercise the integrated policy. No final readability, continuous motion or net-cost acceptance follows from those bounded controls.

Use the equal-quality shadow probes from 02. Continue validating the implemented view-relevant directional map; add cascades only if one map cannot cover readable tactical receivers at adequate texel density. Evaluate one-map vs two-cascade cost with identical contact criteria. Select and record the fit/resolution/bias in this slice; delegate numerical tuning to measured image/perf comparison. No fixed whole-map 1024 assumption and no blanket CSM toggle. Keep offscreen casters, terrain elevation and environment softness. Grass need not individually cast if it does not today; unit and scenery grounding are mandatory. Blob-only grounding does not satisfy the directional-shadow requirement at this framing.

## Artifact and verification

Default-settings production capture paired with shadow-disabled diagnostic at matched time, plus tactical infantry/mounted/tree contact crops and broader horizon receiver view. Prove actual shadow pixels: diagnostic object masks plus an on/off delta must show attached sun-aligned shapes; counts alone do not prove shadows. Compare to the user framing, where readability is the target rather than reproducing the missing shadows. Ground contact must remain visible without exaggerated black halos, wholesale terrain darkening, acne or detached feet.

Visual variable: shadow coverage/readability. Judge foreground formation feet and their ground shadows (roughly x=0..1440,y=400..540 in the supplied image), and the middle formation (x=0..900,y=265..355); use semantic matched crops if the reconstructed camera differs. Exclude HUD, freeze albedo, geometry, fog and color grade. Temporal stability is 09, but obvious edge failure blocks this slice.

Delegated: fit strategy and numerical map/bias/softness tuning under the measured coverage and budget rules above; default visibility is mandatory.

Measure A/B/C shadow-cost components and leave a viable margin for 09. Human preference for softness/strength can tune this slice without permission to sacrifice the final budget. No need to ask again whether default shadows are desired: the user explicitly requested them.

## Inherited verification and review

Keep existing camera, crowd LOD, animation/pose, grass sampling, depth, default-renderer and lifecycle checks green; run the narrow affected checks plus the standing hardware `battle-perf-30k` gate for renderer changes. Preserve its thresholds. Record pre-existing reds separately; do not re-bless unrelated failures. Simulation semantics and campaign consumers must remain unchanged.

For every visual artifact, inspect the actual candidate; use [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the matched baseline/reference, then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**. Use screenshot-regression/snapCheck for captures. Motion claims need a frame sequence/video as well as stills. Store evidence under this spec. Open review shots via preview-shots, allow about five minutes while doing other work, then record an evidence-based decision if no reply arrives and close the shots. Human feedback is non-blocking; failed acceptance is not.

The [held contact captures](../assets/02-held-authority/composition/README.md)
show shared bright contact-mark bands obscuring dense soldiers. Judge grounding
in those ranks as well as isolated units; preserving a noisy overlay is not proof
of readable shadows, and hiding it for timing would change the workload.

[Current readability diagnosis](../assets/08-readability-diagnosis/README.md)
separates observed map density from missing grass reception and unsupported framing
claims. The [grass-receiver candidate](../assets/08-grass-receiver/README.md) was not
adopted after the hardware comparison showed no clear readability gain; its cost
was not measured.
