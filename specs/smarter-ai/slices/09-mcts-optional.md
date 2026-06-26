# Slice 9 — Multi-ply / MCTS (optional, GATED)

## Gate (do not start until this is true)

Ship slices 4–8, play the game, and ask: *does the AI feel shallow in a way a
better evaluation can't fix?* Concretely — does it make locally-best moves that
are strategically dumb two decisions out (walks into a trap a human sees coming;
can't set up a pincer; trades down because it can't see the follow-up)? If the
fix is "tune the eval / candidates," do that instead — depth is the expensive
last resort. Only if depth is genuinely the missing ingredient, build this.

## Contract

Replace the one-ply argmax/softmax loop (`ai.rs think()`, slice 4) with a search
over **sequences** of intents — the AI plans several decision-cycles ahead,
picking moves that pay off later. Everything else (estimator, rollout, eval,
personas, randomness, event triggers) is reused unchanged.

## API seam

- **Module:** `crates/campaign/src/ai/search.rs`:
  ```rust
  pub fn mcts(map: &WorldMap, st: &CampaignState, f: FactionId,
              profile: &persona::Profile, budget: SearchBudget,
              rng: &mut Pcg32) -> Plan
  ```
- Standard MCTS over the slice-3 `Plan` space:
  - **selection** — UCB over candidate plans
  - **expansion** — `plan::candidates` at the reached sandbox state
  - **rollout** — `rollout::forward` to the horizon, scored by `eval::score`
  - **backprop** — average score up the path
- **Branching control is mandatory** — the joint move space (each army × each
  reachable city) explodes far past chess. Reuse `plan::candidates`' labeled,
  filtered intents (focus / nearest-beatable / nearest-any / hold) as the only
  edges; never enumerate raw per-tile moves.
- `SearchBudget` = iteration cap or wall-time cap, sized so the hourly pass
  stays within the perf budget measured in slice 4. Persona `temp` becomes the
  exploration constant.

## What the human can run / see

- Side-by-side campaign: one-ply AI vs. MCTS AI on the same seed/map. The MCTS
  side should demonstrably set up multi-step plays (feint then strike; mass
  before committing) the one-ply side can't.
- A search-tree dump for one decision (depth, visit counts, chosen path) so the
  added intelligence is inspectable, not a black box.

## Verifies

- **Beats one-ply where it should:** on crafted "needs a two-move plan"
  fixtures, MCTS finds the line one-ply misses (assert the setup-then-strike
  sequence is chosen).
- **No regression elsewhere:** `full_game.rs` liveness, determinism (search rng
  from `st.rng`/passed rng, fixed seed → identical), perf within budget.
- **Doesn't get gamey:** watch for MCTS exploiting eval blind spots (turtling
  for a number, suicidal sacrifices that game the score). If it appears, the eval
  needs hardening — log and flag, don't ship a clever-but-weird AI.

## Stays green

- All prior slices' contracts and tests. This slice swaps the *selector*, not
  the substrate.

## Feedback that would change this

- If one-ply + great eval already satisfies David, **this slice may never ship**
  — and that's the intended outcome of the gate, not a failure.
