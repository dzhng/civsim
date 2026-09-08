use crate::force_trace::{ForceChannel, Tracer};
use crate::math::{dir, rotate_toward, wrap_angle, Vec2};
use crate::movement::{drift_factor, pace_speed, soldier_charge_speed, soldier_surge_speed};
use crate::sim::Sim;
use crate::terrain::{stagger01, Terrain};
use crate::tunables::{Pace, Tunables, DT};
use crate::unit::{covered_fighting_files, slot_local, OrderMode, Unit};

mod facing;
mod precompute;
mod routing;
mod speed_caps;
mod weave;

use facing::{finish_soldier, FinishArgs};
use precompute::{precompute_unit, CorridorFoe, UnitPre};
use routing::{prepare_soldier, PrepareSoldierArgs, PreparedSoldier};
use speed_caps::speed_caps;
use speed_caps::{drive_velocity, DriveArgs, SpeedCapsArgs};
use weave::slot_neighbours;
use weave::{
    apply_magnet, compose_weave_and_corridor, prepare_weave, CompositionArgs, MagnetArgs,
    PrepareWeaveArgs, PreparedWeave, SoldierCtx, SteerComposition,
};

/// Per-unit aggregates `steer_soldiers` measures over its men in one pass, for
/// `contact_facing` and `integrate_units` to consume. Centroid is carried as the
/// running sums (cx, cy); divide by `alive_n` to get the mean.
pub(crate) struct UnitMeasure {
    /// Sum of per-soldier slot stretch (m) — feeds mean bond stretch / cohesion.
    pub(crate) err_sum: f32,
    /// Accumulated terrain effort (per-man (1 - ground) while moving).
    pub(crate) effort: f32,
    /// Living men in contact (engaged > 0).
    pub(crate) engaged: usize,
    /// Living men.
    pub(crate) alive_n: usize,
    /// Centroid running sums (x, y); mean = cx/alive_n, cy/alive_n.
    pub(crate) cx: f32,
    pub(crate) cy: f32,
    /// Received push OPPOSING the facing — the unit-level braking force.
    pub(crate) opp_press: f32,
    /// Sum of per-soldier bond pivot — feeds cohesion.
    pub(crate) pivot_sum: f32,
}

pub(crate) const TRAMPLE_SLOT_GRIP: f32 = 0.3;
pub(crate) const REFORM_COH: f32 = 0.55;
pub(crate) const IDLE_FIDGET: f32 = 0.12;
pub(crate) const IDLE_GLANCE: f32 = 0.18;
pub(crate) const FACING_DEADZONE: f32 = 0.14;
pub(crate) const FACING_FRONT_ARC: f32 = 1.0;
pub(crate) const WEAVE_NEIGHBOR_SKIP: usize = 4;
pub(crate) const WEAVE_TERRAIN_CHECK_STRETCH: f32 = 2.0;
pub(crate) const SLOT_TERRAIN_CHECK_DIST: f32 = 3.0;

/// Per-soldier steering and measurement. Returns one `UnitMeasure` per unit.
pub(crate) fn steer_soldiers(sim: &mut Sim, dt: f32) -> Vec<UnitMeasure> {
    let unit_pre: Vec<_> = (0..sim.units.len())
        .map(|ui| precompute_unit(sim, ui))
        .collect();
    let tun = sim.tun;
    let Sim {
        units,
        soldier_unit,
        positions,
        prev_positions,
        last_disp_x,
        last_disp_y,
        ema_disp_x,
        ema_disp_y,
        mass,
        mom_x,
        mom_y,
        pressure,
        press_x,
        press_y,
        front_clear,
        awareness,
        facings,
        soldier_slot,
        fidget_offset,
        terrain,
        tick_count,
        alive,
        stun,
        trampled,
        target,
        fighting,
        hit_dir,
        hit_ttl,
        mounted,
        nearest_enemy,
        nearest_enemy_d,
        ..
    } = sim;
    let tick_now = *tick_count;
    #[cfg(feature = "force-trace")]
    let mut force_records = Vec::new();
    let mut tracer = Tracer::new(
        #[cfg(feature = "force-trace")]
        &mut force_records,
        tick_now,
    );
    // Pressure is read straight off the WEAVE now: a man's crush is the
    // load on his springs — the friendly net squeezing him plus the enemy
    // reach-spring shoving him back when ranks pile him inside reach. No
    // separate force ledger; the same springs that move him measure him.
    let press_alpha = 1.0 - (-dt / tun.press_tau).exp();
    let mut measures = Vec::with_capacity(units.len());
    for (ui, u) in units.iter().enumerate() {
        let pre = &unit_pre[ui];
        let f = dir(u.facing);
        let r = f.perp();
        let projected_pivot = &pre.projected_pivot;
        let my_files = u.files_eff.max(1);
        let mut err_sum = 0.0f32;
        let mut pivot_sum = 0.0f32;
        let mut effort = 0.0f32;
        let mut engaged = 0usize;
        let mut alive_n = 0usize;
        let mut cx = 0.0f32;
        let mut cy = 0.0f32;
        // Received push OPPOSING the facing (the crowd's answer to the
        // unit's drive): the unit-level braking force, measured.
        let mut opp_press = 0.0f32;

        for s in 0..u.count {
            let i = u.start + s;
            let Some(PreparedSoldier {
                p,
                aware: aware_i,
                engaged: engaged_i,
                order_advancing,
                trampling,
            }) = prepare_soldier(
                PrepareSoldierArgs {
                    u,
                    i,
                    f,
                    surge_sp: pre.surge_sp,
                    tun: &tun,
                    dt,
                    alive,
                    positions,
                    press_x,
                    press_y,
                    mom_x,
                    mom_y,
                    mass,
                    stun,
                    trampled,
                    target,
                    fighting,
                    terrain,
                    facings,
                    soldier_unit,
                    alive_n: &mut alive_n,
                    cx: &mut cx,
                    cy: &mut cy,
                    opp_press: &mut opp_press,
                    engaged_count: &mut engaged,
                },
                &mut tracer,
            )
            else {
                continue;
            };
            let PreparedWeave {
                slot_anchor_vec,
                slot_pull_vec,
                corridor_slot_removed,
                formation_blocks_forward,
                net_target,
                comp_push,
                crush_scalar,
                enemy_weld_component,
                enemy_inside_push,
                err,
                max_sp,
            } = prepare_weave(PrepareWeaveArgs {
                i,
                u,
                pre,
                p,
                f,
                r,
                aware: aware_i,
                engaged: engaged_i,
                order_advancing,
                trampling,
                tun: &tun,
                prev_positions,
                alive,
                trampled,
                soldier_slot,
                target,
                terrain,
                ema_disp_x,
                ema_disp_y,
                nearest_enemy_d,
                err_sum: &mut err_sum,
                pivot_sum: &mut pivot_sum,
            });
            let SteerComposition {
                mut steer_to,
                gathering,
                idle,
                trample_dive,
            } = compose_weave_and_corridor(
                CompositionArgs {
                    u,
                    i,
                    s,
                    strict_formation: pre.strict_formation,
                    trampling,
                    net_target,
                    comp_push,
                    enemy_weld_component,
                    enemy_inside_push,
                    slot_anchor_vec,
                    slot_pull_vec,
                    corridor_slot_removed,
                    projected_pivot,
                    slot_pull: pre.slot_pull,
                    advancing: pre.advancing,
                    engaged: engaged_i,
                    broad_press: pre.broad_press,
                    my_files,
                    err,
                    hit_ttl,
                    target,
                    mounted,
                    units,
                    soldier_unit,
                    tun: &tun,
                    dt,
                },
                &mut tracer,
            );
            let seeking_flank = apply_magnet(
                MagnetArgs {
                    steer_to: &mut steer_to,
                    u,
                    i,
                    p,
                    f,
                    aware: aware_i,
                    trample_dive,
                    strict_formation: pre.strict_formation,
                    formation_blocks_forward,
                    reach: pre.reach,
                    front_clear,
                    target,
                    prev_positions,
                    tun: &tun,
                    dt,
                    soldier_unit,
                },
                &mut tracer,
            );
            let (v, ground) = drive_velocity(
                DriveArgs {
                    steer_to,
                    max_sp,
                    u,
                    i,
                    p,
                    f,
                    r,
                    engaged: engaged_i,
                    seeking_flank,
                    formation_blocks_forward,
                    gathering,
                    idle,
                    err,
                    tun: &tun,
                    dt,
                    tick_now,
                    fidget_offset,
                    terrain,
                    facings,
                    soldier_unit,
                    target,
                    prev_positions,
                    nearest_enemy,
                    nearest_enemy_d,
                    fighting,
                    last_disp_x,
                    last_disp_y,
                    effort: &mut effort,
                },
                &mut tracer,
            );
            finish_soldier(
                FinishArgs {
                    v,
                    u,
                    pre,
                    i,
                    p,
                    f,
                    r,
                    aware: aware_i,
                    engaged: engaged_i,
                    order_advancing,
                    trampling,
                    mounted_threat_near: pre.mounted_threat_near,
                    idle,
                    err,
                    ground,
                    crush_scalar,
                    comp_push,
                    press_alpha,
                    tun: &tun,
                    tick_now,
                    dt,
                    units,
                    soldier_unit,
                    positions,
                    prev_positions,
                    last_disp_x,
                    last_disp_y,
                    ema_disp_x,
                    ema_disp_y,
                    pressure,
                    press_x,
                    press_y,
                    awareness,
                    facings,
                    terrain,
                    mounted,
                    target,
                    hit_dir,
                    hit_ttl,
                },
                &mut tracer,
            );
        }
        measures.push(UnitMeasure {
            err_sum,
            effort,
            engaged,
            alive_n,
            cx,
            cy,
            opp_press,
            pivot_sum,
        });
    }
    #[cfg(feature = "force-trace")]
    sim.force_trace.extend(force_records);
    measures
}
