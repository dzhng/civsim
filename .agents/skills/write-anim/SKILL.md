---
name: write-anim
description: Review a model's MOTION as a looping, review-only GIF — pose one asset through its cycle with no sim and eyeball the rhythm. Covers the unit animation cycles (walk/run/attack/hit/die per class) today, and is the home for any future single-asset motion (scenery sway, banners, fire). Use when adding or changing a model's animation, retiming a cycle, or eyeballing how a motion reads. Distinct from write-vibe (sim behaviour over time) and write-model-sheet (the static look).
---

# Animation review

`web/shots/models/scripts/soldier-animation.mjs` poses a SINGLE model through an animation cycle — no sim — and
writes a looping GIF you watch frame by frame. It answers "does this model's
motion read right?", a different question from the sim's emergent behaviour
([write-vibe](../write-vibe/SKILL.md)) and the model's static look
([write-model-sheet](../write-model-sheet/SKILL.md)).

Both vibe and anim emit GIFs, so it is tempting to reuse vibe for an asset's
motion — **don't.** Vibe boots a matchup and advances *sim-seconds*; a pure
motion loop has no sim. Pose the asset and advance only its clock, which is
exactly what this harness does.

**Review-only.** Unlike the static model sheet, anim writes the GIF directly — no
`snapCheck`, no pixel gate. You re-run and *watch*; there is no baseline to diff.
The GIFs are committed review artifacts (like the vibe timeline GIF).

## Run (units)

1. **Rebuild wasm first** — `npm run build:wasm` from `web/` (the harness loads
   the prebuilt wasm, never live Rust).
2. `node shots/models/scripts/soldier-animation.mjs` from `web/` films the representative class set
   (`[0, 3, 4, 6]`) through every cycle. `ONLY=3 …` picks classes;
   `ANGLE=front …` faces the camera (default is the 3/4 hero view).
3. Shared soldier GIFs land at
   `web/shots/models/shared/soldiers/anim/<id>-<class>-<anim>.gif`. Looping
   cycles run twice for a natural rhythm; `die` plays once (`once: true`).

## Authoring a cycle

Each animation is a list of `{ frame, dt }` pose steps plus a GIF delay, in the
`ANIMS` table in `shots/models/scripts/soldier-animation.mjs` — edit there to add a cycle or retime one.
Walk/run/hit toggle discrete poses; attack/die step through a ladder. The encoder
is the shared `shots/_gif.mjs`; the GIF rules every series follows (~200 ms/frame,
surface it to the user) live in [write-vibe](../write-vibe/SKILL.md).

A new class needs a `NAMES` entry in `shots/models/scripts/soldier-animation.mjs` (it labels the GIF), and the
default run films only the representative set `[0, 3, 4, 6]` — so review a
specific class with `ONLY=<id>`. It also needs a static model sheet — see
[write-model-sheet](../write-model-sheet/SKILL.md).

## Beyond units

Scenery and effect motion — a swaying tree, a banner, fire — is the same shape
(one asset, no sim, a looping GIF) and belongs here when it is added. The harness
enumerates the soldier roster today; a new model family needs its own poser wired
into `soldier-animation.mjs`, not a vibe matchup.

Animation artifacts follow model ownership: battle-only motion goes under
`web/shots/models/battle/anim/`, campaign-only motion under
`web/shots/models/campaign/anim/`, and reusable motion under
`web/shots/models/shared/<family>/anim/`, such as
`web/shots/models/shared/soldiers/anim/`.

Pairs with [write-model-sheet](../write-model-sheet/SKILL.md) (the static twin),
[write-vibe](../write-vibe/SKILL.md) (sim behaviour, and the shared GIF rules),
and [aesthetics](../aesthetics/SKILL.md) (the look every model is judged against).
