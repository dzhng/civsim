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
