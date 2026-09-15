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
