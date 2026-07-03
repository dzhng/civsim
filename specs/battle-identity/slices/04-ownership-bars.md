# Slice 04 — Bars mean "mine": 4 stats on own units only

**Contract:** own units (team 0): hp, cohesion, morale, stamina bars above
the flag (add morale+stamina to unitBanner bars — values already flow to
chips via scene.ts:430-456; find the morale/stamina scalars in unitInfo).
Enemy units: flag only (no bars; event chips like ROUT/TIRED may stay).
`mine` enters BannerState (unitBanner.ts:13-19) from `info[o+6]===0` at
scene.ts:482.

**Verify:** banner gallery with a mine/enemy pair; a battle scene shot showing
own (bars) vs enemy (bare flag); screenshot-critique ("can you tell whose
units are whose without color knowledge?").
