# Native live functional controls

The first raw Menu flow at `77d1ed47` timed out after the existing 120-second
readiness bound, with no page errors. The public readiness helper requires
`renderStats.ready` and `renderStats.soldiers`; the native facade only exposed the
same audience facts under its native diagnostics. The correction exposes these
public fields directly from the actual admitted native audience. It does not
invent a Three renderer or change the helper's readiness gate.

Runs use the actual Menu and unchanged source scenario scripts on a fixed lab
checkout, Chrome hardware GPU, 1440×900 CSS at DPR 2. A private Vite dependency
cache avoids shared-worktree dependency churn. Shared production assets and
verified offline atlas artifacts are read-only. These are functional controls
under shared host load, not performance rankings; native GPU timing is pending.

At `d934c150`, the corrected raw Menu cancellation/export flow passes all seven
checks. Its full five-minute Menu run passes all ten checks, including canonical
contact hash `9928381812590497427`, live simulation, all camera phases/extremes,
new primary submissions, matching run clock/interval totals, visible result
actions, and full JSON export. Both browser runs report zero page errors. The
complete raw measurement is retained without a performance acceptance claim.

At `9dcde73d`, TypeGPU's instrumented Menu flow and full five-minute run pass all
checks with zero page errors. GPU collection tracks 1,366 primary submissions:
1,365 complete pose/grass/shadow/main/post query results, one unresolved at the
terminal snapshot, zero cursor gaps and zero lost events. Query helper copies do
not replace the recorded render identities. Host load was shared; these values
verify measurement correlation and do not establish comparative performance.

At `4bd3fce3`, vgpu's instrumented flow/full run passes every check, with zero
page errors. All 1,019 tracked primary submissions have complete GPU results;
there are no pending queries, cursor gaps or lost events. Startup/end allocation
snapshots retain actual requested logical bytes (including telemetry), explicitly
not physical VRAM. Peak combined requested bytes are 1,912,350,048; unknown
allocation count is zero. Default muted audio is retained in these functional
runs; future quiet acceptance must explicitly enable normal audio consistently.
