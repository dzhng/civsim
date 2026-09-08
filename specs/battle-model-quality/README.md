# Battle model quality

Direct-authored Blender models, articulated skeletons and individual animations for the existing battle roster. Aim for the natural proportions, layered equipment, material separation and warm grounded tone of the [supplied Rome II reference](assets/reference-rome2-phalanx-vs-heavy.png), at the nearest supported gameplay view—not Rome II's exact asset fidelity.

## Next Agent Prompt

**User-directed delivery cutover, 2026-09-08:** current visual quality is good
enough. Finish the overall feature before further per-piece refinement. This
explicit instruction supersedes the polish-first priorities and cosmetic
acceptance blockers recorded below and in individual slices. Retain the best
usable fitted sources and complete roster/state coverage, production admission,
distance representations and consumer consistency. Do not close unfinished
functional work by relabeling it polish. Existing cosmetic defects belong in
[follow-up work](follow-ups.md), not another first-pair iteration loop.

Current pickup: final production consumer verification and cleanup. All roster
sources, practical distance meshes and canonical action bindings are integrated;
the complete authored catalog is published in the working tree. Fresh bake and
loader checks pass for every appearance, and synthetic assets are isolated as
explicit test fixtures. Campaign and review consumers now resolve manifest roles.

Remaining functional omission: slice25 requires root-attached artillery equipment;
the current crew source has its hand tool but lacks the machine. Complete that
source and regenerate its bundle before final crew captures. In parallel, refresh
the other production cards/sheets and consolidate the choices ledger. Then repeat
the production workbench/action, live battle and campaign checks, run final review,
commit/push and archive. Do not reopen model-polish or optimization loops.

The user explicitly accepted a documented performance follow-up instead of
holding completion for the original frame-time gate. That work now belongs to
[sim-perf](../sim-perf/model-rendering-follow-up.md). Timing thresholds remain
unchanged and unmet; no performance pass is claimed here.

The original six infrastructure slices are complete. Later slices have usable
partial deliveries, not final whole-roster acceptance. Do not reopen rejected
shoulder or timing experiments. Preserve the fitted source meshes and action
keys except where a missing role genuinely requires new authoring.

Carry invariants: at-ease standing and ordinary walk/run put the shield beside
the left flank; battle-ready/protected travel carries it forward. Canonical
engine observations select posture, life state and equipment; animations never
decide combat or simulation timing. Do not substitute inspection actions for
missing gameplay roles. Keep uniform class appearances; paired actions and
fine-grained variation remain deferred.

Evidence owners:

- [Checkpoint](checkpoint.md), [anatomy](slices/08-anatomy.md),
  [equipment](slices/09-pair-gear.md), [surfaces](slices/10-pair-surfaces.md):
  fitted first-pair sources and historical studies.
- [Locomotion](slices/11-pair-locomotion.md): live completed-interval sampling
  is integrated, with 382 CPU tests and all 131 held/body-region snapshots
  exact. Natural foot-contact polish is a follow-up, not another timing project.
- [Medium thrust](assets/evidence/12/medium-pike-thrust/integration.md) and
  [reactions](slices/13-pair-reactions.md): retained usable combat actions.
- [Mounted delivery](assets/evidence/21/mounted-family-delivery/review.md):
  complete source/action delivery and exact pose repeats; runtime performance
  remains a separate acceptance requirement.
- [Far fixture repair](assets/evidence/15/far-fixture-repair/review.md):
  actual projected admission and independent mesh shadows, not new art approval.
  Root merged repeat passed all 24 images/111 checks exactly.
- [Budget](slices/07-budget-envelope.md): actual animated detailed-asset budget
  remains open; paused or synthetic workloads cannot close it.
- [Choices](choices.md) and [cosmetic follow-ups](follow-ups.md): retained
  decisions and refinement backlog.

Preserve simulation/save/balance, exact interruption poses, atomic catalog
replacement, the production skin/material/environment path and zero-tolerance
image gates. Use isolated background Blender processes and separate files;
never alter another task's interactive Blender/MCP scene. Serialize GPU captures.
Merge origin/main at clean checkpoints; frozen comparisons remain fixed until
integration. Current branch: `codex/battle-model-quality`, worktree
`/Users/david/dev/game-battle-model-quality`.

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
