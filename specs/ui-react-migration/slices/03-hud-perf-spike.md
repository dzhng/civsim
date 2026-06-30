# Slice 3 — HUD perf SPIKE (the gate that decides S6)

## Contract unlocked
A **measured verdict**: does the per-frame card bar in React (structure in React,
60 Hz bar widths/colors/count/`.sel`/`.rout` written imperatively to ref'd nodes by the
existing rAF loop) cost the same as today's vanilla `UnitCards.update()`? This slice ships a
React card bar **behind a runtime flag**, runs the head-to-head, and writes the number that
selects the S6 branch. **This is the one place a wrong default silently regresses a
renderer-bound frame — so we measure instead of guess.**

## API seam
- `web/src/ui/hud/UnitCardsReact.tsx` — `<UnitCardsReact rosterKey=… count=… />` renders the
  **structure only** (the flex column [hp / portrait / name / coh-mor bars] per card, the
  riveted `.chassis-tray`), rebuilt only on roster identity change.
- It exposes an imperative handle (`useImperativeHandle` → `{ update(frame) }`) whose body is
  the **verbatim hand-diffed `key`-skip logic from `UnitCards.update()`** — writes
  `style.width`/`style.background`/`textContent`/`classList` to ref'd DOM nodes. React's
  render/commit never runs at 60 Hz. The zero-copy `Float32Array` is re-materialized per read
  exactly as today; **never copied into React state.**
- `BattleScene` chooses `UnitCards` (vanilla) vs `UnitCardsReact` by a flag
  (`?hud=react` / `localStorage`), wired into the **same rAF `update(frame)` call site** so the
  measurement is apples-to-apples. Both paths coexist this slice.
- The minimap/toolbar/info-panel stay vanilla here — this slice isolates the **card bar** hot
  path, nothing else.

## What a human can run / see
Boot a large battle (`?battle=…&hud=react`) and a routing fight; cards update every frame —
selection rings, HP/strength bars shrinking, colors flipping on rout, count dropping as men
die — indistinguishable from vanilla. Toggle the flag live to A/B.

## Verification — this is a MEASUREMENT, not a baseline
- **Metric (primary): isolated card-update self-time.** Wrap the per-frame card `update()` in
  `performance.now()` deltas inside `full-game-rendering-performance.mjs` `measureBattle`;
  report **median + p95 over a fixed tick window** at a fixed large roster, vanilla vs React.
  **Pass:** Δmedian ≤ ~0.3 ms and Δp95 ≤ ~0.5 ms (React not meaningfully slower). These are the
  *proposed* floors — **David tunes them at the checkpoint against the printed numbers.**
- **Metric (guard): end-to-end frame budget.** The repo's existing release floors must still
  hold with the React HUD active and the **sim RUNNING** (not paused): frame-time regression
  ≤ +0.25 ms typical / +1.5 ms worst, and **fps ≥ 58** at the standard large battle. A green
  isolated metric but a busted end-to-end floor still fails the slice.
- GPU/perf scenes run **headful with hardware flags** (`VERIFY_GPU=1
  VERIFY_GPU_ADAPTER=hardware VERIFY_HEADFUL=1 VERIFY_BROWSER_CHANNEL=chrome`).
- **Visual:** `card-bar` snaps (DOM-only lab route, pointed at `UnitCardsReact`) must match the
  vanilla baselines at the tolerant default — same structure, same pixels. Re-bless only a
  reviewed AA nudge.
- **Print the table** (vanilla vs React: median/p95/fps) into the slice's results section — the
  verdict is the artifact S6 consumes.

## Visual second opinion
The card bar is a visual shot: run an unprimed
[screenshot-critique](../../../.claude/skills/screenshot-critique/SKILL.md) on the React
`card-bar-20`/`card-bar-40` as the last check (legibility, collisions, bar placement), and
[compare-screenshots](../../../.claude/skills/compare-screenshots/SKILL.md) against the vanilla
card-bar baseline (the target is "identical look") before accepting. Then
[preview-shots](../../../.claude/skills/preview-shots/SKILL.md).

## Must stay green
Vanilla `UnitCards` (still the default until S6 flips it); the rAF loop; the zero-copy buffer
layout; every battle scene; the release perf floors.

## Human review checkpoint (non-blocking) — the verdict
Open the printed perf table + the A/B card-bar shots with preview-shots. David's call: **tune
the thresholds** and pick the S6 branch (migrate vs keep-vanilla). If silent ~5 min: apply the
proposed floors mechanically — **React passes → S6 migrates; React regresses → S6 keeps
vanilla, shares tokens only** — record the numbers + the auto-verdict in this file and in the
README's Next Agent Prompt, close Preview, proceed. The decision is reversible (it only selects
which S6 branch runs) so the build never stalls on sign-off.

## Genuine alternative measured here
`useSyncExternalStore` leaf-subscription for the 60 Hz bars (vs imperative refs). Refs are the
default call; this slice is exactly where the store alternative gets its head-to-head, in case
leaf subscriptions reconcile per-frame at roster scale. Whichever wins is recorded.
