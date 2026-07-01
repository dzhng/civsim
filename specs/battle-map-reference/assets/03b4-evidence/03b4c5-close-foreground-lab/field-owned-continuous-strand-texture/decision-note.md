# B4B1A1Z decision - reject field-owned continuous strand texture

Decision: reject.

The implementation proved a useful seam: `BattleGroundPass` can publish a named
`field-continuous-strand-texture` body domain with zero submitted triangles,
field-owned texture/material bytes, source attachment disabled, and explicit
fiber-frequency telemetry. The focused route gate and new baselines are green.

The visual still fails the close grass body contract. The selected
`continuous-nap-field` candidate replaces isolated flecks/cards with a
domain-spanning diagonal nap, but the crop still reads as a flat green ground
plane with faint scratches. It does not create the target's lower-foreground
vertical blade body, occluding layers, darker pockets, or base/tip depth.

Compare telemetry:

- Against the target close crop, `continuous-nap-field` records
  `edgeEnergyRatio=0.23408` and `parityDistance=0.37502`.
- Against the target close crop, `continuous-nap-fine` records
  `edgeEnergyRatio=0.35048` and `parityDistance=0.37718`.
- Against rejected B4B1A1W material, both variants remain close
  (`parityDistance=0.15`) even though edge energy rises.
- Against rejected B4B1A1Y micro-strand, `continuous-nap-field` is very close
  (`parityDistance=0.05460`, `edgeEnergyRatio=1.23695`).

The unprimed critique rejected the candidates: flat painted plane, wrong
ground-plane perspective, too-faint strand scale, missing bottom-edge foreground
structure, broad smear bands instead of interleaved grass clusters, procedural
regularity, narrow teal-green values, and weak scan readability.

Do not continue to perf, coverage, palette, LOD, camera-relative generation, or
final compose. Continue to
`03b4c5b4b1a1aa-field-owned-foreground-occlusion-blade-layer.md`, which keeps
field ownership but tests the missing variable directly: near-foreground
vertical/occluding blade body over the fixed close lab.
