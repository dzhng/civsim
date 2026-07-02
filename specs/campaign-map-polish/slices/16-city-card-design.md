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

## ★ Human checkpoint (non-blocking)
Open with **preview-shots** / publish as an Artifact. David picks a variation AND
confirms the seam: **DOM overlay anchored via `renderer.toScreen()`** (recommended
— reuses bronze components + the existing projector; invariants 4, 5) vs a richer
canvas panel in `mapPass`. If silent ~5 min, default to variation 1 + DOM overlay;
record the choice in the README and proceed.

## Verification
- No product code. The contact sheet is the deliverable.
- **screenshot-critique** on the contact sheet (does the card read as bronze, not
  webapp; is income legible at map zoom).

## Feedback that would change this slice
- David's variation pick and any content he wants on the card beyond name+income.
