# Impostor packing candidate — not adopted

Candidateabeafbf6 remains on its branch, outside the main implementation. Its
predeclared ABBA screen failed: the slower candidate CPU median did not beat the
faster control in either segment. Pooled improvement alone does not satisfy that
contract. No unchanged rerun is planned to seek a pass.

The candidate removes per-soldier temporary arrays/generic set, hoists fixed eye
and atlas-centre reads and relies on fresh Float32Array zeros for padding. It
preserves the fresh return buffer and arithmetic. Independent review found no
regressions; root25 focused tests and TypeScript pass. Worker differential reports
zero mismatched bytes in24,000 seeded records; its retained scratch runner can be
reproduced. All9 new tests passed on the unmodified packer first. No prior test or
threshold was eased. The new tests pin captured bytes and independently transformed
anchors/view directions, plus fade, span, order, allocation ownership and empty
input. They are not integrated because the candidate is not adopted.

## Screen result

Same pinned tick30, hash14739215347954801209,30,560 soldiers, viewport1280×800,
12-second static and12-second camera-motion segments as the snapshot screen.
Control is the adopted snapshot build. Both candidates and controls retain exact
fixed wide-view pixels; root inspected the wide image. Correctness checks preserve
state/population and active draws with no browser errors. These images do not
prove moving-camera quality or the user's tactical shadow framing.

| Arm | Wide rendered FPS | Moving rendered FPS | Wide CPU median ms | Moving CPU median ms |
| --- | ---: | ---: | ---: | ---: |
| Control A1 | 31.50 | 41.08 | 20.24 | 14.95 |
| Candidate B1 | 42.09 | 58.09 | 14.20 | 12.90 |
| Candidate B2 | 33.17 | 47.42 | 19.54 | 14.38 |
| Control A2 | 38.67 | 56.50 | 16.74 | 13.76 |

Pooled renderCpuMs medians improve8.24% wide and6.37% moving, above the declared5%
threshold, but both ordering checks fail and the slower candidate's cadence trails
the faster control. This does not establish either a reliable improvement or a
regression. Large run-to-run variation is observed; its exact source is not proven.
Own builds/tests/reviews finished before timing; the owned ocean review was
suspended without children and resumed in finally. External activity was not
controlled. Process inventories and raw reports are retained.

[Summary](summary.json), per-arm compressed reports and [wide image](wide.png)
record the outcome. CPU is renderCpuMs, not a sum with nested or overlapping
metrics; frames are deduplicated successful rendered identities. The earlier
snapshot improvement and its changed-build30k passes remain integrated.

## Decision review

Direct writes and scalar hoisting fit the existing packer; no second owner,
cache, GPU layout or runtime option is introduced. Zero padding relies on the
already-required fresh output allocation. Dense arrays are the producer contract;
like the snapshot candidate, unsupported sparse/proxy input is not a compatibility
requirement. A test comment mislabels a below-soldier eye case as above; correct it
if this branch is ever revived. None of these choices justifies adoption without
the declared performance evidence.
