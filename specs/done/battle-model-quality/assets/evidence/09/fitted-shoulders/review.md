# Fitted heavy shoulders and sleeves

Retained as a less-wrong working candidate, not garment/contact acceptance.
The comparison freezes the body, rig, materials, locomotion and unrelated gear.
The parent owns subsequent combined refits; the newer footwear and shield carry
are deliberately absent from this controlled comparison.

## Art decision

Shorter mail sleeves expose more of the underlying tunic. Both layers are fitted
to the fixed body after subdivision and before thickness/weight transfer. Fitting
only the sparse control cage would let subdivision shrink the final surface back
through the shoulder. The authored neckline, sleeve openings and lower hanging
cloth remain open; no skin patch or palette change hides the defect.

Nominal upper-body clearances are 9 mm for tunic and 18 mm for mail, blended into
the original torso shape. Those offsets are a provisional fitting choice, not a
collision guarantee. They do not guarantee layer order after deformation,
particularly where nearest-body correspondence switches between arm and torso.
Mail texture/material quality is unchanged; the knitted-looking surface remains
owned by the surface work, not declared solved by a geometry change.

## Controlled evidence

The existing heavy-kit scene adds one shoulder-focused sheet: ready, two walk
contacts, two run contacts and deep bend, each at four fixed bearings. Existing
full-body, gameplay-pitch and dense walk/run coverage remains intact. All captures
use the production weighted route with an exact fresh repeat per tile. Before
captures passed as new unaccepted candidate baselines; after captures differ
without blessing them. Logs and [artifact hashes](artifact-checks.json) identify
the exact images. No pixel tolerance changed.

Fresh unprimed review inspected all 24 native pairs, both full-body sheets, both
gameplay sheets and the Rome II reference. It prefers after with high confidence:
the conspicuous pale armpit cutouts disappear and the shoulders slope into the
arms more naturally. Deep-bend rear shows the clearest repair of the large oval
openings. Close full-body views retain the improvement; gameplay differences
are smaller but coherent. The author's inspection agrees.

Remaining visible findings:

- A tiny yellow sliver at the rear underside of the sleeve in run opposite
  contact, right-side view (`after-4-side.png`), prevents a claim of complete
  closure. The 2× crop preserves it for later targeted fitting.
- Deep-bend underarm folds are somewhat pinched and angular.
- The taller exposed undersleeve reads as a smooth, rigid band rather than
  convincing cloth edge construction.

These do not require rejecting the provisional candidate. They remain art debt;
selected-pose geometry review does not establish animation quality.

## Numerical limits and controls

[Clearance telemetry](clearance.json) records matching unrelated mesh/weight,
bind and action hashes before/after. Neither the human nor other gear was changed.
Sample counts penetrating the body by more than 1 mm improve in every measured
pose; ready tunic falls from 253 to 54 and deep bend reaches zero for both layers.
However, run first contact still includes 120 mail samples beyond 1 mm with a
roughly 31 mm worst signed distance. Some underarm intersections are hidden;
these measurements do not support universal clearance or collision-free layering.
They also do not prove manifoldness, absence of triangle inversion, or absence
of self-intersection.

## Review and integration

Source review found no blocking issue: subdivision/fitting/thickness order is
appropriate, connectivity is retained, and existing barycentric normalized skin
transfer is unchanged. The repeated camera-bearing array was consolidated in
the existing scene. Bake, typecheck, syntax and diff checks pass. The independent
CLI attempt remains unavailable because the installed version rejects the
configured model ([log](cli-review.log)); no override, reset or upgrade was used.

Reproduce using the installed Blender background entry point
`packages/soldier-assets/bake/blender-heavy-kit.py`, then its sibling baker and
`VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5182 node web/scene.mjs heavy-kit`.
The server must serve this worktree. Parent integration should retain the current
motion/footwear/face source and rebuild the combined asset; do not promote this
frozen blend over newer work. Root owns the spec pickup links and human Preview
presentation. No accepted baselines or completed-slice claim accompany this pass.
