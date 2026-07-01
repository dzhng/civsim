# Slice 3 — Sea dissolves into the sky (golden)

Closes the [water spec's](../../done/water/README.md) named caveat: the battle sea's far
edge melts into the Slice-2 sky with no hard line and no warm-grey/sky colour mismatch —
achieved by identity, not shader surgery.

## Contract unlocked
The battle open sea's far edge dissolves into the sky's horizon colour. `battle water haze
== env.hazeColor == skyHorizon`, so the caveat (water haze warm-grey vs sky) is gone — on
the battle path only.

## API seam (module / functions / data / ownership) — owner: game-renderer/battle
- Set golden `env.hazeColor` to the sky-horizon-matched value, and have
  `battleWaterEnvironment(env).hazeColor = env.hazeColor`. That flows into the battle ocean
  `WaterPlanePass` (built in `horizonPass.ts`) and, for shore consistency, `fieldWaterWgsl(env)`.
- Optionally raise the battle ocean's `BATTLE_OCEAN_RAMP.hazeFar` (in `water/waterShoreRamp.ts`
  — **battle preset only**, not the shared shore ramp fn) so the plane's far edge reaches
  `haze01 ≈ 1` at the visible horizon and fully dissolves.
- **No edit to `waterShade`/`civsimWaterColor`.** The injected `WATER_HAZE` now equals the
  sky horizon for battle surfaces and stays frozen-golden for the lab (separate pipeline).

## What the human can run / see
`/renderer/battle-terrain-3d?gate=coastal-scrub&view=field` aimed at the sea, and
`node web/scene.mjs water-open-sea`.

## Verification gates
- Re-bless `water-open-sea/coastal-sea` and the ocean-edge `terrain-blockers/*` — **change-ledger**.
- A far-seam telemetry check (reuse `water-haze.mjs`'s row-luma technique): the top water
  row's colour approaches `env.hazeColor`, no bright/whiteout band at the sea→sky step.
- **`compare-screenshots`** vs [`../assets/battle-advance-coast.jpg`](../assets/battle-advance-coast.jpg)
  on the **horizon band** (soft hazy horizon, pale shallows).
- **Last check (required): `screenshot-critique`** on the horizon-band crop: "does the sea
  melt into the sky, or is there a line/colour jump?"
- **Load-bearing firewall:** the six `web/scenes/system/water-*.mjs` MUST stay
  byte-identical (the lab plane uses the frozen env — this is the proof the battle/lab
  water paths are separate). `water-coastal` near-shore checks stay green (haze ≈ 0 at the
  shore).

## Slice variable & crop
**Variable:** the sea→sky seam (softness + haze-hue match). **Crop:** the horizon band where
the ocean plane meets the sky. **Frozen inputs:** the frozen water look (`civsimWaterColor`,
the six lab scenes), the sky (S2), near-shore water.

**Out of scope:** land haze (S4), blocker haze (S5) — those horizons may still mismatch.

## What must stay green
Six `water-*.mjs` (byte-identical); `water-coastal`; seating; the sky (S2 unchanged).

## Feedback that would change this slice
"Still a warm-grey line at the horizon" → `env.hazeColor` doesn't equal `skyHorizon`, or the
plane's `hazeFar` doesn't reach the visible edge. "A lab water scene moved" → the battle env
leaked into the `shoreX == null` path; keep them separate.
