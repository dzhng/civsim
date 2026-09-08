# Heavy fitting: helmet and hand contact

Working candidates only. The full heavy silhouette, anatomy, materials and motion
remain unaccepted; no production catalog or snapshot baseline was promoted.

## Helmet construction

The target is a metal bowl with thin fitted cheek protection, not padded lobes.
`helmet-fit` joins the bowl and rolled edge; `helmet-plates` replaces closed
elliptical cheek volumes with curved quad surfaces and physical thickness.
Both use the same body, garments, equipment, original bend, production daylight,
1280×800 SwiftShader fixture and fixed cameras. The extracted surface helper
preserves inward garment thickness; centered thickness is used only for plates.

[Comparison telemetry](helmet-plate-comparison.json) records1,422 changed close
pixels,396 gameplay pixels,12,906 head pixels and zero hand pixels. These counts
prove localized visible change, not quality. The complete sheets and enlarged
helmet crops accompany the exact GLBs and capture reports.

Main inspection and an unprimed comparison agree: the plates are thinner and
less padded. The fresh reviewer prefers them with high confidence on thickness,
moderate confidence on overall fit. The upper attachment lacks a clear hinge or
overlap, and side-view separation from the face is too weak to establish clearance.
The rounded bowl/rim and unfinished face remain. Retain this as a better working
construction, not a passed helmet or complete heavy row.

The exact `helmet-plates` build/export and candidate bake check pass. Its scene
ends with four changed, unaccepted image comparisons; weighted-pose submission,
fresh frozen-frame repeats and absence of page errors pass. No tolerance changed.

## Actual grip is not nominal alignment

The integrated hand study supports a cylinder across the palm rather than the
previous lengthwise sword handle. `grip-axis` aligns sword and shield handles
to that axis and gives the shield handle physical backboard supports.
The [surface audit](grip-contact-audit.json) still finds thumb penetration:
104 of2,952 sampled cylinder surface points lie inside each hand, with the
worst thumb-side clearance roughly7.4mm short. This is a hand-form defect;
shrinking or bending the handle around it would not make a credible grip.

`grip-wrist` is rejected. Rotating only the right hand points the blade away
from the leg but visibly pinches the wrist and allows about2.5mm relative skin
drift because nearby vertices retain forearm influence. That rotation is absent
from retained heavy source. The separate08 forearm-pronation study owns the
proper fitting recipe; original bend remains stress evidence, not ready/combat
motion. In the current original inspection pose, the aligned blade intersects
the leg, so equipment contact acceptance remains open.

## Authoring priority

The whole-body review still fails on inflated shoulders, cylindrical hems,
thin limbs, rudimentary footwear and unsupported scabbard suspension. The next
geometry work judges the whole silhouette, not another isolated rim adjustment.
Candidate surfaces and real ready/walk work may develop on frozen source
revisions, with matched clay evidence and explicit refits. They cannot pass or
conceal these geometry failures.

## Garment silhouette and deformation

`drape` lowered the shoulder too far and exposed the body through the shirt;
it is rejected. `drape-fit` preserves clearance in the shoulder images while
giving the yoke a gentler slope and the lower garment a slightly narrower,
shallow-folded edge. All instance shapes remain uniform.

The independent reviewer prefers `drape-fit` to `helmet-plates` with moderate
confidence: less inflated shoulders and slightly less hoop-like hems, including
the gameplay views. Both still have thick stepped cuffs, cylindrical torsos and
shell-like lower garments in the bend. The review flagged a small dark waist
mark; the enlarged bend crop confirms it. These are not accepted cloth images.

The fixed comparison changes 69,544 close pixels and 45,375 gameplay pixels;
[telemetry](drape-fit-comparison.json) retains the head/hand changes too. Cloth
enters the hand crop, so its changed pixels do not establish a hand alteration.

After integrating the three inspection clips, a complete root anatomy/heavy
capture retained every `drape-fit` heavy PNG byte-for-byte. The merged report
and exact heavy GLB are archived separately. Seven old unaccepted image gates
remain red; production weighted submission, repeated frozen frames and page
error checks pass. Body bake verification and typecheck pass.

The local signed-nearest-surface probe in `drape-contact.json` identifies a
roughly 0.6mm tunic/mail crossing near the visible waist mark in the bent pose.
This local vertex probe is diagnostic, not a complete collision test. Increasing
one mail cross-section made its measured depth worse, so that change was reverted.
Nearest-vertex skin-weight transfer can jump as a garment is fitted; the next
working source interpolates the nearest body's triangle weights instead, retaining
four normalized influences. That candidate still needs its own rendered verdict;
the local probe also reports a lower-hem contact, so no clearance claim follows.

The current `body-refit` capture consumes the reviewed fuller-limb source
integrated as f3dbdd18 and interpolated garment weights. The waist mark is no
longer visible in the same enlarged bend crop. The local probe still finds one
roughly1.3mm lower tunic/mail contact; the hidden lower hem is not cleared by
that image. Whole-body close and gameplay sheets show the sturdier calves and
forearms while the rigid cuffs, shell-like skirt, inspection blade/leg crossing
and scabbard suspension remain unresolved. All four snapshot comparisons are
changed, unaccepted images; all production/frozen-repeat/page checks pass.

Final independent refit review confirms the removed waist puncture and fuller
calves, but retains the cylindrical skirt, inflated sleeve volume and slight
feet/ankles as visible weaknesses. It found no concrete bug in the triangle
selection, barycentric interpolation, four-influence reduction or normalization.
Nearest-surface selection can still switch between thighs under a loose skirt;
interpolation within one triangle is not a universal cloth-deformation solution.
No such switch was established by the supplied images. Retain the current source
as a working refit, with complete cloth/contact acceptance still open.

The local CLI review was attempted again and rejected the configured model as
requiring a newer CLI. No model override or upgrade was made. Main source review
retains a single equipment authoring owner and shared export path; the independent
visual reviews above do not stand in for a completed CLI review.
