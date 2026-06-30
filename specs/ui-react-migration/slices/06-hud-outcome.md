# Slice 6 — HUD outcome branch (consumes S3's verdict)

## Contract unlocked
The in-battle HUD reaches its final state per S3's measurement. **One of two branches runs** —
read S3's recorded verdict in `slices/03-hud-perf-spike.md` before starting. Either way the end
state is: **one bronze token source, no card-bar CSS fork, the 60 Hz path proven safe.**

## Branch A — MIGRATE (S3 showed React ≈ vanilla)
- Flip `BattleScene` default to `UnitCardsReact`; migrate the **toolbar** and the **throttled
  info panel** to React too (both are ≤5 Hz — `useSyncExternalStore`, no hot-path risk). The
  minimap **frame** becomes a React bronze chassis around `<canvas id="minimap">`; `drawMinimap`
  stays raw DOM (firewall).
- Delete vanilla `UnitCards`, `scene.ts`'s `updateHud()` DOM construction, the `#hud`/`#toolbar`
  markup in `index.html`. The hand-diffed `key`-skip logic now lives **only** in the React
  card's imperative `update`.

## Branch B — KEEP VANILLA (S3 showed React regressed the frame)
- `UnitCards`/`updateHud`/toolbar stay **vanilla DOM**, unchanged behavior. Delete
  `UnitCardsReact` (the spike artifact) so there's no dead second implementation.
- The keep-branch still pays its way: the vanilla HUD now consumes **`bronze.css`** (the S1
  source) instead of the `index.html` literal chassis — so "one design system" stays true even
  with two render strategies. This is a planned outcome, not a failure.

## What a human can run / see
A full battle: select units, watch the card bar/HUD/toolbar/minimap update every frame under
load. **Branch A:** all React. **Branch B:** vanilla HUD, but visually identical and now on the
shared token source.

## Verification
- **Branch A:** re-run S3's perf gate as the **default** (no flag) — isolated card-update
  self-time within floors **and** end-to-end release floors (frame ≤ +0.25/+1.5 ms, **fps ≥ 58,
  sim RUNNING**) at the standard large battle, headful hardware flags. A regression here reverts
  to Branch B — the gate is real.
- **Branch B:** the perf floors hold trivially (vanilla unchanged); prove the CSS swap is
  **pixel-identical** — `card-bar` + `battle-renderer-visual` at **{0,0} / no re-bless**.
- `card-bar`, `battle-renderer-visual` (`battle-selection-dpr2`), `cardGrid.test.mjs` green
  either branch.
- **compare-screenshots** the final HUD against the pre-slice baseline ("identical look"),
  unprimed **screenshot-critique** as the last check, then **preview-shots**.

## Must stay green
The release perf floors; the zero-copy `unit_info` buffer layout (firewall); `drawMinimap`; the
rAF loop; every battle scene.

## Human review checkpoint (non-blocking)
Open the final HUD shots + (Branch A) the default-path perf table. David confirms the HUD is
indistinguishable and (A) the frame budget held. Silent ~5 min + gates green → accept per the
recorded S3 verdict, record, close Preview, proceed.
