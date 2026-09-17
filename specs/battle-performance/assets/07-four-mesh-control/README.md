# Four-mesh candidate: correctness evidence, acceptance pending

The candidate inserts an intermediate model while retaining the original close,
middle and distant models. It is integrated at 698d6724; subsequent review fixes
repair diagnostic fixtures and strengthen their tests. No backend decision or
live-performance acceptance follows from these captures.

`four-mesh-identity.json` verifies all twenty production appearances against the
frozen preceding catalog: original geometry/source files, skeletons, animation,
materials and images remain byte-identical. Only the added intermediate mesh and
ordered tier list differ. Obsolete catalog versions can be removed from the
working asset trees because the historical builds use their independently
hash-verified frozen snapshot.

The compressed reference/candidate/comparison reports retain 68 matched images:
four 64-person formations, 17 camera/pose samples each, zooming 40→14→40 standing
height pixels with pan/yaw reversals. Consumed cameras and poses match. Twenty-four
frames match exactly; intermediate-range frames show expected fine edge/shading
differences. All seventeen paired review sheets were inspected by root and an
independent fresh visual agent. Neither found one-sided lost equipment, silhouette,
pose, shadow or grounding defects. Both observed a shared appearance shift between
samples 06 and 07, especially phalanx blue coverage and artillery detail. This
existing transition remains an open temporal-quality issue. The GIF is a sampled
illustration, not recorded real-time cadence; PNGs are authoritative.

Independent Codex review found no actionable four-tier regressions and verified
typechecking and deterministic roster bakes. Root's 33 focused tests pass. Hardware
LOD routing reaches all four meshes and the raw pose/palette numerical checks pass.
The initial far-properties attempt used the wrong hardware mode and correctly
refused capture; the subsequent canonical SwiftShader suite ran and failed 23
baseline images plus the dead-contact material check. These failures are retained
in `four-mesh-far-gates.log`, not waived or re-blessed. The preceding three-tier build reproduces all seven grounding PNGs byte-for-byte
and the same dead-contact failure (p99/max34). The extra old-control shadow-histogram
failures arise because the current harness expects four-tier key names; their
actual old counts are retained. This isolates the grounding failure from the
four-tier change, but does not resolve it. Other far-suite differences remain
unclassified. The unchanged30k hardware gate subsequently passed all18 checks:30,560 soldiers,
585 scenery instances,11.98/14.29ms static GPU medians; pan/zoom/wheel rAF p95
19.25/21.92/23.5ms. Full live moving-camera timing, final shadow benefit and
production acceptance remain open. This paused gate is an additional floor,
not live60fps acceptance.

[Test changes](test-changes.md) records the review corrections and seven carried-in
lifecycle/timing failures repaired without changing production behavior. Root and
independent Codex review both passed all seven repaired tests.

[Stationary contact cost](cost/README.md) now verifies preserved shadow and wide
geometry while reducing dense main-pass work. Timings remain provisional; the wide
view is slower despite identical work and host drift is substantial.
