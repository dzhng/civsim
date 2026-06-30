# Slice 05 — ridge backdrop

## Contract unlocked

The reference's defining feature: tall, layered, receding ridge-walls with pale
light/snow streaks hazing into the distance — replacing today's shallow,
edge-bound peaks. Rendered as **presentation**, never passability.

## API seam

Rework the cliff/mountain path in `packages/game-renderer/src/battle/horizonPass.ts`
(`buildEdge`), or split out a `BattleBackdropPass`:

- Emit a far panoramic range with **multiple receding depth rows** (`peak()` /
  `buildMountainMesh`), sharp near crags + soft far ridges, each row hazing further
  back. Steeper faces and upper-face light/snow streaking for the reference's
  silhouette; unbroken skyline rather than a sawtooth fence.
- Keep the `STONE`/`HAZE` mixing, but the crag albedo is **neutral limestone-grey**
  and the haze/horizon tint comes from the **Slice 06 environment preset** (warm
  under golden-hour, cool under overcast) — don't bake a fixed warm or blue-grey
  constant into the rock.
- Decouple the backdrop from edge-sealing so it can span an open horizon; **edge
  roles and `edgeSealMismatches` semantics stay untouched.** Typed input roughly
  `{ bounds, field, ringRadius, rows } → mesh`.

## What the human can run / see

`renderer/battle-terrain-3d` on maps whose sealed side is `cliff`/`mountain` (e.g.
`walled-plain` east, `coastal-scrub` east), now showing layered ranges across the
horizon.

## Verification

- `ctx.check`: backdrop present even with all edges `open-fog` (proves it's
  decoupled from sealing).
- `stats.sealedEdges` unchanged; **`edgeSealMismatches` still `[]`** for sealed maps
  (`battle-terrain-blockers` stays green).
- Pixel metric for mountain-band height + the top-down haze gradient (no sky
  punching between peaks); snapshot.

## Screenshot-critique

**Required:** does it read as receding ranges with real atmospheric depth, like the
reference — and is the haze *warm* per aesthetics, not a flat blue-grey fence?

## Must stay green

`battle-terrain-blockers` (sealed cliffs/walls/ocean unchanged), edge-seal
validation; render-graph `ok`.

## Human feedback that would reshape this slice

Range height; number of depth rows; silhouette sharpness; how aggressively the far
rows haze; warm-grey vs. blue-grey (ties back to Q1).
