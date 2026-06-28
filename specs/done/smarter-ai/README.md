# Smarter campaign AI — lookahead, personas, rivals

*Shipped. This records why the commander is built the way it is and what must
stay true; the code in `crates/campaign/src/ai/` is the source of truth for how.*

## What shipped

The campaign commander **deliberates** instead of reacting. Its defend / recruit
/ build / consolidate steps stay rule-based, but the one consequential, uncertain
decision — which city to march on, or whether to march at all — goes through a
one-ply lookahead: enumerate a few candidate commitments, clone the world and
roll each one forward resolving battles the cheap way, score the resulting
position, and sample a choice. Personas weight the score differently and demand
different edges before attacking, so the map grows distinct personalities; a
drifting mood and a softmax give the choice a human, non-solver feel.

Entry points, in pipeline order:

- `ai::think` (`crates/campaign/src/ai.rs`) — the per-faction turn. Its defend,
  recruit, set-city-policy and consolidate steps are rule-based; only the
  offensive step is the searched decision.
- `ai::plan::candidates` (`ai/plan.rs`) — proposes a few labeled `Plan`s
  (`hold`, `focus`, `rival`, `nearest-beatable`, `nearest-any`), de-duplicated.
- `rollout::forward_plan` (`rollout.rs`) — rolls a plan forward on a
  caller-cloned state (`think` clones before each call), auto-resolving battles
  via `resolve::estimate` (`resolve.rs`).
- `ai::eval::score` (`ai/eval.rs`) — one scalar from a persona's `Weights`.
- `ai::select::pick_softmax` (`ai/select.rs`) — samples a plan by score.
- `ai::persona::profile` (`ai/persona.rs`) — maps `AiPersona` (`mapdata.rs`) to
  the four dials a faction runs the search with.
- `ai::rival::update` (`ai/rival.rs`) — refreshes the grudge before planning.

Pinned by the tests in `crates/campaign/tests/`: `estimate`, `rollout`,
`personas`, `rivals`, `randomness`, and the health gate `full_game`
(`lopsided_war_concludes`).

## Why it's shaped this way

**Search lives in evaluation, not depth.** One ply only. Most of the felt
intelligence is in the battle estimate and the position score, not in looking
many moves ahead, so v1 deliberately stops at one ply — MCTS was scoped and left
unbuilt (see *What we didn't build*).

**Only the uncertain decision is searched.** Recruit-to-cap, build, merge-idle
are deterministic bookkeeping; searching over them buys nothing and costs clones.
Routing just the offensive through rollout keeps the search small.

**The strategic layer was already search-shaped**, which is why this was cheap to
add: `CampaignState` is `Clone`, collections are `BTreeMap`/`Vec` in id order,
and `sim::tick` is a pure step given the static map. Clone → roll forward → score
needed no new substrate beyond promoting the test harness's cheap battle resolver
into `resolve::estimate`.

**The rollout is bounded by what the plan attempts, not a fixed window.**
`forward_plan` rolls until every ordered army *settles* (arrives and goes quiet,
or dies), floored at `AI_ROLLOUT_HORIZON` (one game-day) and capped at
`AI_ROLLOUT_CAP` (~4 game-days). A neighbouring conquest resolves in a day or
two; a march across the map runs to the cap. This is the key fix over a fixed
short horizon, which couldn't see the payoff of a long offensive. The plan left
the horizon as an open question (120? 180?); the answer was *adaptive*, not a
constant.

**Cost is held down by cadence and gating, not by shrinking the search.** The
expensive clone-and-roll runs only when an idle army needs directing and only
every `AI_SEARCH_EVERY` (360) ticks — roughly once per offensive leg, since
armies take days to cross the map. The cheap rule steps still run every commander
pass. Candidate count and attacker count are capped (`AI_ATTACKERS`).

**Randomness is two knobs, both deterministic** (see *Invariants* — they don't
draw from the live RNG the naive way):
1. **Bravado** — a slow per-faction mood random-walk (`AI_BRAVADO_DRIFT`, clamped
   `[0.7, 1.3]`) that biases offensive plans only, scaled by the persona's
   `bravado_aggro`. It's sticky, so a faction runs hot or cold in streaks rather
   than flickering per decision.
2. **Softmax temperature** — `pick_softmax` samples by score instead of taking
   argmax, so among comparable plans it won't always play the textbook line.
   `select_scale` doubles as a persona dial (cold/Calculating ↔ erratic/Warmonger).

**Personas are presets, not code paths.** Every faction runs the identical
search; a persona only sets four dials — `weights` (what to value), `gate` (the
strength edge it demands before a city counts as beatable), `select_scale`, and
`bravado_aggro`. That's what makes a turtle, a merchant and a warmonger feel
different while sharing one brain, and it keeps the search single-pathed. Seven
personas ship (`Expansionist`, `Neutral`, `Defensive`, `Mercantile`,
`Opportunist`, `Calculating`, `Warmonger`); `Expansionist`/`Neutral` reproduce
the pre-persona defaults so old maps play identically.

**Rivalry is a relationship, not a persona.** Any faction can carry a nemesis,
seeded from the map or formed in play when attacked, escalating toward the
strongest aggressor that hates it back and dissolving on a lopsided power gap
(`AI_RIVAL_SWITCH_MARGIN`, `AI_RIVAL_DISSOLVE_RATIO`). It only *biases* the search
by adding a `rival` candidate plan — the rollout still has to find the march
worthwhile, so a much stronger rival's wall loses to an easier conquest.

**The commander is computed off the live state, on a delay.** This is the largest
divergence from the original plan, which assumed `think` mutated the live state
in place. Instead `commander_decision` runs the whole turn on a *clone* and
returns a serializable `Decision { orders, bravado, rival }`; the host dispatches
a snapshot every `AI_DISPATCH_EVERY` ticks and applies the decision
`AI_LATENCY` ticks later via `apply_decision`. The payoff: the AI can run on a
worker, and the outcome is independent of how long it took to compute — latency
only ever forces a wait, never a different result. Tests drive the same path
synchronously via `drive_ai`.

## Invariants — must stay true

- **Determinism.** BTree-only, id-order iteration, RNG in state. The search
  clones before rolling forward, so the live `st.rng` stream is byte-identical
  with and without search. **Subtlety:** the commander runs on a clone, so its dice can't be drawn
  from `st.rng` directly — a clone's RNG wouldn't persist, and would repeat
  whenever the world RNG hadn't advanced, freezing the AI's choices. `turn_rng`
  instead seeds a fresh per-turn stream from the snapshot RNG mixed with tick and
  faction id. `rival::update` uses no RNG at all. Pinned by
  `randomness::same_seed_replays_identically`.
- **Fog of war.** Search reads only the faction's own `st.visible`; a rollout
  sees what the real commander sees at decision time, never omniscient.
- **Player-legal orders only.** The commander issues only `Move` / `Recruit` /
  `SetPolicy` / `Merge` — orders a player could issue; the searched offensive
  itself emits only `Move` marches.
- **The real battle is the physics sim.** `resolve::estimate` is the AI's
  *imagination only*; the player-facing encounter still resolves through
  `crates/sim`. Never route a live battle through the estimate.
- **No battle-physics or economy changes.** This work only *reads* the economy
  (for eval weights) and never touches `crates/sim`.
- **Health gate.** `full_game` (loop liveness, no-freeze, economy sanity) and
  `lopsided_war_concludes` stay green.

## What we didn't build (and why)

- **Perceived-strength fuzz.** The plan had a *third* randomness knob: a
  `perceive(true_str, rng, sigma)` helper wrapping the strength sizing in
  `eval`/`candidates`, so the AI occasionally mis-sizes a fight and commits on a
  wrong number. The randomness commit shipped only bravado + softmax (no recorded
  "tried it and cut it" — it was just left out as the redundant one). Two reasons
  it's the natural one to drop: bravado already produces the "felt brave,
  committed to a gamble" effect fuzz was meant to add; and unlike the two that
  shipped — bravado biases only offensive *plan scores*, softmax perturbs only
  *selection* — fuzz would corrupt the shared strength numbers `eval` reads,
  which also size up *defensive* threats, so it risks the AI mis-*defending*, not
  just mis-attacking. If you ever want the AI to genuinely misjudge strength
  (not just mood-swing into a gamble), this is the unbuilt lever — scope the fuzz
  to the offensive read so it can't degrade defense.
- **Event-triggered re-think (off-cadence).** Planned so a faction could re-decide
  the instant it's attacked or besieged, between scheduled searches. Not built;
  `think` fires only on cadence. **Watch out:** a few code comments still cite
  "the event-triggered re-think" as the source of urgent mid-march reactions —
  that path does not exist; those reactions currently wait for the next cadence.
- **Rivalry without it.** The plan made rivals *depend* on that event detection
  (a grudge forms when you're attacked). Shipped independently instead:
  `rival::update` runs synchronously at think-time and reads `st.encounters` plus
  who's standing on your city nodes (`aggressors`) — no event bus needed.
- **MCTS / multi-ply.** Scoped (the old slice 9) and gated on a judgment call
  after one-ply shipped. One ply proved enough; left unbuilt.

## Tuning dead-ends worth remembering

- A **hot softmax on a turtle** (`Defensive`) made it commit hopeless assaults on
  a whim. Fixed by a cold `select_scale` (3000) so a cautious persona deliberates
  rather than gambles — see the note in `ai/persona.rs`.
- `AI_SEARCH_EVERY` can't go too high: if the offensive is re-decided too rarely,
  the hourly consolidate step pulls a just-won army home before the next search
  re-commits it. 360 ticks is tight enough to keep an offensive alive.
