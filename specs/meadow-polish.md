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
