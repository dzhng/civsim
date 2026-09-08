# Upstream optimization merge

Merge target: `2c4caf92`, with pre-merge control `964ef533`. Preserve explicit
playback, authored corpse geometry, and independent projected camera/shadow LOD
while incorporating instance pooling, typed LOD storage, fast tile selection,
simulation search optimizations and profiling tools.

Verification: 373 web tests, type-checking, 13 sim library tests, five
presentation-travel tests and the unchanged simulation golden pass. The optimized
WASM builds. Both independent scoped code reviews report no actionable findings.
The projected-audience serialization retains its exact existing hash; added tests
pin pooled object refresh and reusable two-audience buffer contents.

The final production workbench run (22019) passes all checks and all eight image
assertions at zero changed pixels. The earlier combined run was disturbed by
source-formatting HMR during its final interaction; the final run held source
fixed. No snapshots were updated.

Two older far fixtures remain red. The [detached control](far-control.md)
reproduces all eight failures, and all five pre/post actual far images are
pixel-identical. These are not merge regressions: the diagnostic zoom override
predates projected admission, and the grounding fixture iterates the former
flat bucket shape. Repair those fixtures in the distance-coverage pass without
weakening production projection or independent shadows. This merge does not
claim their existing default gates pass.

Test behavior ledger: previous simulation and projected LOD outcomes are
unchanged; typed-array assertions replace object-shaped assertions while retaining
the exact golden. New pool and capacity tests require reuse without stale values.
No animation, balance or art acceptance is inferred from this merge.
