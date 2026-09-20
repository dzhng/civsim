# TypeGPU scene state integration

[Corrected scene integration](corrected/README.md) closes reload, admitted pose,
explicit seating identity and frame depth diagnostics for the selected TypeGPU
candidate. CPU and actual GPU checks pass; final renderer cutover and performance
acceptance remain open.

[The initial candidate](initial-candidate/README.md) records ordinary Menu lifecycle
checks and the independent review finding. [The direct GPU regression](pre-prepare-regression/README.md)
reproduces the missed early-reload ordering; the corrected evidence verifies the
same sequence. The pre-integration [Menu baseline](baseline.json) records unavailable
TypeGPU diagnostics and rejected reload atf440191a.
