# 30 — campaign-traversal

**Contract unlocked:** graph traversal in the campaign has one flood, one
Dijkstra, one partial-edge cost.

## Seam

```rust
pub enum Flow { Continue, Stop }
impl Visited {
    pub fn flood(&mut self, map: &WorldMap, from: Loc, radius: u32,
                 pass: impl Fn(Loc) -> bool, visit: impl FnMut(Loc, u32, Option<Loc>) -> Flow) -> Option<Loc>;
}
fn dijkstra(map: &WorldMap, seeds: &[(NodeId, f32)], allow_sea: bool,
            on_settle: impl FnMut(NodeId, f32) -> Flow) -> (BTreeMap<NodeId, f32>, BTreeMap<NodeId, EdgeId>);
fn edge_partial_cost(map: &WorldMap, e: EdgeId, from: NodeId, tile: u16) -> f32;
```

Replaces `Visited::within` (`pathfind.rs:48-77`, keep as the fast core),
`dist_le` (436-458, still BTreeSet; runs cities×armies per day and per
Preparing encounter per tick), `economy::territory_of` (36-62),
`resolve::tiles_within` (40-61), `resolve::rout_path` (128-186), the inline
flood in `visibility::recompute` (69-85), the heap loop shared verbatim by
`dijkstra` (129-163) and `nearest_targets` (218-262), and the mid-edge cost in
`start_seeds` (176-196) and `plan` (304-343). `Campaign` holds a scratch
`Visited` (not serialized) so the per-tick BTreeSet allocations go.

Order contract: the BTreeSet floods iterate `for l in frontier { for n in
neighbors(l) }` — the seen-set only dedups — so `Visited` is order-identical
when the frontier is walked in the same order. `territory_of`'s first-hit at
equal depth therefore stays. Dijkstra key `(c*1024) as u64` plus the tie-break
at `pathfind.rs:231` stays verbatim.

## Decisions resolved here

Before the swap, add a test pinning each consumer's output on `test_map()`
(`tiles_within` set + order, `rout_path`, `territory_of` per city,
`nearest_targets` first-k). Then swap. Keep it as the traversal seam test.

## Delegated to the implementer

Callback naming; whether `flood` returns the stop location or the visit count.

## Verification

- Slice 28 golden **unchanged**; the new seam test; `orders.rs:8 loads_and_paths`
  (26-tile path), `economy.rs:90`, `full_game`, `combat_handoff`,
  `connectivity_islands`.
- `codex review --uncommitted`.

## Must stay green

Campaign golden. If order cannot be reproduced for a consumer, that consumer
keeps its own loop for now and the slice records why.

## Feedback that would change this slice

None.
