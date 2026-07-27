# meadow-polish — look-grade + density (reopened from living-meadow)

David's verdict on the shipped meadow vs the pen hero: "not nearly as nice."
Gap analysis (specs/done/living-meadow/README.md "Shipped") attributes the
reachable difference to (1) the un-built filmic look-grade and (2) near/mid
density below the hero's carpet. David explicitly reopened both
(ledger items #3 and #7). Two slices, same branch, judged at the existing
living-meadow fixture crops vs `specs/done/living-meadow/assets/pen-reference-hero.jpeg`.

## Slice P1 — look-grade (post owner)
Port the pen's grade to `BattlePostChain` (the ONE tonemap/grade owner —
never the grass material): filmic S-curve + saturation lift, violet-tinted
shadows / cream highlights (pen `shadowTint #5C6E9E`, warm highlight family),
bloom already exists — retune threshold/strength toward the pen's soft glow.
Preset-gated (environment id selects grade strength; overcast stays neutral).
Target: close-crop rendered median S from ~24% into the hero's 30-45% band
without crushing the Aegean neutrality under overcast.
Gate: S-probe + unprimed critique (color/mood only) + compare-screenshots vs
hero; battle suite must stay green or re-bless deliberately.

## Slice P2 — density push (scope ruling reversed by David)
Raise close-crop coverage materially beyond the shipped state (bottom-third
11% → target 22%+, mid unchanged-or-better): levers from slice 05's map —
fan-out 2→3 near/mid, width lift, thinning fadeStart, record budget if needed.
Cost watched: close ≤ ~2.2M tris; re-run `perf:30k` after — worst camera must
stay above the 26 fps floor.
Gate: coverage measurement + unprimed density critique + perf re-run.

Both: determinism (setTime only), no new owners, no schema changes.
Evidence into specs/done/living-meadow/assets/polish-evidence/.

## Landed (2026-07-27)

**P1 look-grade:** BattlePostChain pre-AgX grade (S-curve, violet/cream
split-tone, shadow lift, saturation mix), golden-gated. Two codex rounds left
the saturation path inverted/dead (default boost 0.18); orchestrator sweep
landed 1.15 -> grass S 24->39% (hero band), hue 69deg keeping the green
undertone after 1.3 read mustard (unprimed critique). Overcast neutral (27%).

**P2 density:** fan-out 3x near/mid + width lifts -> close-crop coverage
near 9.3->18.6%, mid 19.6->30%, at 1.31M tris (vs 2.4M budget).
perf:30k re-run: 22.26/30.21/22.43ms — unchanged from pre-polish, PASS.

**Final unprimed verdict vs the hero: PARTIAL** (up from the implicit
STILL-FAR that triggered this pass) — color/mood approaching; the two
remaining gaps are (a) full sward continuity at the very-near band and (b) the
fixture map's placeholder cone mountains reading graphic (test-map art, not
grass/atmosphere — real battle maps have modeled terrain). Diminishing returns
past this point without a photo-mode camera + map dressing.

## P2 continued (2026-07-27, David: "thicker not denser — keep going")

Round 2 (count-not-width): fan-out near/mid/far 4/10/3 with seeded 0.35-0.95m
clone spread, widths pulled back (1.3/1.5). Critique: mid band bare ground
40-50% -> 25-30%; near band ~50%; gaps still read as flat dirt.
Round 3: fan-out 5/14/3 (3.59M tris), underlayer lifted toward blade family
(ground-hash re-pinned cefa5f24), turf mottle/stubble strengthened via
TURF_CONTRAST (its owner). Mid band now approaches reference-class packing;
NEAR band (40-55m) remains gapped — the 1.5m record grid is the structural
limiter (codex + critique concur). Remaining levers, in order: (1) record
density — fieldCellSize 1.5 -> ~0.8 + budget >1M (memory/CPU cost, the real
fix); (2) ground grain scaled up at this camera range (current mottle reads
too fine); (3) a photo-mode camera would change the requirement. Perf re-check
owed after the 3.59M-tri state (was PASS at 2.4M).
