# 16 — City-info design exploration (artifact only)

**Contract unlocked:** a chosen on-map city-info design for the three allegiance
states, plus a confirmed render seam — before any wiring. David asked to "be
creative, try a few variations and show me."

## API seam (HTML contact sheet, no product wiring)
- Build a static HTML contact sheet from `bronze.css` tokens + copies of
  `HudPanel` markup + the `.ucard` garrison strip. 2–3 variations of:
  - **OWN city:** a bronze card, 2 lines — name + income/mo (extensible later). If
    an army is garrisoned, the army text shows in a strip **below** the card.
  - **NEUTRAL city:** faction-colored icon + engraved Cinzel name (as today).
  - **ENEMY city:** as neutral + a **red sword icon** to the right of the text.
- Use the **artifact-design** skill for the contact sheet. Income data is
  available (`CityPanel.tsx` already shows income/mo).

## What the human can see
- The HTML contact sheet (publishable via Artifact) showing all variations side by
  side, over a campaign-map backdrop crop for context.

## ★ Human checkpoint — RESOLVED 2026-07-03 (non-blocking, decided on evidence)
Sheet built (`visualizations/city-card-variations.html`), published as an
artifact, opened in Preview; unprimed critique run (verdict below). David did not
respond within the window, so per protocol the decision was made on the evidence:

**CHOSEN: Variation B — plaque with inset wells** (engraved name on bronze;
income and garrison each in a dark inset `--well-bg` well, one housing).
Rationale: the unprimed critique found A/C near-duplicates while B is the only
variation with real internal material hierarchy, and B's hierarchy survives
downscaling at regional zoom where C's hairline band and A's detached slip lose
signal first. B also already has the single-silhouette-when-garrisoned property
(the garrison is an attached well, not a second chip). Implementation notes from
the critique: keep the faction-colored house icon on the name row; the enemy
sword glyph must be bold (a thin slash dies at zoom); the strength number ("2.6K")
needs brighter ink than the first draft.
**Seam: DOM overlay anchored via `renderer.toScreen()`** (invariants 4, 5).
Reversible: slice 17 parameterizes the card body; switching to A/C later is a
markup swap. David can override at any time.

## Verification
- No product code. The contact sheet is the deliverable.
- **screenshot-critique** on the contact sheet (does the card read as bronze, not
  webapp; is income legible at map zoom).

## Feedback that would change this slice
- David's variation pick and any content he wants on the card beyond name+income.
