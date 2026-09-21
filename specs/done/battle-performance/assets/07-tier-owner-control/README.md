# Shared tier owner, unchanged three-level behavior

The asset bundle owns its ordered mesh roles and count; crowd runtime owns the
matching projected thresholds, hysteresis and audience policy. This removes
independent hardcoded mesh/impostor boundaries from the Three and native
consumers without moving render policy into the baker. The preparing commit
86d8752a retains the original three meshes and18/9/4 policy.

[Comparison](comparison.json) records68 matched frames: sword, phalanx, cavalry
and artillery formations, each64 instances, while zooming40→14→40 projected
pixels with pan/yaw reversal and canonical melee phase progression. All PNG
hashes and pixels match exactly. Both sides retain actual consumed cameras,
poses, crowd stats and capture checks in the compressed reports. This is a
sampled correctness sequence, not real-time cadence or full-game acceptance.

Independent Codex review found no actionable regressions. Its typecheck and17
focused LOD/appearance tests passed. The review sandbox blocked the bake test's
local HTTP server; root reran that test successfully outside that sandbox.
[The result](appearance-tests.log) covers human/mounted pose samples,32-bit mesh
merge, CLI and deterministic bake. No test tolerances or gameplay hashes changed.
The active four-mesh cutover still needs its own visual and hardware gates.
