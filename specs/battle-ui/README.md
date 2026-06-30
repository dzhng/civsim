# Battle UI — rewrite every surface to the bronze game HUD

Rewrite **every** piece of the battle sim's UI so it reads as a diegetic Total War
game HUD, not a web app: the menu, the top buttons, the unit-info panel, the
minimap, the in-battle modals — all of it. The card bar and the order toolbar are
already done and are the **reference implementations** for the look; this spec
brings the rest of the surfaces up to the same bar and extracts the shared chrome
so it stops being copy-pasted.

## Next Agent Prompt

**Status:** planned. _Last updated: 2026-06-30._ The card bar (`specs/card-bar/`)
and the order toolbar shipped the bronze look; this spec generalizes it to the
whole battle UI.

**Start at Slice 1** (the shared design system) — every other slice depends on it.
Then do the surfaces in any order; each is independently shippable and screenshot-
gated. Update this section at the end of each pass.

**Global TODO:**
- [~] S1 — shared bronze-chrome design system. **Tokens seeded** in `index.html`
  `:root` (`--bronze-fill/-edge/-frame/-ink`, `--well-*`); still to do: move them to
  one source both shells consume, and refactor the card bar / toolbar off their
  inline values (and the lab copy). (`slices/01-design-system.md`)
- [x] S2 — top buttons (`#buttons`) + unit-info panel (`#hud`) → bronze (live).
- [x] S3 — minimap housing (`#minimap`) → bronze beveled frame (live).
- [x] S4 — main menu + quick-battle / duel modals → bronze (Cinzel title, bronze
  panels + well-buttons, brass headers). Minor: native `<select>` keeps its OS
  focus ring; `#menu-renderer-status` notice still webapp-ish.
- [~] S5 — in-battle modals: **gameover + pause menu done** (bronze, via the shared
  modal styles); **field manual (`#manual`) + banner (`#banner`) remain**.
- [x] _done_ — card bar + order toolbar (in `specs/card-bar/`), the look's reference impl

## The aesthetic contract (hard rule — same as card-bar)

Every surface obeys the [aesthetics](../../.claude/skills/aesthetics/SKILL.md)
**"UI & HUD — a game surface, not a webapp"** rule, judged against
`../card-bar/assets/reference-tw-cardbar.png` and the aesthetics `ui-cardbar-tw`
reference. A surface fails if it shows a webapp tell: translucent gradient fades,
floating rounded cards/pills with gutters, frameless flat panels, slate-grey
neutrals, hover-lighten, CSS-shadow-as-glow, crisp UI outlines. The targets:

- **Opaque worn-bronze housings** (beveled brass edge, recessed tray, rivets) for
  every panel — the card bar / toolbar chassis is the template.
- **Inset wells** for content; **bronze buttons** (recessed, brass `.on`/active,
  dimmed disabled); **Phosphor fill icons** (no emoji, minimal text).
- **Warm materials** — bronze, iron, leather, bone — never grey.
- **Gold glow** for selection/active (the in-world selection language), parchment
  for menu copy where the grand-strategy frame calls for it.

## Slice 1 sets the seam: a shared chrome system

The card bar proved the look but **duplicated** its CSS (`web/index.html` `<style>`
and the lab `installStyles`). Do not repeat that per surface. Slice 1 extracts the
chrome into **one source of truth** — CSS custom properties (bronze palette, bevel
shadows, radii) plus a small set of classes (`.hud-chassis`, `.hud-well`,
`.hud-btn`, `.hud-bar`) — that every surface and both shells (live `index.html`,
renderer-lab) consume. This is also where the card-bar S5 "dedupe the two CSS
copies" finally lands. Decide the delivery (a shared `.css` imported by both, or a
TS module that injects the `<style>`) so the live game and the lab can't drift.

## Surface inventory (what each slice rewrites)

- **`#buttons` / `btn-menu`** (top-right) and **`#hud`** (top-left unit-info
  readout) — S2. The HUD panel becomes a bronze well with the stat bars in the
  card-bar bar style; the Menu button a bronze icon button (Phosphor `list` / `gear`).
- **`#minimap`** (bottom-right DOM canvas) — S3. Wrap it in a bronze housing with a
  beveled frame and a corner ornament; keep the canvas render untouched (firewall),
  only frame it.
- **`#menu-ui`** + `#quick-battle-modal` + `#duel-modal` — S4. The main menu and
  setup modals: bronze/parchment panels, engraved (Cinzel) titles, bronze buttons,
  no web cards. (The menu may lean more grand-strategy than battle bronze — judge
  against the references.)
- **`#gameover`, `#pausemenu`, `#manual`, `#banner`** — S5. In-battle dialogs as
  bronze panels; the field manual as a framed scroll, not a web modal.

## Scope firewall — do NOT touch

- The WebGPU passes, terrain, soldier/crowd rendering, and the **minimap canvas
  render** itself (`minimapPass.ts`, the `#minimap` drawing) — frame it, don't
  redraw it.
- Sim/wasm, `crates/**`, the unit-info buffer layout.
- `UnitCards.update()`'s keyed bar logic.

## Verification gates (standing, every surface)

Each slice that changes a surface: screenshot it (the live battle HUD via the GPU
scene for in-battle surfaces; the menu via its own scene), run
[compare-screenshots](../../.claude/skills/compare-screenshots/SKILL.md) against
the reference + aesthetics (blocking on the aesthetic contract — a clean layout is
not enough), then an unprimed
[screenshot-critique](../../.claude/skills/screenshot-critique/SKILL.md), and open
the shots for the user with
[preview-shots](../../.claude/skills/preview-shots/SKILL.md). Re-bless the moved
baselines (`battle-selection-dpr2` and the menu shots) as reviewed changes.

GPU note: in-battle HUD shots render headful with hardware flags (no headless
WebGPU adapter on this machine).
