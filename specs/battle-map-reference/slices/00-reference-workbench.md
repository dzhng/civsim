# Slice 00 — reference workbench (target lock)

## Contract unlocked

A shared, human-reviewable scorecard plus **neutral-albedo target swatches and the
lighting-preset plan** that every later slice is critiqued against. Resolves grilling
Q1 (neutral albedos + which lighting presets to ship) on a real surface before any
shader is written.

## API seam

No renderer change. Pure spec/asset work:

- `assets/target-battle-map.png` — the reference (already copied into this spec
  folder per the `feature-slicing` "copy the reference into the spec folder" rule).
- `visualizations/target-vs-current.html` — a side-by-side showing **today's**
  battle render (capture from `renderer/battle-terrain-3d?gate=<map>`) beside the
  reference, plus the **neutral-albedo** swatch strip (grass/rock/water/sky base
  colors judged under neutral light, *not* golden-hour-tinted) and a note of the two
  target lighting presets (`overcast-foggy`, `golden-hour`). See the README "central
  tension" section: light is an environment layer, materials are neutral.

**Ownership:** the HTML is review scaffolding owned by this spec, not product code.

## What the human can run / see

Open `visualizations/target-vs-current.html`: current battle render vs. the
reference vs. the neutral-albedo palette strip. The gap is now visible, and the
albedo/preset split is concrete instead of abstract.

## Verification

- David signs off on the **neutral albedos** and the **preset list / per-map default**
  (grilling Q1); the decision is recorded in the README "Next Agent Prompt" so a fresh
  agent inherits it.
- No code gates — this slice touches no renderer code.

## Screenshot-critique

Run an unprimed `screenshot-critique` on the HTML compare board: do the swatches read
as believable **neutral-light** base colors (so they can go warm under golden-hour or
cool under overcast), or have they drifted — baked amber, clinical cold-grey, or neon
green?

## Must stay green

Everything — no code is touched.

## Human feedback that would reshape this slice

The neutral albedos themselves, and the preset decisions (how many presets, which is
`highland-valley`'s default) — both flow into the color slices (grass 02, ridge 05)
and the lighting slice (06), which is why this is the blocking first rung.
