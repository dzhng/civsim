# Slice 7 — Event-triggered re-think

## Contract

The AI keeps its hourly deliberation cadence but reacts *immediately* to a small
set of events that happen **to it**, so it doesn't stand around for up to 60
ticks while a threat develops. Deliberately **not** tied to player orders —
civsim is continuous-tick (the player has no discrete "move"), and re-thinking
on every order would feel omniscient and twitchy. We trigger on world events,
not on the player.

## Triggers (the whole set)

1. **Contact** — one of the faction's armies enters an encounter
   (`encounters()` creates/advances an `Encounter` involving it).
2. **City threatened** — a hostile crosses into the threat radius of one of its
   cities (the condition already computed in `think()` step 1, `ai.rs:163-188`).
3. **Siege begins** — an enemy starts occupying / besieging one of its cities
   (`economy::occupations` transition).

## API seam

- In `crates/campaign/src/sim.rs tick()`, the phases that already detect these
  (`encounters`, `occupations`, the movement/contact step) push the affected
  faction id into a `BTreeSet<FactionId>` "needs-rethink" set on the state
  (deterministic; cleared each tick).
- After the normal phases, before the `tick % 60` block:
  ```rust
  for &f in &st.rethink_dirty.clone() {
      if map.factions[f as usize].ai_persona.campaigns() {
          ai::think(map, st, f, &mut bfs);
      }
  }
  st.rethink_dirty.clear();
  ```
- **Debounce:** a per-faction `last_think_tick`; skip an event re-think if the
  faction thought within the last `AI_RETHINK_DEBOUNCE` ticks, so a messy
  multi-army contact doesn't trigger a re-think storm in one tick.

## What the human can run / see

- A scripted scenario: park the player's army just outside an AI city's threat
  radius, then step it in. The AI pulls a defender home **on the same/next
  tick**, not up to an hour later. Contrast video/log vs. main branch.

## Verifies

- **Feint-response test:** move a hostile into threat radius → assert the AI
  issues a defensive `try_move` within `AI_RETHINK_DEBOUNCE` ticks (not at the
  next 60-boundary).
- **No storm:** a 3-army simultaneous contact triggers at most one re-think for
  that faction that tick (debounce holds).
- **Determinism:** dirty-set is a `BTreeSet`, drained in id order; fixed seed →
  identical trajectory.
- **Cost:** event re-thinks are bounded (debounce) — `full_game.rs` wall-time
  doesn't blow up vs. slice 4.

## Stays green

- Hourly cadence still runs (`commanders()` unchanged); event re-think is
  additive.
- Determinism doctrine; `full_game.rs` liveness.

## Feedback that would change this

- If reactions feel *too* instant/clairvoyant, raise the debounce or add a
  small reaction delay (a "courier time" before the commander learns of the
  event) — which is also more believable than telepathy. Worth offering as a
  tuning knob if David wants the lag to read as human.
