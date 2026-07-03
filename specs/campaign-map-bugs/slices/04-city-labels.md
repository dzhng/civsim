# 04 — B2 + B8: land-aware city-label anchoring ★human

**Contract unlocked:** overview city labels sit on land beside their marker —
no more TARRACO/CORINTHUS names floating in the sea — and long names (B8:
CASTRUM TRUENTINUM) stay ashore because the score uses the full measured text
box. Evidence: `assets/evidence/b1-tarraco.png` (the label half),
`david-corinthus-label-water.png`, `b8-castrum-truentinum.png`.
Depends on 01 (anchors moved) and 03 (the shared scorer exists).

## API seam (one label system; one placement owner)
- The city-label layout in mapPass calls the SAME placement scorer slice 03
  built: candidates right/left/above/below the marker, scored by land-fraction
  of the full text box (true atlas metrics), current below-right kept as the
  tiebreak so inland cities don't churn. The emitter in `renderer.ts` stops
  hardcoding a single screen offset and requests a placement.
- Markers do not move — labels move around them.
- **B8 is an acceptance check, not a mechanism**: if the anchor chooser can't
  land Castrum Truentinum's second word, escalate to a follow-up micro-slice
  (do NOT bolt wrapping into this one).

## What the human can see
- Overview capture; crops of TARRACO, CORINTHUS, CASTRUM TRUENTINUM.

## ★ Human checkpoint (non-blocking)
Label placement is taste — overview + one regional shot; ~5 min; else proceed
on evidence and record.

## Verification
- Probe: those three label bboxes mostly-land; visibleLabels count within
  tolerance of before (placement must not trigger a collision bloodbath — 09
  owns collisions proper).
- campaign-lod + campaign-polish-markers re-blessed once; critique last.
- **LANE LABELS close-out oracle:** find-map-bugs on the whole-map shot —
  sea-label-on-land AND label-seaward classes absent, no new findings.

## Firewalls
- No per-city special cases; no DOM involvement; army/faction emitters
  untouched; a second placement implementation is a review-reject.
