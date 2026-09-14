# Repeatable action-following benchmark camera

Status: implemented and verified for baseline acquisition. The [evidence record](../assets/01-benchmark/README.md) owns full-menu checks, camera captures, raw timing and limitations. The baseline is slow; completing this measurement slice does not pass the final performance contract.


## Contract and seam

The benchmark camera behaves like a person watching the battle: pans between fighting formations, slows over contact, zooms in to inspect, pulls back to reveal both armies, and looks toward the horizon. It must continuously move and cross real grass/LOD thresholds, not merely teleport between static poses.

Proposed `benchmarkCamera.ts` owns a deterministic `BattleCameraTour`: timestamped semantic targets (unit/contact centroid), smooth pan/yaw/pitch transitions, physical-distance zoom and labeled phases. It drives the existing Camera API and production input/motion path; it does not own new projection/orbit math. Produce the canonical tour by scouting the seeded simulation, detecting sustained contacts through existing observations, and choosing action anchors in a repeatable order. Then **freeze the anchor trajectory and timing** for comparisons so fast/slow backends do not select easier different views. A runtime adaptive tour may be an optional demonstration later, not the benchmark oracle.

Author a 300-second sequence including 30-second tactical contact view, 60-second lateral action-following pan with reversal, 60-second repeated near/tactical/wide zooms, 60-second horizon sweeps, 60-second combined action pans/zooms and 30-second tactical return. All timed phases retain natural camera motion; the separate diagnostic static hold stays in 01. Clip targets to valid production camera ranges and verify achieved poses. No large teleport or velocity discontinuity at phase boundaries. During timing the tour exclusively owns the camera: ordinary pan/zoom gestures are ignored with a small “Benchmark camera” indicator; Escape/Cancel remains available. Do not intercept unrelated system/browser shortcuts. Restore normal input ownership on every exit, including failure. This prevents unnoticed manual input from invalidating comparisons. Record timestamped intended and achieved camera pose plus current sim tick. On sim slowdown, keep the canonical path and report action-framing divergence; the run cannot pass equivalence by following a different path.

## Artifact and verification

Watch the actual menu-launched five-minute battle with a small elapsed/phase indicator and Cancel control. Automated probes verify smoothness, actual zoom ranges, reversals, horizon coverage and visible-action content floors derived from the canonical scout. Freeze frame-rate-independent interpolation; a low-FPS run must not get a shorter camera path. Check that benchmark control detaches on completion/cancel and normal input works afterward.

Visual variable: camera motion/framing. Judge full field excluding HUD, formation scale and action coverage across video/time strip; grass/shadow defects remain baseline observations here. Delegated: exact anchors/easing and conservative velocities chosen from the real battle, frozen with scenario version. Human feedback that it feels unlike real play changes the canonical tour before candidate runs, with a fresh baseline.

## Inherited verification and review

Keep existing camera, crowd LOD, animation/pose, grass sampling, depth, default-renderer and lifecycle checks green; run the narrow affected checks plus the standing hardware `battle-perf-30k` gate for renderer changes. Preserve its thresholds. Record pre-existing reds separately; do not re-bless unrelated failures. Simulation semantics and campaign consumers must remain unchanged.

For every visual artifact, inspect the actual candidate; use [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the matched baseline/reference, then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**. Use screenshot-regression/snapCheck for captures. Motion claims need a frame sequence/video as well as stills. Store evidence under this spec. Open review shots via preview-shots, allow about five minutes while doing other work, then record an evidence-based decision if no reply arrives and close the shots. Human feedback is non-blocking; failed acceptance is not.
