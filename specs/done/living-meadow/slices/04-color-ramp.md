# 04 — Color / 5-stop ramp

**Track:** grass (on spike winner) · **Variable:** color · **Crop:** mid-field
vertical gradient on a near clump · **Human checkpoint: David sign-off (non-blocking).**

## Contract
The pen's richer vertical color: extend our **3-stop** `MEADOW.blade` (root/mid/tip)
to the pen's **5-stop** ramp `gBase→gLow→gMid→gUpper→gTip` plus `gTrans`/`gSheen`/
`gDry`, reconciled with civsim's Aegean environment presets.

## API seam
`packages/game-renderer/src/battle/meadowPalette.ts` **only** — extend `MEADOW.blade`
via the existing `fromAnchor` scaling (no new palette literal; single-owner rule).
Note the shared `MEADOW.farGrass` also feeds the ground/vista turf — re-bless those
turf snaps in this slice.

## Verification
compare-screenshots vs hero mid-field + screenshot-critique, judged **under both
`golden-hour` and `overcast`** `CIVSIM_ENVIRONMENTS` presets (R6). Re-bless the turf
baselines that consume `farGrass`.

**David sign-off (R6, non-blocking):** open the ramp-under-presets shots with
preview-shots; the open question is *Ghibli warmth vs Bronze-Age Aegean art
direction* — keep albedo neutral, mood in the environment. Give ~5 min; if silent,
choose the more Aegean-compatible ramp, record it, proceed.

## Must stay green
Neutral-albedo principle; ground/vista turf (re-blessed here, not broken silently).

## Delegated
Whether to shift the existing anchor or add a sibling `MEADOW.bladeGhibli` family
(prefer extending the anchor).

## Landed (2026-07-27)

5-stop ramp (base/low/mid/upper/tip + sheen + dry) through the existing
fromAnchor anchors; ground underlayer moved via its owner
GROUND_COVER_COLOR["green-grass"] (the spike's carpet finding) with the ground
vertex-hash test deliberately re-pinned. Ramp stops given a 1.3x luma-preserving
chroma boost after the critique.

Unprimed color critique: **hue family correct** (yellow-green, "unambiguously
closer to the reference than flat olive-gray"), believable natural grass under
BOTH golden-hour and overcast, no baked warmth (Aegean rule holds). Remaining
gap: under-saturation vs the hero (S ~24% vs 30-45%) — measured to be
**lighting/tonemap-dominated, not albedo**: a further 1.3x albedo chroma boost
moved rendered median S by only +0.2pp. The saturation gap is therefore OWNED BY
SLICE 08 (environment preset / optional look-grade on the post owner), keeping
albedo neutral per the locked aesthetic rule.

David sign-off window: opened (hero + 4-preset matrix in Preview), no response
within the window — proceeded on the critique evidence; the call is reversible
via the palette stops.
