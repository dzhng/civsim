---
name: write-model-sheet
description: Render one committed in-game-pitch contact sheet per model class or prop family — the static model-review gate, pixel-regression gated. Use when adding or changing a model, when a roster/model family grows, or when checking that models read at the battle/campaign camera. Pairs with write-anim for motion, aesthetics for the visual target, and screenshot-regression for the snap mechanics.
---

# Model Sheets

Model sheets render one committed contact sheet per model class or prop family
at the camera pitch that matters in-game. They are the static model-review gate:
what you review is what ships. They are NOT battles and NOT time series; the
whole sheet is the regression target. Motion review lives in
[write-anim](../write-anim/SKILL.md). Snapshot mechanics live in
[screenshot-regression](../screenshot-regression/SKILL.md).

## Where

- Driver: `web/vibe/model-sheet.mjs` against the WebGPU model-review route. Shared
  soldier sheets write to
  `web/shots/models/shared/soldiers/ingame/<id>-<class>.png`.
- Each sheet is composited in JS and handed to `snapCheck` as a buffer, so the
  one image is the whole gate:
  `snapCheck(page, '${GROUP}/${id}-${name}', check, { threshold: 0.1, maxDiffRatio: 0.003, shot: montage(rows, TW, TH) })`.

## Run

1. **Rebuild wasm first** — `npm run build:wasm` from `web/`. The harness loads
   the *prebuilt* wasm, never live Rust.
2. `node vibe/model-sheet.mjs` from `web/` renders all classes. `ONLY=0,3,6 …`
   limits to class ids. Sheets render at the battle's real top-down tilt
   (0.42 rad) into `shots/models/shared/soldiers/ingame/`.
3. Re-bless after an intentional model change:
   `UPDATE_SHOTS=1 node vibe/model-sheet.mjs` (it clears the folder first).

## When the roster changes

Extend `CLASS_NAMES` (the roster the sheet iterates and names files by) and
`CLASS_H` (per-class height, which drives framing) in `vibe/model-sheet.mjs` so the
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
their static sheet output under the matching `web/shots/models/<owner>/` folder.
Within an owner, group shots by model family before review mode: soldier static
sheets live under `shared/soldiers/ingame`, while reusable scenery meshes belong
under `shared/props/`. Battle-only prop presentations should use `battle/props/`.
