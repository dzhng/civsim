# 18 — Curated seeds in the catalog

Hand-picked generated maps become first-class, named, pickable battle maps.

## Contract unlocked

Generated maps ship in the production quick-battle picker beside the hand
maps — the replace-over-time path is open.

## API seam

- A small curated table (in `genmap` or the catalog): `{ name, seed, recipe
  overrides }` → e.g. "Highland Vale", "Twin Lakes Reach". Each becomes a
  `BattleMapCatalogEntry`-equivalent flowing through the manifest path (slice
  06) — named entries are pinned seeds using the same machinery, never a
  parallel map kind.
- Menu: curated entries listed like hand maps; free-seed entry stays.

## Human can run

Pick "Highland Vale" from the menu and fight it. Verification scenes can
address curated maps by name.

## Verification

- Certificates + determinism goldens pinned per curated seed.
- One model-sheet-style beauty snap per curated map (vista camera), blessed.
- Menu picker scene updated; catalog contract tests
  (`edgeSealMismatches`) green per entry.

## Stays green

Hand maps and their catalog entries untouched; all standing gates.

## Precondition

Slice 17's verdict accepted by David (this is the one blocking checkpoint in
the spec).

## Feedback that would change it

Which seeds make the cut — David's pick from the slice-06 browser, recorded
here with a one-line character note per map.
