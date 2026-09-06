# Battle model quality

Direct-authored Blender models, articulated skeletons and individual animations for the existing battle roster. Aim for the natural proportions, layered equipment, material separation and warm grounded tone of the [supplied Rome II reference](assets/reference-rome2-phalanx-vs-heavy.png), at the nearest supported gameplay view—not Rome II's exact asset fidelity.

## Next Agent Prompt

Last updated **2026-09-06**. Status: **slices01–05 complete;06 in progress**.

Current worktree: `/Users/david/dev/game-battle-model-quality`, branch
`codex/battle-model-quality`, at4d75b7cd. The complete source/assets/consumer cutover
was installed together by fast-forward after staging validation; no old reader
remains. Source bake checks, typecheck and274 web tests pass. Four
[reviewed baseline changes](assets/evidence/06/merged-comparison/review.md) have
strict repeats. The warning-enforcing standing hardware gate passes at30,560
soldiers with unchanged33ms limits. See [merged validation](assets/evidence/06/merged-validation.md)
for actual reports, setup failures and successful reruns.

Next:06c. The [post-install browser repeat](assets/evidence/06/installed-browser.json)
passes on `http://127.0.0.1:5174`, along with typecheck and274 web tests.
The independent corpse-strength consumer pass is being prepared in
`/Users/david/dev/game-corpse-strength-consumers`; keep temporal fixture work
separate until its shared consumer rule is verified. A bounded replay foundation
is prepared independently in `/Users/david/dev/game-temporal-replay-fixture`;
the root owns production temporal screenshot integration after both seams land.
The [Three cutover](assets/evidence/06/three-palette-cutover.md),
[raw cutover](assets/evidence/06/raw-palette-cutover.md) and
[source transport](assets/evidence/06/local-format-cutover.md) separate actual
consumer proofs from source accuracy. The corrected kernel passes64 numerical
poses, including near-unit rotations; both GPU substrates agree byte-for-byte.
[Bounds](assets/evidence/06/gpu-rounding-bounds.md) cover that final arithmetic.
No performance or temporal acceptance follows from those numerical checks.

Then finish [06c](slices/06-gpu-playback.md): fixed-world foreground articulation,
frozen-GPU negative control, interrupted actions, mounted exit and continuous
observed death. The shared corpse-strength helper is prepared separately in
8272dde1, **not integrated**; wire its one rule through Three/raw shading, culling
and far contact AO before claiming death continuity. Existing battle gait pixels
measure scene motion, not isolated articulation. Keep06→07 before detailed
anatomy08, as the user explicitly reaffirmed. No detailed soldier art or user-only
blocker exists.

Preserve [05's merged controller/WASM gates](assets/evidence/05/merged-validation.md)
and [04's material contracts](assets/evidence/04/consumer-closure/review.md).
Keep fragment-stage map reads, per-vertex unit directions and finite geometric
fallbacks. `hit_ttl` is contact/facing memory, not injury; use actual health.
Catalog reload retains the last good scene on failure, while a partial live
upload fails closed until a whole upload succeeds. Growth stays synchronous and
device-checked. Local Blender authoring remains the chosen path; no external AI.

The global TODO is the slice list below; [choices](choices.md) owns decisions.
Update this pickup and the owning slice evidence after each pass. The previous
05 Preview checkpoint is closed; do not reopen its old shots. Dependency symlinks
in auxiliary worktrees are verification-only and must never be committed.

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
- [ ] [06 — GPU interpolation and clip blending](slices/06-gpu-playback.md)
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

The trunk is 01→…→16. After the first-pair review, foot, mounted and crew lanes are independent within their listed dependencies. They join at 28 for complete distance coverage, then real battle acceptance and cleanup. Do not use lane independence to bypass the first-pair presentation.

## Acceptance contract

The workbench must use the same asset loader, shader, animation sampling, environment and LOD behavior as production. A Blender render or a separately beautified lab shader cannot pass a model.

Every visual slice inherits **write-model-sheet** for static model evidence or **write-anim** for motion, **screenshot-regression** for deterministic captures, **compare-screenshots** for candidate/target judgment, and **screenshot-critique** as the last unprimed visual gate. Read the applicable skills when executing. Use `snapCheck` for captured stills and motion frames; GIFs are review derivatives of those frames, not an alternate untested capture path. Where older animation guidance suggests ungated direct GIF captures, this plan explicitly requires the deterministic frame gate.

Freeze fixture camera, crop, pose/time, lighting, viewport and asset hash. Standard baseline environment is bundled Chromium/SwiftShader via the existing verification setup; hardware Chrome is for performance, not interchangeable image blessing. Use fixed 1280×800 review scenes and fixed-size detail tiles specified by the fixture manifest. Record exact settings, never silently compare different exposures or camera distances.

Review human-body silhouette, equipment shape, materials and motion independently. Use reference crops defined in [reference guidance](references.md); unmatched scenes are judged for less-wrong shape/material/motion, not whole-image pixel identity. Freeze snapshots only after their focused verdict passes.

At human checkpoints use **preview-shots**, allow about five minutes for feedback while doing safe ancillary work, and if silent decide on evidence, document why, close Preview and proceed. This is non-blocking review, not assumed approval. A failed gate requires another iteration, not a timeout override.

Preserve the existing 30k/33ms renderer gate. The live animated close-view envelope is measured and locked in [07](slices/07-budget-envelope.md), before detailed art. Report hardware, viewport, load, LOD distribution and timing methodology. The existing paused-simulation benchmark alone does not prove live performance.

At each substantive implementation checkpoint run **review**; use **change-report** when tests change behavior and the independent review required by **codex** before presenting substantive code as finished. Archive source references, candidates, comparisons, critiques and measurements under this spec; harness folders still own active regression baselines. Close/archive this spec only after all slices ship.

## Ownership and planning evidence

- [Architecture, schemas and cutover rules](architecture.md)
- [Research, reference framing and decisions](references.md)
- [Completed exploration map](unknowns.md) — historical rationale; its kickoff and open items are superseded by this plan.

The clean end-state has one appearance catalog, one exported asset contract, one playback controller, one production skin/material path, one environment owner and one shared screenshot primitive. Temporary placeholder **content** uses the new contract and is removed as each appearance lands; it is not a second runtime path.
