# Whole-heavy formation review fixture

The existing candidate scene now supplements individual inspection with a small
formation. This makes repeated silhouette and equipment relationships visible
before propagating the heavy model to another class. It adds no renderer,
animation owner, asset, or production catalog change.

The [formation](formation.png) and [gameplay-pitch formation](formation-gameplay.png)
show ready, walk and run poses from four bearings. Both use the existing
workbench's sixteen-body formation, fixed zoom65, and the same production daylight
and weighted rendering as individual views. Pitch0.9 supplements the0.42
gameplay-pitch study. Neither establishes the nearest supported battle camera or
the physical-display/performance envelope still owned by07.

## Evidence and limits

`VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node web/scene.mjs heavy-kit`
ran as process97357 on the root worktree's Vite server. The [capture log](capture.log)
records ten expected comparisons against older unaccepted model images; every
production-submission, freshly rendered frozen-repeat and page check passes.
The two new sheets are candidate evidence, not blessed art. The source GLB is
`9e8f6776d75055c67f654b9545e07dbd1fd464f6b5502050908e87602176fe90`.

Raw RGBA comparison against the retained combined-mail evidence finds zero
changed pixels in close, head, gameplay-pitch, ready, complete walk and complete
run sheets. This is intentionally a coverage change, not an art improvement.
The previous detailed images and motion coverage remain intact.

Root inspected both complete sheets. An unprimed reviewer independently inspected
their native-size tiles: all sixteen bodies and equipment remain within the
frames, with high confidence. Shields, swords, helmet silhouettes and broad pose
changes remain readable. Front/rear ranks naturally occlude some legs; the
three-quarter views separate the bodies best. The top soldier approaches the
gameplay-view label but is not covered. Shields dominate and hide torso details,
so these sheets supplement rather than replace close inspection. Frozen poses
do not establish motion rhythm or complete appearance quality.

Independent source review found the shared helper preserves the old one-body
default and all clip, phase, substrate and frozen-repeat assertions. Root's shape,
diff and documentation review found no duplicate world, new runtime path or
weakened threshold. Web typecheck and diff whitespace checks pass. The attempted
independent CLI review could not run because its configured model requires a
newer CLI; the independent peer review is the actual review evidence, not a
claimed CLI pass.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Candidate production-weighted-pose check | Every camera requires1 submitted and1 skinned body. | Existing cameras retain1/1; explicit formation cameras require16/16, alongside the same clip/phase/material-path checks. | Exercise the existing formation through the shared scene instead of silently checking a single soldier. **moved** |
| Heavy formation snapshot checks | No formation sheets in the heavy-kit scene. | Two exact sheets cover three frozen poses and four bearings, each freshly repeated byte-for-byte. | Detect group framing and repeated silhouette regressions while retaining all prior individual/motion coverage. **moved** |

No simulation tests, statistics, balance values, production assets or acceptance
thresholds changed. No slice closes at this checkpoint.
