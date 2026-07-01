# Slice 6 — Environment relight + overcast preset

The proof of the whole feature: flipping one data object recolours sky + sea + land +
blockers together — cool, flat, high-key, HEAVY fog swallowing layered ranges — over the
**same** albedos. "Lighting is an environment, not a material."

This slice has two parts: (a) the **value-preserving relocation** of the land grade + sun
into the env (golden stays byte-identical), which is what lets overcast be data-only; then
(b) the **overcast** preset itself.

## Contract unlocked
`?env=overcast` swaps the entire battlefield's atmosphere with no shader edits — the mood is
data. Golden is unchanged; overcast matches `battle-overcast-highland`.

## API seam (module / functions / data / ownership) — owner: game-renderer/battle
- **(a) Relocate, value-preserving for golden:** move the ground's `warmKey/coolFill` grade
  into `env.keyColor/fillColor` and the land + blocker **diffuse sun** onto the env sun
  (either an injected `BATTLE_SUN` const or `sunDirection()` with `shell.setSun(env.sun…)`).
  Golden's env `keyColor/fillColor/sun/exposure` are set to today's exact values so golden is
  **byte-identical**. (The three near-identical suns unify here; if golden shifts sub-percent,
  it is a documented, grouped, intentional re-bless — the alternative of doing it in S1 was
  rejected as spending a re-bless on a non-feature variable.)
- **(b) `BATTLE_ENVIRONMENTS.overcast`:** cool, near-white high-key `skyZenith ≈ skyHorizon`
  (flat sky), cool `hazeColor`, **short `aerialFar` / high fog strength** (heavy fog), cool
  `keyColor/fillColor`, higher `exposure`, low warmth sun. No new surface code — every
  surface already reads the env from S2–S5.
- `routeBattleTerrain3d` `?env=overcast` selects it for clear/sky/sun/all passes.

## What the human can run / see
`/renderer/battle-terrain-3d?gate=river-and-crags&env=overcast` (and other maps);
`battle-atmosphere?env=overcast`.

## Verification gates
- **New** overcast baselines (`battle-terrain-3d/*-overcast`, `battle-atmosphere/overcast`,
  `battle-terrain-blockers/*-overcast` — add an `env` loop to the scenes). **Golden baselines
  from S2–S5 stay green/unchanged** (adding a preset must not touch golden) — this is the
  value-preserving-relocation gate.
- **`compare-screenshots`** vs [`../assets/battle-overcast-highland.png`](../assets/battle-overcast-highland.png)
  on the **full frame** and the **layered-range band** (flat near-white sky, heavy fog
  swallowing ranges, pale water sliver).
- **Same-albedo assertion:** a near-field grass crop's base hue under overcast matches the
  golden shot's near grass (proves it's the light, not a reskin).
- **Last check (required): `screenshot-critique`** on both crops: "is this the same world
  under overcast light, or a different art style?"
- Six `water-*.mjs` byte-identical throughout.

## Slice variable & crop
**Variable:** the whole overcast mood + fog depth (the compose slice for the preset system).
**Crop:** full frame + the fogged layered-range band; plus a near-grass swatch for the albedo
check. **Frozen inputs:** the albedos (grass/rock/water/sand), golden's numbers.

**Out of scope:** soldier/model materials under overcast (a later concern); dusk (lab-only).

## What must stay green
All golden snapshots from S1–S5 (unchanged); six `water-*.mjs`; seating.

## Human review checkpoint (NON-BLOCKING)
[`preview-shots`](../../../.claude/skills/preview-shots) golden vs overcast side by side
(and each vs its reference); ~5 min; if silent, decide on the evidence, record the overcast
numbers + rationale here, close the shots, and proceed.

## Feedback that would change this slice
"Overcast looks like a different game" → the albedos moved; the mood must be env only.
"Golden changed" → the relocation isn't value-preserving; match the numbers. "Fog too
thin/thick" → tune `aerialFar`/fog strength, not the albedo. "Grass still warm under
overcast" → the ground grade isn't reading `env.keyColor/fillColor`.
