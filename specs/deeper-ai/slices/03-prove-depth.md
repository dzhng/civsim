# Slice 3 — Prove the depth (or disprove it)

## Contract

Demonstrate that multi-ply buys a strategically better move one-ply can't reach —
on crafted fixtures and in side-by-side play — and watch that it doesn't turn
gamey. This slice can legitimately conclude depth **isn't** worth it, which sends
the decision back to the README gate.

## API seam

No new production API. This slice is fixtures, a comparison harness, and a dump:

- **Crafted "needs a two-move plan" fixtures** under `crates/campaign/tests/`:
  positions where the highest-scoring *single* move is a trap or a dead end, and
  the winning line is setup-then-strike (feint that pulls a garrison, *then* the
  city it bared; mass-then-commit rather than piecemeal).
- **Side-by-side harness:** same seed and map, one faction one-ply and one depth,
  driven through the existing `common::run_ai` / `drive_ai` path. Reports the
  diverging decisions and the end-state delta (cities held, war outcome).
- **One-decision tree dump:** for a single fixture decision, print the search
  tree (depth, visit counts, chosen path) so the added intelligence is auditable.

## What the human can run / see

- The side-by-side harness on a real map: the depth side should visibly set up
  plays the one-ply side can't (feint→strike, mass→commit), and the tree dump
  should make *why* legible.

## Verifies

- **Beats one-ply where it should:** on each fixture, depth chooses the
  setup-then-strike line and one-ply doesn't — assert the specific first move.
- **No regression where it shouldn't matter:** on positions with an obvious best
  move, depth and one-ply agree (depth doesn't get worse for the cost).
- **Not gamey:** assert against eval-blind-spot exploits — no turtling that
  inflates the score without progress, no score-gaming sacrifices. If found, the
  finding is "harden `eval::score`," logged and flagged, not shipped around.

## Stays green

- All prior contracts. This slice adds tests and a harness; it changes no
  production behavior.

## Feedback that would change this

- **If depth doesn't demonstrably beat one-ply** on the fixtures or in play, that
  is the gate failing in retrospect: disable depth (slice 2's switch defaults
  off) and record that one-ply + eval is sufficient. Not a failure — the planned
  outcome of a well-set gate.
- If depth helps only in narrow situations, scope it to the personas/fronts where
  it pays rather than running it everywhere.
