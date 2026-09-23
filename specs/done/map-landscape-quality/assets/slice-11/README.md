# Dynamic ownership and visibility

The target is geographic continuity when ownership changes or vision moves:
terrain, roads, objects and woodland must agree within the presented frame, and
the next detail tile must inherit the current state. This pass judges those
behaviors, not the unfinished landscape art or the whole production migration.

The focused fixture uses an asymmetric four-cell ownership raster so horizontal
or vertical flips are visible. Its ownership update changes one region while
retaining the others. Two vision queries then reveal opposite sides without
toggling fog off. The existing composition oracle remains the unchanged control.

CPU verification: typecheck and all 490 web tests pass. Initial test invocations
in the sparse worktree failed because excluded runtime assets and archived test
inputs were absent; restoring access to identical inputs resolved those failures.

Browser behavior passes: an ownership replacement changes 157,759 pixels;
political off restores identical natural terrain; moving vision changes 184,239
pixels above a summed RGB delta of 30 and replaces the visible entity/woodland
membership. Detail admission retains the latest visibility. All five original
composition controls remain exact, and all four new captures repeat at zero
pixel differences. No browser errors were reported.

The first repeat exposed 2,368 pixels of stale hidden shadows in the west frame.
Three's ShadowNode updates once per camera per browser frame; consecutive
imperative fixture renders can therefore retain the earlier shadow map. The new
fixture input hooks now also schedule the next animation-frame draw, as the
existing terrain-admission hook already does. Updated/repeated captures include
this fix; the failed report remains evidence rather than a relaxed tolerance.

[Comparison telemetry](comparison-metrics.json) measures deliberate state changes,
not which political owner is aesthetically preferable. The ownership edge energy
ratio is 0.984; moving vision retains nearly identical whole-frame luminance while
moving the exposed region. The target is met by the dynamic response; terrain and
fixture-road art remain outside this checkpoint's acceptance.

Independent code review found no actionable defects. Independent image critique confirms ownership and visibility transitions remain consistent, with no orphan labels or retained hidden shadows. The straight color edge is the intentionally asymmetric ownership fixture; the steep road and weak tree contact shadows remain composition/environment concerns, not failures of this dynamic-input checkpoint. Full-source visibility-update cost and full-region geography still require verification before production cutover.
