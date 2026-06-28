---
name: write-turntable
description: The turntable renders each unit class rotating 360° (8 angles × 4 stances) into one committed contact sheet per class — the static model-review gate, pixel-regression gated. Use when adding or changing a unit model, when the roster grows and a new class needs a sheet, when running or re-blessing the turntable, or when checking that models still read at the battle's real top-down tilt (PITCH=ingame). Pairs with write-anim (the motion twin), aesthetics (the look every model is judged against), and screenshot-regression (the snap mechanics).
---

# The model turntable

The turntable renders each unit class rotating 360° (8 angles × 4 stances) into
one committed contact sheet per class — the static model-review gate. It uses the
real battle renderer (same meshes, materials, sun, colour grade), so what you
review is what ships. It is NOT a battle and NOT a time series: one still sheet
per class, and the whole sheet is the regression target. Its motion twin —
animation cycles as looping GIFs — is [write-anim](../write-anim/SKILL.md).
Snapshot mechanics live in [screenshot-regression](../screenshot-regression/SKILL.md).

## Where

- Driver: `web/vibe/turntable.mjs` against the WebGPU model-review route. Shared
  soldier sheets write to
  `web/shots/models/shared/turntable/<id>-<class>.png`; in-game pitch sheets
  write to `web/shots/models/shared/ingame/<id>-<class>.png`.
- Each sheet is composited in JS and handed to `snapCheck` as a buffer, so the
  one image is the whole gate:
  `snapCheck(page, '${GROUP}/${id}-${name}', check, { threshold: 0.1, maxDiffRatio: 0.003, shot: montage(rows, TW, TH) })`.

## Run

1. **Rebuild wasm first** — `npm run build:wasm` from `web/`. The harness loads
   the *prebuilt* wasm, never live Rust.
2. `node vibe/turntable.mjs` from `web/` renders all classes. `ONLY=0,3,6 …`
   limits to class ids. `PITCH=ingame …` renders at the battle's real top-down
   tilt (0.42 rad) into `shots/models/shared/ingame/` to confirm the models
   still read in-game.
3. Re-bless after an intentional model change:
   `UPDATE_SHOTS=1 node vibe/turntable.mjs` (it clears the folder first).

## When the roster changes

Extend `CLASS_NAMES` (the roster the turntable iterates and names files by) and
`CLASS_H` (per-class height, which drives framing) in `vibe/turntable.mjs` so the
new class gets a sheet; `STANCES` is the fixed four-pose set shown for every
class — leave it. Give the new class an animation review too
([write-anim](../write-anim/SKILL.md)). Class 14 is a RENDER-ONLY look (a shock
lancer with its sabre), not a sim class — keep that distinction when you touch
the arrays.

Pairs with [write-anim](../write-anim/SKILL.md) (the motion twin),
[aesthetics](../aesthetics/SKILL.md) (the visual north star every model is judged
against), [screenshot-regression](../screenshot-regression/SKILL.md) (the snap
mechanics), and [write-vibe](../write-vibe/SKILL.md) (the battle-timeline sibling
under `vibe/`).

## Ownership

Model source and review artifacts follow the same owner split:
`models/battle/`, `models/campaign/`, and `models/shared/`. Put reusable assets
such as soldiers, trees, rocks, banners, carts, and generic props in `shared/`
unless they truly belong to only one surface. New model families should add
their turntable output under the matching `web/shots/models/<owner>/` folder.
