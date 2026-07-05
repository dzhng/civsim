# Slice 04 — Family C: sustained lateral slosh in the grind

## Contract unlocked

The lateral motion inside a static grind is attributed and bounded: we know
which force carries the ~0.63 m/s sustained lateral shimmer (70–86 of 120
men, 1.8–2.6m excursions, indefinitely), we know how much of it is
physical (men jostling in a press is REAL) versus solver artifact, and the
gate pins the corrected level. This is David's "lots of shifting left and
right during battles."

## Attribution FIRST — this slice may legitimately end at a number

Unlike A/B, a nonzero floor here is correct physics: a press is not a
parade. The failure mode to avoid is tuning down real jostle to look calm
(that's the "wrong window" metric trap inverted). The pass must:

1. Film it: run the write-vibe matchup nearest to an even infantry grind
   and READ the frames — is the visible slosh whole-FILE lateral surfing
   (solver artifact) or man-scale jostle (plausible)?
2. Ledger it: force-trace a 2s window deep in the immortal grind; decompose
   the lateral component by channel (expect candidates: PivotSpring,
   WeaveNet, CompPush, BodySeparation*, the pike lateral friction's
   absence for non-strict formations).
3. Compare rear ranks vs front line: the front trading blows may jostle;
   rank 5 of a static press should be near-still. Extend `window_motion`
   use with a per-rank split (helper in the settle module) — if rear ranks
   carry the same lateral speed as the front, it's the lattice ringing,
   not combat.

Then EITHER fix the convicted channel (same doctrine as 02/03: the force
must zero at equilibrium; no uniform drag — the reversal-gated scalpel
family exists for exactly this, but root removal beats damping) OR, if the
frames read as honest jostle, write the number down: tighten
`grind_lateral_slosh_bounded` to the observed healthy level, document the
rationale here, and close the slice as "bounded, physical."

## Verification

- `grind_lateral_slosh_bounded` un-ignored and pinned at the post-slice
  level, with the per-rank assertion (rear-rank lateral ≪ front-rank).
- The write-vibe frames for the touched matchup re-read; re-bless only
  after the new behavior is confirmed against the whole timeline
  (approach → contact → grind), never to silence a diff.
- Combat outcomes: this is the slice most likely to brush balance. Run the
  full suite; any balance_* movement gets provenance + a change-report
  entry, and if a physically-sound fix flips a knife-edge pin, re-derive
  the pin WITH David per tweak-mechanics — never dial the fix to the pin.
- Golden may move here if the fix touches the shared steer path — expected
  containment is "grind-only": the slice-01 settle gates (no combat) must
  stay byte-similar; if THEY move, the fix leaked out of the grind.

## Stays green

Slice 01–03 gates; all mechanics invariants (centroids, no pass-through,
facing); missile/charge/trample families.

## Human feedback that would change this slice

The realism call on how much jostle a grind should show is David's taste
call — present the vibe frames + the per-rank numbers as a non-blocking
checkpoint (preview-shots for the frames, ~5 min window), then decide on
the evidence and record it here.
