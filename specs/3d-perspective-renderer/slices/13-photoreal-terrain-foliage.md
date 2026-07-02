# Slice 13 — Photoreal terrain + foliage

## RE-SCOPED (David, 2026-07-02): look + compose ownership → `battle-map-reference`

David restarted `specs/battle-map-reference` in a parallel session. The terrain/
cliff/grass **LOOK** work and the composed master-shot gate this slice was going
to absorb are handed BACK to that spec (its README's substrate-change block
records the division and the contracts it obeys). This slice shrinks to the
**substrate seams the ladder still owes**:

- the terrain/foliage TSL layers stay structurally sound under `09`–`11` (relit
  materials, receive the `10b` aerial hook + `11` shadows) — no *look-matching*
  against the reference here;
- foliage remains ONE instanced owner with published counts, shared with `14b`'s
  LOD/culling infrastructure (`battle-map-reference` builds density/species on
  top of that owner, never beside it);
- file reservation: after `09` lands, `battle-map-reference` owns
  `battle/{terrain,foliage}Layer*` look edits; the ladder's later slices touch
  them only through the shared hooks.

The original contract below is kept for reference; treat its look/compose gates
as `battle-map-reference`'s now.

## Contract unlocked (original, pre-re-scope)

The ground register of `assets/target-battle-map.png` (copied into this spec from
`specs/battle-map-reference/` — the north star): PBR ground, grass **at density**,
cliffs/scenery, and the ladder's first composed full-vista judgment. This slice
**supersedes `specs/battle-map-reference`'s 03B4* grass ladder on the new substrate**
(see Coordination). Deps: `10` + `11` (receive haze + shadows); parallel with
`12`/`14`.

## API seam

- **13a — ground PBR splat.** `packages/photoreal-renderer/src/battle/terrainLayer.ts`:
  albedo/normal/roughness layers (dry olive grass / earth / rock / sand) driven by the
  sim tint grid + slope/height blending, triplanar on steep slopes; receives CSM +
  aerial. **Neutral albedos** — light comes from `09`/`10`, never baked in. Assets:
  CC0 (ambientCG / Polyhaven) baked to repo-sized textures. Trampled-earth hooks
  reserved (aesthetics rule 5, later content work).
- **13b — grass at density.** `foliageLayer.ts` (the ONE instanced foliage owner,
  grass + trees, shared LOD): instanced TSL blades consuming the **grass-field data
  contract from battle-map-reference `03b1`** (packed attributes, slope eligibility,
  coverage floors — the one accepted artifact of that ladder), wind via the owned
  `uTime`, sun/haze-lit shading with cheap translucency, near-blade / mid-card /
  far-color-in-terrain LOD bands. Sun-bleached olive, not meadow green (rule 3).
  **Required reading: the 03B4* rejection ledger** (cards = speckle, shells =
  invisible, carriers = straw islands, close-hero crop diagnosis) — do not re-run
  rejected experiments on the new substrate.
- **13c — scenery/cliffs.** Cypress/olive trees, rocks, cliff-face/ridge backdrop
  (rule 7) as instanced PBR meshes casting CSM.
- **13d — reference compose.** A highland-valley fixture framed like
  `assets/target-battle-map.png` — the ladder's first *composed* gate; this absorbs
  `battle-map-reference`'s `08-reference-map-compose` acceptance shape.

## What the human can run / see

`/battle` on a highland map; `/renderer/photoreal-battle`; the `battle-grass-field`
and `battle-map-reference` scene framings re-pointed at the photoreal world.

## Verification

- One visual variable per sub-slice, named crops in NEW scene
  `web/scenes/battle/photoreal-terrain.mjs`: 13a **`ground-mid`** (midfield band),
  13b **`grass-near`** (lower-third foreground) + **`mid-meadow`**, 13c
  **`ridge-backdrop`**, 13d **full frame**. Out of scope per crop: sky/haze (`10`),
  sea (`12`), soldiers (`14`).
- 13d: `compare-screenshots` vs `assets/target-battle-map.png` — the standing north
  star; "less wrong" per crop first, composed verdict last. `screenshot-critique`
  as the last check on every shot.
- **Perf gate with dense foliage is the second headline re-run** (after `11`) —
  counts asserted in stats so density can't silently shrink to pass; ledger entry.
- Seating tripwire `match=true` (terrain *visuals* change; heights are CPU/sim-side
  and must not). Existing `web/tests/grassField.test.ts` stays green (the data
  contract survives; the renderer consuming it changed).
- Standing gates: battle suite, campaign byte-identical, deliberate re-bless.

## Must stay green

Standing gates 08b→17. Foliage stays ONE instanced owner shared with LOD — not
per-species passes accreted over time (README invariant).

## Coordination (needs David's confirm — flagged in README)

`specs/battle-map-reference` is **PAUSED / re-scoped to target definition**: its
target image (copied here), its highland-valley fixture, its environment presets
(landed in `CIVSIM_ENVIRONMENTS`), and its `03b1` grass data contract are inputs;
its compose gate is absorbed as **13d**; its 03B4* grass-architecture ladder is
superseded by **13b**; its baselines are will-move-anyway. This spec owns battle
look surfaces from `08b` on.

## Research

- The battle-map-reference slice archive — primary *negative* research (rejection
  evidence trail under `specs/battle-map-reference/slices/03b4*`).
- Ghost of Tsushima grass, GDC 2021 (instanced-blade architecture at scale).
- TSL triplanar/splat examples; three instancing/foliage `webgpu_*` examples.

## Human feedback that would change this slice

13d is the taste checkpoint: open candidate vs target with `preview-shots`
(non-blocking, ~5 min). Ground palette (olive vs straw) and grass density floor are
David's knobs; a "too lush / too sparse" call re-tunes 13b before 13d re-judges.
