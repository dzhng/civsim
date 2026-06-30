# Slice 07 — distant water

## Contract unlocked

The pale water inlet at the reference's right mid-distance, rendered
a **neutral turquoise albedo** per aesthetics rule 4 (tan → turquoise → blue), tinted
by the Slice 06 lighting preset and hazing into the Slice 06 horizon — completing the
valley.

## API seam

Reuse the existing water path, don't build a new shader if the existing one
suffices under the new fog:

- The `ocean` edge role + graded water apron in
  `packages/game-renderer/src/battle/horizonPass.ts`, and/or the ground water tint.
- Expose a presentation hook so a map can place a far water band on **one side**
  without it being a sealed `ocean` edge — driven from `BattleTerrainPresentation` /
  edge roles.

## What the human can run / see

A map with an `ocean` sealed side (`river-and-crags` east, `coastal-scrub` west)
plus the new `highland-valley` map (Slice 08).

## Verification

- `waterQuads` / `ocean` role present; the water grades shallow → deep → haze with
  **no bright seam** at the shore against the new haze (the horizon code already
  worries about this seam).
- Snapshot.

## Screenshot-critique

**Required:** does the water read as the reference's faint, hazed right-edge inlet —
turquoise (cool under the overcast preset, warmer under golden-hour), not a flat grey
sheet — and does it sit *behind* the haze rather than punching through it?

## Must stay green

The coast scenes; `edgeSealMismatches` empty.

## Human feedback that would reshape this slice

Placement; how pale / hazed the water is; which edge it occupies.
