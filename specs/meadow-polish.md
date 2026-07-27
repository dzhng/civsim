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

## P2 round 4 (2026-07-27): the pen's actual params — record density was the wall

David asked whether we'd copied the reference implementation params exactly.
Extracted them: the pen runs **blades/m2 = K/d^1.5 with K~17600** (1100/m2 in
its near ring; 25-70/m2 at our visible 40-80m band) and keeps blades HAIR-THIN
(angular width floor 1.7-2.75 px) — coverage comes from count, never width.
We had been at ~6/m2 with width lifts: exactly backwards on both axes.

Changes: fan-out 6/28/3, width lifts killed (1.0/1.1), and — the real lever —
the fixture now focus-samples records at the crop (radius 300m, 0.6m cells,
599k records, baseWidth 0.055) via the sampler's existing focus support,
mirroring the pen's camera-centred rings. 12.0M submitted triangles — the
pen's own per-frame scale.

Unprimed critique: bare ground 35-50% -> 15-20% (much now reading as shadow),
no moire, graceful LOD; verdict at pixel-zoom still short of the reference's
painted un-resolvable nap (our strokes resolve; theirs are brushwork — partly
irreducible), mild diagonal-comb monotony flagged.

**Caveats before productionizing:** (1) this is a FIXTURE demonstrator — the
production battle still uses static-whole-map records; shipping it needs the
camera-following focus rebuild (machinery exists: pendingFocus/rebuilds) as a
proper slice with hysteresis; (2) 12M tris needs a Metal perf gate and likely
the pen's depth-prepass trick; (3) sample build time at 0.6m cells needs the
async slicing path, not the synchronous fixture build.

## P2 round 5 (2026-07-27): ring merge + measured perf

David: p2f best look but grass vanished past the focus radius; p2e great reach
but sparse close. Fix = the pen's own shape: RING MERGE — the fixture concats
the focused 300m set (599k records) with the world's whole-map set (992k) so
the horizon stays populated. 1.6M records / 15.6M tris.

Measured on Metal (rAF frame times, 12s window, chrome channel):
- p2e whole-map: 3.7M tris — 11.4ms median (~87fps), p95 26ms
- p2f focused:  12.0M tris — 20.4ms median (~49fps), p95 54ms
- p2g merged:   15.6M tris — 26.2ms median (~38fps), p95 69ms
All above the 26fps floor; merged has real p95 spikes.

Productionizing needs (in order): (1) dedupe the overlap — filter world
records inside ~280m of focus before concat (~15-20% tris back); (2) the
pen's depth prepass (it calls this "the single most valuable thing in this
renderer" at 1200 blades/m2 — our early-Z story at 15M tris is the p95);
(3) the camera-following focus rebuild slice.

## Slice P3 — productionize the p2g look (David approved 2026-07-27)

Three optimizations, in order:
1. **Ring-overlap dedupe** (route-level now; rebuild-level when P3c lands):
   filter world records within ~280m of the focus centre out of the far ring
   before concat (~15-20% tris back).
2. **Depth prepass for the blade field** — the pen's biggest win at this
   density (30 blades deep per pixel of overdraw without it). Two near tiers
   drawn depth-only first (no fragment work), then the beauty pass rides
   early-Z with LESS-EQUAL. Targets the p95 spikes (69ms) and should pull the
   median under ~20ms.
3. **Camera-following focus rebuild** — the dense ring follows the battle
   camera via the existing pendingFocus/rebuild machinery with hysteresis
   (rebuild when focus moves > ~80m, async sliced, prefix-shuffled records so
   thinning stays fair during transitions).
Gates: Metal rAF median/p95 on the fixture; perf:30k for production; all
snapshots deterministic; 41/41 vitest.

## P3.1 + P3.2 landed (2026-07-27)

**Dedupe (P3.1):** far-ring records inside focus-radius-20m filtered before
concat: 1.60M -> 1.54M records, 15.6M -> 14.4M tris.
**Depth prepass (P3.2): built, verified, DEFAULT OFF.** Pixel-identity proven
(byte-identical on/off). Metal A/B: ON 27.2ms median / p95 67 vs OFF 26.8 /
63 — net-negative on apple/metal-3 because TBDR hardware HSR already removes
opaque overdraw and the prepass doubles near/mid vertex load (we are
vertex-bound at ~14M tris; the pen was fragment-bound on WebGL). Toggle +
stats kept for immediate-mode GPUs.
**Perf vs pre-spec (production, perf:30k):** before 22.58 gpu-median mid /
~30.7 vista; now 21.65 / 22.09 — production is faster than before the spec
with the full meadow look on. The p2g fixture look runs 26.8ms median (~37fps)
on Metal, above the 26fps floor.
Remaining: P3.3 camera-following focus rebuild (productionizes the dense ring).
