# Final test-behavior reconciliation

Scope: the feature from `2bef8193` through final source and capture closeout.
The initial independent reconciliation covers `dfd6deec`; subsequent rows cover
the final readiness, replay, workbench and live capture changes. Historical
results come from retained reports, not invented reruns. Evidence paths below
are relative to this feature directory.

## Coverage index

The baseline diff contains 19 modified/deleted pre-existing test/scene/checker
files and 102 additions under the tested path set (`**/*.test.*`, `web/tests/**`,
`web/scenes/**`, `web/scene.mjs`, `web/snapshot.mjs`; excluding evidence and shots).
The additions include scene helpers, not 102 independent tests. The table maps
every one of those 19 pre-existing files. The final diff adds four more existing
owners—arrows, seating, campaign-production and worlds—covered by the supplemental
rows below, for 23 modified/deleted pre-feature owners in the final reconciliation.
Prose is not counted as a test rerun.

| Changed file / family | Existing ledger owner | Reconciliation |
| --- | --- | --- |
| `packages/soldier-assets/bake/gltf.test.mjs` | `assets/evidence/06/local-format-cutover.md`; `03/prototype-cutover/review.md` | Fixed-frame matrix comparison becomes authored-time local-sample comparison; rig names/parents/binds and 1e-6 float tolerance retained. Remaining importer assertions are new coverage. |
| Deleted `bake/vat.test.mjs` | `assets/evidence/06/local-format-cutover.md` | Replaced by `local-hierarchy.test.mjs`: bind, 45°/90° transforms, byte repeat and child-before-parent rejection retained. Old width 3 × height 8 / three matrix frames becomes authored times `[0,1]`, 48 local sample floats. |
| `web/scene.mjs` | `assets/evidence/final/scene-cleanup.md` | Throwing-scene context cleanup red/green recorded; following scene sees zero live contexts instead of two. New `scene.test.mjs` owns the regression. |
| `battle-anim-gait.mjs` | `assets/evidence/05/gait-harness.md`; `11/measured-distance/review.md`; `30/gait-cadence/review.md` | Scheduling, framing, duration→distance cadence and preceding-stride correction covered. Latest merged outcome supplement below. |
| `battle-perf-30k.mjs` | `assets/evidence/06/timestamp-query-lifetime.md` | Non-audio-policy warnings now fail; exact autoplay warning remains separately counted. Existing timing/count thresholds unchanged. |
| `battle-renderer-default.mjs` | `assets/evidence/05/battle-adapter.md` | Three added frozen-cache/reload assertions covered. Description-only raw→photoreal wording is not another moved test. |
| Deleted `system/asset-workbench.mjs` | `assets/evidence/03/candidate-workbench/review.md` | Skeleton-box/kit-UI preview retired; source failure, true geometry and last-good reload checks transferred to actual owners. |
| `system/full-game-rendering-performance.mjs` | `assets/evidence/04/campaign-perf-workload.md` | `lineSegments > 1000` replaced by roadTriangles >1000 plus lineSegments >0; preserved generator evidence establishes 28 sea-line segments. |
| Deleted `system/per-class-vat.mjs` | `assets/evidence/03/integration-review.md`; `06/raw-palette-cutover.md` | Declared shared/independent local animation replaces optional matrix fallback; duration 1/2/1 and nonblank >150000 retained in renamed scene. |
| `system/photoreal-substrate.mjs` | `assets/evidence/03/prototype-cutover/review.md` | Production owner, complete IDs, 30400 L0 count and luminance variance >4 added; >40% bright coverage and 33ms limits retained. Mid snapshot re-pin covered there. |
| `system/renderer-capabilities.mjs` | `assets/evidence/06/raw-palette-cutover.md` | VAT→storage terminology/field rename; oversize reject and real-size acceptance unchanged. |
| `system/renderer-lab-routes.mjs` | `assets/evidence/03/candidate-workbench/review.md` | Old kit JSON paste/file/drop entries removed with obsolete UI. |
| `system/soldier-materials.mjs` | `assets/evidence/04/raw/review.md`; `04/raw-textures/review.md`; `04/raw-normals/acceptance.md`; `06/raw-palette-cutover.md` | RGB classifier→explicit surface/mask, scalar/image/normal controls and local-format/navigation migration covered. New normal probes are not relabeled old expectations. |
| `web/snapshot.mjs` | `assets/evidence/01/candidate-filter/review.md` | Comma filtering ignores empty fields; selected comparisons still enforce unchanged exact tolerance. |
| `web/snapshot.test.mjs` | Same candidate-filter leaf | Two added filter/mutation regressions; previous UPDATE_SHOTS byte-preservation assertions unchanged. |
| `web/tests/animationState.test.ts` | `assets/evidence/05/battle-adapter.md`; `07/observation-only.md` | Old global 2Hz/2.6Hz, seeded phase and fabricated fighting beat tests explicitly retired; payload/admission owners replace them. Hysteresis assertions remain .39/.41/.16/.14. |
| `web/tests/gpuBuffers.test.ts` | `assets/evidence/04/raw/review.md` | 128→256→512 growth/three writes retained; exact-once destruction/post-disposal rejection added. Uint32 supplied-view assertion is new coverage. |
| `web/tests/photorealCrowdLod.test.ts` | `assets/evidence/07/projected-lod.md` | Projection, unchanged thresholds, independent shadow audiences and caster rules covered. Caller-owned result-buffer rewrite needs the concrete supplement below. |
| `web/tests/soldierMaterials.test.ts` | `assets/evidence/04/explicit-placeholder-surfaces.md` | Every old identity/RGB/faction/PBR row mapped, including retained 24/24/0 band counts and scalar ordering. |

The runtime/replay tests added during this feature have their intervening edits
banked chiefly in `05/battle-adapter.md`, `07/observation-only.md`,
`11/measured-distance/review.md`, `11/delayed-timeline/review.md`,
`11/live-consumer/review.md`, `14/compatible-body-continuity.md`,
`final/catalog-admission.md`, and `30/test-changes.md`. The last leaf explicitly
records synthetic fixture relocation as unchanged assertions—not real tests
rebuilt on fakes. The latest supplemental rows follow rather than duplicating
those historical ledgers.

## Missing or overly broad closeout rows

Use **moved** below to mean a verified changed expectation/result, not a claim
that `2bef8193` was rerun green or that the regression's introducing commit was
bisected. No new **carried-in** or **your-regression** origin is inferred.

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `photoreal crowd LOD reuses a caller-owned level buffer` → `projected LOD reuses both audience buffers and clears only the active visibility prefix`, `web/tests/photorealCrowdLod.test.ts` | Four formation instances reuse supplied Uint8Array length 8 for `levels`; tier-count sum is 4. | Reuses levels, shadowLevels, screenSizes, shadowScreenSizes and visibility; four main levels `[0,1,2,3]`; capacity tail stays 255; shrinking to two matches fresh main/shadow plans, visibility `[1,1]`, zero shadow counts without shadow views. | One level array is no longer the complete projection result; preserve caller ownership and concrete output through the two-audience contract. **moved** |
| `ready`, `web/scenes/worlds.mjs` (shared readiness precondition) | Default readiness deadline 20000ms. | Default 60000ms; same requested flag must equal true. | Recorded cold authored startup has no ready flag at 20395ms and ready=true at 23676ms; functional coverage must reach the admitted catalog. This is not startup-performance acceptance. **moved** |
| `battleRendererReady`, `web/scenes/worlds.mjs` | Default 20000ms for ready GPU renderer with submitted soldier count matching the game. | 60000ms; identical renderer/readiness/count predicates. | Same bounded startup allowance; no count, pixel or frame-time gate relaxed. **moved** |
| `campaign(ctx,"new")`, `web/scenes/worlds.mjs` | New-campaign menu selector default 20000ms. | 60000ms unless overridden; same selector and click. | Shared functional startup allowance, not evidence that this menu specifically required >20s. **moved** |
| `battle-arrows.run`, `web/scenes/battle/battle-arrows.mjs` | `__ready` must become true within 20000ms. | Same flag within 60000ms; volley assertions unchanged. | Archived archer startup outlasts the old deadline; preserve functional projectile coverage. **moved** |
| `campaign-production.run`, `web/scenes/campaign/campaign-production.mjs` | Explicit campaign deadline 18000ms. | Explicit 60000ms; campaign assertions unchanged. | Use the authored-catalog functional allowance without claiming an independently measured 18s campaign regression. **moved** |
| `battle-anim-gait.run`, `web/scenes/battle/battle-anim-gait.mjs` | `__ready` deadline 20000ms before sampling. | 60000ms; 91 consecutive samples/90 ticks still required. | Readiness is separate from the deterministic sampling window and unchanged cadence tolerance. **moved** |
| `each observed release enters its authored release phase`, `web/scenes/models/battle-model-action-replay.mjs` | Ticks 60 and 90 must name `bow_release` and have equal phases. | Both must name manifest release binding (current archer `bow-release`) and have equal phases. | Authored action role owns spelling; no release timing assertion removed. Broadly mentioned in 30/test-changes, not previously an exact row. **moved** |
| `health decrease selects a fresh hit`, same replay scene | Tick105 clip `hit_a`, phase0. | Manifest hit clip (current `hit`), phase0. | Actual authored binding replaces synthetic spelling; fresh-entry phase retained. **moved** |
| `terminal death holds its final phase`, same replay scene | Tick240 clip `death_a`, phase1. | Manifest death clip (current `death`), phase1. | Terminal semantics unchanged; source role owns clip identity. **moved** |
| Reset assertion, same replay scene | Replay tick0 and sampled clip `idle`. | Replay tick0 and manifest ready clip (current archer `ready`). | The reset observation is ready, not the distinct at-ease/inspection action. **moved** |
| `switching back to manual inspection clears replay tick`, same replay scene | Select appearance3 with hardcoded `idle`; expect replay UI tick `0`. | Select appearance3's atEase binding (current `at-ease`); same tick assertion. | Exercise a real manual pose after the catalog cutover instead of an absent clip. **moved** |
| `compatible equipment handoff starts from a frozen source under the new appearance`, same replay scene | No browser assertion for source kind/weight; existing identity assertion required appearance18. | Adds source.kind=`frozen`, weight=0 while retaining immediate appearance18; new exact equipment-handoff image. | Pins the browser's frozen-source handoff, not independently its pose values; existing timeline tests own numerical continuity. The initially broader assertion name was narrowed without changing assertions. **moved** |
| `mounted controller submits an overlay and reports the base destination separately`, same replay scene | Rider overlay destination must name `bow_release`; displayed sample matches base destination. | Overlay uses manifest mounted release (current `release`); base-display equality retained. | Authored role identity, not synthetic clip spelling. **moved** |
| Manual-only reload rejection setup, same replay scene | Route intercepted `**/appearances/horse-archers/appearance.json*`. | Intercepts `**/appearances/horse-archers/**/appearance.json*`, including immutable hash directory; sets presentation=null, retains original disabled-replay/enabled-manual assertion. | Ensure the negative control actually reaches the published content-addressed bundle. **moved** |

Startup provenance is `assets/evidence/30/startup-timing.txt` plus the source
diff; it does not establish each consumer's cold-load duration. The arbitrary
60s ceiling is a bounded functional wait, not a performance measurement.

## Gait final result supplement (existing ledger, now merged outcome)

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `NO CLASS FLICKER`, `web/scenes/battle/battle-anim-gait.mjs` | Required no transitions and only walk; initial live report measured 12 transitions, 58 nonMarch, 0 appearance changes over 8×91 samples. | Requires calibrated declared gaits and stable appearance; merged repeat measures 12 transitions, 0 nonMarch, 0 appearance changes over 8×91 samples. | Engine-qualified motion legitimately crosses walk/run selection; commanded walk is not animation authority. **moved** |
| `DISTANCE`, same scene | Divides every path increment by walk stride; initial live max cycle error 0.023680198419395858 against unchanged 1e-6 bound. | Uses preceding declared gait stride; merged max 2.761679773755077e-15, no negative steps, same 1e-6 bound. | Completed interval belongs to preceding gait, including a destination switch. Independent 2m/4m negative controls already banked in gait-cadence/review.md. **moved** |

Sources: `assets/evidence/30/live-consumers-initial.json` and
`assets/evidence/30/gait-cadence/merged-live-repeat.json`. The separate diagnostic
trace has 14 transitions and is not substituted for these 12-transition runs.

## Posed geometric normal: every flipped parity row

All rows name `validated palette renders as CPU-preposed geometry` in
`web/scenes/models/_temporal-replay.mjs`, invoked by `battle-model-action-replay`.
Each value is differing RGBA pixels / maximum channel error. Previous values are
from archived `30/action-replay-initial.json`; new values from
`30/action-replay-fixed.json`. The intervening raw-direction-only report still
failed all 18 checks (same maxima), so it is not falsely credited as the fix.
The independent render-consumption gate remains maximum channel error ≤1;
ordinary baseline repeats remain exact.

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| Parity 4/0 | 825 pixels / 4 | 0 / 0 | Posed normal now reaches native geometric roughness as well as shading; controlled ON/OFF causal proof in final/posed-geometric-normal.md. **moved** |
| Parity 4/6.25 | 1370 / 2 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 4/10 | 1637 / 2 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 4/14.5 | 970 / 2 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 4/44.5 | 1008 / 27 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 4/47.75 | 1553 / 3 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 4/54 | 954 / 7 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 4/56.25 | 787 / 2 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 4/106 | 3005 / 17 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 7/0 | 2723 / 8 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 7/6.25 | 4442 / 8 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 7/10 | 4829 / 7 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 7/14.5 | 4770 / 21 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 7/31.5 | 3457 / 26 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 7/34.75 | 4218 / 6 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 7/41 | 4340 / 11 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 7/43.25 | 3849 / 7 | 0 / 0 | Same native posed-normal input correction. **moved** |
| Parity 7/111 | 11352 / 15 | 0 / 0 | Same native posed-normal input correction. **moved** |

Nine diagnostic appearance41 comparisons stay 0/0 and are not moved rows.
Independent CPU image telemetry is a different field and can retain edge
differences; the table does not claim those images all became exact. Independent
GPU matrix and same-input repeat gates remain unchanged.

## Snapshot and pure-addition exclusions

- `misc/photoreal-crowd-mid.png` is covered by `03/prototype-cutover/review.md`;
  late arrows/seating changes are recorded below. Portrait montage and all twenty
  in-game sheets move to authored production poser and complete-kit framing;
  `30/production-review-drivers/review.md` plus `artifact-review.md` own that
  reviewed replacement. They preserve exact repeat thresholds, not old pixels.
- Existing animation GIF replacements and three deleted unbound shoot GIFs are
  review derivatives, not baseline assertions; `motion-review.md` records them.
  Newly added chronological PNG sheets own the exact film regression.
- New snapshot files absent at `2bef8193` have no invented pre-feature pixel
  value. Their within-feature re-pins remain in their pass-specific image
  ledgers. Latest replay semantic-name changes are in
  `final/readback-direction-oracle.md`; the same 13 semantic samples ×3 remain.
- Five existing replay-frame replacements are itemized below. The new equipment
  capture and semantic temporal replacements have direct/fresh visual review in
  `30/replay-review/review.md`; numerical parity is not their art-quality verdict.
- Pure added CPU/source/scene regressions are coverage, not repinned prior tests;
  replacements for deleted tests are explicitly mapped above. `make-test-glb`
  fixture-name refactor retains exact bytes; test registration/config changes
  select current owners rather than change assertions. Already-synthetic fixture
  URL moves are not **rebuilt-on-fakes**.

## Simulation and inputs

`crates/sim/tests/presentation_travel.rs` is the only net changed sim integration
test file and is wholly new; no old matchup/golden expected outcome changes.
Added inline observation tests in movement/facing/routing and game-wasm pin
read-only presentation exports. No golden file is changed. Class/stat/pricing
tables have no diff; the missile constant is still 0.75, only made public. No
unit-stat ledger rows are required, and this audit did not rerun simulation.

## Final fixture and image changes

Image deltas below compare `16984d54`'s committed baseline to the final baseline.
The [final serial repeat](final-consumers/repeat.json) reports zero differing
pixels for every listed current image. Arrows/replay/seating include the authored
catalog cutover; workbench's seven changed images compare the established
authored subjects across the final native posed-normal correction.

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `volley orders start at simulation tick zero`, `battle-arrows.mjs` | No startup pause before readiness; the newly added guard measured tick 354 and failed before the fix. | One-shot initial API freeze; start tick 0, volley freeze tick 1280 in update and both ordinary repeats. | Heavier catalog loading exposed wall-clock advancement before fixture orders. Same seed/order logic/simulation; actual red/green in final-consumers. **moved** |
| `arrows-close`, `battle-arrows.mjs` | Threshold 0.12, maximum differing ratio 0.02; old baseline. | Threshold/ratio both 0; 1,023,199 baseline pixels change; repeat 0. | Authored roster and deterministic tick-zero fixture replace startup-dependent content; not an isolated shader comparison. **moved** |
| `arrows-far`, `battle-arrows.mjs` | Threshold 0.12, maximum differing ratio 0.02; old baseline. | Threshold/ratio both 0; 1,023,197 baseline pixels change; repeat 0. | Same fixture correction and roster cutover; far readability limits remain explicit. **moved** |
| `seating/shore-and-crags`, `battle-seating.mjs` | Threshold 0.12, maximum differing ratio 0.02; old roster baseline. | Threshold/ratio both 0; 12,225 pixels/max channel 102 change; repeat 0. | Authored roster refresh under exact capture; 15,560 height samples and slope assertions unchanged. **moved** |
| `seating/highland-vale`, `battle-seating.mjs` | Threshold 0.12, maximum differing ratio 0.02; old roster baseline. | Threshold/ratio both 0; 12,160 pixels/max channel 102 change; repeat 0. | Same roster refresh and unchanged seating/count/slope contract. **moved** |
| `seating/wooded-pass`, `battle-seating.mjs` | Threshold 0.12, maximum differing ratio 0.02; old roster baseline. | Threshold/ratio both 0; 12,241 pixels/max channel 102 change; repeat 0. | Same roster refresh and unchanged seating/count/slope contract. **moved** |
| Reload-button completion, `battle-model-workbench.mjs` | reloads=2 within default 30,000 ms; diagnostic still loading at 30,008 ms. | Same predicate within 60,000 ms; measured completion 43,192 ms, error=null. Final serial run passes. | Full catalog preparation outlasted the functional wait. No retry, pixel tolerance or frame-time change. **moved** |
| Workbench `heavy-front` | Exact pre-correction authored baseline. | 3,566 pixels/max channel 17 change; exact repeat 0. | Posed normal reaches native geometric roughness. **moved** |
| Workbench `phalanx-side` | Exact pre-correction authored baseline. | 1,450/14 change; exact repeat 0. | Same shading correction; clipped pole extent remains outside this portrait's claim. **moved** |
| Workbench `formation` | Exact pre-correction authored baseline. | 10,627/55 change; exact repeat 0. | Same shading correction, unchanged formation/subject/camera. **moved** |
| Workbench `submission-parity` | Exact pre-correction authored baseline. | 799/60 change; both repeated submissions exact 0. | Same shading correction; adapter/explicit-pose equality retained. **moved** |
| Workbench `manual-alive` | Exact pre-correction standing-alive baseline. | 3,564/17 change; exact repeat 0. | Same shading correction; manual life semantics unchanged. **moved** |
| Workbench `manual-dead` | Exact pre-correction standing-dead baseline. | 3,451/16 change; exact repeat 0. | Same shading correction; life input changes treatment, not selected clip. **moved** |
| Workbench `controls` | Exact pre-correction authored/UI baseline. | 3,595/26 change; exact repeat 0. | Same shading correction after successful local reload. **moved** |
| Replay `controller` | Synthetic mounted figure and its bound clip phases. | Authored mounted figure/roles; 173,042 pixels/max channel 199 change; repeat 0. | Production catalog and authored timing replace diagnostic content. **moved** |
| Replay `disabled-15.1` | Synthetic disabled figure. | Authored figure; 95,306/158 change; repeat 0. | Production catalog cutover; disabled timing assertion retained. **moved** |
| Replay `disabled-15.9` | Synthetic disabled figure. | Authored figure; 95,306/158 change; repeat 0. | Same cutover; the later disabled sample still preserves pose. **moved** |
| Replay `protected-safe` | Synthetic safe-travel figure. | Authored figure; 90,796/149 change; repeat 0. | Production catalog and role-owned travel depiction. **moved** |
| Replay `protected-threatened` | Synthetic guarded figure. | Authored figure; 90,352/150 change; repeat 0. | Production catalog and role-owned protected travel; original semantic distinction retained. **moved** |

The temporal-image replacement inventory is now recorded in
[replay review](replay-review/review.md) and its per-frame delta JSON. It preserves
the distinction between changed asset/semantic samples and an isolated shader
comparison. The equipment UI capture and full ordinary repeat now pass. The
workbench far baseline remains byte-identical and is not a moved image. Renaming
the pause/freeze test in `battleCrowd.test.ts` corrects its description only:
existing assertions still distinguish delayed pause from endpoint freeze.

This is a final base-to-head plus named late-change reconciliation, not a claim
to have rerun every historical experiment. Older ledgers sometimes use family
rows or omit formal provenance tags; their linked evidence is retained rather
than upgraded to invented bisection or baseline measurements. The concrete gaps
above are now reconciled against final capture evidence. Accepted art limits and
the explicit performance follow-up are not relabeled as passing quality/timing gates.
