# Far-bundle consumer probe

## Verdict and boundary

The production crowd consumes distinct heavy-infantry, phalanx and mounted far
geometry. The mounted side silhouette remains a horse with rider, the phalanx
retains its pike, and their scale/anchor are not squeezed into the old fixed
human billboard aspect. The atlas-row correction restores equipment handedness.
This accepts the narrow data/orientation contract, **not finished far-model
quality** or slice03 as a whole.

The close `*-far-diagnostic` captures deliberately hold the near projection and
select far content through the existing LOD input. They are magnified inspection,
not genuine production-distance appearance gates. `roster-production-far` uses
the real far projection and LOD, checks every current appearance independently
against the content producer's roster size, and shows all twenty formations.
Its enlarged crop proves visible coverage, not detailed readability at that size.

## Reproduction and regression

From `web/`, with this worktree's Vite on 5178:

```sh
SCENARIO_REPORT_JSON=../specs/battle-model-quality/assets/evidence/03/far-bundles/final-checks.json VERIFY_GPU=1 VERIFY_URL=http://localhost:5178 node scene.mjs battle-model-far-bundles battle-renderer-default
```

[Final checks](final-checks.json): all five snapshots have exactly zero differing
pixels, repeated frozen screenshots are byte-stable, all 320 roster instances
use far content, and the normal battle boots 15560 soldiers with 9 crowd draws
and 42 total draws. There are no browser/GPU errors. This is correctness on
SwiftShader, not hardware performance evidence.

The new scene uses explicit zero tolerances. Independent code review found two
false-green risks: near checks previously required only absence of impostors,
and the roster expectation was derived from the loaded catalog itself. Both are
fixed: near checks require all submitted skinned instances, and missing catalog
entries fail against the independent producer count.

The verification worktree's broad typecheck still reports three stale raw-lab
consumer calls in `assets.ts` and `assetWorkbench.ts`; their removal is owned by
the parallel runtime-cutover lane. The new scene is JavaScript and introduces
no TypeScript errors. This report does not claim the unintegrated tree is green.

## Row-addressing defect and less-wrong comparison

Target: one soldier's weapon remains on the same side when switching from mesh
to its far representation; the selected view must survive the texture lookup.
Canvas atlas rows count from the top while texture V counts from the bottom.
The selected tile row must therefore be inverted without flipping local tile V.

The [mutation run](row-mutation-checks.json) restores the original row formula:
the central pike's measured X centroid changes from669.207 to621.407 pixels,
while the mesh reference remains669.322. The handedness assertion fails without
depending on a blessed baseline. Both near snapshots remain identical. Far
snapshots change16900(front),11695(side), and996(actual far-roster) pixels.

[Before-row-fix images](before-row-fix/) and the active baselines share the same
viewport, camera, pose, assets and browser; only UV row addressing changes.
These are before/after evidence for the row bug, not a historical comparison
against the entire pre-bundle renderer. [Metrics](comparison-metrics.json)
report front distance0.01160 full-frame /0.06471 silhouette crop, side0.00863
/0.04460, and actual far-roster0.00040 /0.02567. Distance is not acceptance;
the corrected candidate is less wrong because equipment handedness agrees with
the mesh. [Front comparison](front-row-comparison.png) and
[side comparison](side-row-comparison.png) put the rejected image on the left.

## Final independent visual critique

[Fresh critique](critique.md) was run from `/tmp` without project history using
full captures and enlarged crops. It found no mirroring, orientation swap or
missing whole unit, but identified real readability defects:

- The front-facing mounted sprite merges rider/horse layers into a humanoid
  column; narrow leg and equipment separations become muddy.
- Side-view lower weapon shafts become occluded/softened; nearest-view sampling
  cannot reproduce the exact near-camera silhouette.
- Blur and dark edge halos fill small gaps.
- Far sprites have no cast/contact shadows, unlike the close mesh. This is the
  pre-existing far policy, made conspicuous by diagnostic magnification.
- Near placeholder horse geometry has possible loose-looking slivers.

These remain explicit distance/content acceptance debt for15/28 (and horse
geometry21), not a waiver for finished assets. A scratch production-mesh probe
at the selected phalanx atlas direction confirmed the coarse-view contribution:
tile23 looks along[0.91287,-0.18257,0.36515],11.31 degrees away from true side
azimuth and2.70 degrees in elevation; at that view the mesh also hides much of
the lower shaft behind the body. No camera, lighting, material or atlas-density
change was bundled into this verification pass.

## Review and choices

Shape: one addressable mixed-roster scene, existing production world and camera,
no new renderer or generic harness. Diff: UV correction is one expression with
its coordinate-system reason; code review's two test gaps are resolved. Docs:
this report owns evidence and limitations; source code owns exact fixture values.

Decision audit: close far-tier inspection is explicitly diagnostic and cannot
replace real-distance acceptance. This was required by the task, not a new
product choice. No new dependencies, settings or runtime interfaces are added.
Existing tests retain their behavior; the new scene adds a mutation-proven
handedness assertion and exact screenshot coverage.
