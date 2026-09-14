# Bound grass sampling and publication work

## Contract and question

Can a new grass focus region become ready without a blocking copy/hash/upload spike, vanished coverage or endlessly restarted sampling?

## API seam

`BattleGrassField` owns requested/active generation and sampling progress; `PhotorealBladeFieldLayer` owns GPU resident storage and publication. Evolve existing sampling and incremental upload paths, not a parallel streamer. Proposed `GrassResidencyStats` includes requested/active generation, pending age, processed cells, bytes copied/hashed/uploaded this frame and resource changes. Current records have 16 floats (64 bytes); one million records is 64 MB before copies or routing buffers. Preserve the existing base field and focus density; avoid unlimited double buffering.

Freeze ground record placement/geometry/route algorithm. Retain valid active coverage until an entirely valid next generation is publishable. Camera demand coalesces to a bounded latest request; it cannot reset the same prefix forever. Bound active/pending capacity and upload chunks from 01–03, state overflow/coalescing behavior, and publish completion counters. Under endless travel, use persistent tiles or another measured strategy that makes useful forward progress; if whole-ring jobs cannot satisfy this contract, explicitly replace that owner. Do not merely turn on an existing `incremental` flag without measuring copy, hash, allocation and GPU commit work. Loading-only settle methods never run during interactive input.

## Artifact and verification

Production pan crossing multiple actual 48m snapped focus boundaries, reversal, long travel and return; diagnostic active/pending overlays are lab-only. Pin deterministic sampling equivalence, no stale-generation activation, bounded backlog, completion after motion settles, useful coverage during sustained motion and retained-resource plateau. Require no camera blocking and improved first-traversal p95/p99 in the implicated stages. Measure cancellation and wasted bytes, not only task count.

Visual variable: temporal grass coverage at generation changes. Crop unobstructed lower/middle ground, track the same world patches through motion; exclude HUD/soldiers. Existing color, blade shape and wind are frozen. Delegated: tile vs ring internals, chunk size and pool capacity based on measurements, with an explicit memory bound. Human-visible trailing holes or edge bands reject the result even with improved timing.

## Inherited verification and review

Keep existing camera, crowd LOD, animation/pose, grass sampling, depth, default-renderer and lifecycle checks green; run the narrow affected checks plus the standing hardware `battle-perf-30k` gate for renderer changes. Preserve its thresholds. Record pre-existing reds separately; do not re-bless unrelated failures. Simulation semantics and campaign consumers must remain unchanged.

For every visual artifact, inspect the actual candidate; use [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the matched baseline/reference, then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**. Use screenshot-regression/snapCheck for captures. Motion claims need a frame sequence/video as well as stills. Store evidence under this spec. Open review shots via preview-shots, allow about five minutes while doing other work, then record an evidence-based decision if no reply arrives and close the shots. Human feedback is non-blocking; failed acceptance is not.
