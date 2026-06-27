# Slice 00 — Baseline harness (the yardstick)

**Unlocks:** a reproducible read of today's campaign arc so every later slice has
a measured before/after. No behaviour change.

## Seam
- `crates/campaign/tests/full_game.rs` — extend `grand_map_report` /
  `sample_stats` / `FactionStat` to emit the metrics that matter for this
  feature, as a stable, parseable report.
- Metrics: **runaway gap** (strongest-vs-weakest playable power over time, by
  cities and by army strength), **economy curve** (treasury per faction),
  **army-size-vs-cities** ratio, **flip cadence** (captures/month), conclusion
  day.

## Human can run
`CAMPAIGN_DAYS=N cargo test -p campaign --test full_game grand_map_report -- --ignored --nocapture`
→ a table the human can eyeball and that later slices diff against.

## Verifies
- Report runs deterministically (same seed → same numbers).
- Capture the current numbers into this file as the baseline (paste the table).

## Stays green
- Everything — this slice only reads. `lopsided_war_concludes` untouched.

## Feedback that would change it
- Which metrics actually express "runaway" / "calcified" / "armies too cheap" to
  the human — add or drop columns before building on it.
