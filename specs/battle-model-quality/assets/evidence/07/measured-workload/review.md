# Current-contract animated workload

The timed synthetic workload supplies measured forward travel, not an exertion
hint. Its walk/run paces come from the selected fixture's authored stride and
duration; the mounted diagnostic uses 1/2 m/s. This is synthetic observation
input, not proof of individual propulsion or a simulation change. Fixed crowd
positions, the actual capped wall-time clock, release schedule, production
renderer, timing ownership and 33 ms thresholds remain unchanged.

This is a **new workload baseline**, not a speedup comparison with the earlier
constant-1-m/s measurements. Those historical measurements genuinely exercised
walk and release overlays but their obsolete running hint did not select run.
The distinct-history allocation workload is unchanged and remains outside timed
cadence measurements. No art envelope is accepted.

## CPU and review

The synchronized schedule now lives in the existing typed synthetic-fixture
owner, consumed by both the browser benchmark and a real ActionTimeline test.
The red tracer used constant speed and failed specifically because only
`fixture-walk` was selected. After measured pace selection, both roles are
observed, release overlays occur only in the interrupted row, and fractional
samples advance base phase throughout the cycle. All 355 web tests and the full
TypeScript check pass. Seven pre-existing synthetic-fixture tests stay unchanged.

Independent bundled Codex review 7448, session
`01a07f73-0674-7033-870e-aa0dbd5f784e`, completed terminal 0 with no actionable
defects. It independently passed all eight fixture tests with the runner config
loader after its default loader was blocked from writing linked dependencies.
It performed no GPU validation.

Shape review keeps one fixture schedule owner and deletes the obsolete inline
schedule, with no new benchmark, renderer or clock. Diff review leaves runtime
and simulation untouched. Representative clip and phase telemetry is recorded
outside CPU submission timing; all bodies share the synchronized history.
Root owns the slice pickup, README and checkpoint updates.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `timed mounted workload exercises measured walk/run and release interruptions`, `web/tests/syntheticBudgetFixture.test.ts` | New regression on constant speed observed only `fixture-walk`, failing the expected two-role set | Steady selects only walk; interrupted selects walk and run with release overlays; every half-tick sample advances base phase | Current timeline selects gait from measured speed, so the obsolete hint was ineffective. **moved** |

No existing assertion, performance threshold, screenshot baseline or unit stat
was re-pinned. Hardware measurements are pending the serialized slot.
