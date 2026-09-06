# Merged production validation

The observation adapter, controller and workbench replay are integrated. The
rebuilt WASM passes four native composition tests; the simulation golden remains
`0x46c3732a78dc549c`. The final integration run passes typechecking and all252 web
tests across51 files.

The production workbench rerun (`VERIFY_GPU=1 VERIFY_URL=http://localhost:5174
node web/scene.mjs battle-model-workbench`) passes all checks, including all five
existing zero-difference snapshots, material controls and atomic reload failures.
The default battle scene also passes its frozen-tick and same-tick reload cache
checks. These are integration proofs, not new model or motion-quality acceptance.

## Changed-test ledger

| Test                                        | Previous behavior                                           | New behavior                                                                                                          | Why                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Missing presentation clip, real HTTP loader | Rejected a missing name without checking diagnostic detail. | Requires both the action role and missing source clip in the error; observed red before the message fix, green after. | Authors need to identify the broken binding.                                                              |
| Workbench incompatible active-clip reload   | Expected the later active-selection admission error.        | Accepts earlier presentation admission and verifies the last good class0 / march / phase0.25 plus retained clip.      | Canonical role validation now correctly rejects the malformed catalog earlier; rollback remains required. |

New held-pike readiness coverage uses a distinct authored clip: entry at phase0,
duration-based progress, movement and at-ease taking precedence, and no invented
binding for an inapplicable appearance. Previously no dedicated non-null binding
exercised that selection. Replay coverage audit exposed this gap; production
policy is unchanged. Its focused timeline file has17 passing tests, with
typechecking and independent review also passing.

Independent review found no issue in the diagnostic/rollback patch; its sandbox
could not bind the HTTP test server, so the main unrestricted run supplies that
test result. No baseline or tolerance changed.

The [unchanged hardware gate](hardware-30k.json) also passes on Apple Metal3 at
1280×800 with30,560 soldiers and150 GPU samples per stop. Mid/vista medians are
12.09/11.16ms, with p95s16.92/13.17ms. Pan, zoom sweep and wheel rAF p95s are
19.70/21.45/19.06ms; close-grass p95s18.73/19.96ms. All remain below33ms.
The evidence frames were inspected: formations read as distant masses and
vista foreground grass obscures individual bodies. This inherited paused-sim
gate is neither close-model readability nor live-animation acceptance;07 owns
those additional measurements.

The [final merged scene report](merged-scenes.json) passes replay, the ordinary
workbench, deterministic battle gait and the material-swatch oracle. The new
replay gate explicitly requires zero tolerance and reports0 changed pixels;
all existing workbench and swatch snapshots likewise remain unchanged. The
[gait repair](gait-harness.md) now samples91 consecutive observations over90 ticks
and reports a1.96 pixel-motion metric over three ticks, above the unchanged0.02
floor. This is on-screen movement, not isolated articulation acceptance.

The replay Preview checkpoint opened at08:32:19UTC on2026-09-06. It concerns
action inspection only; the existing placeholder model is not art acceptance.
No feedback arrived by08:37:31UTC; proceed on the passing evidence and bounded
readability verdict, not assumed user approval. Preview was closed. Final
independent integration review found no actionable regression and confirmed
typechecking and the scene evidence. Slice05 is complete;06 owns GPU continuity.
