# 08 — B6: the hollow army standard (repro → fix)

## Status ledger (2026-07-03 — implemented on worktree-map-bugs-standard)

- **Repro (08a):** probe iterated all 12 campaign armies at the whole-map
  camera (`throwaway/b6/probe-standards.mjs` pattern). The evidence object is
  Arverni army id 6 (garrisoned NW of Lugdunum, Gaul) plus the adjacent city
  square marker; army id 7 shows the same defect ungarrisoned. Pixel
  telemetry: banner cloth `[60,150,60]` (pure Arverni livery) vs surrounding
  Arverni territory wash `[81,144,62]` — near-zero contrast.
- **Root cause class:** per-instance livery color edge case, NOT missing
  geometry or atlas packing. The whole-map army/city markers
  (`MARKER_WGSL` in `packages/game-renderer/src/campaign/mapPass.ts`) filled
  cloth/chip with the flat faction color; the political territory wash IS the
  faction color over land, so any faction whose color sits near the land green
  (and every faction on its own wash) rendered as a hollow ink outline.
- **Fix (08b), at the marker-shader owner:** cloth keeps the faction hue but
  carries luminance structure no flat wash can match — parchment-lit head to
  ink-deepened foot — plus gold trim widened to survive the 9 px marker; the
  city square marker gets the same top-lit grade plus a beveled rim. Two-color
  rule intact (cloth stays faction livery; gold/ink are the existing
  hardware vocabulary).
- **Family pin:** new `standard-liveries` model-sheet gate
  (`/renderer/campaign-models?gate=standard-liveries`, snap
  `web/shots/models/campaign/entities/standard-liveries.png`) renders the 3D
  standard + true-size marker for ALL factions from the real bake and asserts
  per-livery cloth grade (>=10 median luma head-vs-foot) and cloth-vs-ground
  separation (>=25 max channel) — 63/63 pass (min grade 18.9, min sep 45.2).
- **Evidence:** before `assets/evidence/b6-hollow-standard.png`, after
  `assets/evidence/b6-hollow-standard-after.png` (same view, fresh baseline).
  Unprimed judge verdict: after shows "a filled banner with clear pole and
  gold insignia"; before is "a hollow, empty rectangular outline".
- **Baselines re-blessed (marker pixels only — verified by diff clustering):**
  `campaign-lod-whole-political`, `campaign-lod-whole-natural`,
  `campaign-frame-zoomout-wide`, `campaign-frame-zoomout-tall`, plus the new
  `models/campaign/entities/standard-liveries` sheet. All 0 px on re-run.

**Contract unlocked:** every army standard renders full banner cloth in every
faction livery. Evidence: `assets/evidence/b6-hollow-standard.png` (outline +
mast render, cloth missing — NW of the whole-map shot). Fully parallel.

## 08a — reproduce (mandatory before any fix)
- Locate WHICH army: iterate armies on the whole map, render/crop each
  standard (probe-style), pin the broken instance deterministically (seed/
  save).
- Classify: per-instance banner-cloth color (livery table edge case?), missing
  geometry, or atlas/packing bug. The owner is the campaign entity model
  source / entity pass — find the current one in the code.

## 08b — fix at the owner + pin the class
- Fix where 08a points. Then a write-model-sheet contact sheet of the standard
  across ALL faction liveries — the bug class is "one livery breaks", so the
  sheet pins the whole family, not the one instance.

## What the human can see
- The repro crop before/after; the livery contact sheet.

## Verification
- Model-sheet snap committed as a gate; whole-map scene snap; compare vs the
  evidence crop. Oracle: folded into the final sweep (10).

## Firewalls
- No shared soldier/crowd pipeline edits; scope to the standard's cloth;
  two-color rule (cloth is faction livery).
