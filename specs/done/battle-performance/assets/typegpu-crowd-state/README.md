# Shared admitted crowd diagnostics

Integrated worker `30c8f216` as `f440191a`. The history owns the published pose;
raw and TypeGPU audiences now use one diagnostic reader. Inspection stays explicit:
no frame performs a full-army seating scan or copies all diagnostic records.

Root checks on the combined colour/High/frame/crowd tree: TypeGPU candidate47/47,
raw audience21/21, candidate test typecheck and web typecheck pass. The first raw
suite invocation used the wrong working directory and found no tests; the corrected
web-directory invocation passed. The independent review found no actionable issue,
but its raw test execution was denied by its sandbox; root covered that gate.
Worker sparse-suite failures and exact commands are retained in [its report](worker.txt).

The extraction preserves the existing raw assertions and tolerance. Five new
TypeGPU tests cover the real audience with GPU leaves mocked, and one new raw
test covers submitted mutable-input isolation. No existing assertion, baseline,
threshold or simulation stat changed, so the changed-behavior ledger is empty.

Shape review: one reader consumes the history's named admitted-pose contract;
publication mutation methods remain private to the audience. No new dependency,
configuration or compatibility API. Diff review found no stale imports of the
moved diagnostic type. Docs review keeps capability evidence here and only the
current pickup in the spec hub. These are CPU admission diagnostics, not GPU feet
placement, a scene reload proof or a performance claim.

[Combined consumer hardware](integrated-hardware/README.md) subsequently passed
all three shadow modes through the actual Menu build, including resize/disposal.
