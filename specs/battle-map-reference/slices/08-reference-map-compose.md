# Slice 08 — reference-map compose + integration

## Contract unlocked

One map that composes everything — grass, relief, ridge backdrop, sky/haze, distant
water — to frame like the reference, **verified as a real, playable battle** with a
crowd on it, then judged side-by-side against the reference and closed.

## API seam

- Add `highland-valley` to `BATTLE_MAP_CATALOG` in
  `packages/game-renderer/src/battle/mapCatalog.ts`: `id`, `wasmMapId`, `edges`
  (one `cliff`/`mountain` sealed side for the backdrop + one `ocean` side for the
  water), `groundCover: 'green-grass'` (neutral albedo), the default lighting preset
  (`overcast-foggy`, Slice 06), and the height profile for the deep valley (Slice 04).
  Register the matching sim/wasm map id.
- Wire the composition only — no new rendering primitives. The reference framing is
  not a separate camera: the **Slice 01 zoom-coupled camera resolves to the
  reference's low oblique vista at full zoom-in**, so the master comparison is just
  this map captured at max zoom-in.

## What the human can run / see

`renderer/battle-terrain-3d?gate=highland-valley` and a **full battle with a real
crowd** on the map (via the `run` / `verify` skills). The Slice 00 HTML compare now
shows reference vs. final side-by-side.

## Verification

- The full battle **reads at the playable mid zoom** — units, the gold selection
  footprint, and trampled ground stay legible against the grass (aesthetics rule 5) —
  *and* resolves to the cinematic reference vista at full zoom-in.
- Perf within budget with grass + fog + units together, across the zoom range.
- The master **side-by-side comparison shot** is captured at **full zoom-in** (the
  Slice 01 rig's vista framing) under the **`overcast-foggy` preset** (Slice 06) vs.
  `assets/target-battle-map.png` via `compare-screenshots`, recorded as the acceptance
  artifact — plus a **`golden-hour` capture of the same map** to prove the neutral
  albedos also read as warm Aegean (the both-weathers contract).
- Re-bless all affected battle baselines; `change-report` of every moved baseline /
  test for David.

## Screenshot-critique

**Required — the final unbiased verdict.** Does a real battle on this map feel like
the reference (composition, atmosphere, relief, water) *while still reading as a
playable Total War Saga Aegean fight* in the warm palette — neither cold-grey nor
neon-green?

## Must stay green

The whole battle suite (`bun run scenario:renderer`), `full-game-rendering-performance`,
`scripts/test-mechanics`, `scripts/test-scenarios`; render-graph `ok`.

## After it lands

Run `review` on each slice's diff, then `close-spec` to archive this plan into
`specs/done/` as a rationale record.

## Human feedback that would reshape this slice

Any composition element still off — water position, range silhouette, grass-to-hill
ratio, camera framing — loops back to the **owning slice**, not this one. This slice
is composition, not new primitives.
