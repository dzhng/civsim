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

## Current lifetime acceptance gap

Explicit terrain disposal and flat GPU resource counters do not prove JavaScript
collectability. The ten-cycle journey shows growing memory; a three-cycle weak
reference probe collects outer worlds but retains their disposed Three renderers.
Resolve the measured retaining path before claiming stable whole-game lifetime.
Do not substitute timestamp-map counts or disposal events for retained-size
measurement. Diagnostic boundaries live in the production journey evidence.

The heap now identifies shared Three texture and quad-geometry dispose listeners
as retaining paths to retired renderers. Correct the dependency's resource-owner
disposal, preserving simultaneous live worlds. Prefer a small reproducible patch
of the pinned package over an application-side listener cleanup system or a
renderer upgrade. The patch must cover the package's actually imported bundles,
be installed through the package manager, and have a removal condition when the
upstream version fixes the same defect. Re-run weak-reference and memory cycles,
plus rendering and lifecycle guards; listener removal alone is not acceptance.
