# 08 — Bronze tooltip chips on icon-only buttons

## Contract unlocked
Every icon-only button gets a **custom diegetic bronze tooltip** on hover **and**
focus, replacing reliance on the native `title=` bubble — so the player can tell
what each icon does, on-aesthetic.

## Slice variable & crop
**One visual variable: the tooltip appearance.**
- **Judge:** a hovered/focused button + its chip.
- **Out of scope:** button layout (05), placement (07).

## API seam
- **Use Radix as the primitive** (David sanctioned Radix/shadcn). Add
  `@radix-ui/react-tooltip` and wrap it in `web/src/ui/hud/Tooltip.tsx`, **skinned
  to the bronze tokens** (`--bronze-fill/-edge/-frame/-ink`) — do **not** ship the
  default shadcn slate/rounded look (that is the exact "webapp tell" the
  `aesthetics` skill forbids). Adopt Radix's behavior + a11y, supply our own CSS.
  - Radix handles the hard parts for free: hover **and** keyboard-focus triggers,
    `side="top"` + `collisionPadding` so the chip **opens upward** and never clips
    at the bottom viewport edge, and a portal above the housings. Wrap the HUD in
    one `<Tooltip.Provider>`.
  - If adopting more shadcn components later, run shadcn init once — but every
    generated component gets re-skinned to bronze before it ships to the HUD.
- `Toolbar.tsx`: the rich per-button copy already lives in `LAYOUT[].title` — feed
  those strings into the chip; **remove the native `title=`** (keep `aria-label`
  for a11y).
- The chip lives under the `pointer-events:none` HUD overlay — Radix portals it
  out, but confirm it does not steal pointer events from the battlefield.
- Apply to any other icon-only control that exists (audit the HUD).

## What the human can run / see
Hover a toolbar icon → a bronze chip (not the OS tooltip); tab to it with the
keyboard → the same chip appears on focus.

## Verification
- A lab / UI scene (headless-friendly, no GPU) snapping a button's hover + focus
  chip.
- Keyboard-focus path shows the chip; native `title` bubble no longer appears.
- Confirm the chip does not clip at the bottom viewport edge (opens upward).
- **screenshot-critique** on the chip (legible, bronze, no clipping).
- Human checkpoint (**non-blocking**) via `preview-shots`, ~5 min, decide-and-record.

## Stays green
Button commands, `aria-label` a11y, the ≤5 Hz toolbar render.

## Feedback that would change this slice
Copy length / whether to show the hotkey line is a taste call; the `<Tooltip>`
seam stays. If David wants tooltips on non-toolbar icons too, the same component
covers them.
