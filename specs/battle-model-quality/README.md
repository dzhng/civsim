# Battle model quality

Direct-authored Blender models, articulated skeletons and individual animations for the existing battle roster. Aim for the natural proportions, layered equipment, material separation and warm grounded tone of the [supplied Rome II reference](assets/reference-rome2-phalanx-vs-heavy.png), at the nearest supported gameplay view—not Rome II's exact asset fidelity.

## Next Agent Prompt

Last updated **2026-09-07**. **01–06 complete;07 envelope open;08 candidate authoring in progress.**
Worktree: `/Users/david/dev/game-battle-model-quality`, branch
`codex/battle-model-quality`. No art envelope or detailed model is accepted.

Current pickup has independent authoring and measurement lanes:
- **09–11 combined heavy:** 43cab350 composes the local Blender geometry,
  materials and motion, including reviewed rear-belt fitting. 4926aa16 adds the
  corrected walk and initial run authoring. The current rebuild combines
  facial-form 7ea34c11, loaded-body motion b8577b62 and footwear a9b55b0e,
  retaining the latest belt and correcting a newly discovered shield/knee clash.
  [Current combined review](assets/evidence/11/combined-footwear-shield/review.md)
  supports this working composition, not art acceptance; technical checks pass.
  [Prior combined control](assets/evidence/11/combined-locomotion/review.md)
  retains the pre-face/pre-loaded-gait evidence; do not confuse its source hash
  with the current build.
  [Combined review](assets/evidence/11/combined-heavy.md) owns fitting evidence;
  [locomotion review](assets/evidence/11/heavy-run/review.md) owns the frozen motion
  study, actual pace rationale and unresolved contact/carry defects. Old 1.53m/s
  walk captures are fitting evidence only, not gameplay-speed acceptance.
- **08 face and 11 motion authoring:** facial landmarks are integrated as a
  provisional improvement, not finished anatomy. Loaded movement now uses
  explicit world-axis torso orientation. Keep body proportions, hands, shoulders and
  pelvis review open; clothing cannot establish anatomy acceptance.
- **09 next geometry priority:** whole-heavy silhouette and believable contacts:
  shoulder/sleeve fit, hanging garment, footwear, grips and scabbard suspension.
  Footwear is composed and reviewed. The frozen garment lane is complete and
  recomposed with current footwear/carry; [combined garment evidence](assets/evidence/09/combined-garments/review.md)
  owns the current capture and independent less-wrong verdict. Do not copy its
  frozen generated mesh over the root candidate. Independent head-form and mail
  surface work continues from the preceding checkpoint in separate worktrees.
  Scabbard suspension is the next equipment authoring target; rigid cuffs and
  hidden underarm intersections remain open.
  Do not propagate unresolved heavy defects to medium phalanx.
- **07 animated budget:** the reusable LOD result experiment was rejected after
  worse matched timing; its code is not integrated. Finish combined geometry,
  camera, physical-display, storage and executable asset limits using separately
  measured changes.07 still gates08/09 acceptance, not editable source authoring.

Evidence ledger:
- [06](assets/evidence/06/merged-validation.md) owns GPU playback contracts;
  [projected detail](assets/evidence/07/projected-lod.md) owns separate main/shadow
  representations and the explicitly reviewed controller shadow.
- [Exact storage](assets/evidence/07/snapshot-banks.md) admits60,000 frozen sources
  for30k bodies at67 joints. Merged28 CPU tests/typecheck,675 palette/temporal
  checks, zero differences in all40 images, and the standing30k gate pass.
  [Old/new/old hardware](assets/evidence/07/snapshot-banks-aba.md) fails animated
  interruption cadence on both versions; banking is not established as its cause.
- [CPU attribution](assets/evidence/07/banks-interruption.md) and the
  [rejected storage experiment](assets/evidence/07/lod-storage.md) guide further
  measurement. Neither is performance acceptance;
  [07](slices/07-budget-envelope.md) owns the remaining budget requirements.
- [Anatomy review](assets/evidence/08/anatomy-review.md) owns Blender iterations,
  exact source/capture provenance, rejected studies and unresolved visible form.
  [Pronation review](assets/evidence/08/pronation/review.md) owns the unchanged-rig
  roll recipe and its unresolved wrist/elbow form. [Heavy kit review](assets/evidence/09/heavy-kit-review.md) owns the first equipped
  Blender candidate and its unresolved garment/grip defects. The production
  catalog remains unchanged; no finished armor or motion clips are accepted.
  [Current fitting evidence](assets/evidence/09/helmet-and-grip.md) owns thin
  plates, garment slope, grip failures and the current body refit.

Preserve sim/save/balance, exact interruption poses, atomic catalog replacement,
the one production skin/material/environment path, and the existing temporal
image gates. Local Blender authoring only; no external AI or downloaded soldiers.
Block fixtures validate transport and cost, never final art. Complete appearances
promote atomically only after distance-ready acceptance; see
[architecture](architecture.md). The full TODO remains below; continue all slices.

## Scope and firewalls

- First prove **heavy sword infantry and medium phalanx** in production-rendered turnarounds, individual motion and a small formation. Present that evidence before expanding.
- Finish all existing gameplay classes and their current equipment-state appearances. Keep appearance uniform within each class; movement phases may differ.
- Author the source meshes, rig, materials and clips locally in Blender. External AI model generation is excluded. Asset-service capability availability is not authorization to use generated/downloaded replacement soldiers. The earlier all-variants-library exception is not the chosen approach; revisit only with an explicit scope change.
- Preserve simulation positions, combat balance, reach, outcomes, campaign and save data. Read-only presentation observations may be exposed where necessary; animation does not become a combat authority.
- No paired combat, per-soldier appearance variation, facial animation, ragdolls, cloth simulation, foot-IK system or coordinated multi-person artillery choreography. Hands must still have credible form/grips; ordinary authored secondary motion is in scope.
- No old baked-asset compatibility or data migrations. Rebuild artifacts and update consumers together; game/save schemas remain unchanged.
- Terrain, weather, lighting redesign, UI restyling and new unit types are not this feature. Production daylight is the fixed review environment. If it independently prevents judging authored surfaces, isolate and reslice that finding rather than hiding it in material tweaks.

## Roadmap and global TODO

[Open the visual roadmap](visualizations/roadmap.html). Each link below owns its execution and acceptance record; later family slices iterate one explicitly named row at a time.

- [x] [01 — Production model workbench](slices/01-production-workbench.md)
- [x] [02 — Blender export reference fixtures](slices/02-blender-reference-fixtures.md)
- [x] [03 — Weighted mesh and skeleton cutover](slices/03-weighted-asset-contract.md)
- [x] [04 — Explicit material round trip](slices/04-explicit-materials.md)
- [x] [05 — Action observations and timeline](slices/05-action-timeline.md)
- [x] [06 — GPU interpolation and clip blending](slices/06-gpu-playback.md)
- [ ] [07 — Measure asset and animated-view budgets](slices/07-budget-envelope.md)
- [ ] [08 — Shared human anatomy](slices/08-anatomy.md)
- [ ] [09 — First-pair equipment geometry](slices/09-pair-gear.md)
- [ ] [10 — First-pair surface finish](slices/10-pair-surfaces.md)
- [ ] [11 — First-pair locomotion](slices/11-pair-locomotion.md)
- [ ] [12 — First-pair attack and brace](slices/12-pair-combat.md)
- [ ] [13 — First-pair hit and death](slices/13-pair-reactions.md)
- [ ] [14 — First-pair equipment transitions](slices/14-pair-transitions.md)
- [ ] [15 — First-pair LOD and bounds](slices/15-pair-lod.md)
- [ ] [16 — First-pair production review](slices/16-pair-checkpoint.md)
- [ ] [17 — Remaining foot equipment geometry](slices/17-foot-geometry.md)
- [ ] [18 — Remaining foot materials](slices/18-foot-surfaces.md)
- [ ] [19 — Remaining foot locomotion and melee retarget](slices/19-foot-melee-motion.md)
- [ ] [20 — Bow and thrown-weapon motion](slices/20-ranged-motion.md)
- [ ] [21 — Horse and rider geometry](slices/21-mounted-geometry.md)
- [ ] [22 — Horse, tack and rider surfaces](slices/22-mounted-surfaces.md)
- [ ] [23 — Horse gait and rider balance](slices/23-horse-gait.md)
- [ ] [24 — Mounted combat and reactions](slices/24-mounted-actions.md)
- [ ] [25 — Artillery crew geometry](slices/25-crew-geometry.md)
- [ ] [26 — Artillery crew surfaces](slices/26-crew-surfaces.md)
- [ ] [27 — Artillery crew individual motion](slices/27-crew-motion.md)
- [ ] [28 — Roster-wide distance representations](slices/28-roster-distance.md)
- [ ] [29 — Live battle and performance acceptance](slices/29-battle-integration.md)
- [ ] [30 — Remove placeholders and finish handoff](slices/30-cutover-closeout.md)

The acceptance trunk is 01→…→16. Editable08 anatomy and09 equipment candidates may be authored alongside07; acceptance still follows the trunk. Equipment fitting consumes the provisional body/rig and must be revisited when those change. After the first-pair review, foot, mounted and crew lanes are independent within their listed dependencies. They join at28 for complete distance coverage, then real battle acceptance and cleanup. Do not use lane independence to bypass the first-pair presentation.

Candidate10 surfaces and11 locomotion may proceed on fixed provisional geometry
and rig revisions while08/09 remain open. Keep matched clay evidence and refit
affected surfaces/clips after geometry changes. This authoring wavefront changes
no acceptance dependency, performance gate or production-promotion requirement.

## Acceptance contract

The workbench must use the same asset loader, shader, animation sampling, environment and LOD behavior as production. A Blender render or a separately beautified lab shader cannot pass a model.

Every visual slice inherits **write-model-sheet** for static model evidence or **write-anim** for motion, **screenshot-regression** for deterministic captures, **compare-screenshots** for candidate/target judgment, and **screenshot-critique** as the last unprimed visual gate. Read the applicable skills when executing. Use `snapCheck` for captured stills and motion frames; GIFs are review derivatives of those frames, not an alternate untested capture path. Where older animation guidance suggests ungated direct GIF captures, this plan explicitly requires the deterministic frame gate.

Freeze fixture camera, crop, pose/time, lighting, viewport and asset hash. Standard baseline environment is bundled Chromium/SwiftShader via the existing verification setup; hardware Chrome is for performance, not interchangeable image blessing. Use fixed 1280×800 review scenes and fixed-size detail tiles specified by the fixture manifest. Record exact settings, never silently compare different exposures or camera distances.

Review human-body silhouette, equipment shape, materials and motion independently. Use reference crops defined in [reference guidance](references.md); unmatched scenes are judged for less-wrong shape/material/motion, not whole-image pixel identity. Freeze snapshots only after their focused verdict passes.

At human checkpoints use **preview-shots**, allow about five minutes for feedback while doing safe ancillary work, and if silent decide on evidence, document why, close Preview and proceed. This is non-blocking review, not assumed approval. A failed gate requires another iteration, not a timeout override.

Preserve the existing 30k/33ms renderer gate. The live animated close-view envelope is measured and locked in [07](slices/07-budget-envelope.md), before accepting detailed exported art. Editable candidate anatomy may proceed while measurement remains open; no provisional count is an accepted budget. Report hardware, viewport, load, LOD distribution and timing methodology. The existing paused-simulation benchmark alone does not prove live performance.

At each substantive implementation checkpoint run **review**; use **change-report** when tests change behavior and the independent review required by **codex** before presenting substantive code as finished. Archive source references, candidates, comparisons, critiques and measurements under this spec; harness folders still own active regression baselines. Close/archive this spec only after all slices ship.

## Ownership and planning evidence

- [Architecture, schemas and cutover rules](architecture.md)
- [Research, reference framing and decisions](references.md)
- [Completed exploration map](unknowns.md) — historical rationale; its kickoff and open items are superseded by this plan.

The clean end-state has one appearance catalog, one exported asset contract, one playback controller, one production skin/material path, one environment owner and one shared screenshot primitive. Temporary placeholder **content** uses the new contract and is removed as each appearance lands; it is not a second runtime path.
