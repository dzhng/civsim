# Slice 5 — Static wave: campaign panels

> **RESLICED (2026-07-01):** recon showed this is the biggest, most gameplay-critical surface —
> `panels.ts` is 317 lines of builders and `campaign/scene.ts` is **954 lines with ~69 DOM
> interaction points** (diplomacy actions, recruitment, city policy sliders, army orders,
> save/load), shared with the lab via `uiLayer.ts`. A monolithic React port would put core
> campaign gameplay at risk in one pass. Decomposed into sub-slices, each keeping the slate look
> (Option A default) and gated by the campaign visual scenes (`campaign-visual`,
> `campaign-production`, `campaign-conquest`, `campaign-save-load`, …):
>
> - **S5a — campaign React root + top bar.** Establish `CampaignScene`'s React root over the
>   Babylon canvas; migrate the `.cmp-top` bar (date/gold, speed 1×/3×/10×, pause, Factions, Fog,
>   Diplomacy, Classes, Save, Menu). Mostly static + a handful of handlers — the lowest-risk
>   foundation the other panels mount into. State bridged ≤5 Hz (turn/gold/speed/paused).
> - **S5b — army + city panels** (`#cmp-army`, `#cmp-city`): selection-driven; city has the
>   policy sliders + recruit buttons; army has roster + orders (halt/fortify/ambush/split/merge).
> - **S5c — diplomacy panel** (`#cmp-diplomacy`): per-faction relation rows + action buttons.
> - **S5d — class builder** (`#cmp-classes`): doctrine rows, unit options, size buttons, apply.
> - **S5e — sieges + end-of-turn modal**, then fold `uiLayer.ts` (the lab copy) onto the same
>   components. The slate→bronze re-theme fork stays deferred to a David call after the port.
>
> Do S5a first (it unblocks the rest). The prose below is the original whole-surface intent.

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
