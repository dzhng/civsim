use std::collections::{BTreeMap, BTreeSet, VecDeque};

pub fn components(
    nodes: impl IntoIterator<Item = u32>,
    edges: impl IntoIterator<Item = (u32, u32)>,
) -> Vec<BTreeSet<u32>> {
    let mut adjacency: BTreeMap<u32, BTreeSet<u32>> =
        nodes.into_iter().map(|id| (id, BTreeSet::new())).collect();
    for (a, b) in edges {
        adjacency.entry(a).or_default().insert(b);
        adjacency.entry(b).or_default().insert(a);
    }

    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for &start in adjacency.keys() {
        if !seen.insert(start) {
            continue;
        }
        let mut component = BTreeSet::new();
        let mut queue = VecDeque::from([start]);
        while let Some(id) = queue.pop_front() {
            component.insert(id);
            for &next in &adjacency[&id] {
                if seen.insert(next) {
                    queue.push_back(next);
                }
            }
        }
        out.push(component);
    }
    out
}

pub fn stub_junctions(
    nodes: impl IntoIterator<Item = u32>,
    fixed_nodes: &BTreeSet<u32>,
    edges: impl IntoIterator<Item = (u32, u32, bool)>,
) -> BTreeSet<u32> {
    let nodes: BTreeSet<u32> = nodes.into_iter().collect();
    let edges: Vec<(u32, u32, bool)> = edges.into_iter().collect();
    let mut alive = vec![true; edges.len()];
    let mut removed = BTreeSet::new();

    loop {
        let mut ordinary_degree: BTreeMap<u32, usize> = BTreeMap::new();
        let mut protected_degree: BTreeMap<u32, usize> = BTreeMap::new();
        let mut endpoints: BTreeSet<u32> = nodes.difference(&removed).copied().collect();
        for (index, &(a, b, protected)) in edges.iter().enumerate() {
            if !alive[index] {
                continue;
            }
            endpoints.extend([a, b]);
            let degree = if protected {
                &mut protected_degree
            } else {
                &mut ordinary_degree
            };
            *degree.entry(a).or_default() += 1;
            *degree.entry(b).or_default() += 1;
        }
        let doomed: BTreeSet<u32> = endpoints
            .into_iter()
            .filter(|id| {
                !fixed_nodes.contains(id)
                    && ordinary_degree.get(id).copied().unwrap_or(0) <= 1
                    && protected_degree.get(id).copied().unwrap_or(0) == 0
            })
            .collect();
        if doomed.is_empty() {
            break;
        }
        removed.extend(&doomed);
        for (index, &(a, b, _)) in edges.iter().enumerate() {
            if alive[index] && (doomed.contains(&a) || doomed.contains(&b)) {
                alive[index] = false;
            }
        }
    }
    removed
}
