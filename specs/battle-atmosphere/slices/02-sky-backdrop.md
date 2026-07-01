# Slice 2 — Sky / horizon gradient backdrop (golden)

The first visible payoff: the flat clear becomes a real graded Aegean sky the far terrain
and sea recede into. Rule 1's "give it a sky and a horizon."

## Contract unlocked
A single vertical sky gradient (`skyZenith → skyHorizon`) fills the frame behind all
geometry; the dark-green/pale-blue flat clear is gone. The env is the sky authority every
later dissolve targets.

## API seam (module / functions / data / ownership) — owner: renderer-core (generic) + game-renderer/battle
- **Recommended:** extend the background underpaint so `drawFrame` accepts a generic
  `skyGradient?: { zenith: [3], horizon: [3] }` painted as a screen-space vertical gradient
  where the flat `clear` is today, **before** the builtin `terrainBackdropRect` grass quad.
  It carries caller-supplied colours only — no battle knowledge — so renderer-core stays
  campaign-safe. `routeBattleTerrain3d` passes `{ zenith: env.skyZenith, horizon: env.skyHorizon }`.
- **Fallback (if the underpaint seam is awkward):** `battle/skyPass.ts` `BattleSkyPass(env)`,
  a `phase:'background', role:'background-underpaint'` full-screen gradient drawn **first**
  in the background pass list. MSAA-safe (`gpuMultisample(shell.sampleCount)`).
- Golden `skyZenith`/`skyHorizon` chosen to read as the reference's pale gold-to-blue sky,
  with `skyHorizon == env.hazeColor` (the colour S3–S5 dissolve into).

## What the human can run / see
`/renderer/battle-terrain-3d?gate=coastal-scrub&view=field&env=golden` — sky above the far
terrain silhouette; near ground unchanged.

## Verification gates
- New scene `web/scenes/battle/battle-atmosphere.mjs` snapping the golden gameplay frame
  (`battle-atmosphere/golden`); re-bless `battle-terrain-3d/*`, `battle-terrain-features/*`
  (their open edges/top now show sky) — **change-ledger** the re-bless.
- **`compare-screenshots`** vs [`../assets/battle-coastal-vista.jpg`](../assets/battle-coastal-vista.jpg)
  on the **sky band only** (pale gold-to-blue, warm hazy horizon).
- **Last check (required): `screenshot-critique`** on the sky-band crop: "does this read as
  a sun-drenched Aegean sky, not a flat gradient fill?"
- The six `water-*.mjs` stay byte-identical; `battle-terrain-elevation` seating byte-identical.

## Slice variable & crop
**Variable:** the sky gradient colour/shape. **Crop:** the top third, above the far terrain
silhouette. **Frozen inputs:** everything below the horizon (land/sea haze are S3–S5).

**Out of scope (explicitly, do not fix here):** the sea→sky dissolve seam (S3), far-land
haze (S4), blocker haze (S5) — the frame will still show mismatched horizon greys below the
sky; that is expected.

## Verification the sky sits right
Resolve the known unknown: does a screen-space gradient line up with the far terrain/sea
edge across the battle pitch/zoom and `view=west/east`, or is a projected world-space
horizon needed? The dissolve is carried by aerial haze (later slices), so screen-space is
the hypothesis — escalate to world-space only if the band is visibly wrong.

## What must stay green
Six `water-*.mjs`; seating; campaign scenes (renderer-core change must be a generic,
opt-in `skyGradient` that campaign does not pass).

## Human review checkpoint (NON-BLOCKING)
[`preview-shots`](../../../.claude/skills/preview-shots) the golden sky frame next to
`battle-coastal-vista.jpg`; give ~5 min; if silent, decide on the evidence, record the
sky-colour decision + rationale here, close the shots, and proceed.

## Feedback that would change this slice
"Sky reads flat/webapp-gradient" → widen the zenith→horizon spread, warm the horizon.
"Horizon band doesn't line up with the terrain edge" → escalate to world-space horizon.
"Campaign map changed" → the `skyGradient` leaked; make it strictly opt-in.
