# Deeper campaign AI — multi-ply search (MCTS)

Give the commander **depth**: plan several decision-cycles ahead so it picks
moves that pay off later — a feint that opens a city, massing before committing,
declining a trade because it can't see the follow-up. This swaps the *selector*
only; the estimator, rollout, eval, personas, and rivalry built in
[smarter-ai](../done/smarter-ai/README.md) are reused unchanged.

## The gate — do not start until this is true

Depth is the expensive last resort. One-ply lookahead with a good evaluation
already ships (`specs/done/smarter-ai`). Before building this, play the game and
answer: **does the AI feel shallow in a way a better `eval::score` or richer
`plan::candidates` can't fix?** Concretely — does it make locally-best moves that
are dumb two decisions out: walks into a trap a human sees coming, can't set up a
pincer, trades down because it can't see the follow-up?

- If the fix is "tune the eval / add a candidate," do that instead — it's an
  order of magnitude cheaper and it's where one-ply's intelligence lives.
- Only if **depth itself** is the missing ingredient is this spec worth opening.
  The intended outcome of this gate is that it often **never ships**.

## Why this builds cleanly on what's there

The one-ply search is already a function of reusable parts, so depth is a new
selector over the same substrate — not new substrate:

- **State is cloneable and steppable.** `rollout::forward` / `forward_plan`
  (`crates/campaign/src/rollout.rs`) already roll a cloned `CampaignState`
  forward, auto-resolving battles via `resolve::estimate`. A tree node is just a
  rolled-forward clone.
- **The move space is already small and legal.** `plan::candidates`
  (`ai/plan.rs`) yields a handful of *labeled* intents (`hold`, `focus`,
  `rival`, `nearest-beatable`, `nearest-any`) read through the faction's fog.
  Those are the tree's edges — never raw per-army×per-city moves.
- **Positions already score to one scalar.** `eval::score` (`ai/eval.rs`) with
  the persona's `Weights` is the leaf evaluation and the backprop value.
- **A persona already carries an exploration dial.** `Profile.select_scale`
  (`ai/persona.rs`), today the softmax temperature, becomes the UCB exploration
  constant — so depth inherits each persona's cold/erratic character for free.

## The shape of the change

Today's offensive decision is the one-ply block in `ai::think`
(`crates/campaign/src/ai.rs`): enumerate candidates, roll each forward once,
score, `select::pick_softmax`. This replaces that block with a call to a new
`ai::search::mcts(...) -> Plan` that searches over **sequences** of those same
candidate intents. Everything around it — the rule-based defend/recruit/policy/
consolidate steps, and the off-thread `commander_decision` → `Decision` →
`apply_decision` dispatch — is untouched.

```
think(faction):
  defend / recruit / set-policy / consolidate     ── unchanged rule blocks
  rival::update                                    ── unchanged
  ┌─ offensive decision ─────────────────────────────────────────┐
  │ if depth enabled:  plan = ai::search::mcts(.., budget, rng)   │
  │ else:              plan = one-ply softmax (today)             │
  │ issue plan.orders                                            │
  └───────────────────────────────────────────────────────────────┘
```

**Determinism is the load-bearing constraint.** The commander already runs on a
clone with a *passed* RNG (`turn_rng` seeds it from the snapshot — search must
never read `st.rng` directly; see the smarter-ai determinism invariant). MCTS
draws all its exploration/rollout randomness from that passed `rng`, in a fixed
visitation order, so a fixed seed yields a byte-identical search. This is the
single most likely thing to break.

## Slice graph

| # | Slice | Unlocks | Verify | Type |
|---|-------|---------|--------|------|
| 1 | [Search module](slices/01-search-module.md) | `ai::search::mcts` over the labeled candidate space + `SearchBudget`, deterministic from a passed rng, tested in isolation | unit tests on a tiny fixed map: deterministic, picks the known-best line, respects budget | substrate |
| 2 | [Wire + gate](slices/02-wire-and-gate.md) | `think` calls `mcts` when depth is enabled (a persona/tunable switch), one-ply otherwise | `full_game` liveness + determinism green with depth on; **perf within the slice-4 budget** | behavior |
| 3 | [Prove the depth](slices/03-prove-depth.md) | crafted two-move fixtures + one-ply-vs-MCTS side-by-side harness + a one-decision tree dump | MCTS finds the setup-then-strike line one-ply misses; no eval-gaming | behavior + visible |

Slice 1 lands as pure substrate (no live behavior change — the selector isn't
wired). Slice 2 is the first behavior change and the perf gate. Slice 3 is the
payoff demonstration and the anti-regression watch; it can reveal that depth
*isn't* buying anything, which sends you back to the gate.

## Sacred contracts (must stay green)

- **Determinism.** All search randomness flows through the passed `rng` in a
  fixed order; a fixed seed → byte-identical campaign. The smarter-ai
  determinism invariant and `randomness::same_seed_replays_identically` still
  hold with depth on.
- **Fog of war.** Expansion calls `plan::candidates` and `eval::score`, which
  already read only the faction's own `st.visible`. A deeper search may not see
  more than the one-ply search did at the root.
- **Player-legal orders only.** Edges are `plan::candidates` intents (→ `Move`
  marches); the search never manufactures an illegal order.
- **The real battle is still the physics sim.** `resolve::estimate` stays the
  AI's imagination only inside rollouts; the player-facing fight resolves through
  `crates/sim`.
- **Off-thread dispatch unchanged.** `mcts` runs inside `commander_decision` on
  the clone and returns a `Plan` whose orders go into the `Decision`. The
  dispatch/latency contract (`AI_DISPATCH_EVERY` / `AI_LATENCY` / `apply_decision`)
  doesn't change.
- **Health gate.** `full_game` (loop liveness, no-freeze, economy sanity) and
  `lopsided_war_concludes` stay green.

## Firewalls / non-goals

- **Swap the selector, not the substrate.** No changes to `resolve::estimate`,
  `rollout`, `eval`, `plan::candidates`, personas, or rivalry beyond reading them.
- **No new order types.** The branching set is exactly today's labeled intents.
- **No battle-physics or economy changes.** As in smarter-ai, off-limits.
- **Depth is opt-in.** One-ply remains the default selector; depth ships behind a
  switch so it can be A/B'd and disabled without touching the rest.

## Known unknowns (the slices resolve these)

- **Is depth worth its cost?** The gate's question, re-answered with real
  side-by-side play in slice 3. A "no" is a successful outcome.
- **Search budget.** Iteration cap vs. wall-time cap, sized against the
  per-decision perf budget the one-ply search already lives within (the AI cost
  model and its bottlenecks are recorded in the `lookahead-ai-cost` memory). MCTS
  multiplies rollouts per decision — slice 2 must show the hourly search stays in
  budget or cap it down.
- **Branching realism.** The labeled-intent edge set was tuned for one-ply; a
  tree may need a slightly richer (but still bounded) candidate set to express
  multi-step plays. Widen only if slice 3 shows a needed line is unreachable —
  never by enumerating raw moves.
- **Eval-gaming under depth.** A deeper search exploits evaluation blind spots a
  shallow one can't reach (turtling for a number, score-gaming sacrifices). If it
  appears, the fix is hardening `eval::score`, not shipping a clever-but-weird AI.

## How to start cold

Re-read the gate first and decide it's genuinely failed. Then a fresh agent
begins at `slices/01-search-module.md`. Each slice names its module seam, the
test that pins it, and what a human can run to judge it.
