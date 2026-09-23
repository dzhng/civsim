# Mature canopy coverage

Accepted for coverage only. The candidate enlarges mature tree dimensions by
50% through the existing campaign placement owner. The 4 km lattice, 32,000 cap,
source cover, species, crown geometry, materials and lighting stay fixed. Fringe
shrubs keep their prior dimensions. Final-footprint clearance checks still apply,
so accepted regional counts move slightly: Alps 2,206 to 2,216; Italy 1,125 to 1,110.

[Before](before/landscape-italy.png) and [candidate](candidate/landscape-italy.png)
show more overlapping crowns. The [fresh critique](critique.md) accepts this
improvement in both regions, while retaining oversized conifers, separated clumps
and absent ground detail as open slice07 work. This is not reference parity.

Verification: 501 web tests pass; focused woodland tests pass; typecheck passes.
The candidate report records the two expected changed regional baselines. The
repeat report preserves zero pixel differences after accepting those baselines,
and unchanged water controls. Hardware measurements are scoped to regional
rendering, not complete campaign UI performance.

Change ledger: `landscape-alps` and `landscape-italy` now pin the reviewed larger
canopies. Their old snapshots showed smaller detached crowns. No test thresholds
or gameplay behavior changed.

Review: one existing placement constant owns the change; no new renderer,
scatter algorithm, dependency or tuning interface. Independent review and the
hardware report are recorded alongside this evidence.

Corrected hardware runs load `region=alps` and `region=italy` and verify distinct scene centers. Both 180-frame runs report 16.67 ms p95/max on Apple Metal3 with no errors. The initial probe used an ignored query parameter and loaded Alps twice; that report is replaced. Independent Codex review found no actionable regression in the sizing change; its three woodland tests passed.
