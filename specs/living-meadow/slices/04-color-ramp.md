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
