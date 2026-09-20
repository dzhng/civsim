# M7 — effects, cues and block debugging

Depends on M1b and M2. Selected backend: raw WebGPU.

Promoted overlays/standards/readouts own their existing GPU resources and ordered depth-read passes. Restore the source block-debug behavior required by selection verification through the selected world; it is not a reason to retain the old engine. Keep authoritative selections/orders/projectiles/corpses and elevations.

Reuse hostile-order, standards, readout and complete-scene controls plus debug-block selection scenes. Inspect occlusion/grounding with actual terrain depth and transparent cues. Split a newly found effect-specific change into its own pass; do not hide overlays for timing or declare shared bright contact bands acceptable merely because both backends show them.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.


[Block-debug restoration](../assets/m7-block-debug/README.md) now passes actual
DPR1/2 selection, focused geometry/lifecycle checks and frozen snapCheck review.
Ordinary scenes allocate no extra debug GPU layer. The source lab's third geometry
copy also uses the shared owner. This closes the missing debug mode; complete
opaque/transparent cue ordering and the shared bright contact bands remain separate
M7 visual obligations, not implicitly accepted by these debug checks.

[Current-camera sizing](../assets/m7-current-camera/README.md) removes the observed
first-frame banner correction after pan/zoom. This closes that camera-ownership
defect; other effect ordering and bright-contact-band obligations remain separate.
