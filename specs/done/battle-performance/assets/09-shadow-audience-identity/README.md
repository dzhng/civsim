# Stable caster admission for a retained map

Integrated as4d1f1423 from worker a9e44c69. A shadow map may stay unchanged over
small camera movements. Its old crowd-only near plane depended on an independent
rounding remainder, so keeping the entire fit also kept an audience plane from an
earlier camera sample. The signed difference could be too restrictive.

The fitted crowd plane now uses the sun and the fixed difference between caster
ceilings, rounded conservatively to the map's existing depth step. In the
mathematical model it admits a superset with less than two additional depth quanta
(8 light-depth units). It adds no revision owner or per-frame map update. The
whole-map fallback still uses its original near plane.

Root's synthetic replay previously finds a retained/fresh disagreement after the
first millimetre pan; the corrected replay finds none. Integrated verification
passes67 focused tests and full TypeScript. Independent Codex review found no
actionable regression. Existing mounted-caster admission and cliff exclusion
assertions remain unchanged. Three new tests cover retained-map audience identity,
conservative/finite geometry across sun presets and framings, and sun/field/pose
invalidation. No old assertion, image baseline or performance threshold changed.

The worker initially linked dependencies/WASM from the original checkout and
reported11 environmental TypeScript errors there. Root corrected the links to
this task's dependencies; integrated TypeScript is clean. The worker's report is
retained as provenance, not the current validation verdict.

More admitted casters can cost GPU work and may demand legitimate additional
detail. This is not a performance or visual acceptance result, nor proof of the
exact88-caster discrepancy in earlier controls. Moving-shadow quality and final
A/B/C cost remain open. Sun-axis coincidence and quantization boundaries retain
the existing numerical caveats; this change does not modify raster-map identity.
