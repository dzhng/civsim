# TypeGPU formation-debug routing

Worker90bfb331 is integrated4ec4b3e6. Debug mode uses a separate instance of the
existing triangle layer so empty attack arcs cannot erase formation rectangles.
Ordinary mode allocates no extra layer. Geometry, padding, team colors, dead-body
exclusion, lifecycle refusal and depth-off ordering retain their shared owners.

Root candidate83 and facade57 tests pass. Independent review found no actionable
regressions; its test invocation did not discover the changed suites, so root ran
their actual configs. A fixed actual-game TypeGPU build passes the unchanged
battle-selection scene's click/drag assertions at both DPR1 and DPR2 with no page
errors. The screenshot proves the previously refused TypeGPU debug route renders.

Fresh unprimed critique confirms blue/red team separation and plausible projected
rectangles. It flags opaque blue fill hiding lower bodies/shadows, as root sees too.
This matches the existing depth-off debug contract documented in
[the original checkpoint](../m7-block-debug/README.md); it is not ordinary battle
rendering or a new quality policy. Still images do not prove overlap/motion quality.

Tests now run the same debug persistence/order checks on the newly supported
TypeGPU route; the facade refusal expectation applies only to vgpu. New tests pin
no debug allocation in ordinary mode, lifecycle refusals and disposal. No existing
selection threshold, gameplay behavior or normal-mode visual gate was weakened.
