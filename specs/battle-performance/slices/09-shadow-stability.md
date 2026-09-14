# Stable shadows while moving

## Contract and question

Do accepted shadows stay attached through pan, zoom, cascade transitions and offscreen-caster entry without extra frame spikes?

## API seam

Shadow rig temporal fit/update policy owns previous fit, texel snapping and invalidation. Consume the same camera/light/terrain state used by beauty rendering. Keep 08 shadow resolution/contact target and scene look frozen. Fit stabilization may use snapped light-space bounds and hysteresis; caching is allowed only with correct invalidation for moving casters, sun/environment, terrain and viewport. Never freeze moving unit shadows merely to pass timing. A static terrain/caster cache and dynamic pass may be tested separately if timestamp evidence justifies the extra ownership.

## Artifact and verification

Run slow sub-texel pan, fast reversals, repeated zoom/cascade crossings, stationary camera with moving troops, moving camera with fixed troops, tree outside screen casting into it, resize and environment change. Save short full-motion clips plus aligned contact/shadow-edge crops. Require no swimming, flashing boundary, shadow detachment, dark band or stale shadow. Measure update costs and pipeline/resource creation during these events, not only stationary medians.

Visual variable: shadow temporal stability only. Compare world-aligned shadow edges and feet across sequences; grass/LOD/color remain frozen from prior accepted slices. Delegated: fit stabilization and cache strategy/numerical tuning under the invalidation contract. Human feedback on shimmer changes acceptance; clean stills cannot overrule it. Complete the A/B/C gate before 10.

## Inherited verification and review

Keep existing camera, crowd LOD, animation/pose, grass sampling, depth, default-renderer and lifecycle checks green; run the narrow affected checks plus the standing hardware `battle-perf-30k` gate for renderer changes. Preserve its thresholds. Record pre-existing reds separately; do not re-bless unrelated failures. Simulation semantics and campaign consumers must remain unchanged.

For every visual artifact, inspect the actual candidate; use [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the matched baseline/reference, then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**. Use screenshot-regression/snapCheck for captures. Motion claims need a frame sequence/video as well as stills. Store evidence under this spec. Open review shots via preview-shots, allow about five minutes while doing other work, then record an evidence-based decision if no reply arrives and close the shots. Human feedback is non-blocking; failed acceptance is not.
