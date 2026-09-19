# Held authority control

The lab build holds the canonical simulation endpoint while rendering the shared
camera tour, repeated observed poses and environment time. Ordinary builds still
run live. Reports identify renderer-only scope and live acceptance rejects them.
The held interval includes artificial pose replay boundaries; it cannot establish
natural animation quality or final camera smoothness.

Root focused tests pass26 cases, and the lab report/trial/plugin tests pass67.
Web typechecking passes. Independent source review found no actionable defect.
Root added the independently pinned tick12000 hash, loop-only catalog coverage,
and immediate authority holding on terminal benchmark transitions. The subscriber
owns that lifecycle change, including cancellation and failure.

The source production build passes a15-second hardware browser control: canonical
state/hash stays fixed through advancing camera positions and502 additional frames;
cancellation holds the same state with no further presentations and no page errors.
The first probe incorrectly read camera from frameMetrics (which has no such field);
its failed report is retained beside the corrected probe using recorded camera data.
CPU implementation/tests may overlap this correctness run, so its timings are not
performance evidence. Root inspected the running scene for gross composition only.
Actual pose/environment parity across all four backends and the full tour remain
unverified. No renderer ranking or visual/performance acceptance follows.

The tested bundle was built after the root hash, terminal and loop-only fixes but
before removal of a redundant setHolding call; the state subscriber already owned
the same transition in that bundle. Fresh fixed comparison builds must use the
committed source and preserve enabled/disabled held-plugin parity.

## Test behavior changes

The default completion scene still requires live simulation advance. In an
explicit held lab build it instead requires renderer-only classification and
unchanged canonical tick/hash; the live scorecard rejects this report kind.
The canonical-start assertion now supports both independently pinned contact
states. This changes only the declared lab workload (moved).

Existing unit-test expectations and performance thresholds were not repinned;
constructor arguments gained explicit live authority and a supplied hash.
New tests cover held state changes, clock progression, finite loop-only poses,
retained positions and terminal authority holding. No gameplay stat changed.
