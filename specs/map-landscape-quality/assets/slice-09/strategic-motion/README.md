# Strategic water motion

Screen-unresolved procedural drift caused whole-map flicker. Attenuate the drift
by its projected footprint, using the slowest ripple frequency. Keep the initial
phase and eight-second loop intact; near water continues to move.

The same production campaign cameras and corrected wet-mask oracle measure
33,754 moving pixels before and 20 after at strategic distance (limit400).
Near-water motion remains18,518 pixels (minimum2,000), with99.97% of classified
motion over water. Both clock0→3→0 returns are exact. The far initial-phase
snapshot is identical; the near animated snapshot changes3,841 pixels. The
candidate report intentionally records that snapshot mismatch against the
control; it is not reported as an all-green baseline run.

Twelve focused water tests and both application typechecks pass. Independent
code review found no correctness issue. Root inspected both candidate views;
an unprimed reviewer found no new visible defect at the supplied resolution.
Existing fuzzy shallow-water edges, tiny offshore dots and a bright far coastal
rim remain. This accepts the bounded motion correction, not final water art.

Production scene migration and baseline adoption belong to the owner-retirement
pass. Its [images](../../slice-14-production/raw-map-retirement/water/) preserve
these compared views.
