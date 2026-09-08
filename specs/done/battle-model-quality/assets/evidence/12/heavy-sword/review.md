# Heavy unpaired sword effort — bounded study

This is a manual-only source-action study, not an accepted combat animation or a simulated strike. The existing controller plays complete authored melee efforts; the proposed 1.2-second duration is art cadence, not the heavy sword's 4.1-second simulation attack interval. No hit/contact event, opponent, runtime binding, root travel, or gameplay change is introduced.

## Rejected A

The author, main reviewer, and independent visual reviewer rejected A before a broader motion film. All 36 poses were inspected across front, shield-side oblique, and opposing sword-side views. A readable raise/cut/return exists, but bilateral knee dipping substitutes for receiving-leg support; the torso stays upright and the nearly straight sword arm finishes beside/behind the hip. The shield-side view hides important arm motion. Numerical clearance does not establish convincing effort.

`fresh-smoke-review.txt` records the independent verdict. The CLI session `01a07d9b-8443-7d82-9ae1-ce9dd348d5bc` loaded 13 image payloads, including all six chronological strips and whole-frame context. The pose-review GIFs use 200 milliseconds per nonuniform sampled pose and are **not actual-speed playback**.

Capture 89280 completed with 26 snapshots and 53 checks; opposing capture 67160 completed with 12 snapshots and 25 checks. Both repeated their frozen frames exactly and had no page errors. Frame zero matches ready outside the caption; the final sampled ready pose differs by one pixel in each original camera, so endpoint byte identity is not claimed.

Source controls establish unchanged keys/handles for all ten existing actions, 37 editable meshes, and bind rig. Imported old clips and rig are exact; exported tangents differ on primitives 0 and 6. The 145 quarter-frame surface probe found no intersections in its 18 named pairs. It does not test containment, every kit pair, or continuous motion. Minimum sampled sole heights were −0.118 mm left and −0.351 mm right. Prior scabbard/mail concerns are not covered by this probe.

The rejected source and recipe remain in task-owned scratch:

- `throwaway/heavy-attack/a-reviewed-rejected/heavy-kit.blend`: SHA-256 `9904995d9897ce86daf2b60e635eacc8fb34f424e28963d26a4fcb9d9886cf9b`.
- Matching GLB: `ee4ac2241e55a3c5344e54d1d67f0f849fc1e8f7924ab271486ab5acb932271b`.
- `throwaway/heavy-attack/author-smoke-a.py`: `8321b4cddd24f52f8c014e7bd21111a93f26d19cf2b5a37a931f393313c9e22f`.

## B revision under study

The bounded revision adds a small authored left/front receiving step while the rear foot remains anchored, distinct rear/right loading and forward/left pelvis/chest transfer, rear heel lift, and a compact connected sword-arm finish forward of the hip. It returns to ready and preserves the old clips and fitted equipment. No world-root displacement is added. The offline two-segment joint calculation is extracted from the existing leg owner and reused for the sword arm; there is no runtime IK or generic solver layer.

B capture 19481 completed both sequential three-angle smoke runs: 38 snapshots, 78 checks, exact frozen immediate repeats, and no page errors. The author inspected all 36 attack poses. The receiving step and rear heel are more distinct than A, but the low near-hip finish, conspicuous raised elbow, and restrained torso effort remain concerns.

Independent CLI comparison 91671 completed with 20 actual image payloads, including all 12 A/B strips (72 panels) and whole/detail views. Session `01a07db1-3684-7283-89bb-f18e340b708f`; exact verdict in `fresh-ab-smoke-review.txt`. It judged B less wrong with moderate overall confidence and suitable for a bounded actual-speed film, **not acceptance**. B has clearer receiving-leg participation and a less strained bent-elbow finish; its cramped release at 0.367 seconds, quiet torso/shield, and low-finish hold from 0.500–0.733 seconds remain. Main subsequently reviewed all B smoke poses and approved the bounded film below.

Every intermediate A/B pose differs outside the caption; frame-zero and final poses match A exactly in all three cameras. `ab-smoke-pixels.json` records the per-pose counts. This demonstrates a rendered change, not an improvement score. The same cameras, times, complete framing, floor, and lighting are retained.

Final B CPU controls 65849 preserve all ten old source actions, 37 editable meshes, and the bind rig exactly. Imported old clips and rig are exact, with fresh tangent differences on primitives 0 and 7. Export 51150 and bake 3105 completed. Surface probe 92743 found no intersections in its 18 named pairs across 145 quarter-frame samples; minimum sole heights are −0.196 mm L and −0.434 mm R. These are diagnostic, not visual acceptance, true center-of-mass measurements, or proof of all kit clearance.

Frozen B hashes:

- Source recipe: `08184dc139d29033ebba24382667d3ae08753d14af67fc833b1784a2777674b8`.
- Blend: `3f16d33a1d81b1af9590be5ae037c01da39d3566c12d6f4feea63ab633d29145`.
- GLB: `03db0e499549f2345398768eb153ab5694a6dcb536398e9f184d3aa5abb0a36d`.

## B bounded film

Main reviewed all 36 B smoke poses and approved a bounded film, not art acceptance. Capture 73001 completed 96 PNGs / 193 checks with exact immediate repeats and no page errors. Both camera sequences contain 48 deterministic frames at 30 fps: 0.2 seconds of ready, one 1.2-second effort, and 0.2 seconds of ready. Source hashes above were checked unchanged afterward. Twenty shared smoke/film poses are PNG-byte-identical (`film-smoke-controls.json`).

The `b-film` GIFs and MP4s are derived from these PNGs, not a second renderer. Both formats contain 48 frames over 1.6 seconds; GIF timing has centisecond quantization, while MP4 reports 30/1 fps. The author inspected all sixteen chronological strips / 96 panels; still-image tools do not justify claiming playback was watched. The receiving step and rear heel are distinct, the release unfolds rapidly around 0.333–0.433 seconds, and the low finish remains nearly held through 0.500–0.700 seconds. No controller blend, paired timing, damage/contact event, or live movement is demonstrated by this pure source-action film.

Fresh film review 8493 completed with 30 actual image payloads, including all sixteen strips and fourteen whole frames. Session `01a07db9-22c4-71d0-a300-b4dd52425289`; exact final in `fresh-film-review.txt`. Verdict: provisionally coherent as a manual art study, moderate confidence, with no visible blocking defect requiring source revision. The strongest weakness is the low-finish hold at frames 21–27 (0.500–0.700 seconds), which risks reading as an endpoint hold rather than braking. The cramped release at frames 16–20 (0.333–0.467 seconds) makes blade rotation more prominent than arm opening. The author concurs with this limited retention, not final art acceptance. Neither reviewer watched GIF/MP4 playback; precise landing, hidden grip/contact, and actual-speed rhythm remain open. Main independently inspected all 96 panels and the complete fresh verdict and provisionally retained the connected manual study with these limits. No final timing/contact acceptance follows. Preview's completed checkpoint is recorded in closeout below.

## Preserved source and reproduction

The exact donor is the canonical ten-clip heavy source at commit `6c8959b0`, `packages/soldier-assets/assets/source/heavy-kit/heavy-kit.blend` (SHA-256 `458e2604f793375b2646d6e0b1ff34209ef9ef5d86738110dbdde557083e2b74`). Its GLB is `1737da781c4f2b26698227d66391ab98c7345c630627f7cad255f39308d11638`. This identifies the fitted geometry and prior action controls independently of a moving root branch.

Captured B is explicitly preserved at `/Users/david/dev/game-heavy-attack-study/throwaway/heavy-attack/b/heavy-kit.blend` and adjacent `heavy-kit.glb`, with the frozen hashes above. Do not remove this pair before selective action integration is reproduced. Rejected A remains at the source path above. Canonical blend/GLB, catalog, runtime bindings, and old screenshot baselines are unchanged by this study commit.

Reproduction uses Blender 5.2.1 LTS (hash `9e2066aef7ef`) in isolation. From `/Users/david/dev/game-heavy-attack-study`, with the preserved donor under `throwaway/heavy-attack/control`:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python packages/soldier-assets/bake/blender-heavy-motion.py -- --source throwaway/heavy-attack/control/heavy-kit.blend --output throwaway/heavy-attack/b-repeat
CONTROL=b CANDIDATE=b-repeat node throwaway/import-attack.mjs
CONTROL=b CANDIDATE=b-repeat /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python throwaway/source-controls.py
CANDIDATE=b-repeat /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python throwaway/attack-probe.py
```

The reproduced export is compared to captured B above. Fresh export tangents can differ, so these checks do not claim reproduced pixel identity. Separately, replay the exact captured donor by baking **B**, then capturing its existing gates:

```sh
CANDIDATE=b node throwaway/bake-attack.mjs
CANDIDATE=b VERIFY_GPU=1 VERIFY_URL=http://localhost:5279 node throwaway/capture-attack-smoke.mjs
CANDIDATE=b OPPOSING=1 VERIFY_GPU=1 VERIFY_URL=http://localhost:5279 node throwaway/capture-attack-smoke.mjs
CANDIDATE=b FILM=1 VERIFY_GPU=1 VERIFY_URL=http://localhost:5279 node throwaway/capture-attack-smoke.mjs
```

Capture requires the isolated candidate page on port 5279 and exclusive GPU ownership. Adapters/probes remain preserved task-local scratch, not new durable harness owners. Committed JSON and images archive the results; canonical production scene coverage belongs to selective integration. Re-running capture uses exact scratch gates, never broad baseline updates. GIF/MP4 derivation uses `ffmpeg -framerate 30` over ordered PNGs; authoritative time mapping is `b-film/timing.json`.

## Closeout review

Shape: one heavy-motion owner, one existing ready-based lifecycle, and existing offline two-segment geometry reused by legs and sword arm. No solver framework, runtime IK, pose clock, or second renderer. The source diff adds 122 and removes 16 lines, principally the new action. The one-off capture adapter is not promoted. Diff review corrected only the shared joint argument names to `origin`, `target`, and `bend_hint`; arithmetic and call order are unchanged. The captured recipe hash above predates this naming-only cleanup; final recipe hash is `c3fcb398f9705f9a7ba40b1dbb7d5b91a70b0af39f3cdfa86af48b549e7e10ea`. Fresh export 31763 and control check 4504 completed: all eleven source actions, 37 meshes and bind rig exact against B. All eleven imported clips and rig also match; tangents differ on primitives 0/1/7. Captured B remains the pixel-reviewed donor. Shared ready lifecycle functions are text-identical to the independent hit lane.

Independent code review 95676 (session `01a07dc2-624a-7653-aa30-23c51da6471a`) found one valid documentation defect: reproduction exported `b-repeat` but subsequent checks selected archived `b`. The commands now explicitly validate `b-repeat` against B, then separately replay captured B. No actionable source correctness or ownership finding was identified, and no visual acceptance was inferred. Global doc/hub edits remain main-owned; this leaf is the proposed slice-12 evidence link.

Preview closed at 21:26:22 UTC after opening 21:20:51 UTC on 2026-09-07. There was no user response; the five-minute checkpoint conveys no user approval. Main/fresh provisional retention and the open limitations above remain the disposition.

No existing production test or screenshot expectation moved. New image checks cover only this study's previously absent manual action. Old ten source/imported clip controls remain exact; this is not a claim that the entire production heavy screenshot suite was rerun in this study lane.
