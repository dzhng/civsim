# Draft provenance — three independent slice cuts

Per feature-slicing, three subagents each drafted the whole plan from the same
brief with no sight of each other. Where they agreed is firm ground; where they
split is where the synthesis had to think hardest.

## Where all three agreed (→ became invariants)
- Density **grows** `arbitrateLabelOccupancy` — one importance-ranked greedy
  pass, one shared city+faction budget, replacing the `stageOf` ladder.
- Naming is **bake-owned**, drop-qualifier-when-unique, scoped to display
  names, no parens; the frontend renders `node.name` verbatim.
- Marker verification **extends the render-probe** (sample the drawn rect, not
  the anchor) + one new `CampaignLabelDebugRect.iconRect` field. No new tool.
- Importance is **assembled at the emitters, never baked**: city `tier` (baked)
  + faction territory size + army strength (runtime) + zoom.
- **Leagues == factions** — no special-case text/style anywhere.

## Where they split (→ resolved in the README)
1. **Offshore root cause.** Drafts A and C blamed the label shove / icon-lift
   dragging the marker off its anchor; Draft B blamed the bg-raster vs biome
   drawn-coast divergence at the anchor. **Resolved by live instrumentation
   (not by vote):** the shove (`horizontalEdgeOffset`, −52 px west) is the
   cause; the anchor is ~60 km inland, past the biome smoothing, so Draft B's
   divergence is real-but-latent, not the bug. See README "The offshore root
   cause." Draft B's `renderDrawnLandAt` owner is deferred, not built.
2. **Naming pass location.** Drafts A/B put it in `build.rs`; Draft C put it as
   a final post-step after prune + leagues. **Draft C won** — prune changes the
   surviving population (uniqueness must be counted post-prune) and league names
   derive from city names. Slice 02 follows Draft C.

The full draft texts were transient subagent outputs; their durable content is
folded into the README invariants and the slice files above.
