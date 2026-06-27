# Slice 07 — The economics panel (legibility)

**Unlocks:** the player reads their realm as a monthly budget — the
"set policy, watch the books" payoff.

## Seam
- `campaign_bind.rs`: an `economy_json` (or floats) summarizing the monthly
  books — per-city income (pop × econ-development × market-equivalent, minus
  unrest drag), per-army/per-class upkeep, totals, net, treasury trajectory.
- Frontend (`web/src/campaign/`): a panel that renders income breakdown, upkeep
  breakdown, net/month, and a treasury projection; updates on the monthly pulse.

## Human can run
- Browser: open the economics panel; the numbers reconcile with the sim's actual
  monthly settlement; overextension drag and upkeep burden are visible *before*
  bankruptcy.

## Verifies
- Scene + screenshot (per `write-scenario` / `screenshot-regression`).
- A probe asserting the panel's totals equal the sim's applied monthly delta
  (panel doesn't lie).

## Stays green
- Wasm thin boundary + rebuild; no sim behaviour change (read-only view).

## Feedback that would change it
- What the player most needs to see (per-city vs per-army emphasis, projection
  horizon, warning thresholds).
