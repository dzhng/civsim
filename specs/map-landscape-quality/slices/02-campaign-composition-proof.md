# 02 — One-world campaign composition proof

Status: complete. Dependencies: [01](01-surface-contract.md).

## Contract and owner

Begin the proposed photoreal campaignWorld as the final composition owner, using existing PhotorealWorld and cameraBridge. Add only the smallest real campaign data fixture needed to prove its boundaries.

Slice variable: **Depth and interaction integration, not final art.**

## Work

Render one raised terrain patch, a draped road, a territory wash, fog edge, one city and army representation, a standard, selection, and a label/card. Reuse CPU draw/layout inputs where they already exist. All GPU world objects use the same depth buffer and camera; DOM cards use its projected anchors. Reorder submissions deliberately to prove real occlusion. Do not bridge raw campaign passes with a second canvas or private shared-texture protocol. Keep production selection unchanged until cutover; this lab composition grows into production rather than being discarded.

## Runnable checkpoint

Planned /renderer/campaign-composition route and campaign-composition scene. The fixture is clickable at DPR1 and DPR2, with the camera off-center and tilted.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Click the visually rendered elevated target through actual pointer input, not a debug select shortcut. Assert fog hides the entity and associated label; a front ridge occludes a rear road/army even when submission order is hostile. Prove standard and selection grounding, then resize and dispose/recreate the world. Run renderer-lifecycle and the surface tests.

Crop/mask: Full composition, city/road/selection intersection and fog edge crops. Placeholder city geometry is permitted; landscape palette, forest density, and polished text atlas art are out of scope.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Small fixture geometry and internal layer classes are delegated. The single world/depth/camera contract and actual pointer oracle are fixed.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: A new UI design would change the label/card work. Existing campaign UI and faction/allegiance meanings are the acceptance target.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.

## Implementation and review evidence — 2026-09-15

The production composition owner now exists under `photoreal-renderer/src/campaign/`. Its lab route uses the real city asset, existing road geometry and a shared standard layer (promoted out of the battle directory). The tactical source and application commands are unchanged. The army boxes are an explicit verification fixture, not a new production army representation.

Actual CSS-pixel clicks select the raised army and city at DPR1 and DPR2. Fog removes the army, standard, label and selection together. A flat control exposes 97 road pixels and more than 500 army pixels behind the ridge; the raised fixture occludes both regions completely despite hostile submission order. Resize and same-canvas world recreation pass. New screenshots are explicit-zero-tolerance captures; the final repeat is recorded in the pass handoff.

Visual review rejected a card that covered its army/banner; anchoring above the shared standard's pole top resolves that. A second independent critique found no blocking depth, grounding, continuity, flag, selection or fog defects. The card can cover a small road segment as screen UI, and fixture roads/army models remain intentionally schematic; polished production presentation belongs to 11–12.

Code review found the source box winding disagrees with its outward normals. The material now honors authored normals with the model normal matrix rather than letting stock double-sided shading reverse them. The earlier test mock return-type finding was corrected and typecheck passes.

Disposal initially reproduced a real pending timestamp-buffer `mapAsync` abort. The shared world now waits for every outstanding readback before destroying query buffers; an explicit failure-plus-pending-read test pins this. It retains the original older-success-after-newer-failure regression and original sampling cadence. Final hardware `renderer-lifecycle` passed all ten cycles on Chrome/Apple Metal: 25 geometries, 181 textures and 12,910,592 WASM bytes remained constant; user-agent memory ranged 262.34–273.04 MB, with no page errors. [Hardware evidence](../assets/slice-02/hardware/) includes the complete log and metrics.

Hardware battle standards passed behavior checks. Tactical and approach are byte-identical to the matched prior-code hardware control. Eye differs by 8,251 RGB pixels (885 at the existing 0.12 comparison threshold), concentrated in distant grass; an unprimed paired review found neither image visibly worse and no changed soldier/flag shapes. This is not certified exact and is larger than control-repeat noise. Hardware-versus-software baselines differ substantially in both candidate and control; no battle baseline was changed. Full battle visual acceptance remains in 13/15. Subsequent long browser gates should use a frozen build/preview: live Vite reloads interrupted earlier runs, and SwiftShader's 66-million-triangle battle frames exceeded readiness timeouts.

Final closeout: all 429 web tests, typecheck, build and focused lint pass. The five composition captures (initial, selected, fog, flat control, DPR2) repeat with zero differing pixels. The final normal-corrected images were independently critiqued: no detached poles, floating bases or broken roads; schematic road/model forms and deliberately simple fog-of-war gradient remain fixture limitations. Selection uses the existing shared green and ring profile. Review findings were fixed, with no remaining in-scope blocker.
