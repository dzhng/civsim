# Shared water response owner

Terrain water, battle oceans and lakes import their albedo/foam/roughness response from the neutral landscape water material. Battle keeps its ocean/lake geometry and Gerstner displacement. Shader equations, constants, frame clock and linear-color conversion are unchanged.

The direct terrain/standalone control repeats exactly: both center samples are RGB76/134/151, screenshot difference0pixels, no page errors. Typechecking and three existing sea/seam tests pass. Independent Codex review found no actionable defect.

A broader scene selection included the16-frame sea film and was interrupted after several minutes without a result to release the shared GPU lane. It is not acceptance evidence. No baselines were changed. Campaign-specific depth, surf and motion remain open in slice09.
