# 09 — Fidelity pass vs reference + close-spec

## Contract unlocked
The three housings read as the Total War Saga: Troy reference — the HUD is done,
the spec is archived.

## Scope
- Aesthetic polish against `assets/reference-tw-cardbar.png`: general-medallion
  framing for the left card portrait (round crop), bevel/ornament pass, corner
  ornaments, final `MIN_WINDOW` / corner-width tuning. Any remaining
  known-unknown taste calls land here.
- Re-derive / clean up: delete dead inline `index.html` HUD CSS left after the
  migration; confirm `viewportGate` and the reserve constants are final.

## Verification (blocking on the aesthetic contract)
- **compare-screenshots** the full composed HUD vs the reference — the
  less-wrong verdict against the four **webapp-tell** failure modes from the
  `aesthetics` skill (transparency/fade, floating rounded gutters, no frame, flat
  web-affordant). Iterate until it passes.
- **screenshot-critique** (unprimed second opinion) as the final gate.
- Re-bless the final baselines (`battle-selection-dpr2`, `battle-initial`,
  `card-bar-*`) only once the render actually matches — reviewed, headful.
- Full battle scene suite green; `test:ui` green.

## Close
Run **close-spec**: archive `specs/hud-housings/` to `specs/done/` and rewrite the
README from this build ladder into a durable rationale (the why, the invariants —
the single-root collapse, the 60 Hz firewall, the asymmetric reserve — pointing
back to the shipped code).

## Stays green
Everything. This is the last slice; the whole suite must be green and blessed.
