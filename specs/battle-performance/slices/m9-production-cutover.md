# M9 — one production battle renderer

Depends on M2 through M8. Selected backend: TypeGPU.

Replace the production BattleRenderer constructor implementation with the selected complete world and its frontend presentation/lifecycle policy. Delete the old battle implementation and obsolete candidate selectors/adapters, not the shared camera/environment/asset owners. Sweep real renderer-lab/baker consumers before deletion; retained Three tooling must have a real owner and no production fallback. Keep saved gameplay unchanged and add no migration.

Run actual Menu benchmark plus normal battle/campaign entry, settings including High, asset reload, error/cancellation/disposal and emitted-runtime dependency checks. Prove exactly one live device/world per battle. Retire experiment backend unions and align memory/debug consumers with honest final counters. The standing30k floor and final live net-shadow/input-latency gates remain10; a clean switch is not final performance acceptance.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.

The standing browser checks still encode Three ownership and source-shaped
terrain/grass fields. Current selected-world diagnostics already provide real
population, camera, installed terrain/content, physical depth and correlated
complete-submission timing. [Presented draw counts](../assets/native-draw-observation/presented-frame/README.md)
now carry an independently checked command total for their own validated frame.
These capabilities do not make the unchanged source guard pass: it still requires
`three-webgpu` and a source seating flag that is not an explicit measurement.

Migrate the actual scene consumers to the selected owners. Use the explicit
[seating inspection](m9c-seating-inspection.md) tied to the presented crowd/terrain
identity; do not manufacture `stats().seating.matches`. Preserve population,
scenery, grass coverage, physical-scale, draw-budget and33ms assertions. Assert the
actual installed TypeGPU identity/depth resources and retain source controls as
explicit lab references, not a production fallback. Shader-routed grass counts
still need their truthful consumer proof; static record capacity is not routing.

[M9a](m9a-frame-timing.md) provides correlated native timing. Its complete submission
span includes compute and gaps; source render-pass sums remain a differently
scoped measurement. Never relabel or sum overlapping passes to pass a threshold.
[Readiness audit disposition](../assets/m9-readiness/README.md) identifies legitimate
capture/baker/lab consumers and source-specific guards that the sweep must cover.
Migrate their real requirements before deleting the old battle owner, then run
normal entry/campaign handoff and final live acceptance on the sole selected path.
