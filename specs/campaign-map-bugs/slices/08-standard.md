# 08 — B6: the hollow army standard (repro → fix)

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
