# Tactical light separation

Scratch-only shader substitutions separate the existing shadow visibility,
direct illumination and indirect/emissive illumination. Geometry, shadow fits,
sampling and assets stay fixed; aerial fog and output processing remain active.
These displayed components are therefore **not additive radiometric measurements**.
No diagnostic is a production lighting candidate or performance workload.

Six single/off captures share tick30/hash15927906182668164452, CSS1440×900 DPR2,
with no page errors, through shared snapCheck. The shadow visibility image shows
attached elongated shapes; direct-only output makes them easier to distinguish.
Indirect-only output retains bright surfaces without directional sun shadowing.
Together these support testing key/fill balance, without proving a particular
ratio or ruling out all filtering and coverage issues. Direct-only output leaves
some soldiers excessively dark and is not an acceptable replacement.

The next isolated golden-preset experiment will reduce indirect intensity while
increasing direct sunlight. It must preserve soldier readability and the warm
battlefield, with no fog, exposure, material, geometry or map-quality changes.
