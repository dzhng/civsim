# 04 — Army-roster idle state in the left card

## Contract unlocked
When **no unit is selected** (and nothing hovered), the bottom-left card shows an
**army-roster summary** instead of a blank/header-only panel — so the card always
reads as intentional. Selected/hover behavior is unchanged. Also **drops the debug
header** and **relocates the FPS readout** to bare top-left telemetry (David,
decided).

## Slice variable & crop
**One visual variable: the left card's idle content** (plus the coupled header
drop / FPS relocation, which are the same content change).
- **Judge:** the bottom-left card crop in the no-selection state, and the faint
  top-left FPS text.
- **Out of scope:** position (03), styling polish (09).

## Header drop + FPS relocation
- Remove the `#hud` header line (`fps N   tick X ms   … units`) from the
  `HudData`/`HudPanel` render — the diegetic card no longer carries debug text.
- Keep the existing `fpsAvg` (`scene.ts:1133-1139`). Render it as a **standalone,
  low-contrast, transparent-background text node in the top-left** (which slice 03
  emptied) — no label, no bronze chrome, `pointer-events:none`. It is dev
  telemetry, not HUD chrome; the `aesthetics` "no transparency" rule does **not**
  apply. A small always-mounted `<FpsReadout>` fed by `handle.setFps(n)` (or a
  tiny direct text write) is fine — do not route it through the card re-render.

## API seam
- Aggregate is computed **client-side from data already in memory** — no
  `crates/**` / wasm change. In `scene.ts` `updateHud()`, when no unit is
  selected, iterate `game.unit_count()` over player units (`team === 0`) and sum
  from the `unit_info` Float32Array: alive men, total men, men-weighted morale +
  cohesion, and a routing count. The per-unit read loop already exists
  (`buildCards` / `myUnits`); reuse the same raw offsets.
- Extract a pure `armySummary(info, count, stride)` →
  `{ unitsAlive, unitsTotal, strengthFrac, morale, cohesion, routing }`
  (unit-testable headless like `cardGrid.ts`).
- Extend `HudData` with a `roster` variant; add a render branch in
  `HudPanel` / `<LeftInfoCard>` shown when `unit` is undefined (army strength as a
  bar, morale + cohesion bars, units-alive/total, routing count).
- Drop the header lines from `HudData` (see "Header drop + FPS relocation" above).

## What the human can run / see
`bun run --cwd web scene -- battle-selection` — deselect all → the left card shows
the army readout; select a unit → per-unit stats return; the debug header is gone
and a faint FPS number sits alone in the top-left.

## Verification
- Add a headless assertion for `armySummary()` (pure math) alongside
  `cardGrid.test.mjs`.
- Snapshot the idle (no-selection) left-card state; re-bless as needed
  (reviewed, headful).
- **screenshot-critique** on the idle state (legible, not empty, on-aesthetic).
- Human checkpoint (**non-blocking**) via `preview-shots`, ~5 min, decide-and-record.

## Stays green
The ≤5 Hz cadence, the selection → per-unit path, `battle-selection` behavior.

## Feedback that would change this slice
Which stats belong in the summary (add men-count total? drop cohesion?) is a
taste call for the checkpoint; the seam (pure `armySummary` + a `HudData` variant)
stays regardless.
