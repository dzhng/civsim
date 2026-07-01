# Slice 7 — Live-battle wiring + fold cleanup + close-spec

The atmosphere reaches the actual game, not just the lab route, and the water-env fold is
completed. Then the spec closes.

## Contract unlocked
The live battle (`web/src/battle/renderer.ts`) renders the same environment the lab route
does: a real sky, env-driven clear, env sun, and preset selection. No battle file imports
`WATER_ENVIRONMENTS` directly — all battle water goes through `battleWaterEnvironment`. The
lab keeps `WATER_ENVIRONMENTS` frozen for the six scenes.

## API seam (module / functions / data / ownership) — owner: web/battle
- **`web/src/battle/renderer.ts`:** construct a `BattleEnvironment` (default golden), add the
  sky (the `skyGradient`/`BattleSkyPass` from S2), replace `clear: {0.16,0.24,0.15}` with the
  env sky, `shell.setSun(env.sunAzimuth, env.sunElevation)`, and pass the env to
  `BattleGroundPass`/`BattleHorizonPass` and `battleWaterEnvironment(env)` to the ocean plane.
  Accept an optional preset selector (so a future campaign→battle weather handoff can pass
  overcast; **driving** it from the campaign is out of scope, **accepting** it is in).
- **Fold audit:** grep that no `battle/` file imports `WATER_ENVIRONMENTS`; document `dusk`
  as lab-only in `waterEnvironment.ts`.

## What the human can run / see
The real app: `node web/scene.mjs battle-renderer-visual` (and `battle-renderer-default`),
both presets at the gameplay camera.

## Verification gates
- Re-bless the live-battle visual snapshots (`battle-renderer-*`) under golden — **change-ledger**.
- **All sim/behavior scenes green** (`battle-ai`, `battle-smoke`, `battle-selection`,
  `battle-minimap`, …) — atmosphere is presentation only, it must move no behavior.
- **`compare-screenshots`** full-frame vs both references (golden vs `battle-coastal-vista.jpg`,
  overcast vs `battle-overcast-highland.png`).
- **`review`** skill pass over the whole feature diff before closing.
- **Last check (required): `screenshot-critique`** on both live frames.
- Six `water-*.mjs` byte-identical; campaign + soldier/model sheets untouched.

## Slice variable & crop
**Variable:** live-battle atmosphere end-to-end (the legitimate whole-frame compose slice).
**Crop:** the full live-battle frame + the horizon band.

**Out of scope:** driving overcast from campaign weather; soldier relight.

## What must stay green
Every sim/behavior scene; six `water-*.mjs`; campaign; soldier/model sheets.

## Close
When live parity is verified and green, run [`close-spec`](../../../.claude/skills/close-spec)
to archive `specs/battle-atmosphere/` → `specs/done/` as a rationale record (the one-env
seam + adapter; sea→sky by identity; the shared `battleAerial` helper; the sun-scoping
decision; overcast-as-data proof), keeping the three reference images as visual provenance.

## Feedback that would change this slice
"A behavior scene moved" → the atmosphere touched more than presentation; it must be
colour/sky only. "Live looks different from the lab route" → an env value or the sky pass
isn't wired the same way. "Still imports WATER_ENVIRONMENTS in battle" → finish the fold.
