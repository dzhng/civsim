# Slice 8 — Battle toolbar: bronze chrome + Phosphor icons

_Requested by David: "update the bottom bar (Run, Reform, …) — find icons, use
Phosphor like the campaign UI."_

The order toolbar (`#toolbar`: pace / reform / pursue / fire / kite / pause /
1× / 3× / paths) was a translucent web pill-bar with text labels — a webapp tell
under the README **Aesthetic contract**. Bring it into the same bronze game HUD as
the card bar, with Phosphor icons instead of text.

## Status (implemented)

- **Bronze chrome.** `#toolbar` is now the same opaque worn-bronze chassis as the
  card bar (beveled brass edge, inner groove, top highlight). Buttons are square
  bronze wells (recessed, bronze rim); hover brightens the rim; the active/`.on`
  state (paused, fire-at-will, pursue, paths shown) lights up brass; disabled
  dims. No translucency, no pill rounding.
- **Phosphor icons.** `web/src/battle/toolbarIcons.ts` holds the FILL-weight
  Phosphor paths keyed by `data-cmd` (mirrors `campaign/icons.ts`), and
  `scene.ts` injects the inline SVG into each `#toolbar button` on init (the
  buttons carry only `data-cmd`, `aria-label`, and the `title` tooltip now). The
  pace button no longer rewrites its own text — `set()` just toggles `.on`.
- **Mapping:** pace→`person-simple-run`, reform→`users-three`, pursue→`sword`,
  fire→`crosshair-simple`, kite→`arrow-u-up-left`, pause→`pause`, 1×→`play`,
  3×→`fast-forward`, paths→`flag`. Icons were pulled from the Phosphor core repo
  (MIT) so the path data is exact, not hand-authored.

## Verification

- Verified in the live HUD (`battle-selection-dpr2`, re-blessed): icons render
  crisp, the paused button lights brass, the kite button dims for a non-skirmisher
  selection.
- **compare-screenshots** (vs `assets/reference-tw-cardbar.png` — its toolbar is
  the same bronze family) and an unprimed **screenshot-critique** on the toolbar
  crop, per the standing gates.

## Open follow-ups

- Tune icon choices at David's eye (e.g. reform = `users-three` vs `arrows-in`;
  kite = `arrow-u-up-left` vs `wind`).
- The lab harness toolbar (`BattleUiLayer` `renderer-toolbar` in
  `apps/renderer-lab`) still uses text buttons — mirror this treatment there for a
  consistent harness if/when that surface is reviewed.
