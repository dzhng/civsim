# Phalanx intermediate representations — still-image pilot

Blender 5.2.1 LTS reduces the original fitted `phalanx.blend` / `MediumPhalanx-Deform`
through the existing reducer's near mode, targeting 4,000 and 2,000 triangles.
The source hash matches the saved-source reproduction manifest:
`1bbacf1f72a91a11bef2e9556dd3b1b77358a32b3f4a5eb75b9ae4686a960a6f`.
Unlike the existing middle-tier reduction, near mode omits no detached component
by extent and keeps a twelve-triangle floor for reduced islands. Triangle budget
and omission policy both differ from the original L1; this experiment cannot
attribute improved appearance to either one alone.

The candidates contain **4,012** and **2,028** triangles, versus 7,984 in the
reference and 1,078 in the existing phalanx middle tier. Scratch appearances place
one candidate in the middle slot while retaining original near/far geometry.
Rig, animation, material data and unchanged mesh files are byte-identical to the
production appearance. Existing mesh-LOD invariant checks pass for both candidates:
rig/actions, material/texture semantics, tangent/UV data and normalized skin.

The same isolated workbench comparison as the first pilot captures 18/32/48/64
physical projected spans. All L0 reference PNGs are byte-identical to the prior
pilot, and every individual shot repeats exactly. The clip is the asset's named
`ready` diagnostic clip; canonical production pike-ready/thrust and death remain
next. This is not full gameplay pose coverage. The override also selects shadow
mesh detail, so shadows are not independently adjudicated here.

The three-column sheets show reference / 4k / 2k. A fresh reviewer finds the 4k
option close to the reference in these stills, preserving a continuous spear
and broadly matching armor coverage. The 2k option still changes torso brightness
and pattern at 48–64 pixels. Its lower-size behavior may warrant later study, but
it is not accepted as a broad replacement. The 4k option is the candidate for the
next **canonical pose and camera-reversal** test; no production threshold or
catalog has changed, and no performance improvement is claimed.

Scratch GLBs, temporary catalogs and reproducible bake drivers remain under
`throwaway/lod-intermediate/` and `throwaway/`. Production source assemblies and
catalogs are untouched. Neither these files nor this one-class pilot establish
all-appearance fidelity or the final moving-camera/shadow acceptance contract.
