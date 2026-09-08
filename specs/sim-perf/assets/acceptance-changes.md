# Acceptance changes

Simulation assertions and unit statistics are unchanged. This ledger records
changes to what the performance harness requires.

| Test | Previous behavior | New behavior | Why it changed |
|---|---|---|---|
| `scripts/test-perf` / `profile_tick gate` | Requires the 30k opening window's median repeat-mean tick cost to be at most 25 ms; reports 60k without gating it. | Retains that check and also requires the developed 30k window to cost at most 25 ms while retaining at least 30,000 living soldiers. | The opening window has only 49 minimum living fighters; deterministic reconnaissance locates thousands of fighters while over 30k men remain. The extra window checks the intended fighting budget. **moved** — expanded acceptance coverage, no simulation or stat change. |
