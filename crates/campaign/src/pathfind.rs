//! Route planning over the road/sea graph. Dijkstra runs on nodes with
//! per-edge time costs; mid-edge start/end locations are spliced in by
//! walking the partial edge. Output is the tile-by-tile Loc sequence the
//! movement phase consumes.

use crate::mapdata::{EdgeId, NodeId, TileFeature, WorldMap};
use crate::state::Loc;
use crate::tunables;
use std::cmp::Reverse;
use std::collections::{BTreeMap, BinaryHeap};

/// O(1) BFS visited-set over `Loc`, reusable across many traversals without
/// re-allocating or re-zeroing: each traversal bumps an epoch, and a slot
/// counts as visited only when it carries the current epoch. Sized once to the
/// map's dense `Loc` space. Replaces the per-call `BTreeSet<Loc>` that
/// dominated the campaign tick profile.
pub struct Visited {
    seen: Vec<u32>,
    epoch: u32,
}

impl Visited {
    pub fn new(map: &WorldMap) -> Visited {
        Visited {
            seen: vec![0; map.loc_count()],
            epoch: 0,
        }
    }

    /// Begin a fresh traversal; everything is unvisited again.
    pub fn clear(&mut self) {
        self.epoch += 1;
    }

    /// Mark `loc` visited. Returns true if it was newly inserted this traversal.
    pub fn insert(&mut self, map: &WorldMap, loc: Loc) -> bool {
        let i = map.loc_index(loc);
        if self.seen[i] == self.epoch {
            false
        } else {
            self.seen[i] = self.epoch;
            true
        }
    }

    /// Road distance from `from` to the nearest tile satisfying `hit`, capped
    /// at `radius`. Self-contained: clears before traversing.
    pub fn within<F: Fn(Loc) -> bool>(
        &mut self,
        map: &WorldMap,
        from: Loc,
        radius: u32,
        hit: F,
    ) -> Option<u32> {
        if hit(from) {
            return Some(0);
        }
        self.clear();
        self.insert(map, from);
        let mut frontier = vec![from];
        for depth in 1..=radius {
            let mut next = Vec::new();
            for &l in &frontier {
                for n in neighbors(map, l) {
                    if !self.insert(map, n) {
                        continue;
                    }
                    if hit(n) {
                        return Some(depth);
                    }
                    next.push(n);
                }
            }
            frontier = next;
        }
        None
    }
}

/// Time cost of one tile for a baseline foot army (arbitrary units).
fn tile_cost(f: TileFeature) -> f32 {
    match f {
        TileFeature::Sea => tunables::BASE_TILES_PER_TICK / tunables::SEA_TILES_PER_TICK,
        other => 1.0 / tunables::feature_mult(other),
    }
}

fn level_of(roads: &[u8], e: EdgeId) -> u8 {
    roads.get(e as usize).copied().unwrap_or(1)
}

fn edge_cost(map: &WorldMap, roads: &[u8], e: EdgeId) -> f32 {
    let edge = &map.edges[e as usize];
    let base: f32 = edge.tiles.iter().map(|&t| tile_cost(t)).sum();
    // Embark + disembark overhead for hopping onto a sea lane.
    if edge.sea {
        base + 1.0
    } else {
        // Good roads are cheaper to route over, so planning prefers them.
        base / tunables::road_mult(level_of(roads, e))
    }
}

/// Tiles of edge `e` as Locs, from the `from` endpoint to the other end,
/// excluding both endpoint nodes.
fn edge_tiles_from(map: &WorldMap, e: EdgeId, from: NodeId) -> Vec<Loc> {
    let edge = &map.edges[e as usize];
    let n = edge.tiles.len() as u16;
    if edge.a == from {
        (0..n).map(|t| Loc::Edge { edge: e, tile: t }).collect()
    } else {
        (0..n)
            .rev()
            .map(|t| Loc::Edge { edge: e, tile: t })
            .collect()
    }
}

fn other_end(map: &WorldMap, e: EdgeId, from: NodeId) -> NodeId {
    let edge = &map.edges[e as usize];
    if edge.a == from {
        edge.b
    } else {
        edge.a
    }
}

/// Dijkstra from a set of seeded nodes. Returns (cost, came_from_edge) maps.
fn dijkstra(
    map: &WorldMap,
    roads: &[u8],
    seeds: &[(NodeId, f32)],
    allow_sea: bool,
) -> (BTreeMap<NodeId, f32>, BTreeMap<NodeId, EdgeId>) {
    let mut cost: BTreeMap<NodeId, f32> = BTreeMap::new();
    let mut from: BTreeMap<NodeId, EdgeId> = BTreeMap::new();
    let mut heap: BinaryHeap<Reverse<(u64, NodeId)>> = BinaryHeap::new();
    let key = |c: f32| (c * 1024.0) as u64; // monotonic int key keeps the heap total-ordered
    for &(n, c) in seeds {
        if cost.get(&n).map_or(true, |&old| c < old) {
            cost.insert(n, c);
            heap.push(Reverse((key(c), n)));
        }
    }
    while let Some(Reverse((k, n))) = heap.pop() {
        if k > key(cost[&n]) {
            continue;
        }
        for &e in &map.nodes[n as usize].edges {
            if map.edges[e as usize].sea && !allow_sea {
                continue;
            }
            let m = other_end(map, e, n);
            let c = cost[&n] + edge_cost(map, roads, e);
            if cost.get(&m).map_or(true, |&old| c < old) {
                cost.insert(m, c);
                from.insert(m, e);
                heap.push(Reverse((key(c), m)));
            }
        }
    }
    (cost, from)
}

/// Seed costs for a Dijkstra starting at `start`: a node seeds at cost 0; a
/// mid-edge start seeds both endpoints by the partial-edge walk. `None` if the
/// start sits on a sea lane and sea travel is disallowed.
fn start_seeds(
    map: &WorldMap,
    roads: &[u8],
    start: Loc,
    allow_sea: bool,
) -> Option<Vec<(NodeId, f32)>> {
    Some(match start {
        Loc::Node(n) => vec![(n, 0.0)],
        Loc::Edge { edge, tile } => {
            let e = &map.edges[edge as usize];
            if e.sea && !allow_sea {
                return None;
            }
            let n = e.tiles.len() as u16;
            let m = if e.sea {
                1.0
            } else {
                tunables::road_mult(level_of(roads, edge))
            };
            let to_a: f32 = (0..=tile)
                .map(|t| tile_cost(e.tiles[t as usize]))
                .sum::<f32>()
                / m;
            let to_b: f32 = (tile..n)
                .map(|t| tile_cost(e.tiles[t as usize]))
                .sum::<f32>()
                / m;
            vec![(e.a, to_a), (e.b, to_b)]
        }
    })
}

/// Road cost from `start` to every reachable node — for "march to the nearest
/// X" queries that don't need a full route planned to each candidate.
pub fn costs_from(
    map: &WorldMap,
    roads: &[u8],
    start: Loc,
    allow_sea: bool,
) -> BTreeMap<NodeId, f32> {
    match start_seeds(map, roads, start, allow_sea) {
        Some(seeds) => dijkstra(map, roads, &seeds, allow_sea).0,
        None => BTreeMap::new(),
    }
}

/// The up-to-`k` nearest nodes (by road cost) satisfying `is_target`, in
/// ascending-cost order. Early-stops as soon as `k` are found, so it floods
/// only the local region instead of the whole graph — the same first-`k`
/// targets a full flood would surface, but far cheaper when targets are near.
pub fn nearest_targets(
    map: &WorldMap,
    roads: &[u8],
    start: Loc,
    allow_sea: bool,
    is_target: impl Fn(NodeId) -> bool,
    k: usize,
) -> Vec<(NodeId, f32)> {
    let Some(seeds) = start_seeds(map, roads, start, allow_sea) else {
        return Vec::new();
    };
    let mut cost: BTreeMap<NodeId, f32> = BTreeMap::new();
    let mut heap: BinaryHeap<Reverse<(u64, NodeId)>> = BinaryHeap::new();
    let key = |c: f32| (c * 1024.0) as u64; // matches dijkstra's int key + tie-break
    for &(n, c) in &seeds {
        if cost.get(&n).map_or(true, |&old| c < old) {
            cost.insert(n, c);
            heap.push(Reverse((key(c), n)));
        }
    }
    let mut found: Vec<(NodeId, f32)> = Vec::new();
    while let Some(Reverse((kk, n))) = heap.pop() {
        if kk > key(cost[&n]) {
            continue;
        }
        if is_target(n) {
            found.push((n, cost[&n]));
            if found.len() >= k {
                break;
            }
        }
        for &e in &map.nodes[n as usize].edges {
            if map.edges[e as usize].sea && !allow_sea {
                continue;
            }
            let m = other_end(map, e, n);
            let c = cost[&n] + edge_cost(map, roads, e);
            if cost.get(&m).map_or(true, |&old| c < old) {
                cost.insert(m, c);
                heap.push(Reverse((key(c), m)));
            }
        }
    }
    found
}

/// Plan a tile-by-tile route. Returns None if unreachable.
pub fn plan(
    map: &WorldMap,
    roads: &[u8],
    start: Loc,
    dest: Loc,
    allow_sea: bool,
) -> Option<Vec<Loc>> {
    if start == dest {
        return Some(Vec::new());
    }

    // Same-edge shortcut: walk directly along the edge.
    if let (Loc::Edge { edge: e1, tile: t1 }, Loc::Edge { edge: e2, tile: t2 }) = (start, dest) {
        if e1 == e2 {
            let mut out = Vec::new();
            if t1 < t2 {
                for t in t1 + 1..=t2 {
                    out.push(Loc::Edge { edge: e1, tile: t });
                }
            } else {
                for t in (t2..t1).rev() {
                    out.push(Loc::Edge { edge: e1, tile: t });
                }
            }
            return Some(out);
        }
    }

    // From a mid-edge start, both endpoints are reachable by walking the
    // partial edge; from a node, cost 0.
    let seeds = start_seeds(map, roads, start, allow_sea)?;
    let (cost, from) = dijkstra(map, roads, &seeds, allow_sea);

    // Pick the cheapest entry to the destination.
    let (goal_node, tail): (NodeId, Vec<Loc>) = match dest {
        Loc::Node(n) => {
            cost.get(&n)?;
            (n, Vec::new())
        }
        Loc::Edge { edge, tile } => {
            let e = &map.edges[edge as usize];
            if e.sea && !allow_sea {
                return None;
            }
            let n = e.tiles.len() as u16;
            let m = if e.sea {
                1.0
            } else {
                tunables::road_mult(level_of(roads, edge))
            };
            let from_a: f32 = (0..tile)
                .map(|t| tile_cost(e.tiles[t as usize]))
                .sum::<f32>()
                / m;
            let from_b: f32 = (tile + 1..n)
                .map(|t| tile_cost(e.tiles[t as usize]))
                .sum::<f32>()
                / m;
            let ca = cost.get(&e.a).map(|c| c + from_a);
            let cb = cost.get(&e.b).map(|c| c + from_b);
            let via_a = match (ca, cb) {
                (Some(x), Some(y)) => x <= y,
                (Some(_), None) => true,
                (None, Some(_)) => false,
                (None, None) => return None,
            };
            let end = if via_a { e.a } else { e.b };
            let mut tail: Vec<Loc> = if via_a {
                (0..=tile).map(|t| Loc::Edge { edge, tile: t }).collect()
            } else {
                (tile..n)
                    .rev()
                    .map(|t| Loc::Edge { edge, tile: t })
                    .collect()
            };
            tail.pop(); // the dest tile itself is appended below
            tail.push(dest);
            (end, tail)
        }
    };

    // Walk came_from back to a seed node, then expand edges into tiles.
    let mut node_chain = vec![goal_node];
    let mut cur = goal_node;
    while let Some(&e) = from.get(&cur) {
        cur = other_end(map, e, cur);
        node_chain.push(cur);
    }
    node_chain.reverse();

    let mut out: Vec<Loc> = Vec::new();
    // From a mid-edge start, walk the partial edge to the first chain node.
    if let Loc::Edge { edge, tile } = start {
        let e = &map.edges[edge as usize];
        let first = node_chain[0];
        if first == e.a {
            for t in (0..tile).rev() {
                out.push(Loc::Edge { edge, tile: t });
            }
        } else {
            for t in tile + 1..e.tiles.len() as u16 {
                out.push(Loc::Edge { edge, tile: t });
            }
        }
        out.push(Loc::Node(first));
    } else if node_chain.len() == 1 && tail.is_empty() {
        return Some(vec![Loc::Node(goal_node)]);
    }

    for w in node_chain.windows(2) {
        // Find the connecting edge recorded by Dijkstra (cheapest, unique).
        let e = from[&w[1]];
        out.extend(edge_tiles_from(map, e, w[0]));
        out.push(Loc::Node(w[1]));
    }
    out.extend(tail);
    Some(out)
}

/// Tiles adjacent to a Loc on the road network (for encounter range checks).
pub fn neighbors(map: &WorldMap, loc: Loc) -> Vec<Loc> {
    match loc {
        Loc::Node(n) => map.nodes[n as usize]
            .edges
            .iter()
            .map(|&e| {
                let edge = &map.edges[e as usize];
                let last = edge.tiles.len() as u16 - 1;
                if edge.a == n {
                    Loc::Edge { edge: e, tile: 0 }
                } else {
                    Loc::Edge {
                        edge: e,
                        tile: last,
                    }
                }
            })
            .collect(),
        Loc::Edge { edge, tile } => {
            let e = &map.edges[edge as usize];
            let last = e.tiles.len() as u16 - 1;
            let mut out = Vec::with_capacity(2);
            out.push(if tile == 0 {
                Loc::Node(e.a)
            } else {
                Loc::Edge {
                    edge,
                    tile: tile - 1,
                }
            });
            out.push(if tile == last {
                Loc::Node(e.b)
            } else {
                Loc::Edge {
                    edge,
                    tile: tile + 1,
                }
            });
            out
        }
    }
}

/// Within encounter range: same tile or adjacent.
pub fn in_contact(map: &WorldMap, a: Loc, b: Loc) -> bool {
    a == b || neighbors(map, a).contains(&b)
}

/// Road distance between two locations is at most `k` tiles (BFS).
/// Discrete stepping makes a chase oscillate between distance 1 and 2, so
/// encounters initiate at <=1 but sustain at <=2.
pub fn dist_le(map: &WorldMap, a: Loc, b: Loc, k: u32) -> bool {
    if a == b {
        return true;
    }
    let mut frontier = vec![a];
    let mut seen = std::collections::BTreeSet::new();
    seen.insert(a);
    for _ in 0..k {
        let mut next = Vec::new();
        for &l in &frontier {
            for n in neighbors(map, l) {
                if n == b {
                    return true;
                }
                if seen.insert(n) {
                    next.push(n);
                }
            }
        }
        frontier = next;
    }
    false
}
