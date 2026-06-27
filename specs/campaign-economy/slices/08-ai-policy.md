# Slice 08 — AI plays the new economy

**Unlocks:** the commander plays the population/policy/loyalty world well enough
that the macro arc is healthy. Judged against the **slice-00 baseline**, not
against a prescribed implementation — the goal loop should try approaches.

## Competence to reach (the goals, not the recipe)

- **Lives within the monthly budget.** Heavy upkeep means it can't field more
  army than monthly income sustains; recruits from the population pool; doesn't
  bankrupt itself.
- **Holds what it takes — the headline new behavior.** A surrounded conquest
  revolts without an army anchor, so the commander must garrison fresh conquests
  (leave a ≥10-unit anchor or accept the loss) and **not conquer faster than it
  can hold**. Offense vs consolidation is now a real tradeoff it has to make.
- **Sets city policy** sensibly — roughly frontier→Military, interior→Economy,
  Exploit for a war chest, Grow in peace.
- **Chooses sack vs hold** at capture.
- **`eval` understands the new world**: a conquest it can't hold (will revolt) is
  near-worthless; population, loyalty, and sustainable upkeep are part of the
  score, not just current cities/army.

## Where it lives
`ai/` (`think`, `eval`, `plan`, and `rollout`/`estimate`). The AI acts only
through the **player order surface** (policy orders, recruit, move, sack/hold) —
a new AI action must be one a player could also issue.

## Invariants (must hold whatever the approach)
- `lopsided_war_concludes` green; determinism (clone + `turn_rng`); the
  lockstep worker protocol (`advance_external`); AI emits only player-legal orders.

## Verifies (judge the outcome, not the method)
- Harness (00): beats baseline on **runaway gap** and **solvency** without
  introducing **calcification** (the known stalemate failure).
- Behaviour (seed-set, distribution, never a single seed): warmonger out-attacks a
  turtle; an over-extended AI **consolidates/garrisons** rather than losing
  everything to revolt or bankruptcy; a held conquest stays held.

## Open — explore in the loop (do not pre-commit)
- Offense vs consolidation: an explicit "garrison this" plan, or does anchoring
  fall out of `eval` simply valuing held-and-loyal territory?
- Overextension avoided by **foresight** (eval predicts the revolt) or learned
  **reactively** (lose one, garrison the next)?
- Policy-setting shape: per-city heuristic, faction-wide stance, or lookahead?
- How much the rollout/`estimate` must model the loyalty/anchor dynamics vs cheap
  heuristics that are good enough.

## Feedback that would change it
- How aggressively it exploits/consolidates, and whether its choices read as
  credible to a watching human (the "simple and credible" bar).
