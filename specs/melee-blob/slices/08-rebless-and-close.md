# Slice 08 — Full sweep, re-bless, ledger, close

Depends on all previous slices.

## Contract

The whole repo agrees the new physics is the truth: every test wall run,
every moved pin re-derived deliberately, every moved shot re-blessed after
being READ, and the spec closed as a rationale record.

## Steps

1. `scripts/danger-run-all-tests-super-slow` with `--no-fail-fast`; trust the
   exit code, never a grep over piped output.
2. `scripts/test-balance`: seam depth feeds kill rates, so `balance_*`
   outcomes may legitimately move. Classify each as physics-exposed
   (ledger it for a separate balance-unit pass) vs broken-by-bug — never tune
   physics back to keep a price.
3. Rebuild wasm. Re-film every melee vibe whose frames moved — expect:
   heavy-both, heavy-move-clash (must match heavy-both — the move==attack
   film), pike-v-pike, heavy-attack-defend, phalanx-v-heavy,
   heavy-v-phalanx-defend, penetration, offense, multi-penetration,
   surround/surround-attack. Read EVERY frame of each in order (approach →
   contact → grind → break → rout), not samples. Re-bless per
   screenshot-regression (headless installed-Chrome capture per the repo
   memory); refresh GIFs; `web/shots/weave/` snapshots if the weave moved.
4. Final visual gates: `compare-screenshots` contact sheets old-vs-new for
   heavy-both and pike-v-pike; unprimed `screenshot-critique` on the target
   claim ("front dissolves, bodies hold, no pinwheel"); non-blocking
   preview-shots for David.
5. Produce the change-report ledger: every moved test —
   {test, previous behavior, new behavior, why} — including the golden
   re-pins and every deliberately-regressed-then-re-derived pin.
6. Confirm the promised deletions happened (corridor clamp / 0.65 lean /
   double-count — whichever slices proved dead): net sim code down is the
   success signal. Update the first-principles backlog: retire entries this
   feature paid down, add any new named crutch it was forced to keep.
7. close-spec: archive to `specs/done/melee-blob/`, rewrite the README as a
   rationale record (divergences from this plan are the most valuable thing to
   record), keep `assets/before-*` and the seam-timeline visualization as
   provenance, and audit every statement against the code with fresh
   sub-agents.
