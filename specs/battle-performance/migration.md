# Selected TypeGPU replacement: conversion and exit graph

[TypeGPU is selected](backend-decision.md) after user feedback on the performance
tie. The graph below records the promoted raw capability work and its required
exits; it is historical implementation evidence, not proof that the TypeGPU path
already owns those capabilities. First map and convert the resource/shader owners
using the existing TypeGPU candidate and latest raw improvements. Keep one device
and frame owner, typed schemas/bindings and explicit shader-body type-safety
boundaries. The concrete conversion passes are being scoped before implementation.
No production selector, saved-data migration or compatibility owner is introduced.

```text
M1a independent contracts → M1b promote raw world
  ├→ M2 terrain/scenery → M3b water (also M3a)
  ├→ M3a atmosphere → M8 post/output
  ├→ M4 crowd assets/reload → M6 default + High shadows (also M2)
  ├→ M5 grass (also M2, joins04/05)
  └→ M7 effects/debug (also M2)
M2–M8 → M9 production cutover →10 final live/quality/net-cost acceptance
03a unchanged simulation throughput joins10 independently.
```

[M1a](assets/m1a-contracts/README.md) and the
[M1b promotion](assets/m1b-promotion/README.md) are integrated; inherited gates
remain explicit. Current pickup lives in the README handoff. Concrete obligations:
[M2](slices/m2-terrain-scenery.md), [M3a](slices/m3a-atmosphere.md),
[M3b](slices/m3b-water.md), [M4](slices/m4-crowd-assets.md),
[M5](slices/m5-grass.md), [M6](slices/m6-high-shadows.md),
[M7](slices/m7-effects-debug.md), [M8](slices/m8-post-output.md),
[M9](slices/m9-production-cutover.md).

Current prerequisite ledger (capability and final optimization are distinct):

| Pass | Recorded capability checkpoint | Still needed before declaring exit |
| --- | --- | --- |
| M1 | Promotion/API, lifecycle, raw pose and repeated scene controls | Carry documented initial/strict pixel differences |
| M2 | Promoted terrain/scenery and M6 pre/post terrain controls | Map checks to seating/picking/replacement contract explicitly |
| M3a | Complete-scene atmosphere/frame controls exist | Numerical and initialization/update ownership verified; composed horizon proof remains |
| M3b | Dedicated lake/ocean controls; complete-scene fixture has no water | Current lake passes; ocean strict residual remains open ([evidence](assets/migration-component-review/README.md)) |
| M4 | Public atlas/reload admission and hostile disposal | Broader posed/LOD/mounted/dead coverage |
| M5 | Promoted residency/grass and complete-scene controls | Coverage/motion/bounded-work proof; joins04/05 |
| M6 | Single/High/off hardware and lighting checkpoints | Default receiver/motion quality and net cost |
| M7 | Debug blocks and immediate overlay sizing | Remaining effect ordering/contact-band assessment |
| M8 | Frame controls reproduce inherited strict differences | Explicit post/output exit mapping; carry unresolved pixel reds |
| M9 | Import seam exists | [Correlated timing](slices/m9a-frame-timing.md), honest diagnostics, production guard/capture/handoff migration, then deletion |

Missing pass-named directories do not by themselves invalidate existing evidence.
Map the recorded checks before scheduling replacements; do not infer a full exit
from the mere presence of promoted code. Lab comparison types can stay in lab
harnesses; the final production facade has only the selected backend.

The table below retains the original verification contracts. Its rows are now
owned by the linked passes, not an unresolved choice of engines.

| Port slice | One owner/seam | Frozen inputs and review surface | Exit |
| --- | --- | --- | --- |
| M1 device/frame shell | device/attachments/frame lifecycle | canonical camera/depth, resize and hostile depth-order fixture | healthy frame, feature limits, loss/error and disposal behavior |
| M2 terrain/opaque scenery | terrain height and opaque world phase | existing terrain/scenery/material assets; raised-terrain crop | terrain/props aligned and depth-correct, equal environment input |
| M3 atmosphere/sea | existing environment-driven vista output | fixed camera/time/weather; horizon/water crop | correct sun/fog/water composition; split atmosphere and sea into separate slice files if both change |
| M4 crowd beauty | asset/playback→visible crowd pass | current animation and model tiers; posed/mounted fixture | silhouettes, normals, equipment and pose parity; 06/07 attach here |
| M5 grass | resident records→route/draw | fixed records, source terrain; ground crops | current coverage/wind parity; 04/05 attach here |
| M6 shadows | canonical light/caster views→shadow resource/receiver | 02 fixed-fit probe followed by 08/09 | directional coverage and movement stability within budget |
| M7 effects/cues | depth-read world effects after opaque writes | selections/orders/projectiles/corpses; hostile-order fixtures | correct elevation, occlusion and simulation-driven identity; split distinct effect owners into files |
| M8 post/output | accepted scene color→canvas | fixed lighting/color/output size | post/tone mapping/AA parity and timing; UI stays existing DOM |
| M9 battle cutover | production BattleRenderer→chosen world | full menu benchmark and battle entry/exit | delete old battle owner/selector, no second production backend |

The linked files materialize these rows; atmosphere and water are separate. M1b precedes promotion-dependent changes; M2 precedes grounding; crowd/grass/shadow consumers meet at the selected frame graph. Final production switch happens only after complete parity, and then 10 judges the combined optimization. Use fixture routes while ports are incomplete; do not ship a half-rendered production battle. Keep them runnable without booting unrelated gameplay systems.

For every materialized slice specify selected-backend native resource schemas, update frequency, memory owner, read/write phase, deterministic fixture, perf counters, crop and regression tests. Compare screenshots and run unprimed screenshot-critique last; review is non-blocking as in README. No generic renderer facade wrapping both engines. A temporary lab adapter is removed at M9/10. If Three utilities remain for assets or campaign, document the real remaining use instead of making a false zero-Three claim.

All candidates still miss final live acceptance; retain that finding, investigate the dominant measured workload and reslice it. An incomplete candidate, an unknown hardware cost or fewer implemented features cannot win by declaration. Large implementation effort is allowed; the decision is grounded in performance, fidelity and maintained ownership.
