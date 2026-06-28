---
name: write-vibe
description: A vibe is one battle matchup filmed as a time series and watched frame by frame — the realism verdict for sim work. Use when authoring or running a vibe scenario, reading a vibe's frames, shipping or refreshing its GIF, or re-blessing vibe baselines after a sim change; and whenever you need to judge whether battle physics "feels right across the whole timeline". Pairs with write-scene (the single-state sibling) and screenshot-regression (the snap mechanics every frame obeys).
---

# Write a vibe timeline

A **vibe** is one matchup filmed as a time series — approach → contact → grind →
break → rout — and watched frame by frame. It is the realism verdict for sim
work: green Rust proves the physics is *correct*; the vibe proves it *feels*
right across the WHOLE timeline (a clash can look clean at t=32s and be a
swirling blob by t=48s). Snapshot mechanics — determinism, freeze, diff,
rebless flow — live in
[screenshot-regression](../screenshot-regression/SKILL.md); this skill is how
you author, run, read, and re-bless a vibe.

## Author a scenario

- Scenarios live in `web/vibe/*.mjs`, registered in `vibe/all.mjs` — a
  `SCENARIOS` array of `{ name, script, env }`, where `env.ATK`/`env.DEF` are
  class ids and the posture/wall flags pick the matchup.
- Copy `vibe/duel-posture.mjs` for a new one. `vibeCapture` (`vibe/_lib.mjs`)
  drives the camera, freezes, and `snapCheck`s every frame — never call
  `snapCheck` yourself inside a vibe.
- `vibe/measure-duel.mjs` is the JS twin of the Rust test — reach for it when
  you need numbers off the same timeline rather than pixels.

## Run

1. **Rebuild wasm first** — `npm run build:wasm` from `web/`. The harness loads
   the *prebuilt* wasm, never live Rust; skip this after a `crates/` change and
   you film a stale binary.
2. Sweep every scenario with `node vibe/all.mjs` from `web/`; one scenario with
   `node vibe/<script>.mjs`.
3. Frames land at `web/shots/vibe/<scenario>/t###s.png`.

## Read EVERY frame, in order

Open `t000s.png` onward and describe what each shows before drawing any
conclusion. Do NOT sample two or three and infer the story between them — the
in-between frames routinely tell a different story than the endpoints. If a unit
"wins," trace *how* across the frames; never assume it from the final count.

> A "surrounded square sallies out" test: reading only t48 + t72 showed the
> block moving forward and the front enemy dying → "it breaks out of the
> encirclement." Reading every frame showed the square ran off after the *front*
> unit at t12 and the other two attackers never made contact — no encirclement,
> the scenario was broken. Two frames plus a plausible narrative is a confident
> wrong conclusion.

## ALWAYS ship a GIF

Reading frames one by one is how you *diagnose*; a looping GIF is how the user
*watches* the whole sequence at a glance. Whenever the artifact is a time
series, surface a GIF (~200 ms/frame, 5 fps) to the user (`SendUserFile`) —
never hand back a stack of `t###s.png` with no GIF.

- **Vibes do this for free.** `vibeCapture` writes
  `web/shots/vibe/<name>/timeline.gif` every run, downscaled to 640×400 from the
  same screenshots the per-frame PNGs gate on. The PNGs stay the full-res
  regression baselines; the GIF is review-only, committed alongside them (like
  `shots/anim/`). Just point the user at it.
- **Any other series** (an ad-hoc Playwright sweep, a folder of frames you shot
  yourself): `node vibe/gif.mjs <dir> [out] [delayMs=200] [downscale=2]`. It
  orders frames by filename and writes `<dir>/timeline.gif`. Name frames so they
  sort.
- The encoder is `vibe/_gif.mjs` (`encodeGif` / `downscaleRGBA`,
  dependency-free — no ffmpeg/imagemagick on this box). Call it directly for a
  bespoke series.

## Re-bless

A mechanics change turns frames red — that's the point. Once the new behavior is
confirmed, re-bless with `UPDATE_SHOTS=1` and commit the baselines as the
record.

- A full re-bless clears the scenario's baseline folder before writing, so a
  shorter regenerated timeline cannot leave stale old frames behind.
- A timeline re-bless **refuses** `UPDATE_SHOTS=1 SNAP=...`: a filtered regen
  would clear the folder and then skip frames, leaving gaps. Unset `SNAP` and
  re-bless the whole timeline.

Pairs with [screenshot-regression](../screenshot-regression/SKILL.md) (the snap
mechanics every frame obeys), [write-scene](../write-scene/SKILL.md) (the
single-state sibling), [write-turntable](../write-turntable/SKILL.md) (static
model review) and [write-anim](../write-anim/SKILL.md) (model-motion review) under
`vibe/`, and [tweak-mechanics](../tweak-mechanics/SKILL.md) (the physics work a
vibe is the verdict for).
