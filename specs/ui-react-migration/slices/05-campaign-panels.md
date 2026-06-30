# Slice 5 — Static wave: campaign panels

## Contract unlocked
The campaign DOM overlay (`campaignDomHtml()` in `web/src/campaign/panels.ts` — today its own
off-theme slate island with **zero** bronze tokens) is React, mounted over the Babylon campaign
canvas, consuming the **one** token source. Folds the 4th CSS island into the shared system.

## API seam
- `web/src/ui/campaign/CampaignPanels.tsx` — the province/army/turn panels as components, fed by
  the ≤5 Hz external store (campaign turn state, selection). Mounted into `#ui-root` by
  `CampaignScene`; the Babylon terrain + Canvas2D marker layer are a **firewall — untouched**
  (React owns only the DOM panels over the canvas, same as the battle HUD over `#battlefield`).
- The self-styled `<style>` block in `panels.ts` is deleted; classes resolve against
  `bronze.css` + Tailwind.

## What a human can run / see
Enter a campaign (`?campaign`), click provinces/armies, end turns — the panels are React over
the live Babylon map, no slate `<style>` island left.

## The one decided fork — re-theme (flag to David in this slice)
The campaign panels are **slate** today (`#2a3242`, system-ui), off the bronze theme.
- **Option A (default — pure refactor):** consolidate the CSS onto the token source but **keep
  the slate look**. Screenshots stay ~identical; re-theming bronze is separate aesthetics work.
- **Option B:** re-theme slate→bronze now — the one place in the whole migration screenshots
  *should* move on purpose.
Open both candidate shots with preview-shots and let David pick. **If silent ~5 min: take
Option A** (a migration slice shouldn't smuggle in an aesthetic change unreviewed), record the
decision, file a follow-up note for the bronze re-theme, close Preview, proceed.

## Verification
- Campaign visual scenes: **Option A** re-blesses only reviewed reflow at the tolerant default;
  **Option B** re-blesses the bronzed panels as an intended visual change (reviewed, never
  blind).
- `tsc`/`build` green; campaign turn logic + Babylon render untouched (firewall).
- **compare-screenshots** the React panels against the prior slate baseline — Option A target is
  "identical look", Option B target is "matches the bronze aesthetic +
  `assets/reference-tw-cardbar.png` family" — then an unprimed **screenshot-critique** as the
  last check, then **preview-shots**.

## Must stay green
Campaign navigation/turn flow; the Babylon terrain + marker layer; the menu's
`onNewCampaign`/`onLoadCampaign` entry (S2).

## Human review checkpoint (non-blocking)
The re-theme fork above **is** this slice's checkpoint — same non-blocking rules.
