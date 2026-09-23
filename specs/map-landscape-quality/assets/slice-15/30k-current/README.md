# Current production 30k performance contract

The performance scene follows the sole production TypeGPU renderer. The retired
Three/source and raw route selectors no longer describe live production owners.
Grass is read from the installed terrain owner; measurement waits until a
finished grass generation has appeared across two completed frame identities.
GPU samples identify completed submission spans and are deduplicated by their
published identity.

Workload, camera sequence, thirty-second readiness deadline, population/content
floors and timing thresholds remain unchanged. Twelve diagnostic tests pass.
The initial native run failed while the old source branch interpreted current
grass diagnostics as disabled; corrected native execution is pending.

## Change ledger

| Tests | Previous behavior | Current behavior | Reason |
| --- | --- | --- | --- |
| `source keeps its uncorrelated render-pass sum semantics: every read is a reading`; `a missing source measurement is dropped rather than counted as zero` | Accepted repeated anonymous source pass sums | Removed; identified completed submissions are the only production metric | Retired renderer has no live caller |
| `source grass keeps reading its flattened blade-field mirror` | Read the old top-level field layout | Removed; nested TypeGPU terrain grass remains covered | Read the installed owner |
| `an unset route is the incumbent source renderer, and both routes are known`; `a mistyped route is rejected rather than quietly measuring source` | Selected source or raw diagnostic adapters | Removed with selector | One production contract needs no backend switch |
| Native/mixed timing cases | Compared route-selected metrics | Preserve missing, mixed and identified sample behavior for production metric | A wrong metric must not silently count as timing |
| Grass readiness | Required nonzero records | Requires completed publication of the finished generation | CPU completion may precede its visible GPU frame |

The first corrected native run passed timing/content contracts but read a prior
camera frame after the final pan write (99.905m versus100m). The endpoint oracle
now waits for a newer completed frame matching all requested axes within the
unchanged0.01 tolerance. This wait is outside the measured GPU/rAF window and
bounded to30seconds. The repeated native run passes all19checks with exit0 and no page errors.
Population, scenery, grass, camera endpoint, static/pan/zoom/wheel and close-fill
contracts all pass their unchanged limits; see `native-report.json`.
