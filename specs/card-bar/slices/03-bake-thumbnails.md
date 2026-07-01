# Slice 3 — Bake 3D-model portrait thumbnails (offline PNGs)

## Contract unlocked

One committed **3:4 PNG per model look** showing a rendered shot of the unit's 3D
model, plus a `--check` freshness gate so the build fails when the committed PNGs
go stale. No UI consumes them yet — this slice is assets + pipeline only, fully
decoupled from the layout work so a baking problem can't block S1/S2.

## Status (implemented 2026-06-30)

Baked a first cut of all 16 looks. Deviations from the plan below, with reasons:
- **Baker lives at `web/shots/models/scripts/soldier-cards.mjs`** (beside the other
  GPU baker `soldier-sheets.mjs`), **not** `packages/`: GPU bakers need `playwright`/
  `pngjs`, which only resolve from `web/node_modules`. The dual-write *targets* the
  package + `web/public` regardless of script location, so the asset contract holds.
- **GPU needs a real adapter** — headless swiftshader returns no adapter on this
  machine, so the baker launches **headful with hardware (Metal) flags**.
- **`--check` compares the package vs served copies for byte-equality** (the
  dual-write wasn't forgotten) rather than re-rendering: GPU output isn't
  byte-reproducible across machines, so the montage `snapCheck` is the render-drift
  gate and `--check` is the dual-copy-freshness gate.
- **`cardThumbUrl` deferred to S4** (where it's consumed) to avoid a hardcoded
  name list that duplicates the generated `manifest.json` — the manifest is the
  single source of truth; S4's helper reads it.
- **Framing constants** (pitch 1.1 — near eye-level, NOT a low number; `cam x −3.3`
  to centre the fixed-position soldier; `zoom 184/h`; figure-following crop) are
  first-cut defaults for **David's framing checkpoint** — heads have room and the
  figures read at 72px, but small-size class distinguishability is the open call.

## API seam

- **New baker `web/shots/models/scripts/soldier-cards.mjs`**, modeled on two
  existing files:
  - `web/shots/models/scripts/soldier-sheets.mjs` for the Playwright drive of
    `/renderer/skinned-soldier` — reuse `captureSoldier()` (URL params
    `class/clip/phase/facing/zoom/pitch/yaw/size`, waits on
    `window.__rendererLabReady` + `__rendererLabStats`) and `cropPng()`.
  - `packages/soldier-assets/bake/soldier-placeholders.mjs` for the **write +
    `--check` + dual-output contract** — write each PNG to the package
    (`packages/soldier-assets/assets/cards/NN-name.png`) **and** the served copy
    (`web/public/assets/soldiers/cards/NN-name.png`), and support
    `process.argv.includes('--check')` to hash output and fail if the committed
    copy is stale.
- **One portrait per look** `0 .. MODEL_LOOK_COUNT-1` (≤16; classes sharing a look
  share a PNG — key on look, since `modelLookForClass(cls)` is stable across the
  20/30/40 scaling). Filename `NN-<name>.png`, zero-padded look index.
- Capture: a near-front three-quarter idle pose (`clip=idle`, calm `phase`), a
  **head-on hero pitch** lower than the sheet's near-top-down `0.42` (tune to the
  reference), framed by the model's per-class height so a 3.4 m pike and a knife
  both fill their card (reuse the `CLASS_H`/`REVIEW_H` framing in
  `soldier-sheets.mjs`). `cropPng()` to a **3:4** window (e.g. 180×240) at 2× for
  crispness.
- **Faction:** bake **team-0 / faction-neutral body only**; faction stays the CSS
  `--fac` accent (border/sash). Document a `-t<0|1>` filename hook for later
  two-faction baking — do **not** build it now.
- **Card reference helper** (added now, consumed in S4): `cardThumbUrl(look)` →
  `/assets/soldiers/cards/${pad(look)}-${name}.png`, placed in
  `web/src/battle/classData.ts` (it owns `CLASS_NAMES`). Plus a generated
  `manifest.json` (look → filename) so nothing hardcodes the list.

## What a human can run / see

- `node packages/soldier-assets/bake/soldier-cards.mjs` writes the PNGs (both
  copies) + the montage; open any PNG or the montage.
- Add `bake:cards` and fold `bake:cards --check` into `web/package.json`'s
  `bake:test` chain (next to `soldier-placeholders.mjs --check`).

## Verification

- A **montage `snapCheck`** of all looks tiled, baseline under
  `web/shots/models/cards/` — gates geometry/render drift exactly like the soldier
  sheets, and is the "regenerate when the model improves" tripwire (montage goes
  red → re-bake → review → `UPDATE_SHOTS=1` to bless, committing the new PNGs in
  the same change).
- `bake:cards --check` exits non-zero on a stale committed copy (CI gate).
- **compare-screenshots (required):** run
  [compare-screenshots](../../../.claude/skills/compare-screenshots/SKILL.md) on a
  baked portrait (downscaled to `--card-w`) vs a single card cropped from
  `specs/card-bar/assets/reference-tw-cardbar.png` — does the camera framing,
  pitch, crop, and how the figure fills the card match the reference's portraits?
  This is the call on whether the hero shot is right.
- **screenshot-critique (required, last step):** run
  [screenshot-critique](../../../.claude/skills/screenshot-critique/SKILL.md) on
  the montage **and** on a few portraits downscaled to the real `--card-w` pixel
  size — do the classes stay distinguishable when small? Is the framing/pitch
  reading like a hero portrait, not a clipped or top-down shot? An unprimed second
  opinion catches "looks fine at 240px, mush at 64px" before S4 ships it.

## Must stay green

Everything — no app code imports the PNGs yet. `soldier-sheets.mjs` and its
baselines are untouched and must still pass.

## Human review checkpoint

David approves the portrait **framing, pitch, stance, and zoom** against
`assets/reference-tw-cardbar.png` — this is the aesthetic gate (pull the
[aesthetics](../../../.claude/skills/aesthetics/SKILL.md) north-star target). The
key question he answers: *do these read at card size, and do they look like the
reference's portraits?*

## Feedback that would change this slice

- "Too top-down / can't see the face" → lower pitch, raise camera.
- "Tall units clip, short units float" → fix the per-look height framing.
- "Can't tell two classes apart small" → may justify per-class (not per-look)
  bakes, or a tighter crop, or distinguishing the kit.
- "Neutral body reads as the wrong side" → trigger the deferred team-variant bake.
