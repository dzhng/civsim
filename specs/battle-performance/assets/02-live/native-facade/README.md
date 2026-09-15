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
