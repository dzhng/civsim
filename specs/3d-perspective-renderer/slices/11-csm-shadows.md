# Slice 11 — Cascaded sun shadows (CSM)

## Contract unlocked

Real cast sun shadows ground the world — the spike's biggest flagged gap ("no
shadows/contact occlusion" on both prongs). Soldiers, trees, scenery, and terrain
cast/receive; the **`08a` blob-shadow parity stand-in is deleted** (a net deletion —
battle's `SoldierShadowDecalPass` usage died at `08b`; the class survives for
campaign until `16`/`17`).

## API seam

`packages/photoreal-renderer/src/battle/shadowRig.ts` —
`configureSunShadows(sun, mode)`, `mode ∈ 'csm' | 'single' | 'off'`, chosen by an
adapter capability probe and **published in the stats identity fields**.

- **Replication spike required first:** three's `CSMShadowNode` addon
  (`three/examples/jsm/csm/CSMShadowNode.js`) — verify it works on `WebGPURenderer`
  @0.185 with node materials, z-up, and our world scale. Record the verdict in this
  file.
- **Fallback plan:** a hand-rolled 2–3 cascade orthographic rig **fit to the
  `camera3d` frustum** — we own the camera math, so split computation is easy and the
  cascades track the rig's zoom curve exactly.
- Overcast preset softens/reduces sun shadows via `environment.ts` (lighting is an
  environment, not a material). Bias/peter-panning/acne tuning; shadow distance fades
  into the `10b` aerial haze; grass may receive nearest-cascade only.

## What the human can run / see

`/battle` — soldiers/trees cast real contact shadows at every zoom;
`/renderer/photoreal-battle?shadows=off` debug param on the lab route only.

## Verification

- **Visual variable: cast/received sun shadows.** Crop **`shadow-contact`** (soldier
  feet + tree line at mid zoom) in NEW scene `web/scenes/battle/photoreal-shadows.mjs`.
  Critique must confirm contact grounding without acne/peter-panning. Out of scope:
  soldier materials (`14`), contact AO (`14c`).
- `compare-screenshots` vs `battle-formations-melee.jpg` and `battle-coastal-vista.jpg`
  (long warm shadows). `screenshot-critique` last.
- **Perf gate re-run is the HEADLINE here** — shadow passes at 30k + foliage are the
  expected biggest frame-time jump of the ladder. Record the shadow-pass ms split in
  the ledger; cascade count/resolution and caster LOD (exclude far tiers beyond
  cascade 1) are the tuning knobs; total stays ≤ 33 ms.
- **SwiftShader fallback proven by scene:** depth-array + per-cascade compare is the
  named CI risk — the SwiftShader run uses `mode:'single'` (1 cascade, low res),
  renders green, and the scene asserts which tier ran. Hardware asserts `'csm'`.
- Standing gates: seating tripwire, campaign byte-identical, battle suite, deliberate
  re-bless (shadows shift most battle baselines — expected, diffed individually).

## Must stay green

Standing gates 08b→17. The blob-shadow stand-in must be **gone** at the end of this
slice — grep `packages/photoreal-renderer` for it (scaffolding ledger row closed).

## Research

- NVIDIA Cascaded Shadow Maps paper (README source list).
- three `webgl_shadowmap_csm` example + `CSMShadowNode` source; `webgpu_shadowmap_*`
  examples.
- MJP shadow-sample notes (bias/filtering).

## Human feedback that would change this slice

Cascade count/resolution vs perf trade; PCF softness at gameplay zoom (too-crisp
shadows read miniature, too-soft read overcast). Open a before/after with
`preview-shots` (~5 min, non-blocking), decide on evidence, record, proceed.
