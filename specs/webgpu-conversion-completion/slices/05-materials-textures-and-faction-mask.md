# Materials, Textures And Faction Mask

## Contract

Soldiers shade from real material textures (albedo/normal/orm) and take faction
accents from a per-pixel mask, instead of hardcoded per-vertex colors and a
two-way `select()` tint. Crests, shields, and sashes can carry faction color
where the artist painted the mask.

## Why

Gaps from the gap review:

- Fragment shader hardcodes faction colors and uses per-vertex `smoothstep` masks
  (`skinnedPipeline.ts:85-105`); the bind-group layout has only the VAT storage
  buffer — no samplers/textures (`skinnedPipeline.ts:129-137`).
- Schema declares `channels=['albedo','normal','orm','factionMask']`
  (`soldier-placeholders.mjs:122`) but nothing samples them.
- Faction tint is a blue/red `select(...)` (`skinnedPipeline.ts:87-92`);
  `ART_CONTRACT.md:40-42` wants per-pixel accent masking (crests, shields,
  sashes).

## API Seam

- `packages/webgpu-core/src/skinnedPipeline.ts` — extend the bind-group layout
  with a texture array + sampler(s) for albedo/normal/orm/factionMask; sample
  them in the fragment shader; mix faction color in by the mask channel, not a
  global `select`.
- `packages/soldier-assets/` bake + schema — carry/pack the texture channels into
  the asset (atlas or array layers); validation ensures declared channels are
  present.
- Placeholder path — synthesize simple placeholder textures (or keep the current
  procedural look as a "no-texture" fallback) so the default render still works
  with no real art.

## Human Review

Model-sheet crops show lit materials with normal/ORM response under the
battle sun, and faction color appearing only where the mask paints it (crest,
shield rim, sash) — not flooding the whole figure. Two factions of the same class
differ only in the masked accents.

## Verification

- Soldier-gate crops: material response visible; faction accent localized to mask
  regions; re-bless the affected baselines once with a change-ledger note.
- Bind-group/layout test: textures + sampler bound; shader samples all declared
  channels.
- Placeholder-without-textures path still renders (fallback test).

## What Must Stay Green

- Crowd-scale perf budget (texture sampling added per fragment — verify at battle
  scale; use an atlas/array, not per-instance bind groups).
- Default render path when no real textures exist.

## Feedback That Would Change This Slice

- Texture packing (atlas vs 2D array vs per-class) and resolution budget.
- How aggressive faction masking should read at battle zoom (subtle accent vs.
  bold team color).
