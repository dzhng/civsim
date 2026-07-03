# find-map-bugs — DATA lane close-out (slice 02, roads)

Shot: fresh regional-italy political capture from the lane-roads worktree
(:5204, camera [-430,445,3], 1280x800, framed like
web/shots/campaign/campaign-lod-regional-italy-political.png) —
shot-regional-italy-political.png beside this report.
Pipeline: code-derived legend → 3×3 tiles → 9 opus finders → 13 candidates
(12 findings + 1 road-missing carried from unclear road verdicts) → merged to
9 → 8 adversarial judges (+1 orchestrator re-crop overrule).

## Gate verdict: GREEN — all three DATA-lane gate classes absent
- **road-missing: ABSENT.** Finder road sweep: every named city reached —
  COSA, TARRACINA, FERENTINUM, CAPUA, MINTURNAE, TEANUM, CASINUM, PUTEOLI,
  BENEVENTUM, AECLANUM, AESERNIA, BOVIANUM, LARINUM, CORFINIUM, ATERNUM,
  CLUSIUM, VOLSINII, SPOLETIUM, NARNIA, REATE, ROMA, TIBUR, ALBA FUCENS,
  CASTRUM TRUENTINUM, ASCULUM (cross-tile). The single carried candidate
  (OSTIA, plaque-occluded in two tiles) was judged confirmed from the carded
  shot, then OVERRULED by a re-crop of the same framing with DOM cards hidden:
  the settlement model renders on land and the Roma-hub ribbon terminates in
  it (crops/ostia-nocards-overrule.png; zoom-6 confirmation
  crops/ostia-zoom6-overrule.png). Judge's crops were blocked by the stacked
  ROMA + OSTIA plaques sitting exactly over Ostia's projection.
- **road-dead-end: ABSENT.** Zero candidates from any finder; the pre-02
  FERENTINUM-area stub (../evidence/b7b-ferentinum-stub.png) is gone — the
  Tibur road now runs continuously through to the Tarracina coast
  (../evidence/b7b-after-ferentinum.png).
- **offshore-city: ABSENT.** All city-on-water candidates refuted as marker
  defects: OSTIA (overruled, above), MINTURNAE (model ashore; normal coastal
  card overhang), COSA plaque (normal below-model plaque convention). The one
  confirmed city-on-water is CASTRUM TRUENTINUM's LABEL tail over water with
  its model correctly ashore — that is B8 (long names overflow coast), the
  exact named instance slice 04 owns as an acceptance check. Not a marker
  offshore; not new.

## Confirmed findings (all pre-existing classes owned by other lanes — none new, none reopen 02)
1. jagged-water-edge, four coastal segments (Cosa stretch, Ostia stretch,
   south Latium/Minturnae, Aternum/Adriatic) — 8 km wash cells stair-stepping
   into water (crops/jagged-north-4.png, jagged-mid-3.png, jagged-south-2.png,
   jagged-east-b2.png; tagged intended-by-code). This is B4. Slice 05's fix
   (1c81869e) lives on lane-territory-coast / worktree-campaign-map-bugs and
   is NOT in lane-roads' history — expected here, resolves at merge.
2. city-on-water CASTRUM TRUENTINUM label tail "...NTINUM" over the Adriatic,
   model ashore (crops/castrum-label-3.png) — B8, slice 04 acceptance check
   (slice 04 also not in this branch).

## Refuted: 5 candidates
COSA plaque "detached" (normal convention, cf. VOLSINII), MINTURNAE card
offshore (model ashore, normal overhang), jagged-east segment (a) near
LARINUM (border jogs stay on land), OSTIA city-on-water + OSTIA road-missing
(both overruled by the cards-hidden re-crop).

## Process note
The card-occlusion trap is new: two stacked player plaques (ROMA + OSTIA) can
fully hide a settlement and its approach ribbon at the regional framing.
Future road judges should get a cards-hidden companion capture alongside the
canonical shot.
