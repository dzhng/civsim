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

- Soldier driver: `web/shots/models/scripts/soldier-sheets.mjs` against the GPU renderer model-review route.
  Shared soldier sheets write to
  `web/shots/models/shared/soldiers/ingame/<id>-<class>.png`.
- Campaign model driver: `web/scenes/models/campaign-models.mjs` against the
  campaign model-review route. Campaign entity, prop, terrain, water/fog, and
  label shots write to `web/shots/models/campaign/{entities,props,terrain,labels}/`.
  This scene is the repurposed campaign model report harness; it must stay a
  `web/shots` baseline generator, not a spec report writer.
- Each sheet is composited in JS and handed to `snapCheck` as a buffer, so the
  one image is the whole gate:
  `snapCheck(page, '${GROUP}/${id}-${name}', check, { threshold: 0.1, maxDiffRatio: 0.003, shot: montage(rows, TW, TH) })`.

## Run

1. **Rebuild wasm first** — `bun run build:wasm` from `web/`. The harness loads
   the *prebuilt* wasm, never live Rust.
2. `node shots/models/scripts/soldier-sheets.mjs` from `web/` renders all classes. `ONLY=0,3,6 …`
   limits to class ids. Sheets render at the battle's real top-down tilt
   (0.42 rad) into `shots/models/shared/soldiers/ingame/`.
3. Re-bless after an intentional model change:
   `UPDATE_SHOTS=1 node shots/models/scripts/soldier-sheets.mjs` (it clears the folder first).
4. Campaign model/prop shots use the scene runner:
   `VERIFY_GPU=1 UPDATE_SHOTS=1 node scene.mjs campaign-models`.

## Adapter provenance

The canonical model-shot baseline device is the SwiftShader WebGPU path used by
the screenshot harness. If SwiftShader cannot create a WebGPU adapter locally,
capture with the repo's hardware fallback (`VERIFY_GPU_ADAPTER=hardware`,
`VERIFY_BROWSER_CHANNEL=chrome`, and headful when needed), then immediately
re-run the same gate without `UPDATE_SHOTS` on that adapter and require `0 px`
diff before calling the baseline deterministic. In the handoff, name the exact
command that exists in the current checkout. Stone-dense props and terrain
samples are the risky cases: their hardware/Metal pixels can exceed the shared
2% snapshot budget against SwiftShader-blessed baselines, so flag them as
possible one-time CI re-blesses rather than hiding the provenance.

## When the roster changes

Extend `CLASS_NAMES` (the roster the sheet iterates and names files by) and
`CLASS_H` (per-class height, which drives framing) in `shots/models/scripts/soldier-sheets.mjs` so the
new class gets a sheet; `STANCES` is the fixed four-pose set shown for every
class — leave it. Give the new class an animation review too
([write-anim](../write-anim/SKILL.md)). Class 14 is the render asset
`shock-cav-sidearm` (mounted shock cavalry with its sword), while the battle UI
may still label sim class 14 as medium phalanx — keep that render-vs-sim
distinction when you touch the arrays.

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
