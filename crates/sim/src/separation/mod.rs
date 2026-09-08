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

#[derive(Default)]
pub(crate) struct Scratch {
    brace: Vec<f32>,
    impact_kills: Vec<usize>,
    mom0_x: Vec<f32>,
    mom0_y: Vec<f32>,
    bleed_x: Vec<f32>,
    bleed_y: Vec<f32>,
    set_mag: Vec<f32>,
    set_nx: Vec<f32>,
    set_ny: Vec<f32>,
    wall_depth: Vec<f32>,
    wall_cx: Vec<f32>,
    wall_cy: Vec<f32>,
    wall_r: Vec<f32>,
    repel: Vec<f32>,
    project_unit_active: Vec<u8>,
    unit_near_enemy: Vec<bool>,
    weapon_repel: weapon_repel::Scratch,
}

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
    sim.separation_scratch.brace.clear();
    sim.separation_scratch
        .brace
        .extend(sim.units.iter().map(|u| u.brace()));
    // Applying queued kills needs the whole sim after the array borrows end.
    let mut impact_kills = std::mem::take(&mut sim.separation_scratch.impact_kills);
    impact_kills.clear();

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
        alive,
        cur_weapon,
        rng,
        impact_kill_count,
        enemy_contact,
        separation_scratch,
        ..
    } = sim;
    let Scratch {
        brace,
        mom0_x,
        mom0_y,
        bleed_x,
        bleed_y,
        set_mag,
        set_nx,
        set_ny,
        wall_depth,
        wall_cx,
        wall_cy,
        wall_r,
        repel,
        project_unit_active,
        unit_near_enemy,
        weapon_repel,
        ..
    } = separation_scratch;
    // Jacobi impact: the charge stack READS carried momentum (the trample
    // bleed reads the trampler's, the retain-set reads the victim's) and
    // WRITES it across bodies. In place those reads/writes ran in body-index
    // order — a head-on charge resolved one side's momentum before the
    // other's, the deep-press half of the directional bias. Read the
    // tick-start snapshot; stage the bleed (additive) and the retain (a
    // max-magnitude set) and apply both after the body loop.
    let n_sol = mom_x.len();
    mom0_x.clear();
    mom0_x.extend_from_slice(mom_x);
    mom0_y.clear();
    mom0_y.extend_from_slice(mom_y);
    bleed_x.clear();
    bleed_x.resize(n_sol, 0.0);
    bleed_y.clear();
    bleed_y.resize(n_sol, 0.0);
    set_mag.clear();
    set_mag.resize(n_sol, 0.0);
    set_nx.clear();
    set_nx.resize(n_sol, 0.0);
    set_ny.clear();
    set_ny.resize(n_sol, 0.0);
    grid.rebuild(cell, body_pos);
    // The REAL WALL: deepest enemy body a soldier overlaps this tick. The
    // capped push relieves crowds gently; an ENEMY body, though, a man may
    // not END the tick standing inside — he is snapped to its contact ring.
    // This is what stops a SHORT-weapon clash walking through: the planted
    // front line is a wall of bodies the rear can't shove past. Long braced
    // weapons extend the same wall out to reach (the pole pass below).
    wall_depth.clear();
    wall_depth.resize(n, -1.0);
    wall_cx.clear();
    wall_cx.resize(n, 0.0);
    wall_cy.clear();
    wall_cy.resize(n, 0.0);
    wall_r.clear();
    wall_r.resize(n, 0.0);
    // scratch: per-soldier [push_x, push_y] (the body separation, capped).
    scratch.clear();
    scratch.resize(2 * n, 0.0);
    // The weapon repel is a SEPARATE force, applied UNCAPPED: it must compete
    // on its own magnitude against the rear-rank backing (the contest of
    // pushes that decides the standoff distance), not get flattened by the
    // crowd-relief separation cap into a binary win/lose wall.
    repel.clear();
    repel.resize(2 * n, 0.0);
    project_unit_active.clear();
    project_unit_active.resize(units.len(), 0);
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
    unit_near_enemy.clear();
    unit_near_enemy.extend(units.iter().map(|u| {
        if u.tramples() && u.mass_advance > tun.charge_spent_speed {
            return false;
        }
        let eu = u.bound_radius();
        units.iter().any(|v| {
            v.team != u.team
                && v.alive_count > 0
                && !(v.tramples() && v.mass_advance > tun.charge_spent_speed)
                && (v.center() - u.center()).len() < eu + v.bound_radius() + 40.0
        })
    }));
    perf_scope!(_timer, "separation body pairs");
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
            unit_near_enemy,
            project_unit_active,
            project_any: &mut project_any,
            trampled,
            stun,
            mom0_x,
            mom0_y,
            bleed_x,
            bleed_y,
            facings,
            rng,
            impact_kill_count,
            mounted,
            mount_health,
            health,
            impact_kills: &mut impact_kills,
            set_mag,
            set_nx,
            set_ny,
            scratch,
            wall_depth,
            wall_cx,
            wall_cy,
            wall_r,
        },
        &m_eff,
        &brace_dir,
        &mut tracer,
    );

    perf_next!(_timer, "separation momentum");
    bodies::apply_momentum(
        bodies::MomentumCtx {
            n_sol,
            mom_x,
            mom_y,
            bleed_x,
            bleed_y,
            set_mag,
            set_nx,
            set_ny,
            soldier_unit,
        },
        &mut tracer,
    );
    perf_next!(_timer, "separation weapon repel");
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
            project_unit_active,
            project_any: &mut project_any,
            repel,
            scratch: weapon_repel,
        },
        &m_eff,
        &mut tracer,
    );
    perf_next!(_timer, "separation walls");
    walls::apply(
        walls::WallsCtx {
            n,
            tun,
            scratch,
            repel,
            positions,
            terrain,
            wall_depth,
            wall_cx,
            wall_cy,
            wall_r,
            soldier_unit,
            project_any,
            body_pos,
            body_r,
            body_owner,
            alive,
            mounted,
            facings,
            grid,
            cell,
            project_unit_active,
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
    sim.separation_scratch.impact_kills = impact_kills;
    drop(tracer);
    #[cfg(feature = "force-trace")]
    sim.force_trace.extend(force_records);
}
