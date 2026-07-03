# find-map-bugs — gpu/scenery/cards lane close-out (slices 05+06+07)

Shot: web/shots/campaign/campaign-lod-regional-italy-political.png (merged tree @ post-07 bless, 2026-07-03)
Pipeline: code-derived legend → 3×3 tiles → 9 opus finders → 12 candidates → 7 adversarial judges.

## Gate verdict: GREEN — all four gate classes absent
- jagged-water-edge: 2 candidates, both resolved not-a-defect on the merged tree.
  - Tyrrhenian/Cosa segment: refuted — wash mottle on land + shallow-water shading; wash stops at the coast (crop: crops/jagged-tyrrhenian-3.png).
  - Latium/Tarracina segment: judge initially confirmed, but it had cropped the MAIN CHECKOUT's stale baseline (ran with a relative path from the repo root). Re-crop of the correct merged-tree file at the same coords shows a smooth conforming coast (crops: ../judge-recheck.png, ../crop-latium-now.png vs ../crop-latium-orig.png — the before/after pair actually demonstrates slice 05's fix).
- scenery-on-water: none (no confirmed instances; 06's gate holds).
- card-over-sea: none (Minturnae "ghost card" refuted — drop shadow + two neighboring cards sharing an income value; all cards ashore; crop: crops/minturnae-ghost-r4.png).
- missing-model: none (every named city shows its 3D model; the "bare glyph" candidates were the models themselves).

## Confirmed findings (ship to their owning slices — none reopen 05/06/07)
1. road-missing COSA — no road from any direction; nearest network 150px east (crops/road-cosa-2.png). B7b, slice 02 (in flight).
2. road-missing TARRACINA — coastal model isolated; neighbors networked (crops/roads-sweep-tarracina-model.png). B7b, slice 02 (original case).
3. road-missing PUTEOLI — NEW named instance; CAPUA hub above never extends down (crops/road-puteoli-4.png). B7b → slice 02.
4. road-dead-end near FERENTINUM — NEW: paved stub from the ROMA direction terminates in open terrain (crops/road-ferentinum-3.png). B7b → slice 02 (dead-end detector case).
5. island-fidelity pill near Populonium — real island renders as an opaque faction-color lozenge with dilated wash rim; no land tone visible (crops/island-pill-final.png). Known artifact documented in slice 06's ledger; David rules at slice 10.
6. Roma-cluster card stacks (TIBUR/ROMA corner overlap, wedged city label) + minor MINTURNAE/TEANUM card overlap. B7, slice 09 (deliberately last; expected).

## Refuted: 7 candidates
(jagged-tyrrhenian, minturnae-ghost, misc A: city models read as bare markers, misc B: LOD-culled secondary label, misc C: Larinum "color mismatch" = terracotta roof aesthetic, misc D: broadleaf tree, plus the mislocated Latium confirm re-ruled above.)

## Road verdict sweep (previously unclear): SPOLETIUM, NARNIA, CASTRUM TRUENTINUM, ASCULUM, TIBUR, ALBA FUCENS all reached; TARRACINA missing (above).

## Process note for future oracle runs
Judges must be told to use the ABSOLUTE shot path verbatim — one judge ran from the main repo root with a relative path and audited origin/main's stale baseline. Its cross-check accidentally produced a clean before/after proof of slice 05's fix.
