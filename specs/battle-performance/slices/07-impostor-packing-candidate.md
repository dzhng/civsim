# Impostor record packing — measured CPU candidate

After the snapshot optimization, a pinned tick30 wide-view profile puts
impostorData.packImpostors first among named leaf costs:323ms self in a4.11s
capture, plus admission begin314ms and snapshot capture276ms. Inlining and
inclusive overlap prevent treating these as additive exclusive subsystems.
The profiler is diagnostic, not a new timing acceptance run.

Remove transient per-soldier arrays and generic Float32Array.set from the existing
12-float record packer. Use direct indexed writes and an ordinary loop. Preserve
all arithmetic operation order, tile selection, corpse fade, perspective minimum
span, instance order, allocation/return ownership, empty input and padding.
Do not introduce pooling, caching, a second packer, new GPU layouts, LOD changes
or renderer shims. The caller still owns visibility and LOD.

Before changing code, capture representative expected packed bytes from the
current implementation, covering headings, camera directions, negative and absent
elevation, factions, alive/dead fade, tiny-span enlargement and empty input. Pin
actual packed results; never update expectations just to fit a changed result.
Existing atlas/tile/transport tests remain unchanged.

Root uses the same pinned30k static and wall-time camera-motion ABBA screen, now
with the adopted snapshot build as control. Both candidate CPU medians must beat
both controls and pooled renderCpuMs must fall at least5% in both segments; this
narrow leaf accounts for only part of total preparation. Actual rendered cadence
must not regress. Preserve matched images and crowd/LOD output. No adoption from
unit tests, a synthetic microbenchmark, or profile percentages alone.

Not adopted: [the declared screen failed](../assets/07-impostor-packing/README.md).
Preserve the branch/evidence; no unchanged rerun to seek a pass.
