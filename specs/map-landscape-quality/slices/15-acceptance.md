# 15 — Whole-game visual and hardware acceptance

Status: pending. Dependencies: [14](14-production-cutover.md).

## Contract and owner

Use the existing scene/performance report owners. The spec evidence folder stores the final comparison, decisions and behavior ledger; it does not become a second benchmark framework.

Slice variable: **Final integrated quality, stability and resource behavior.**

## Work

Review the full production campaign across the regional/climate/camera matrix, plus battle counterparts. Resolve all in-scope high-confidence critique findings from the spike and later passes. Measure named hardware with full overlays and crowds; compare against pre-change captures and the declared budgets. Exercise continuous pan/zoom, rapid distant travel, an idle hold, and repeated campaign/battle return. Remove superseded experiment routes and dead tuning controls; retain the canonical review fixtures. Close the spec only after its goals and required evidence are actually satisfied.

## Runnable checkpoint

Production campaign and battle, final screenshot/crop set, water motion GIF, and archived full-game hardware report.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Run typecheck, full web tests, build, required campaign/battle scenes, hardware full-game and 30k battle gates. No invented metrics for unavailable capabilities. Record software correctness separately from hardware performance. Finish with refactor-clean → code-review → write-docs, independent Codex review, change-report, and unprimed screenshot critique. If substantial fixes are needed, reslice the failing owner and continue.

Crop/mask: Full-frame reference comparison plus every feature crop from validation.md. Nothing within the agreed landscape scope is now out of scope; exact geographic battle reproduction and gameplay rebalance remain excluded.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Test execution ordering and reversible fixes within the declared contracts are delegated. Passing snapshots cannot substitute for the reference quality bar or actual hardware evidence.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: User feedback can change the art target at any checkpoint, but silence does not block implementation. Missing hardware evidence is reported as unverified, never accepted by assumption.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.

Pending battle verification follow-up: full-frame hardware bronze-cardbar drift remains separate from zero-difference forest-world captures. Preserve canonical tolerances. The standing 30k scene's close zoom 24/28 requests settle at 8; correct its actual camera coverage before claiming those close-stop budgets. See the [density evidence](../assets/slice-07/battle-density/README.md).

## Verified production lifetime checkpoint

The pinned Three dependency patch removes renderer-owned disposal listeners from
shared textures and geometry while preserving other live renderers. The existing
lifecycle scene now checks weak-reference collection as well as disposal and
resource counters. Ten hardware production cycles pass all 63 checks: all retired
worlds and older renderers collect, and measured memory stays at 296–303 MB.
Only the latest retired battle renderer remains through the shared Bloom quad
until replacement. This is a finite ten-cycle result; full visual and performance
acceptance above remains open.

[Retirement evidence](../assets/slice-15-retention/README.md) records exact heap
paths, reports, memory samples and the separate development React Refresh catalog
retention. No React or application cleanup workaround was added. The dependency
patch documents its upstream removal condition and covers the imported bundles.
