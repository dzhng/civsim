# Slice 06 — Conquest choice: sack vs hold

**Unlocks:** taking a city is a decision, and population becomes a contested,
deniable resource. Hooks the existing siege/occupation path.

## Seam
- `resolve.rs` / `economy.rs` occupation: when a city falls (the won-assault →
  `Occupying` path from the siege work, and the undefended `occupations` path),
  resolve as **sack** or **hold**.
  - **Sack**: instant gold proportional to population, population destroyed,
    city left ruined (and low loyalty if held after).
  - **Hold**: keep population, city starts at low loyalty, must be pacified
    (slice 05).
- Surface the choice: a player order/modal at capture; the AI picks too
  (default hold; sack when it can't hold or wants denial).

## Human can run
- Browser: a capture prompt offering sack/hold; the chosen outcome is visible on
  the city next month.

## Verifies
- `sack_yields_gold_and_destroys_population`; `hold_keeps_population_low_loyalty`;
  determinism. AI-off fixture proves the outcome is owned by the resolution, not
  commander timing (the lesson from the siege work).

## Stays green
- Gate, determinism, save/load. The siege capture path (`won_assault_occupies…`)
  still converts.

## Feedback that would change it
- Sack gold formula, whether sacking can raze a city off the map entirely, and
  the default the AI/player gets when not prompted.
