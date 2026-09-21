# Experimental machinery retirement

The user requested removal of the discarded renderer implementations and their
dependencies after accepting the TypeGPU cutover. The maintained implementation
has one battle renderer. The production Menu benchmark and current renderer
regressions remain; historical reports and visual references are evidence only.

The performance lab, its five Vite entry configurations, and 116 archived
executable experiment scripts were removed. The dependency lock drops vgpu and
ten exclusive transitive packages. Three remains required by asset authoring and
generic material/model previews; TypeGPU remains the battle runtime dependency.

Production telemetry no longer has the experimental query-disable switch or
alternate backend identities. The unused single-texture shadow binding was
removed; both production shadow modes still bind their depth array, and their
generated sampling shader strings compared byte-for-byte equal before and after.

Verification on 2026-09-21: 908 tests across 144 files passed, TypeScript and the
production build passed, and hardware-browser battle rendering plus benchmark
cancellation/export checks passed without page errors. An independent Codex
review found no actionable regressions and passed its 250 targeted checks.
This cleanup did not repeat the five-minute performance measurement or claim a
new performance improvement.

[The test-change ledger](experimental-test-retirement.md) accounts for coverage
moved to the normal suite and tests removed with their experimental subjects.
[The choices ledger](../../choices.md) describes the final maintained state,
excluding rejected experiments, superseded choices and explicit user requirements.
