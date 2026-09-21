# Model image review

Visual-only review of the prior `web/shots/models/shared/soldiers/` images against matching candidate `web/shots/diff/shared/soldiers/*/*-actual.png` images. Inspected all full frames. No source inspection, builds, or GPU work. Prior images were not assumed correct.

## Findings

- No candidate-only missing body geometry, equipment, changed pose, displaced formation member, or broken control-panel layout was visible in these frames. Sword, shield, scabbard, bow/string, long spear, rider and horse silhouettes remain present where shown.
- **Grounding concern, clearest in equipment-handoff:** the candidate's main shadow starts substantially to the right of the forward foot (foot near x485/y595, darkest shadow near x700/y650), with very little contact shading underneath. This makes the figure read more suspended. Heavy-front, manual-alive/dead and controls have the same weaker near-foot grounding. This is a shadow/contact-shading concern, not evidence that meshes moved. The prior also has soft grounding and is not an ideal reference.
- Across the close model images, candidate shadows are markedly darker, narrower and more directional, with warmer/more saturated ground and darker unlit surfaces. Formation readability survives; these broad color/shadow changes alone do not demonstrate lost geometry. The horse's large dark cast shadow is conspicuous but plausible for the lighting.
- Shared pre-existing limitations: phalanx spear extends above the frame in both; manual-dead is upright in both; disabled/protected light clothing has small irregular-looking shoulder/torso patches in both; the far roster is too small to assess individual equipment. None establishes a candidate regression.

## Per-pair result

“Pass” means no concrete new defect visible at the provided resolution; it does not assert pixel parity or validate animation between frames.

| Group / pair | Result | Observation |
| --- | --- | --- |
| workbench / heavy-front | Concern: grounding | Body, armor, sword, shield, scabbard and sandals retained; weaker foot contact with darker offset shadow. |
| workbench / phalanx-side | Pass | Spear, shield and armor silhouette/pose retained; spear top cropped in both; stronger shadow. |
| workbench / formation | Pass | Same 4 × 4 formation, equipment and poses; darker directional shadows do not obscure members. |
| workbench / manual-alive | Concern: grounding | Same model and pose; same contact-shading concern as heavy-front. |
| workbench / manual-dead | Concern: grounding | Same standing pose and desaturated dead appearance; same contact-shading concern. |
| workbench / submission-parity | Pass | Small soldier pose and equipment retained; stronger shadow. |
| workbench / controls | Concern: grounding | UI text, values, controls and panel placement retained; model shows same foot-contact concern. |
| workbench / authored-roster-far | Pass with scope limit | Terrain tile and 3 × 5 model-group arrangement retained; individual equipment too small to judge. |
| action-replay / equipment-handoff | Concern: grounding | Sword, shield, crest, scabbard and raised-arm pose retained; detached-looking shadow weakens foot contact. |
| action-replay / controller | Pass | Mounted rider, sword and horse pose retained; UI retained; stronger cast shadow. |
| action-replay / disabled-15.1 | Pass | Bow/string, scabbard, clothing and walking pose retained. |
| action-replay / disabled-15.9 | Pass | Same visible pose/equipment as counterpart; no new discontinuity visible. |
| action-replay / protected-safe | Pass | Bow/string and limb pose retained; stronger shadow. |
| action-replay / protected-threatened | Pass | Inspected this additional existing pair: changed running pose relative to safe is present in both versions; equipment retained. |
| action-replay / protected-crossing | Not available | No prior/candidate pair with this name exists in the supplied directories. |

Static images cannot verify temporal equipment handoff or controller transitions. No claim about those behaviors is made here.

## Additional current-source control

After the historical comparisons above, inspected `throwaway/typegpu-cutover/current-source-heavy.png` against candidate `web/shots/diff/shared/soldiers/workbench/heavy-front-actual.png`. The control was supplied as pre-cutover Three at `8c62b9d9`, using current assets and the same SwiftShader 1280 × 800 heavy-front pose/camera; that capture provenance was provided, not independently reconstructed in this visual-only review.

**Result: pass against this current-source control.** The dark, elongated lower-right shadow footprint, weak near-foot contact shading, model silhouette, equipment and coloring are visually the same. I see no new candidate contact/shadow-footprint defect relative to this control. The heavy-front concern recorded above is therefore a difference from the historical baseline and a shared visual-quality concern, not evidence of a regression introduced by the cutover.

This control directly resolves the heavy-front attribution only. It makes a shared capture/rendering-history explanation plausible for the similar differences elsewhere, but does not replace matched current-source controls for equipment-handoff or other poses.
