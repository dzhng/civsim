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

/// One collision body as the target scan reads it, laid out parallel to
/// `grid.entries` so a bucket's `lo..hi` slice is one sequential stream
/// instead of five gathers through `entries -> body_owner -> soldier_unit ->
/// units`. Every field is a bit-for-bit copy of the load the scan would
/// otherwise make at exactly that index — nothing is recomputed or reordered.
///
/// It holds ONLY what is fixed for the whole combat pass: the bodies and the
/// grid were built by `apply_separation` and are not rebuilt until the next
/// tick, and deaths land in `apply_staged_damage` after the pass. Anything the
/// pass itself writes — `fighting`, `positions`, `target` — stays a live read
/// in the scan below, because a later search must see what an earlier one did.
#[derive(Clone, Copy)]
pub(super) struct TargetBody {
    x: f32,
    y: f32,
    r: f32,
    /// `body_owner[bj]` — the soldier this body belongs to (a rider owns two).
    owner: u32,
    /// `soldier_unit[owner]`.
    unit: u32,
    /// `units[unit].team` — the full team id, never a flag: teams are arbitrary
    /// u32s and two of them can share any given bit.
    team: u32,
    alive: bool,
    mounted: bool,
}

/// Pack the scan inputs for every body in the grid, in `grid.entries` order.
///
/// Call once per `run_combat`, after the last grid/body rebuild and after
/// separation's impact kills have landed (hence `alive` is meaningful), and
/// drop it at the end of the pass — `run_missiles` reads `body_*` again after
/// combat's own kills, so this table must never outlive the pass that built it.
pub(super) fn pack_bodies(sim: &Sim, out: &mut Vec<TargetBody>) {
    out.clear();
    out.extend(sim.grid.entries.iter().map(|&bj| {
        let bj = bj as usize;
        let j = sim.body_owner[bj] as usize;
        let uj = sim.soldier_unit[j] as usize;
        TargetBody {
            x: sim.body_pos[2 * bj],
            y: sim.body_pos[2 * bj + 1],
            r: sim.body_r[bj],
            owner: j as u32,
            unit: uj as u32,
            team: sim.units[uj].team,
            alive: sim.alive[j] != 0,
            mounted: sim.mounted[j] == 1,
        }
    }));
}

/// `bodies` is this pass's `pack_bodies` table, indexed exactly like
/// `sim.grid.entries` (the bucket slices below index into both alike).
pub(super) fn find_target(
    sim: &mut Sim,
    bodies: &[TargetBody],
    search: TargetSearch,
) -> Option<Targeting> {
    perf_scope!(_timer, "combat targeting");
    debug_assert_eq!(bodies.len(), sim.grid.entries.len());
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
            for body in &bodies[lo..hi] {
                let j = body.owner as usize;
                if j == i || !body.alive {
                    continue;
                }
                let bp = Vec2::new(body.x, body.y);
                let to = bp - p;
                let d_surf = to.len() - body.r - my_r;
                if d_surf > search {
                    continue;
                }
                // The bearing is an atan2 per body in range; only a rider's
                // wheel cost or a strike candidate reads it here. A recorded
                // friend keeps its offset and resolves an angle only if this
                // search returns a target (see `ScannedFriend::resolve`).
                let bearing = || to.y.atan2(to.x);
                let uj = body.unit as usize;
                if body.team == my_team {
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
                            body.mounted,
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
    use super::{pack_bodies, SeenBuckets};
    use crate::class::UnitClassId;
    use crate::combat::run_combat;
    use crate::math::Vec2;
    use crate::sim::Sim;
    use crate::tunables::Tunables;
    use std::f32::consts::PI;

    /// A still battlefield: no micro-roughness, no morale — so a fixture's
    /// geometry is the only thing deciding who targets whom.
    fn still_field(seed: u64) -> Sim {
        let tun = Tunables {
            micro_rough: 0.0,
            morale_enabled: false,
            ..Tunables::default()
        };
        Sim::new(tun, seed)
    }

    /// First soldier of a unit (a 1-man unit IS that soldier).
    fn first(sim: &Sim, unit: usize) -> usize {
        sim.units[unit].start
    }

    /// Tick until the NEXT combat pass is the one soldier `i` acts in, so a
    /// hand-driven `run_combat` below actually runs his search.
    fn tick_to_phase_of(sim: &mut Sim, i: usize) {
        sim.tick();
        while sim.tick_count % 3 != (i % 3) as u64 {
            sim.tick();
        }
    }

    /// The packed table is the SAME loads the scan used to do, in the same
    /// order: entry k of the table must mirror an eager read at
    /// `grid.entries[k]`. The fixture carries the two cases that make the
    /// mapping non-trivial — a rider owning two bodies, and a soldier killed
    /// after the last body rebuild whose bodies still sit in the grid.
    #[test]
    fn packed_bodies_mirror_the_eager_reads_at_each_grid_entry() {
        let mut sim = still_field(11);
        // Teams 1 and 3 (not 0 and 1): the table must carry the whole id.
        let foot = sim.spawn_class(Vec2::new(0.0, 0.0), 0.0, 6, UnitClassId::HeavySword, 1);
        let horse = sim.spawn_class(Vec2::new(4.0, 0.0), PI, 3, UnitClassId::ShockCavalry, 3);
        sim.tick();
        // A death AFTER the rebuild: separation's impact kills land like this,
        // which is why the scan (and the table) carry an `alive` bit at all.
        let corpse = first(&sim, foot) + 1;
        sim.kill(corpse);

        let mut packed = Vec::new();
        pack_bodies(&sim, &mut packed);
        assert_eq!(packed.len(), sim.grid.entries.len());
        for (k, &bj) in sim.grid.entries.iter().enumerate() {
            let bj = bj as usize;
            let j = sim.body_owner[bj] as usize;
            let uj = sim.soldier_unit[j] as usize;
            let rec = packed[k];
            assert_eq!(rec.x.to_bits(), sim.body_pos[2 * bj].to_bits(), "x at {k}");
            assert_eq!(
                rec.y.to_bits(),
                sim.body_pos[2 * bj + 1].to_bits(),
                "y at {k}"
            );
            assert_eq!(rec.r.to_bits(), sim.body_r[bj].to_bits(), "r at {k}");
            assert_eq!(rec.owner as usize, j, "owner at {k}");
            assert_eq!(rec.unit as usize, uj, "unit at {k}");
            assert_eq!(rec.team, sim.units[uj].team, "team at {k}");
            assert_eq!(rec.alive, sim.alive[j] != 0, "alive at {k}");
            assert_eq!(rec.mounted, sim.mounted[j] == 1, "mounted at {k}");
        }
        assert!(
            packed.iter().any(|b| !b.alive),
            "the fixture must leave a dead soldier's bodies in the grid"
        );
        let rider = first(&sim, horse);
        assert_eq!(
            packed.iter().filter(|b| b.owner as usize == rider).count(),
            2,
            "a rider owns two bodies, both packed"
        );
        assert!(packed.iter().filter(|b| b.mounted).count() > 0);
    }

    /// A team is an arbitrary u32 identity, not a flag. Teams 1 and 3 share
    /// every low bit, so a scan that carried "the team bit" instead of the
    /// team would read these two units as comrades and never find a foe.
    #[test]
    fn a_full_team_id_decides_friend_from_foe_not_one_of_its_bits() {
        let mut sim = still_field(13);
        let ones = sim.spawn_class(Vec2::new(0.0, 0.0), 0.0, 1, UnitClassId::HeavySword, 1);
        let threes = sim.spawn_class(Vec2::new(2.0, 0.0), PI, 1, UnitClassId::HeavySword, 3);
        // A second team-3 unit: the comrade the team-3 man must NOT turn on.
        let allies = sim.spawn_class(Vec2::new(3.2, 0.0), PI, 1, UnitClassId::HeavySword, 3);
        let (a, b, c) = (first(&sim, ones), first(&sim, threes), first(&sim, allies));
        for _ in 0..5 {
            sim.tick();
        }
        assert_eq!(sim.target[a], b as i32, "team 1 must see team 3 as the foe");
        assert_eq!(
            sim.target[b], a as i32,
            "team 3 must fight team 1, not its own team-3 comrade s{c}"
        );
        assert_eq!(sim.target[c], a as i32, "and so must its comrade");
    }

    /// `fighting` is written by `find_target` itself, so it must stay a LIVE
    /// read: a comrade who entered the fight earlier in this same pass already
    /// counts toward the local fight density. Zeroing the flags and running one
    /// pass makes the point exactly — every count it produces was set by an
    /// earlier search in the pass, so a snapshot taken at the top would score 0.
    #[test]
    fn a_comrade_who_entered_the_fight_earlier_in_this_pass_counts_now() {
        let mut sim = still_field(17);
        sim.spawn_class(Vec2::new(0.0, 0.0), 0.0, 12, UnitClassId::HeavySword, 0);
        sim.spawn_class(Vec2::new(0.0, 2.0), -PI, 12, UnitClassId::HeavySword, 1);
        for _ in 0..40 {
            sim.tick();
        }
        for f in sim.fighting.iter_mut() {
            *f = 0;
        }
        for d in sim.fight_near.iter_mut() {
            *d = 0;
        }
        run_combat(&mut sim);
        assert!(
            sim.fight_near.iter().any(|&d| d > 0),
            "with every flag cleared, any fight_near count can only come from a \
             comrade who set his own flag earlier in THIS pass"
        );
    }

    /// The scan measures other soldiers by their BODY — the snapshot separation
    /// built this tick — not by their live position, which combat itself moves
    /// (an impale shove) as the pass runs. A body left behind by a teleport is
    /// still the thing that is seen.
    #[test]
    fn the_scan_measures_foes_by_their_body_snapshot() {
        let mut sim = still_field(19);
        let me = sim.spawn_class(Vec2::new(0.0, 0.0), 0.0, 1, UnitClassId::HeavySword, 0);
        let near = sim.spawn_class(Vec2::new(2.0, 0.0), PI, 1, UnitClassId::Peasant, 1);
        let far = sim.spawn_class(Vec2::new(4.0, 0.0), PI, 1, UnitClassId::Peasant, 1);
        let (m, n, f) = (first(&sim, me), first(&sim, near), first(&sim, far));
        tick_to_phase_of(&mut sim, m);
        assert_eq!(
            sim.target[m], n as i32,
            "the nearer foe, before the teleport"
        );

        // Move the near foe's LIVE position out of the fight, leaving his body
        // where the grid holds it.
        sim.positions[2 * n] = 400.0;
        run_combat(&mut sim);
        assert_eq!(
            sim.target[m], n as i32,
            "the foe is still seen at his body (s{f} is the only live-position answer)"
        );
    }

    /// The scanning soldier's own position, though, is read LIVE — it is the
    /// caller's `p`, taken fresh each search, so a man the pass has already
    /// shoved searches from where he now stands.
    #[test]
    fn the_scan_searches_from_the_soldiers_live_position() {
        let mut sim = still_field(23);
        let me = sim.spawn_class(Vec2::new(0.0, 0.0), 0.0, 1, UnitClassId::HeavySword, 0);
        let foe = sim.spawn_class(Vec2::new(9.0, 0.0), PI, 1, UnitClassId::Peasant, 1);
        let (m, e) = (first(&sim, me), first(&sim, foe));
        tick_to_phase_of(&mut sim, m);
        assert_eq!(sim.target[m], -1, "9m apart: nobody is engaged");

        sim.positions[2 * m] = sim.positions[2 * e] - 2.0;
        run_combat(&mut sim);
        assert_eq!(
            sim.target[m], e as i32,
            "searching from where he now stands, the foe is 2m away"
        );
    }

    /// A rider is TWO bodies in the grid and one man. The scan measures both
    /// and keeps the nearer — the horse's head, when that is what you are
    /// standing in front of — so the engagement distance is the real surface
    /// gap, not whichever of his circles the bucket happened to offer first.
    #[test]
    fn a_riders_two_bodies_both_measure_and_the_nearer_one_decides() {
        let mut sim = still_field(29);
        let me = sim.spawn_class(Vec2::new(0.0, 0.0), 0.0, 1, UnitClassId::HeavySword, 0);
        let horse = sim.spawn_class(Vec2::new(3.0, 0.0), PI, 1, UnitClassId::ShockCavalry, 1);
        let (m, r) = (first(&sim, me), first(&sim, horse));
        tick_to_phase_of(&mut sim, m);
        // Where he stands as this pass searches; the shove staged by the pass
        // lands only after it, so this is the `p` the scan reads.
        let p = sim.soldier_pos(m);
        run_combat(&mut sim);

        let mut nearest = f32::MAX;
        let mut his_bodies = 0;
        for bj in 0..sim.body_r.len() {
            if sim.body_owner[bj] as usize != r {
                continue;
            }
            his_bodies += 1;
            let to = Vec2::new(sim.body_pos[2 * bj], sim.body_pos[2 * bj + 1]) - p;
            nearest = nearest.min(to.len() - sim.body_r[bj] - sim.radius[m]);
        }
        assert_eq!(his_bodies, 2, "a rider is two bodies");
        assert_eq!(sim.target[m], r as i32);
        assert_eq!(
            sim.nearest_enemy_d[m].to_bits(),
            nearest.to_bits(),
            "the engagement distance is the nearer of the rider's two bodies"
        );
    }

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
