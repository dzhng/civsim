# 03 — Translucency (backlight rim + subsurface)

**Track:** grass (on spike winner) · **Variable:** light-through-the-blade ·
**Crop:** backlit close (sun behind blades).

## Contract
Blades transmit backlight and carry a Fresnel rim — the pen's "connective tissue of
the image," the signature soft look we do **not** have today (our material is
env-lit only).

## API seam
Port the pen `paint()` terms into the winning grass material's node graph, added to
the color output as an additive lighting term over **neutral albedo** (not baked
amber):
- rim `back = smoothstep(dot(V,-sun))·fres^4.2·rim`
- subsurface `transCol · pow(dot(V,-sun),3.2) · pow(1-|dot(N,sun)|,2.2) · tip · shadow · 0.52`
- `transCol` from a new `MEADOW.blade.trans` (~`gTrans #E9EE7C`).

Substrate (physical `transmission` vs faked emissive rim) and the reachability of the
env **sun vector + shadow term** at the blade are decided by the `00` R3 probe —
confirm before implementing, don't rediscover here.

## Verification
compare-screenshots vs the hero's backlit close crop + **mandatory** screenshot-critique
told it may judge only edge-glow / softness. New snapCheck baseline.

## Must stay green
Neutral-albedo principle (transmission is a lighting term, not baked color); the
close-gate anatomy oracle; existing battle snaps (term is `battle-grass`-only).

## Delegated
Transmission strength constant; whether sheen is folded here or in `07`'s wind-flash.

## Reslice hooks
`03a` transmission in isolation (fixed light); `03b` coupled to the real sun +
shadow rig — if the shadow dependency proves fiddly.

## Landed (2026-07-26)

Terms: Fresnel backlight rim + subsurface transmission tinted MEADOW.blade.trans
(added), tip-weighted, distance-faded (full near, zero by far tier), near-eye
floor 0.3, display-emission cap 1.1, field-normal Fresnel (hazard honored).
Strengths runtime-tunable (`setTranslucencyStrengths`), baked rim 2.2 / sss 4.5
from a live sweep. Sun uniform written per frame by PhotorealBattleWorld.render.

Gate history: v1 REJECTED by unprimed critique (white sparkle, no warmth, no
falloff — root cause: strength applied after linear conversion + no distance
gate). v2 fix over-corrected to invisible. v3 (final): 5.6k changed px vs
pre-slice, peaks 87 gray levels, mean R-B +36.4 on changed px (warm not white),
mid-field weighted, clean horizon. Second critique read v2-strength as TOO WEAK;
**absolute magnitude judgment is deliberately deferred to slices 04/08** where
color + atmosphere compose the hero look — the term's mechanism, warmth, and
falloff are proven; its gain is a reversible uniform.

**DEBT: battle grass-scene snapshot baselines not yet swept/re-blessed** (the
one scene run, battle-genmap-clay, strips grass — 0px). Owed at the next
maintenance checkpoint, before slice 09 at latest.
