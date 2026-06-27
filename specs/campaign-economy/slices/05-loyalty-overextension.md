# Slice 05 — Loyalty / overextension (the runaway-leader fix)

**Unlocks:** sprawl has diminishing, self-correcting returns; holding a fresh
conquest costs an army's presence. The headline macro-health slice — judged
against the slice-00 baseline.

## The model: signed pressure from adjacency + army anchors

No capital. Each month a city's loyalty **drifts up or down** by the balance of
friendly vs enemy presence among its connected territories.

- **Adjacency** = the road graph collapsed to cities (A neighbours B if linked
  through only junctions). Static — precompute from `WorldMap`.
- **Connected territories** are neighbouring **cities** and **armies** standing on
  or adjacent to the city. An **army acts like a city** for loyalty if it has
  **≥ 10 units** (full friendly anchor); below that its weight **scales down**
  (`min(units/10, 1)`). Armies are *sources* of presence, they don't hold loyalty
  themselves.
- **Drift = friendly_weight − enemy_weight**:
  - friendly neighbour city → weight ∝ *its own* loyalty (so loyalty propagates —
    a barely-loyal neighbour lends little: the gradient),
  - friendly army (≥10 units) → full weight,
  - enemy city / enemy army → negative weight (same size rule for armies).
- **More connected enemy territory than own → loyalty falls.** Net friendly →
  rises toward max. So the **frontier is disloyal by default** (it borders the
  enemy), and the **interior fills in** as the core stabilises and propagates.
- **Conquest** flips a city to the new owner with **a little starting loyalty**
  (not zero). If it's surrounded by enemies, the only thing holding it is a
  **stationed army**: leave, and net pressure goes negative and it **revolts in
  ~a month** (calibrate the drift rate to that). Park a ≥10-unit army and it holds
  and slowly pacifies.
- **Effects:** low loyalty drags **output and population growth** (slice 01/03);
  below a threshold the city **revolts** (flips to independents/rebels).
  Over-exploitation (Throttle → Exploit) adds enemy-side drag.

## Seam
- `state.rs`: `CityState.loyalty` (owned core high; conquest starts at a small
  positive).
- `mapdata.rs`/`pathfind.rs`: static city-adjacency; per-month army-near-city
  lookup.
- `economy.rs` monthly: snapshot loyalties + army positions/sizes → for each city
  sum friendly vs enemy weight (cities by loyalty, armies by `min(units/10,1)`) →
  drift loyalty by the signed difference → apply output/growth scaling + revolt
  check. Snapshot-then-apply for determinism; revolt rolls from `st.rng`; armies
  in id order.

## Human can run
- Browser: city panel shows loyalty; the map renders the **loyalty gradient**
  (interior bright, frontier dim, an army's halo holding a salient). Harness (00):
  the **runaway gap shrinks** — leaders accrue restive frontier they must garrison
  or lose.

## Verifies
- `enemy_majority_neighbours_drain_loyalty` — more enemy-connected than own → it
  falls (AI off — owned by the mechanic).
- `army_anchors_a_surrounded_conquest` — a ≥10-unit army adjacent holds/raises a
  conquest's loyalty; `small_army_anchors_proportionally` (<10 scales down).
- `unsupported_surrounded_conquest_revolts_within_a_month` — the key timing test:
  take a lone enemy city, leave, it revolts in ≈1 game-month.
- `gradient_relaxes_inward` — a pacified core lifts the layer behind it over months.
- Harness: leader-vs-trailer gap closes vs slice-00; gate still concludes (a
  stalled runaway must not become a *stalemate* — watch calcification).

## Stays green
- Gate, determinism (snapshot-then-apply, BTree/id order, rng for revolts),
  save/load. Revolts must not deadlock the loop.

## Feedback that would change it
- The army-anchor threshold (10 units) and size scaling; the drift rate (months to
  pacify / months to revolt); conquest's starting loyalty; enemy-army vs
  enemy-city weight; revolt severity (independents vs prior owner); whether
  loyalty also gates recruitment from the pool.
