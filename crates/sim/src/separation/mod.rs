//! Body collision: the physical medium of the battle.
//!
//! Soldiers are circles; mounted soldiers are TWO circles (an elongated horse)
//! whose rider sits at the center — rider reachability is pure geometry.
//! Overlapping bodies push apart, the lighter yielding more, sharing the
//! correction by effective mass. Force TRANSMISSION (deep columns walking thin
//! lines back, pike walls holding) is not modelled here — it emerges from the
//! weave springs in steer_soldiers, and CRUSH is read off that same weave
//! compression, not from the pushes posted here.
//!
//! What this pass owns: the hard non-overlap correction, the REAL WALL (a man
//! may not end the tick inside an enemy body), and charge impacts (closing
//! speed × effective mass) that stun and displace.

use crate::class::HORSE_BODY_R;
use crate::force_trace::Tracer;
use crate::sim::Sim;

mod bodies;
mod walls;
mod weapon_repel;

pub(crate) fn apply_separation(sim: &mut Sim) {
    let n = sim.soldier_count();
    if n == 0 {
        return;
    }
    let tun = sim.tun;
    let tick_now = sim.tick_count;
    #[cfg(feature = "force-trace")]
    let mut force_records = Vec::new();
    let mut tracer = Tracer::new(
        #[cfg(feature = "force-trace")]
        &mut force_records,
        tick_now,
    );

    // --- per-unit brace factor; per-soldier effective mass -------------
    let brace: Vec<f32> = sim.units.iter().map(|u| u.brace()).collect();

    bodies::rebuild(sim, n);
    let nb = sim.body_owner.len();
    let max_pair = 2.0 * sim.max_radius.max(HORSE_BODY_R);
    let cell = bodies::grid_cell(max_pair);

    let Sim {
        positions,
        grid,
        scratch,
        terrain,
        mass,
        stun,
        trampled,
        mom_x,
        mom_y,
        soldier_unit,
        units,
        body_pos,
        body_r,
        body_owner,
        health,
        mount_health,
        mounted,
        facings,
        radius,
        alive,
        cur_weapon,
        rng,
        impact_kill_count,
        enemy_contact,
        ..
    } = sim;
    // Collision damage is applied after the pass (kill() needs &mut sim).
    let mut impact_kills: Vec<usize> = Vec::new();
    // Jacobi impact: the charge stack READS carried momentum (the trample
    // bleed reads the trampler's, the retain-set reads the victim's) and
    // WRITES it across bodies. In place those reads/writes ran in body-index
    // order — a head-on charge resolved one side's momentum before the
    // other's, the deep-press half of the directional bias. Read the
    // tick-start snapshot; stage the bleed (additive) and the retain (a
    // max-magnitude set) and apply both after the body loop.
    let n_sol = mom_x.len();
    let mom0_x = mom_x.clone();
    let mom0_y = mom_y.clone();
    let mut bleed_x = vec![0.0f32; n_sol];
    let mut bleed_y = vec![0.0f32; n_sol];
    let mut set_mag = vec![0.0f32; n_sol];
    let mut set_nx = vec![0.0f32; n_sol];
    let mut set_ny = vec![0.0f32; n_sol];
    grid.rebuild(cell, body_pos);
    // The REAL WALL: deepest enemy body a soldier overlaps this tick. The
    // capped push relieves crowds gently; an ENEMY body, though, a man may
    // not END the tick standing inside — he is snapped to its contact ring.
    // This is what stops a SHORT-weapon clash walking through: the planted
    // front line is a wall of bodies the rear can't shove past. Long braced
    // weapons extend the same wall out to reach (the pole pass below).
    let mut wall_depth = vec![-1.0f32; n];
    let mut wall_cx = vec![0.0f32; n];
    let mut wall_cy = vec![0.0f32; n];
    let mut wall_r = vec![0.0f32; n];
    // scratch: per-soldier [push_x, push_y] (the body separation, capped).
    scratch.clear();
    scratch.resize(2 * n, 0.0);
    // The weapon repel is a SEPARATE force, applied UNCAPPED: it must compete
    // on its own magnitude against the rear-rank backing (the contest of
    // pushes that decides the standoff distance), not get flattened by the
    // crowd-relief separation cap into a binary win/lose wall.
    let mut repel = vec![0.0f32; 2 * n];
    let mut project_unit_active = vec![0u8; units.len()];
    let mut project_any = false;

    // DIRECTIONAL brace: a man braces his FRONT — planted feet, leveled weapon,
    // raised shield, set against the enemy he faces. A threat on his flank or
    // rear meets no set resistance: his effective mass (what a push or a charge
    // must overcome) is full to the front and falls toward his bare body to the
    // rear. This is what makes a FLANK charge break into a line a frontal one
    // bogs on — the soft side is soft in the physics, not by a special case.
    // `tx,ty` is the direction from soldier i toward the threat. The directional
    // softness applies only to an ENEMY threat — a man braces against the foe he
    // faces, not against his own jostling neighbours, so a FRIENDLY push reads
    // his full omni-directional brace (else the weave deforms laterally).
    let brace_dir = |i: usize, tx: f32, ty: f32, enemy: bool| -> f32 {
        let b = brace[soldier_unit[i] as usize];
        if b <= 1.0 || !enemy {
            return b; // not set, no brace mult, or a friendly push: omni-directional
        }
        let aspect = crate::math::wrap_angle(ty.atan2(tx) - facings[i]).abs();
        let dir = if aspect < crate::combat::FRONT_ARC {
            1.0
        } else if aspect < crate::combat::SIDE_ARC {
            0.4
        } else {
            0.1
        };
        1.0 + (b - 1.0) * dir
    };
    let m_eff = |i: usize, tx: f32, ty: f32, enemy: bool| mass[i] * brace_dir(i, tx, ty, enemy);
    let unit_near_enemy: Vec<bool> = units
        .iter()
        .map(|u| {
            if u.tramples() && u.mass_advance > tun.charge_spent_speed {
                return false;
            }
            let eu = 0.5 * u.width().max(u.depth());
            units.iter().any(|v| {
                v.team != u.team
                    && v.alive_count > 0
                    && !(v.tramples() && v.mass_advance > tun.charge_spent_speed)
                    && (v.center() - u.center()).len() < eu + 0.5 * v.width().max(v.depth()) + 40.0
            })
        })
        .collect();
    bodies::separate_pairs(
        bodies::PairCtx {
            tun,
            nb,
            body_owner,
            body_pos,
            body_r,
            cell,
            grid,
            soldier_unit,
            units,
            enemy_contact,
            unit_near_enemy: &unit_near_enemy,
            project_unit_active: &mut project_unit_active,
            project_any: &mut project_any,
            trampled,
            stun,
            mom0_x: &mom0_x,
            mom0_y: &mom0_y,
            bleed_x: &mut bleed_x,
            bleed_y: &mut bleed_y,
            facings,
            rng,
            impact_kill_count,
            mounted,
            mount_health,
            health,
            impact_kills: &mut impact_kills,
            set_mag: &mut set_mag,
            set_nx: &mut set_nx,
            set_ny: &mut set_ny,
            scratch,
            wall_depth: &mut wall_depth,
            wall_cx: &mut wall_cx,
            wall_cy: &mut wall_cy,
            wall_r: &mut wall_r,
        },
        &m_eff,
        &brace_dir,
        &mut tracer,
    );

    bodies::apply_momentum(
        bodies::MomentumCtx {
            n_sol,
            mom_x,
            mom_y,
            bleed_x: &bleed_x,
            bleed_y: &bleed_y,
            set_mag: &set_mag,
            set_nx: &set_nx,
            set_ny: &set_ny,
            soldier_unit,
        },
        &mut tracer,
    );
    weapon_repel::apply(
        weapon_repel::WeaponRepelCtx {
            units,
            tun,
            cell,
            nb,
            body_owner,
            soldier_unit,
            cur_weapon,
            body_pos,
            grid,
            body_r,
            mounted,
            project_unit_active: &mut project_unit_active,
            project_any: &mut project_any,
            repel: &mut repel,
        },
        &m_eff,
        &mut tracer,
    );
    walls::apply(
        walls::WallsCtx {
            n,
            tun,
            scratch,
            repel: &repel,
            positions,
            terrain,
            wall_depth: &wall_depth,
            wall_cx: &wall_cx,
            wall_cy: &wall_cy,
            wall_r: &wall_r,
            soldier_unit,
            project_any,
            body_pos,
            body_r,
            body_owner,
            alive,
            mounted,
            facings,
            radius,
            grid,
            cell,
            project_unit_active: &project_unit_active,
            units,
        },
        &mut tracer,
        &m_eff,
    );
    // The throws that broke bodies: bookkeeping after the borrow ends.
    sim.impact_casualties += impact_kills.len() as u64;
    for &i in &impact_kills {
        sim.kill_with(i, crate::combat::KillCause::Impact);
    }
    drop(tracer);
    #[cfg(feature = "force-trace")]
    sim.force_trace.extend(force_records);
}
