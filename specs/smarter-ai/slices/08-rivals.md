# Slice 8 — Rivals

## Contract

Every faction can have a **rival** — a persistent nemesis it leans toward
fighting, independent of persona. A rivalry is either seeded from history
(Rome ↔ Carthage) or forms in play (whoever attacks you becomes your rival),
escalates toward the strongest real threat, and **auto-dissolves once the two
sides are too far apart in power** (so a snowballed giant stops fixating on a
crushed minnow, and a doomed minnow stops suicidally fixating on a giant).

This is narrative texture layered on the optimizer — exactly the "believable >
optimal" north star. The rival doesn't override the cold strategy; it *biases*
it. A faction will still opportunistically eat a weak neighbor (`diplo_target`),
but it bristles and over-commits against its rival.

Distinct from `diplo_target` (`ai.rs:261`), which is the cold "weakest reachable
victim." `rival` is the warm "who I have a history with." They can differ, and
keeping both alive is the point — opportunism *and* grudge.

## API seam

- **State:** `rival: Option<FactionId>` on `Faction` (`crates/campaign/src/state.rs`).
  Serializable → determinism + saves for free. `Option`, so "no current rival"
  is a real state.
- **Seeding (map data):** optional `rival` string on `FactionDef`
  (`mapdata.rs:90`, parsed like `ai_persona` at `mapdata.rs:165`). Resolved to a
  `FactionId` at load. Asymmetric is allowed (the field is per-faction), but a
  seeded historic rivalry usually sets both sides.
- **Dynamic selection** — `crates/campaign/src/ai/rival.rs`:
  ```rust
  /// Re-evaluate `f`'s rival. Called on the diplomacy/think cadence AND on an
  /// "attacked" event (reuses slice 7's event detection). Pure-ish: reads
  /// strengths + relations, writes only `factions[f].rival`.
  pub fn update(map: &WorldMap, st: &mut CampaignState, f: FactionId)
  ```

### Selection rules (in `update`)

Let `aggressors(f)` = factions currently warring on `f` / attacking its armies
or cities (from `relations` + active encounters), and `strength(g)` the
cost-weighted yardstick from `ai.rs:14`.

1. **No rival + attacked** → the attacker becomes the rival.
2. **Escalate to the real nemesis** — prefer the *strongest* faction that is
   both hostile to `f` **and** already counts `f` as *its* rival (mutual rivalry
   is the strongest signal). This is David's "another faction that also rivals
   Rome and is stronger → Rome switches." A genuine arch-enemy outranks a minor
   raider.
3. **Hysteresis on switching** — only switch away from an existing rival if the
   new candidate's strength exceeds the current rival's by `AI_RIVAL_SWITCH_MARGIN`
   (e.g. 1.3×). Prevents flip-flopping as the balance jitters.
4. **Auto-reset on power gap** — if `max(strength(f), strength(rival)) >
   AI_RIVAL_DISSOLVE_RATIO * min(...)` (e.g. 3×), clear the rivalry
   (`rival = None`). Re-selectable later if a new threat arises. Also clear if
   the rival is eliminated (no cities, no armies).

All draws/iterations are deterministic (BTree / id order); no RNG needed here —
rivalry is about strength + relations, not dice.

## Effect on the AI (the payoff — reuses existing machinery)

- **Eval (slice 3):** add a `rival` term to `Weights` — hurting the rival's
  cities/army scores higher, and threat *from the rival* is penalized harder
  (you defend more fiercely against your nemesis).
- **Candidates (slice 3):** the `focus_city` logic (`ai.rs:261`) prefers the
  rival's weakest reachable city over the cold `diplo_target` when they differ —
  but only as a bias (a much weaker rival target loses to a juicy opportunity).
- **Diplomacy (`ai.rs:69`):** more willing to ally against the rival, less
  willing to make peace with it.

## What the human can run / see

- A seeded Rome/Carthage fixture: the two fixate on each other even when easier
  prey is adjacent, and the AI probe (slice 3) shows the rival-biased scores.
- A dynamic fixture: an unrivalled faction gets attacked → adopts the attacker;
  then a stronger mutual-rival appears → switches; then it snowballs past 3× →
  the rivalry dissolves and it goes back to cold opportunism.

## Verifies

- **Seeding:** map `rival` field resolves and survives a save/load round-trip.
- **Adopt-on-attack:** unrivalled faction attacked → rival set to attacker (test
  reuses slice 7's event hook).
- **Escalate + hysteresis:** with two aggressors, the stronger mutual-rival is
  chosen; a marginally-stronger newcomer does **not** trigger a switch (margin
  holds), a clearly-stronger one does.
- **Auto-reset:** drive the power ratio past `AI_RIVAL_DISSOLVE_RATIO` → rival
  clears; eliminate a rival → clears.
- **Determinism:** fixed seed → identical rival history (no RNG, BTree order).
- **Bias not override:** a faction with a weak rival still takes a far better
  opportunity elsewhere (rival is a thumb on the scale, not a straitjacket).

## Stays green

- Determinism doctrine; `full_game.rs` liveness (rivalry must not freeze the loop
  into two factions ignoring everything else — the auto-reset + bias-not-override
  rules exist to prevent exactly that).
- Existing maps with no `rival` field: every faction starts `rival = None` and
  behaves as slices 4–7 — rivalry is purely additive.

## Feedback that would change this

- The two thresholds (`SWITCH_MARGIN`, `DISSOLVE_RATIO`) are pure feel — too
  sticky and rivalries never evolve; too loose and they flip every battle. Named
  tunables, dialed against in-app drama.
- If David wants rivalry to also color the *player's* experience (UI showing "your
  rival," a vendetta event log), that's a frontend follow-on — the state field is
  already there to read.
