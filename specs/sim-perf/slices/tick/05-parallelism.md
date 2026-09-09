# tick/05 — Retain simple weapon-repel parallelism only

David accepts 35 ms and requires simple changes only (2026-09-09).
The revised weapon-repel pass meets that target with unchanged hashes and
resolved small-battle overhead. Retain its shared search kernel, coarse
scheduling and original serial force-application order.

Whole-unit steering and bounded projection replay are closed experiments.
They do not ship. Remove their isolated source changes after preserving the
verdict; no further implementation or timing is required for them.

Finish the retained pass's integration checks and native build contract.
The verified performance result used eight Rayon threads; the standing
performance command must select the measured configuration explicitly.
Keep browser builds serial. Do not introduce a new pool manager, automatic
tuning or additional execution modes to chase headroom.

All state hashes and existing simulation expectations remain unchanged.
The parent owns the full integrated checks, scaled telemetry and final
review. The historical trial evidence is not a claim that those prototypes
shipped.
