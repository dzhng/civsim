# 07 — renderer-sediment

**Contract unlocked:** the renderer packages carry no aliases, wrappers,
legacy anchors, dead data, or dead exports. Zero pixels move.

## Items

- `packages/game-renderer/src/environment/environment.ts:165-221`: delete
  `type WaterEnvironment`, `WATER_ENVIRONMENTS`, `waterEnvironmentWgsl`,
  `battleEnvironmentWgsl` (wrappers around `environmentWgsl`, itself unused
  externally), `BATTLE_ALIASES`, and the `resolveBattleEnvironment` synonyms
  no caller passes. Consumers use `CIVSIM_ENVIRONMENTS` and
  `resolveBattleEnvironment` with the ids they actually pass.
- `meadowPalette.ts:8-13 fromAnchor(base, legacy)` and the `@deprecated` tag on
  `blade.root`: after slice 02 recount consumers. If only photoreal reads
  `blade.root`, drop the tag and the legacy anchor and store the resolved
  colours directly (identical values).
- `photoreal-renderer/src/battle/terrainLayer.ts:604-624`: the eight rock/scree
  literals become `MEADOW.rock.*` in `meadowPalette.ts` with **identical
  values**.
- `models/shared/tree/presets.ts`: keep `ashMedium`, `aspenMedium`, `bush1`,
  `oakMedium`, `pineMedium`; delete the other ten (~800 lines). Keep as TS
  (typechecked data, no runtime load).
- Dead exports: for game-renderer + renderer-core (audit list of 24 values and
  108 types) and photoreal (69), delete every export with zero importers
  outside its file. Recount after slices 01-04 — many die with the estate.
  Keep exports named by the renderer-contract regexes.
- JS math: one `packages/renderer-core/src/scalar.ts` (`clamp01`, `smoothstep`)
  replacing `bladeFieldLayer.ts:1920`, `readoutLayer.ts:404`, `groundDetail.ts:207`,
  `terrainLayer.ts:798`, `skyModel.ts:443`, `cameraRig.ts:174,178`,
  `campaign/renderer.ts:921`. TSL `smoothstepN` in `battleTsl.ts:116` stays as
  the shader-side owner.

## Decisions resolved here

All values identical; this slice is not allowed to change a colour.

## Delegated to the implementer

Order; whether `scalar.ts` lives in renderer-core or a tiny shared package.

## Verification

- G0. G-photo and G-camp at **0 px**. If `MEADOW.rock` moves a pixel, the
  literal was transcribed wrong — fix the transcription, never re-bless.
- Dead-export proof: a script that greps each removed name across
  `apps web packages` returns zero hits, pasted into the commit message.

## Must stay green

Everything.

## Feedback that would change this slice

None.
