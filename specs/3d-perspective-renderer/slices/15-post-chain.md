# Slice 15 — Post chain

## Contract unlocked

The final battle read: a disciplined post pipeline (bloom first, refinement only on
evidence) and the **tone-mapping identity decision** (ACES vs AgX) — recorded here
with shots either way. Deps: `11` (and pairs with `12e` for glint); lands before the
campaign question (`16`) so campaign inherits a settled grade infrastructure.

## API seam

`packages/photoreal-renderer/src/post/postChain.ts` on three's node-based
`PostProcessing` (`pass()` + `three/examples/jsm/tsl/display/BloomNode.js`), every
stage toggleable + named in the stats identity fields. Exposure/tonemap stays owned
by `environment.ts` (the preset owner) — post applies it, never re-decides it.

- **15a — bloom.** Threshold-disciplined: sun glint on the sea, sky around the sun
  disc, gold selection glow (aesthetics rule 6) — not a full-frame smear. Pairs with
  `12e`: the glint discipline shots are re-taken with bloom on to prove bloom didn't
  re-break them.
- **15b — refine.** Vignette / AO / TAA **only if evidence demands** (a named artifact
  in a shot: shimmer proven on hardware for TAA, cavity flatness for AO). Each
  addition is its own toggle + shot; default answer is "no".
- **Tone-mapping identity:** render the same three-preset contact sheet under ACES
  (as spiked) and AgX; decide on the shots; record the verdict + rationale in this
  file. The loser is deleted, not left as a flag.

## What the human can run / see

`/battle` with the full stack on; `/renderer/photoreal-battle?post=off` debug param
(lab only) for A/B.

## Verification

- **Visual variable 15a: bloom only.** Crop **`sun-glint`** (the `12e` crop, bloom
  on/off pair). 15b: one crop per accepted refinement, judged against the artifact
  it fixes.
- Tone-mapping decision: full-frame per preset, `compare-screenshots` ACES-vs-AgX
  vs `battle-coastal-vista.jpg` + `target-battle-map.png`; `screenshot-critique`
  ("filmic, not Instagram" — does it read as the reference's photographic register
  without crushing gameplay legibility?). This is a deliberate one-time re-bless of
  every battle baseline (grade shifts everything) — diffed individually.
- Standing gates: perf gate + ledger entry (post passes are the last cost added to
  the headline number), SwiftShader green (post is plain render targets — low risk),
  seating tripwire, campaign byte-identical.

## Must stay green

Standing gates 08b→17. One post chain owner; no pass gains a private grade/bloom.

## Research

three `webgpu_postprocessing_bloom` / `webgpu_postprocessing_traa` examples; AgX-in-
three notes (Blender's default filmic successor — flatter highlights than ACES).

## Human feedback that would change this slice

This is the most taste-sensitive slice — expect a tuning loop with `preview-shots`
(non-blocking, ~5 min per round). David's calls: ACES-vs-AgX, bloom strength, and
whether any 15b refinement earns its cost.
