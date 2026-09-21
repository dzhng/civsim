# 15 — Whole-game visual and hardware acceptance

Status: pending. Dependencies: [14](14-production-cutover.md).

## Contract and owner

Use the existing scene/performance report owners. The spec evidence folder stores the final comparison, decisions and behavior ledger; it does not become a second benchmark framework.

Slice variable: **Final integrated quality, stability and resource behavior.**

## Work

Review the full production campaign across the regional/climate/camera matrix, plus battle counterparts. Resolve all in-scope high-confidence critique findings from the spike and later passes. Measure named hardware with full overlays and crowds; compare against pre-change captures and the declared budgets. Exercise continuous pan/zoom, rapid distant travel, an idle hold, and repeated campaign/battle return. Remove superseded experiment routes and dead tuning controls; retain the canonical review fixtures. Close the spec only after its goals and required evidence are actually satisfied.

## Common acceptance matrix

This slice owns the integrated matrix for04–14. Their owner-specific CPU/resource
and focused visual checks remain required; the same final production capture or
journey may satisfy several owners when its framing and assertions prove each
requirement. Record links to that evidence, not separate duplicate runs. The
[validation contract](../validation.md) owns exact subject/crop coverage and
[architecture](../architecture.md) owns resource/performance limits.

| Pass | Required proof | Completion boundary |
| --- | --- | --- |
| Battle consumers | Shared rock/water policy, stable tree variants/projected detail, geometric normals and common leaf mask; generated highland/wooded/coastal and authored A/B/C, plus city/crossing handoffs where available | Composed production character, forest edge, water/vista joins, seating/cues and unchanged physics/recipes; historical Three images are not current acceptance |
| Campaign reference quality | Alps/Italy plus Aegean/islands or narrow channels, dry south, river mouth and wet north; dominant crests, valleys, green shelves/foothills, forest interior/edge/outliers, plains detail and coherent light/water | Whole frames and named crops meet the reference qualities; no geometry/material slice closes solely from a passing repeat or a recolor |
| Presentation and shores | Natural/political and fog variants; overview/full tilt/max zoom/yawed views; independent raised-marker clicks at DPR1/DPR2, label/card coverage and collision, resize/tile swaps, road endpoints/crossings and coast clipping | Same visible surface/camera/revision for presentation and interaction; owner-aware negative controls before replacing the deficient label brightness oracle |
| Integrated stability | Water-motion GIF, strict repeats and final unprimed critique; save/load, conquest/reinforcements, campaign/battle return, continuous pan/zoom, rapid distant travel and idle holds | Current named-hardware full-game/30k and campaign frame/admission budgets; stable residency/disposal and no surviving resources/listeners; whole-spec review and closeout |

Repair stale verification contracts before using their output: campaign traversal
must wait for the requested camera frame, and battle shadow/turf scenes must use
current TypeGPU stats and completed-frame evidence instead of retired hooks.
Keep existing default coverage and tolerances. Unavailable hardware is explicitly
unverified, never a software timing pass presented as hardware acceptance.

## Acceptance state

| Accepted within scope | Remaining | Evidence |
| --- | --- | --- |
| Campaign foundations, production adapter and bounded road/material/crown checkpoints | The combined quality and interaction matrix above | Owner slice evidence tables |
| Ten-cycle historical Three retirement proof, including UI attachments | Current integrated lifetime/resource plateau after battle migration and material adoption | [Retirement](../assets/slice-15-retention/README.md) |
| Merged campaign/TypeGPU battle handoff | Final combined journeys and current hardware timings | [Main integration](../assets/main-integration/verification.md) |

## Verification and review

Run typecheck, full web tests, build, required campaign/battle scenes, hardware full-game and 30k battle gates. No invented metrics for unavailable capabilities. Record software correctness separately from hardware performance. Finish with refactor-clean → code-review → write-docs, independent Codex review, change-report, and unprimed screenshot critique. If substantial fixes are needed, reslice the failing owner and continue.

Crop/mask: Full-frame reference comparison plus every feature crop from validation.md. Nothing within the agreed landscape scope is now out of scope; exact geographic battle reproduction and gameplay rebalance remain excluded.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Test execution ordering and reversible fixes within the declared contracts are delegated. Passing snapshots cannot substitute for the reference quality bar or actual hardware evidence.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: User feedback can change the art target at any checkpoint, but silence does not block implementation. Missing hardware evidence is reported as unverified, never accepted by assumption.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.

## Historical performance boundaries

Pre-merge full-frame hardware cardbar drift and the old close-camera clamp
measurements are historical observations, not current TypeGPU diagnoses. Preserve
canonical tolerances and actual camera assertions; run current production gates
before concluding either regression or acceptance. The [density evidence](../assets/slice-07/battle-density/README.md)
and [camera audit](../assets/slice-15-camera/README.md) retain their original scope.

## Historical lifetime evidence

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

The [camera coverage audit](../assets/slice-15-camera/README.md) replaces the
unsupported close dial labels with two physical views through the existing
camera owner and adds settled-framing assertions. CPU checks and hardware framing assertions pass; the closest 10m view records
33.74ms rAF p95 against the unchanged 33ms limit, so that historical run did not pass. Current hardware acceptance remains open;
this measurement does not establish a failure in the migrated TypeGPU renderer.
