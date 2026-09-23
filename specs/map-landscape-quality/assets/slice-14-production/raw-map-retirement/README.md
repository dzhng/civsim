# Raw whole-map owner retirement

The normal campaign and regional preview already use the shared physical world.
The whole-map raw lab was the final consumer of the raster map and territory
passes, their texture/coast helpers, and the coarse campaign surface adapter.
Removing this lab retires those displaced surface/material owners. The unused
coarse light raster and its independent baked sun are also removed; no runtime
consumer read them. Physical lighting remains owned by the active world. Raw model/UI
labs retain their live road, line, marker, label and cloud passes. In particular,
`campaign-models` still has a `cloud-fog` fixture; that owner is not dead.

## Change ledger

| Test | Previous behavior | New behavior / evidence owner | Why |
| --- | --- | --- | --- |
| `renderer-lab-routes`: whole-map route stats | Required raw map/territory/cloud identities and counts | Route case removed. `campaign-production` asserts the physical world, GPU labels and shared depth contract | Obsolete implementation identities must not preserve a duplicate world |
| Whole-map visible terrain/water/roads/borders | Combined warm-ground/water/cloud/red/dark pixel floors and border count | Existing `campaign-map-alignment` checks projected land/water across cameras; `campaign-lod` checks actual road continuity; `landscape-geography` checks real geometry, visible contribution, re-seating and exact restore | Attribute each visible behavior to its current owner |
| Whole-map ownership presence | Raw territory texture pixel count and red pixel floor | Existing `campaign-landscape-overlays` checks visible ownership changes and exact natural-mode restoration | Test live ownership behavior, not old texture allocation |
| Whole-map label proof | Raw atlas identity, vertices, visible count, no obsolete label DOM | Existing `campaign-production` and `campaign-visual` exercise the physical atlas; density scene verifies actual names and stable policy across DPR | Atlas implementation changed; readable labels remain required |
| Phase-brand source checks | Required raw map and territory world-pass signatures | Deleted only those two checks; retained raw lines, roads, markers, labels, clouds and depth-footgun checks | Deleted owners have no signature to validate |
| Whole-map cloud assertion | One quad and pale-pixel floor | Raw `campaign-models` cloud-fog coverage remains. Current geographic-atmosphere acceptance is still open | Pale pixels do not prove physical atmosphere; no claim of equivalent production acceptance |
| `water-sea`: route/clock | Raw whole-map lab with `t=0/3` | Real game `campaign(ctx, "new")`, same Nile/whole camera inputs, existing renderer fixed clock, residency and completed presentation | Exercise water the player actually sees |
| `water-sea`: near motion | RGB-blue classifier, >2,000 moved sea pixels and >90% of motion in sea | Same numeric floors within the classified domain; actual wet-source mask through the camera, independent of palette. Excluded coastal motion is reported separately | Turquoise/light shallow water must not evade a blue-channel classifier |
| `water-sea`: far calmness | Fewer than400 pixels change by >6 summed RGB levels | Preserved unchanged | The current material may fail; measure before deciding any implementation change |
| `water-sea`: dry ground / return | Comments claimed untouched land; no exact return check | Land-change telemetry and exact full-canvas return after clock0→3→0; existing controlled `landscape-water` retains exact dry-ground invariance | Keep material isolation separate from full-world animation; detect uncontrolled presentation state |
| `water-sea`: appearance | Muted chart sea fraction >.15 and mean blue <165 | Old chart-specific ceiling removed explicitly. Current `landscape-water` owns shallow/deep luminance response (>5), source preservation and8-second water phase return; current reference calls for physical turquoise/deep response | The old anti-ocean palette contradicts spec09; this is a changed appearance contract, not a relaxed motion tolerance |
| `water-sea`: snapshots | Old raw-chart near/far images at default snapshot tolerance | Same named images now capture production canvas at exact0/0 tolerance; existing baselines deliberately untouched | Fresh visual review and exact repeat required before adoption |

The water mask excludes off-map samples and a two-cell coastal margin. Each
four-pixel cell is classified using the rendered camera query and canonical
source wet mask; neighboring classes must agree before its pixels count as dry
land or water. Both masks must cover more than50,000 pixels. The near-motion
ratio uses only classified motion; whole-canvas and excluded-shore counts are
reported separately.

The injected clock is the existing shared visual clock: carts, foliage and crowd
clips may also move. Exact dry-land stability therefore belongs to the controlled
`landscape-water` material scene, not this composed production view. The film
reports land changes while applying the >90% offshore-motion check to the
classified domain. The material candidate addresses distant water motion; it
does not change camera, palette or coverage.

## Verification and pending acceptance

Web and renderer-lab typechecks, both changed scene syntax checks, scene registry
and twelve focused water tests pass. Independent static review found no concrete
correctness issue in the retirement.

The corrected wet-mask control is recorded in `water-mask-control-report.json`.
Near water passes: 18,565 moving wet pixels, five moving dry pixels in the
classified domain. Both views return exactly after clock 0→3→0, and repeat the
control snapshots exactly. Distant water fails the unchanged whole-canvas
calmness gate: 33,754 moving pixels against a limit of 400.

The mask uses actual water coverage rather than territory land semantics, which
include rivers. Near isolation compares numerator and denominator over the same
conservative domain; unclassified coast motion remains visible in telemetry.
This corrects the oracle independently of the pending material fix.

The candidate attenuates unresolved motion by its screen footprint while keeping
its eight-second period and initial phase. The browser motion checks pass: far
motion falls from 33,754 to 20 pixels, near water retains 18,518 moving pixels,
and both views return exactly. The far initial-phase snapshot stays identical;
near animation differs in 3,841 pixels (0.3751%). The recorded candidate run has
one expected snapshot mismatch, not a fully green result. Reviewed candidate snapshots have been adopted. Retained raw lab/model gates and final production
journey/lifecycle acceptance are still required.

## Composed fixture baseline reconciliation

The five composition pins predate accepted rock imagery and screen-space UI
ownership. Current frames preserve geometry, camera, labels, grounding and
occlusion. An independent fresh review inspected all five pairs and found no
concrete regression. Darker attached shadows and ground-tone changes are also
present; their exact historical commit was not isolated and is not attributed
to rock imagery. The fogged right slope is very dark, retained as a visual note.
Reviewed candidates replace the old pins, archived in [composition evidence](../../slice-02/composition-current/README.md);
all five candidates now repeat with zero changed pixels in the current journey
run. No check threshold or fixture changed.

The complete web test suite passes: 187 files, 1,096 tests. These tests do not
substitute for the remaining current browser journeys or hardware acceptance.

The retained grass/scrub fixture pin predates the accepted shared crown meshes.
The unchanged six-tree fixture now consumes those meshes through the raw scenery
registry. Independent review confirms fuller crowns without new floating or
clipping. The old image is archived as `grass-scrub-before.png`; its candidate is
adopted for the repeat gate, without claiming overall vegetation acceptance.

The first retained suite completes with eleven failures: six stale image pins
reviewed above, three source audits referencing displaced implementation shapes,
and two raw model pixel probes. There are no page errors. These failures remain
open; the suite is not represented as passing. A bounded source/probe audit is
underway while the current production journey matrix runs.

## Source and depth verification repairs

The retained audit now recognizes the TypeGPU battle seam. Its shared-role helper
also rejects roles in the wrong phase, with positive/wrong-phase/missing-phase
controls, and image mip shaders use the existing structured compilation owner.
The thirteen source audits, six focused image/skinned tests and typechecks pass.

Two fixed costume-color probes are replaced by isolated fixture comparisons:
combined/front/rear/empty layers prove hostile-order depth, and body-on/body-off
with unchanged shadows proves a visible garrison body. The existing minimum
pixel signal remains. These fixture-only controls await their browser run.

The current journey run passes conquest, 16,000-soldier handoff and return,
reinforcement arrival (2,730→5,130 soldiers) and save/load. All16,000 presented
soldiers match installed terrain height. Its sole failure is the lifecycle
fixture's22-second battle-start deadline under SwiftShader; native lifecycle
verification is pending rather than treating that timeout as a disposal failure.

Native headful lifecycle completes all ten cycles with exit0: each campaign
terrain/worker is disposed, every requested battle buffer/texture returns to
zero, retired campaign worlds are collected, and live resource counts stay
constant after excluding measured telemetry buffers. User-agent memory is
measured for every cycle. See [native lifecycle](../../slice-15/native-lifecycle/README.md).

The repaired raw-lab suite now passes on native hardware, including all source
contracts and both isolated depth controls (7,565 front-winning overlap pixels;
9,179 exposed garrison-body pixels). No page errors. The containing run's sole
failure belongs to the separate30k performance scene's retired reader selection;
it is not reported as an all-green aggregate run. Water/crown software repeats
are running before retirement is committed.

The current software repeat reproduces both adopted water images with zero
changed pixels, retains near motion and far calmness, and returns exactly after
clock reversal. The full model scene completes successfully. The adopted-repeat report is terminal
with exit0; both water images and the revised grass/scrub fixture repeat exactly.

## Accepted scope

The displaced raw whole-map owners are retired. Their surviving model/UI
consumers pass the repaired native raw-lab suite; the complete campaign model
scene and production water film pass on software rendering. Current game
journeys and native lifecycle are independently proven above. This closes the
retirement checkpoint; final scene coverage and workload acceptance remain in
slice15.
