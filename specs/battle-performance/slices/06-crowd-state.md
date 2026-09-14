# Separate crowd state from camera demand

## Contract and question

Does moving a camera cause needless observation packing, pose storage growth or material replacement? Remove only measured duplication while preserving every live pose change.

## API seam

Current owners are `PhotorealBattleWorld.drawInstances`, `PhotorealCrowd.uploadFrame` and `SoldierPosePalette`; `BattleRenderer` owns production frame orchestration. Introduce explicit state/playback and camera/audience revisions at those boundaries, reusing existing source identity where possible. A camera update recomputes required audience work without rebuilding unchanged source state. Animation time and live observation changes must still advance poses; “paused sim” does not imply frozen animation. Keep stable soldier identity through deaths/spawns and separate one pose from its visible/shadow consumers.

Freeze LOD policy, meshes, materials and shadow fit. Pre-size or amortize resources using measured active populations; count growth and pipeline creation. No shader/material compilation after camera-only demand within prepared capacity. Do not reserve every possible class×LOD×audience maximum blindly. An actual overflow has a measured bounded growth path and cannot silently omit soldiers. Existing asset reload/dispose remains authoritative.

## Artifact and verification

Same observation under moving camera, then moving/attacking/dying soldiers under stationary and moving cameras. Verify equal poses and equipment, correct identity after compaction, and lower allocation/upload work for camera-only frames. Exercise palette growth and zero→many→zero populations; prove no cached stale animation, no resource leaks and valid shadow pose sharing. Existing camera/frozen-frame cache behavior must continue to invalidate on every rendering-relevant change.

Visual variable: animation/pose continuity only; crop entire representative infantry, mounted, ranged and dying figures across frame sequences. LOD silhouette and lighting are frozen. Delegated: internal buffers/revision naming and pool sizing based on 01 evidence. Human reports of frozen/skipping animation reject the optimization regardless of faster frames.

## Inherited verification and review

Keep existing camera, crowd LOD, animation/pose, grass sampling, depth, default-renderer and lifecycle checks green; run the narrow affected checks plus the standing hardware `battle-perf-30k` gate for renderer changes. Preserve its thresholds. Record pre-existing reds separately; do not re-bless unrelated failures. Simulation semantics and campaign consumers must remain unchanged.

For every visual artifact, inspect the actual candidate; use [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the matched baseline/reference, then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**. Use screenshot-regression/snapCheck for captures. Motion claims need a frame sequence/video as well as stills. Store evidence under this spec. Open review shots via preview-shots, allow about five minutes while doing other work, then record an evidence-based decision if no reply arrives and close the shots. Human feedback is non-blocking; failed acceptance is not.
