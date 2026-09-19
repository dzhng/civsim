use super::*;

pub(super) struct Targeting {
    pub(super) nearest: i32,
    pub(super) nearest_d: f32,
    pub(super) t_bearing: f32,
    pub(super) candidates: [(u32, f32, f32); 12],
    pub(super) cand_len: usize,
    pub(super) friends: [Option<NearbyFriend>; MAX_NEARBY_FRIENDS],
    pub(super) friends_len: usize,
}

pub(super) struct TargetSearch {
    pub(super) i: usize,
    pub(super) ui: usize,
    pub(super) cell: f32,
    pub(super) max_reach: f32,
    pub(super) p: Vec2,
    pub(super) local_f: Vec2,
    pub(super) local_r: Vec2,
    pub(super) disengaged: bool,
    pub(super) tgt_field: crate::strike::StrikeField,
    pub(super) turn_rate: f32,
    pub(super) approach_speed: f32,
}

/// The distinct grid buckets one target search has visited, in first-visit
/// order. Several cells of the scan can hash to the same bucket; each bucket
/// is scanned once. `ids` is the exact membership. `bits` is keyed by a
/// bucket's low ten bits and is set for every recorded id, so an unset bit
/// proves the bucket is new; a set bit may be a different bucket sharing
/// those bits (tables above 1024 buckets), so it defers to `ids`.
struct SeenBuckets {
    ids: [usize; 81], // 9x9: range_cells caps at 4
    len: usize,
    bits: [u64; 16],
}

impl SeenBuckets {
    fn new() -> Self {
        Self {
            ids: [usize::MAX; 81],
            len: 0,
            bits: [0; 16],
        }
    }

    /// Records `b` and returns true the first time it is offered.
    fn insert(&mut self, b: usize) -> bool {
        let slot = b & (self.bits.len() * 64 - 1);
        let (word, bit) = (slot >> 6, 1u64 << (slot & 63));
        if self.bits[word] & bit != 0 && self.ids[..self.len].contains(&b) {
            return false;
        }
        self.bits[word] |= bit;
        self.ids[self.len] = b;
        self.len += 1;
        true
    }
}

pub(super) fn find_target(sim: &mut Sim, search: TargetSearch) -> Option<Targeting> {
    perf_scope!(_timer, "combat targeting");
    let TargetSearch {
        i,
        ui,
        cell,
        max_reach,
        p,
        local_f,
        local_r,
        disengaged,
        tgt_field,
        turn_rate,
        approach_speed,
    } = search;
    let my_team = sim.units[ui].team;
    let my_r = sim.radius[i];
    // --- find nearest enemy + count envelope obstruction ------------
    // The scan covers awareness range: targeting, obstruction, AND
    // the local fight-density measurement all come from this pass.
    let search = (max_reach + 1.2).max(DISENGAGE_DIST);
    let range_cells = ((search / cell).ceil() as i32).clamp(1, 4);
    let mut nearest: i32 = -1;
    let mut nearest_d = f32::MAX;
    // STICKY TARGET: a man fights the foe he is already squared up to and
    // only switches when a new one is meaningfully closer. Re-picking the
    // single nearest body every tick made his facing OSCILLATE — the
    // nearest flips between near-equidistant foes in a packed grind, so his
    // body chased a target that reversed several times a second (real
    // soldiers don't twitch their stance 30x/s). Track the current foe's
    // live distance so we can keep him unless clearly out-classed.
    let prev_target = sim.target[i];
    let mut prev_target_d = f32::MAX;
    // Cost-based selection: nearest_d stays the CHOSEN foe's
    // real distance (downstream reach/fight checks need a distance), but
    // the CHOICE is argmin engage-cost.
    let mut nearest_cost = f32::MAX;
    // (victim, surface distance, bearing)
    let mut candidates: [(u32, f32, f32); 12] = [(0, 0.0, 0.0); 12];
    let mut cand_len = 0usize;
    // Friendly soldiers nearby: raw offset + distance. The angles they are
    // read at (against facing, or the target bearing) resolve below, once the
    // search is known to have a target at all.
    let mut scanned: [Option<ScannedFriend>; MAX_NEARBY_FRIENDS] = [None; MAX_NEARBY_FRIENDS];
    let mut friends_len = 0usize;
    let mut least_preferred_friend = None;
    let mut fight_near = 0u32;

    let cx = (p.x / cell).floor() as i32;
    let cy = (p.y / cell).floor() as i32;
    let mut seen = SeenBuckets::new();
    for oy in -range_cells..=range_cells {
        for ox in -range_cells..=range_cells {
            let b = sim.grid.bucket(cx + ox, cy + oy);
            if !seen.insert(b) {
                continue;
            }
            let (lo, hi) = (sim.grid.starts[b] as usize, sim.grid.starts[b + 1] as usize);
            for &bj in &sim.grid.entries[lo..hi] {
                let bj = bj as usize;
                let j = sim.body_owner[bj] as usize;
                if j == i || sim.alive[j] == 0 {
                    continue;
                }
                let bp = Vec2::new(sim.body_pos[2 * bj], sim.body_pos[2 * bj + 1]);
                let to = bp - p;
                let d_surf = to.len() - sim.body_r[bj] - my_r;
                if d_surf > search {
                    continue;
                }
                // The bearing is an atan2 per body in range; only a rider's
                // wheel cost or a strike candidate reads it here. A recorded
                // friend keeps its offset and resolves an angle only if this
                // search returns a target (see `ScannedFriend::resolve`).
                let bearing = || to.y.atan2(to.x);
                let uj = sim.soldier_unit[j] as usize;
                if sim.units[uj].team == my_team {
                    if uj == ui && sim.fighting[j] == 1 && d_surf < DISENGAGE_DIST {
                        fight_near += 1;
                    }
                    if d_surf < (max_reach * 0.9).max(1.6) {
                        let priority = (
                            (to.dot(local_f) / cell).floor() as i32,
                            (to.dot(local_r) / cell).floor() as i32,
                            (j - sim.units[uj].start) as u32,
                        );
                        record_friend(
                            &mut scanned,
                            &mut friends_len,
                            &mut least_preferred_friend,
                            ScannedFriend {
                                owner: j as u32,
                                offset: to,
                                distance: d_surf.max(0.05),
                                fighting: sim.fighting[j] == 1,
                                priority,
                            },
                            sim.mounted[j] == 1,
                        );
                    }
                    continue;
                }
                // Engage cost, in METRES (a wheel converted to the distance
                // it would cover): `travel + turn_time*closing_speed`. The
                // turn term is MOUNTED-only — a man on foot pivots freely
                // (turn ~instant), so his cost is EXACTLY `d_surf` and his
                // targeting is byte-for-byte nearest (he still turns to
                // meet a flanker; the raw distance compare also avoids the
                // float-tie churn a `/speed` would add). A HORSE can't pivot
                // at speed and a wide sabre is blind over its head, so a
                // rider genuinely must wheel to bring the blade to bear: a
                // foe in the flank lobe is cheap, one dead-ahead in the
                // blind front is dear. That wheel cost is the measured bug.
                let cost = if sim.mounted[i] == 1 {
                    let off = wrap_angle(bearing() - sim.facings[i]).abs();
                    d_surf + tgt_field.turn_to_edge(off) / turn_rate * approach_speed
                } else {
                    d_surf
                };
                if cost < nearest_cost {
                    nearest_cost = cost;
                    nearest_d = d_surf;
                    nearest = j as i32;
                }
                if j as i32 == prev_target {
                    prev_target_d = d_surf;
                }
                if cand_len < candidates.len() && d_surf <= max_reach {
                    // Dedup per owner (two horse circles = one victim).
                    if !candidates[..cand_len].iter().any(|c| c.0 == j as u32) {
                        candidates[cand_len] = (j as u32, d_surf, bearing());
                        cand_len += 1;
                    }
                }
            }
        }
    }

    sim.fight_near[i] = fight_near.min(10) as u8;
    sim.nearest_enemy_d[i] = if nearest >= 0 { nearest_d } else { f32::MAX };
    sim.nearest_enemy[i] = nearest;
    if nearest < 0 || nearest_d > DISENGAGE_DIST {
        sim.target[i] = -1;
        sim.fighting[i] = 0;
        return None;
    }
    // Keep the foe we're already on unless the new nearest is clearly
    // closer (>15%) — the hysteresis that stops the facing oscillation.
    // A man PULLING OUT (disengage/rout) doesn't cling to his foe, though:
    // stickiness would keep a withdrawing unit nailed in contact, so it
    // yields to the latest nearest and lets the gap open as it backs off.
    // Selection is argmin engage-cost (arc-aware); the sticky hysteresis
    // stays on DISTANCE — its job is anti-oscillation, and keying it off
    // cost made a line man DROP a foe that merely drifted to his flank
    // (its turn penalty spiked), churning targets mid-grind. Keep the foe
    // I'm squared up to unless a new one is meaningfully closer.
    sim.target[i] = if !disengaged
        && prev_target >= 0
        && sim.alive[prev_target as usize] == 1
        && prev_target_d <= DISENGAGE_DIST
        && prev_target_d <= nearest_d * 1.15
    {
        prev_target
    } else {
        nearest
    };
    // Past the no-target return, the kept friends are certain to be read:
    // resolve each one's bearing once, for the three checks below and the
    // swing obstruction downstream.
    let friends: [Option<NearbyFriend>; MAX_NEARBY_FRIENDS] =
        std::array::from_fn(|k| scanned[k].map(ScannedFriend::resolve));
    // Empty frontage toward the target: the measured anti-blender
    // leash. Blocked = a comrade's body within 1.5m inside +-40deg
    // of the target bearing.
    let t_bearing = {
        let tp = sim.soldier_pos(nearest as usize);
        (tp - p).y.atan2((tp - p).x)
    };
    // Blocked = a comrade ALREADY FIGHTING stands DIRECTLY between
    // me and my target (within 1.2m, +-26deg). Lateral fighting
    // neighbors don't block — a hurled man may step back into the
    // gap he was thrown from; only true rank-stacking is the blender.
    let blocked = friends[..friends_len]
        .iter()
        .flatten()
        .any(|f| f.fighting && f.distance < 1.2 && wrap_angle(f.bearing - t_bearing).abs() < 0.45);
    sim.front_clear[i] = (!blocked) as u8;
    // Situational awareness (see Sim::awareness): each comrade STACKED in
    // the cone toward the foe (within ~3.5m, ±34°) halves the man's view of
    // it. A clear line ⇒ ~1 (turns to meet a flanker); buried behind 2-3
    // ranks ⇒ ~0.1-0.25 (can't see it, holds frontage). A smooth gradient.
    let cover = friends[..friends_len]
        .iter()
        .flatten()
        .filter(|f| f.distance < 3.5 && wrap_angle(f.bearing - t_bearing).abs() < 0.6)
        .count();
    sim.awareness[i] = 0.5f32.powi(cover as i32);
    // Awareness is not combat: the fight starts when weapons can land.
    sim.fighting[i] = (nearest_d <= max_reach + 0.3) as u8;
    let u = &mut sim.units[ui];
    u.contact_unit = sim.soldier_unit[nearest as usize];
    if disengaged {
        return None;
    }
    Some(Targeting {
        nearest,
        nearest_d,
        t_bearing,
        candidates,
        cand_len,
        friends,
        friends_len,
    })
}

#[cfg(test)]
mod tests {
    use super::SeenBuckets;

    fn admitted(offers: &[usize]) -> (Vec<usize>, Vec<usize>) {
        let mut seen = SeenBuckets::new();
        let order = offers.iter().copied().filter(|&b| seen.insert(b)).collect();
        (order, seen.ids[..seen.len].to_vec())
    }

    #[test]
    fn seen_buckets_admit_each_distinct_bucket_once_in_offer_order() {
        // 17, 1041 and 2065 share their low ten bits, so once one is recorded
        // the filter reports the others present too: only the exact list can
        // tell a distinct colliding bucket from a revisit. 5 never collides.
        let (order, ids) = admitted(&[17, 1041, 17, 5, 2065, 1041, 5, 2065, 17]);
        assert_eq!(order, [17, 1041, 5, 2065]);
        assert_eq!(ids, order);

        // A full 9x9 scan over colliding, repeating buckets matches the plain
        // first-occurrence list.
        let offers: Vec<usize> = (0..81).map(|k| (k * 7 % 5) * 1024 + k % 3).collect();
        let mut expected = Vec::new();
        for &b in &offers {
            if !expected.contains(&b) {
                expected.push(b);
            }
        }
        let (order, ids) = admitted(&offers);
        assert_eq!(order, expected);
        assert_eq!(ids, expected);

        // Fill every slot with distinct ids that all collide in the prefilter.
        let full: Vec<usize> = (0..81).map(|i| i * 1024 + 17).collect();
        let (order, ids) = admitted(&full);
        assert_eq!(order, full);
        assert_eq!(ids, full);
    }
}
