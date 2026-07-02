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

## STATUS (2026-07-03): DONE — bloom + AgX; 15b refine = no

**Owner.** `packages/photoreal-renderer/src/post/postChain.ts` — `BattlePostChain`
on three's node post pipeline (`RenderPipeline`, the r183 rename of
`PostProcessing`): one `pass(scene, camera)`, one `bloom()` stage, then three's
`renderOutput` applies the ONE tone-map + output transform at the tail
(`outputColorTransform` default). Installed via `world.post` (a minimal
`WorldPostRenderer` seam so `world.ts` owns no post dependency); every lab/production
battle world gets it (`PhotorealBattleWorld` constructor → `world.post`). Stages are
toggleable and named in the stats identity (`renderStats.post = { owner, enabled,
bloom{enabled,strength,radius,threshold}, tonemap }`), published on BOTH the lab
route and the production `BattleRenderer.stats()`. Lab A/B knobs: `?post=off` (bypass
the chain), `?bloom=off` (drop only the bloom stage).

**Exposure/tonemap ownership.** Unmoved: `environment.ts` sets `toneMappingExposure`
per preset; `world.ts` owns the ONE operator (`BATTLE_TONE_MAPPING`). The scene
passes render `NoToneMapping` and the grade is applied exactly ONCE at the chain
tail — no double-tonemap of the already-linearized overlays (the slice-09 lesson
holds; verified bloom-off ≡ post-off at tactical framing, and the mid-tone crowd/sky
baselines moved sub-threshold).

**15a bloom — constants: strength 0.06, radius 0.30, threshold 1.0.** Threshold is
LINEAR-HDR luminance (BloomNode's highpass keys off `luminance(sceneColor)` pre-tone,
smoothWidth 0.01 ≈ hard cut), so 1.0 sits just above a fully sunlit diffuse surface:
only genuine emitters spill — the sky sun disc and the disciplined GGX sea glint. The
first spike (strength 0.18 / radius 0.7) blew the low sun into a full-frame white wash
(synthwave); 0.06/0.30 is the sun-drenched register (a soft warm sun halo + enriched
glint, mountains still read). Overlay/UI exclusion: the in-scene tactical overlays
(gold selection glow ground-cue, effect lines, far-LOD marker impostors, debug tris)
carry display-referred colours that sit BELOW the linear bloom threshold once
linearized, so they never bloom — no scene split needed; the true HUD (DOM cardbar)
composites outside the WebGPU canvas and is categorically unreachable by the chain.
The gold selection glow is thus preserved, not re-washed (slice-09 concern honoured).

**12e pairing PROVEN.** New scene `web/scenes/battle/photoreal-post.mjs` re-takes the
12e `sun-glint` crop at the SAME golden-hour vista with bloom ON and OFF
(`photoreal-post/{sun-glint-bloom,sun-glint-nobloom,post-hero}`). Bloom enriches the
track (hotFraction 0.0235→0.0267) yet stays UNDER the recorded 12e tripwire
(`hotFractionMax` 0.07) and concentrated in the reflected-sun band (centerShare 0.80
≥ 0.60). Bloom did not re-break the disciplined glint. `photoreal-sea` re-blessed and
green under the new grade (glint hotFraction 0.0267 < 0.07; shore sand/turquoise/deep
all present).

**Tone-mapping identity — VERDICT: AgX (ACES deleted, not flagged).** Matched
per-preset shots (sea vista + golden-hour field + overcast) rendered under ACES and
AgX, judged against `assets/battle-coastal-vista.jpg` + `battle-overcast-highland.png`.
AgX carries the reference's warm golden-hour cast with a soft highlight rolloff on the
sun disc / sea glint and lower far-distance contrast (true aerial perspective, and it
lifts shadows per aesthetics rule 2); ACES read cooler, punchier, over-saturated — the
"Instagram" look the slice warns against. Confirmed by a BLIND second reviewer (Option
A/B, operators hidden): "Option B [AgX] is less wrong… warm amber cast across sky,
field and distant haze, the sun column rolls off more gently… clearly closer to the
reference." Legibility cost (slightly muted team pips) is acceptable — blue vs red stay
unambiguous — and is a team-colour-layer concern, not the grade's. `BATTLE_TONE_MAPPING
= AgXToneMapping` in `world.ts`. Same-materials litmus: the operator is one engine-wide
constant, applied identically to every preset by the one chain tail.

**15b refine — NO.** Default answer held: no shot surfaced a named artifact demanding
vignette / AO / TAA. (AO already exists as 14c's analytic contact grounding; a
post-AO would double-own it. TAA on the byte-stable snapshot harness is a determinism
hazard and no on-hardware shimmer was proven. Vignette earns nothing.) None earns its
cost; none added.

**Screenshot-critique (last visual check, unprimed).** On `post-hero`: CONFIRMED the
slice deliverables — "bloom size/spread around the sun is restrained — no giant
screen-washing smear"; "faction colors are not crushed together; blue vs red is still
separable"; foreground sea "reads believably as a sunlit sea." Its other notes
(cool/desaturated register, milky background haze, white-not-gold sun core, a
speckle-shimmer on the shoreline grass) are OUT of slice-15 scope — the haze is the
10b aerial owner, the sun tint is 10a's sky model, and the grass sparkle is the
reserved foliage LOOK (confirmed pre-existing: present with bloom OFF, so not a post
artifact). The desaturation is the deliberate AgX trade-off the blind A/B validated;
final warmth/bloom-strength taste is David's per the loop above.

**Perf (hardware, `apple / metal-3`, budget 33 ms).** Before (14b) 3.63 mid / 3.59
vista; after (post landed) **4.73 mid / 7.89 vista** median GPU ms — the full-screen
bloom pyramid is the added cost (+1.1 / +4.3 ms), comfortably in budget.

**Re-bless (deliberate, diffed individually).** AgX≡ACES on near-white highlights
(both clip the bright sky to white → 0.00% on sky-band crops) and sub-threshold on
mid-tone crowd/tactical content (0.1–0.9%, within the deliberate snap tolerance → not
re-blessed); the grade shifts hard only on saturated/specular surfaces. **7 baselines
re-blessed:** `photoreal-sea/{sea-horizon,sea-mid,shore-line,sun-glint}` +
`battle-smoke/{battle-initial,battle-banner,battle-manual}`; **3 new:**
`photoreal-post/{post-hero,sun-glint-bloom,sun-glint-nobloom}`. Seating tripwire
`battle-terrain-elevation` match=true (sim firewall intact). `battle-photoreal-shadows`
grove presence-proxy floor relaxed 1.5→1.2 (AgX lifts shadows per rule 2; delta 1.37,
mechanism still holds — grove darkens, `?shadows=off` removes it). **Out of scope /
NOT mine:** `water-coastal` + `water-open-sea` fail on the base commit e8e3d834 too
(bespoke `battle-terrain-3d` route, proven pre-existing by a stash re-run — the
calm-sea commit's legacy water), and a one-off `battle-selection` dpr1 drag-box flake
(passed on re-run).

**Gates:** typecheck clean; `test:unit` 71/71; SwiftShader photoreal-post +
photoreal-sea + photoreal-{sky,lighting,shadows,parity} + battle-terrain-elevation +
production battle scenes green; hardware perf green; campaign untouched.
