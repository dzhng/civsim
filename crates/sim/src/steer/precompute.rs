use super::*;

pub(crate) struct UnitPre {
    pub sprint_sp: f32,
    pub surge_sp: f32,
    pub keep_up_sp: f32,
    pub reach: f32,
    pub advancing: bool,
    pub strict_formation: bool,
    pub slot_pull: f32,
    pub broad_press: bool,
    pub soldier_at_slot: Vec<usize>,
    pub projected_pivot: Vec<Vec2>,
    pub mounted_threat_near: bool,
}

pub(crate) fn precompute_unit(sim: &Sim, ui: usize) -> UnitPre {
    let tun = sim.tun;
    let u = &sim.units[ui];
    let f = dir(u.facing);
    let surge_sp = soldier_surge_speed(&tun, u);
    // The per-man sprint ceiling: a CHARGING unit's men may run all the way
    // to charge pace; otherwise the ceiling is the catch-up surge. Without
    // the charge branch the cap below clamps a charge back down to a surge.
    let sprint_sp = if u.charging {
        soldier_charge_speed(&tun, u)
    } else {
        surge_sp
    };
    let keep_up_sp = pace_speed(&tun, u) + 0.5;
    let advancing = matches!(u.mode, OrderMode::Attack(_)) || u.move_target.is_some();
    let strict_formation = u.strict_formation();
    let slot_pull = if u.pivoting && u.engaged == 0 {
        tun.slot_pull_hold.max(tun.slot_pull)
    } else if advancing && !strict_formation {
        tun.slot_pull
    } else {
        tun.slot_pull_hold
    };
    let mounted_threat_near = !u.at_ease
        && sim.units.iter().any(|v| {
            if v.team == u.team || v.alive_count == 0 || v.routing || !v.is_mounted() {
                return false;
            }
            let gap = (v.center() - u.center()).len() - v.bound_radius() - u.bound_radius();
            gap < tun.at_ease_range
        });
    let my_files = u.files_eff.max(1);
    let broad_press = covered_fighting_files(u, &sim.alive, &sim.fighting, &sim.soldier_slot)
        .iter()
        .filter(|&&covered| covered)
        .count()
        * 2
        > my_files;
    let narrow_against_much_wider_foot = advancing
        && !strict_formation
        && !u.is_mounted()
        && !u.tramples()
        && sim.units.iter().any(|v| {
            if v.team == u.team
                || v.alive_count == 0
                || v.is_mounted()
                || v.tramples()
                || v.files_eff.max(1) < my_files * 4
            {
                return false;
            }
            let vf = dir(v.facing);
            if f.dot(vf) > -0.35 {
                return false;
            }
            let vr = vf.perp();
            let lateral = (u.center() - v.center()).dot(vr).abs();
            let lateral_overlap = lateral < 0.5 * (u.width() + v.width()) + u.spacing.x;
            let axial = (v.center() - u.center()).dot(f);
            lateral_overlap && axial > -u.depth() && axial < 220.0
        });
    let reach = u.stats.weapons.iter().fold(0.0f32, |m, w| m.max(w.reach));

    let slot_capacity = u.count.div_ceil(u.files_eff.max(1)) * u.files_eff.max(1);
    let mut soldier_at_slot = vec![usize::MAX; slot_capacity];
    for s in 0..u.count {
        let i = u.start + s;
        if sim.alive[i] == 1 {
            let sl = sim.soldier_slot[i] as usize;
            if sl < slot_capacity {
                soldier_at_slot[sl] = i;
            }
        }
    }

    let mut living_centroid = Vec2::ZERO;
    let mut living_count = 0.0f32;
    for s in 0..u.count {
        let i = u.start + s;
        if sim.alive[i] == 1 {
            living_centroid =
                living_centroid + Vec2::new(sim.positions[2 * i], sim.positions[2 * i + 1]);
            living_count += 1.0;
        }
    }
    if living_count > 0.0 {
        living_centroid = living_centroid * (1.0 / living_count);
    }

    let mut pre = UnitPre {
        sprint_sp,
        surge_sp,
        keep_up_sp,
        reach,
        advancing,
        strict_formation,
        slot_pull,
        broad_press,
        soldier_at_slot,
        projected_pivot: vec![Vec2::ZERO; u.count],
        mounted_threat_near,
    };
    if living_count > 0.0 {
        let order_advancing = u.move_target.is_some() || matches!(u.mode, OrderMode::Attack(_));
        let running =
            !strict_formation && u.move_target.is_some() && u.mass_advance > tun.charge_spent_speed;
        let gathering = u.reform_timer > 0.0
            && u.cohesion < REFORM_COH
            && !matches!(u.mode, OrderMode::Attack(_) | OrderMode::Disengage);
        let trampling_unit =
            u.tramples() && (u.move_target.is_some() || u.mass_advance > tun.charge_spent_speed);
        let weave_active = !((trampling_unit || running) && !gathering);
        if weave_active {
            let neighbor_skip = if order_advancing && !strict_formation {
                1
            } else {
                WEAVE_NEIGHBOR_SKIP
            };
            let mut torque = 0.0f32;
            let mut inertia = 0.0f32;
            for s in 0..u.count {
                let i = u.start + s;
                if sim.alive[i] == 0 || sim.stun[i] > 0.0 || sim.trampled[i] > 0.0 || u.routing {
                    continue;
                }
                let p = Vec2::new(sim.positions[2 * i], sim.positions[2 * i + 1]);
                let si = sim.soldier_slot[i] as usize;
                let mut raw = Vec2::ZERO;
                for (j, off) in
                    slot_neighbours(u, &pre, si, neighbor_skip, &sim.alive, &sim.trampled)
                {
                    let jp = Vec2::new(sim.prev_positions[2 * j], sim.prev_positions[2 * j + 1]);
                    let d = p - jp;
                    let (al, rl) = (d.len(), off.len());
                    if al > rl + WEAVE_TERRAIN_CHECK_STRETCH && !sim.terrain.segment_passable(p, jp)
                    {
                        continue;
                    }
                    if al > 1e-3 && rl > 1e-3 {
                        let (dh, oh) = (d * (1.0 / al), off * (1.0 / rl));
                        let dot = (dh.x * oh.x + dh.y * oh.y).clamp(-1.0, 1.0);
                        let tang = oh - dh * dot;
                        let fighting_mounted =
                            sim.target[i] >= 0 && sim.mounted[sim.target[i] as usize] == 1;
                        let pivot_len = if (u.is_mounted()
                            || fighting_mounted
                            || narrow_against_much_wider_foot)
                            && al > rl
                        {
                            al.min(rl + 0.10)
                        } else {
                            al
                        };
                        raw = raw + tang * pivot_len;
                    }
                }
                let component = raw * tun.pivot_stiffness;
                pre.projected_pivot[s] = component;
                let lever = p - living_centroid;
                torque += lever.x * component.y - lever.y * component.x;
                inertia += lever.x * lever.x + lever.y * lever.y;
            }
            if inertia > 1.0e-6 {
                let omega = torque / inertia;
                for s in 0..u.count {
                    let i = u.start + s;
                    if sim.alive[i] == 0 {
                        continue;
                    }
                    let p = Vec2::new(sim.positions[2 * i], sim.positions[2 * i + 1]);
                    let lever = p - living_centroid;
                    pre.projected_pivot[s] =
                        pre.projected_pivot[s] - Vec2::new(-omega * lever.y, omega * lever.x);
                }
            }
        }
    }

    pre
}
