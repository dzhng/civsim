# Premerge far-scene control

Detached source `964ef533364e71236011cf8ed81f72c2bf4f68f7`, no tracked edits.
Own Vite port 5473. Root-built WASM copied locally, SHA256
`04aa7834b861ce266205f1072aec5b27ac2c53eaf76191f638221392f19497ce`;
these model-only scenes do not test simulation behavior. Medium source/server untouched.

Run 56956 failed before rendering because sparse checkout omitted the renderer
lab app. Setup-failed report/log retained. Exact premerge apps/docs/crates were
included and Vite restarted; transformed main and router both returned HTTP200.
This setup attempt is not comparison evidence.

Frozen rerun 72998 ended 1, browser closed: 29 checks, eight failures, no page errors.
Command: `VERIFY_GPU=1 VERIFY_URL=http://localhost:5473 SCENARIO_REPORT_JSON=../throwaway/far-premerge/report.json node scene.mjs battle-model-far-bundles battle-model-far-grounding`.

| Far snapshot | Difference from old baseline | Premerge vs postmerge actual |
| --- | ---: | ---: |
| front-near | 3364 | 0 |
| front-far-diagnostic | 33081 | 0 |
| side-near | 27231 | 0 |
| side-far-diagnostic | 47200 | 0 |
| roster-production-far | 96 | 0 |

Both diagnostic representation assertions report skinned=3, impostors=0.
Grounding near is exactly its old baseline, followed by the same
`replacement.buckets[0] is not iterable` exception. All five pre/post actual
PNGs are retained adjacent; direct RGBA comparison found zero changed pixels
in each. These failures precede the root merge, not a merge regression.

Source explanation: far-bundles changes scalar camera.zoom to .9 while retaining
the close camera3d projection. battleWorld.ts drawInstances/crowdVisibilityScope
uses the actual THREE camera projection footprint for admission. The override
is no longer its claimed LOD input. Grounding line132 iterates buckets[0] as an
array, but crowdLayer.ts132 already stores class→main/shadow→bucket arrays.
No fix or snapshot acceptance performed. GPU explicitly released at terminal.
