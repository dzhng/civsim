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

## P3.3 landed (2026-07-27) — verified, ring opt-in pending zoom gate

Two-set architecture in battleWorld (static base + async camera-following
300m ring, 80m hysteresis, 48m snap, latest-wins). Verified: fixture parity
with the approved p2g shot (mean diff 1.9 — dedupe + ring-snap residual),
byte-stable, ring follows a moved focus (rebuild observed, 1.61M records at
the new centre). One fix round: first-build lifecycle (setTerrain-before-
camera race; hysteresis must not gate the first ring).

OPEN: with the ring always on, perf:30k vista hit 37.25ms gpu (>33 budget) —
the ring is invisible at tactical zoom; production default is OFF until the
ring is gated by the grass zoom cutoff (the named next step). Final perf reads
of the session (34.7ms vista with ring off vs 22.1 earlier) are confounded by
suspected thermal throttle after ~10 consecutive GPU runs — needs one cold
perf:30k to disambiguate before flipping the default.

## P3.4 zoom gate landed (2026-07-28) + the remaining finish line

Gate: zoomT-only hysteresis (engage >= 0.62, release < 0.54) — codex's raw-zoom
upper cap was removed after the zoomT mapping showed the perf scene's zoom-9.5
stop is the MOST zoomed-in camera (zoomT 1.0), exactly where the ring belongs.
Ring default ON. Two bugs fixed en route: level-triggered release re-applied
the 1M base set EVERY released frame (rAF 140ms at the mid stop — now
edge-triggered), and activeRecordBudget under-reported the merged cap (now
base+ring = 2M; perf-scene foliage contract re-pinned to the two-set
architecture). Cold runs settled the thermal question: vista-with-ring 37.15
-37.28ms GPU median is real steady-state, not throttle.

perf:30k with ring on: ALL contracts green except three checks against the
LOCKED 33ms budget: vista GPU median 37.15 (within David's ratified 26fps
floor), zoom-sweep p95 33.32 (marginal), close-zoom p95 ~68ms (ring
engage/rebuild re-uploads the 1.5M merged buffer in one frame — the real
offender). NEXT: split base and ring into two layer instances (base buffers
never re-upload; engage = visibility flip; dedupe = circle mask in the route
compute). Kills the spikes architecturally; 33ms lock question parked with
David meanwhile.

## P3.5 two-layer split landed (2026-07-28)

grassBase + grassRing as separate layer instances; concat/merge path deleted;
dedupe = GPU circle mask in the route pass; engage/release = visibility flips;
stats merged (records = base + ring when engaged). Verified: pixel parity with
the approved look EXACT (mean 1.9 — same as pre-split), close-zoom rAF medians
31.5 -> 25ms, pan/wheel gates green.

REMAINING vs the locked 33ms budget (decision + one optional round):
1. Vista-with-ring GPU median 37.3ms — genuine steady-state cost of the
   approved density at the closest camera with 30k soldiers; within David's
   ratified 26fps floor (38.5). DECISION (locked number, David's):
   raise the budget to 38.5 for ring-engaged stops, or demand further cost
   cuts from the look.
2. Ring-apply hitch: applying the 599k-record ring set uploads in one frame
   (~66ms p95 during engage/rebuild windows). Fix if wanted: chunked/steamed
   record upload across frames in applyPackedRecords (a bladeFieldLayer
   round), or accept as a rare transition hitch.

## P3.6 directives (David, 2026-07-28) + handoff state

DECISIONS: (1) the 33ms budget HOLDS everywhere — the ring look must get
cheaper, no budget raise; (2) chunk the ring upload; (3) explore perf levers
BEYOND lod/density: route-compute frustum culling (300m ring vs the camera's
wedge — likely the biggest untapped win), varying/interpolant reduction (the
pen names vertex-export bandwidth as the wall), 16-bit instance packing
(pen-style, vs our 64B float32), segment trims, front-to-back tier order.

OPEN RED: node:test meadowPalette "every role follows a changed base" — the
branch's lifted anchor pushes trans/sheen raw values >1.0 (review P1). A hard
clamp and an over-unity renormalize both pin saturated channels. REAL FIX:
re-author the trans/sheen legacy triples ~12% darker so nothing exceeds 1.0
under the production anchor (fromAnchor stays pure); visual delta absorbed by
the translucency strength uniforms. vitest 41/41 green; ONLY this node test red.

## P3.6 landed (2026-07-28): THE LOCKED 33ms BUDGET HOLDS, look intact

Levers that worked (measured): route-compute camera-wedge cull on the ring
(vista tris 15.2M -> 11.2M; helped rAF, not GPU median — vista was not
cull-bound), varying trim + mid segments 8->6 (mid stop 21.5 -> 19.4-20.5ms),
and the decisive one: the pen's far count-for-width rule — far fan 3->2 with
farSoft width 2.2->3.1 (vista 37.9 -> 31.0ms GPU median, visually identical
at the fixture). Total vista tris now 9.0M. Palette P1 fixed properly
(trans/sheen/rakedDust/sunBleached legacy triples re-authored under 1.0,
fromAnchor pure again, translucency strengths compensated; node palette suite
green). perf:30k: ALL checks green except the two rAF-p95 TRANSITION checks —
the one-frame 599k ring upload on engage/rebuild. The chunked-upload attempt
CHURNED (uploads never completed; rAF 77ms sustained) and is disabled with
rationale at the call site; the open item is a proven-completing incremental
upload. Steady-state is fully within every locked number.
