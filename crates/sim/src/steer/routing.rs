use super::*;

pub(super) struct RouteArgs<'a> {
    pub(super) u: &'a Unit,
    pub(super) i: usize,
    pub(super) p: Vec2,
    pub(super) surge_sp: f32,
    pub(super) terrain: &'a Terrain,
    pub(super) tun: &'a Tunables,
    pub(super) positions: &'a mut [f32],
    pub(super) soldier_unit: &'a [u32],
    pub(super) facings: &'a mut [f32],
    pub(super) dt: f32,
}

fn route_soldier(args: RouteArgs<'_>, tracer: &mut Tracer<'_>) -> bool {
    let RouteArgs {
        u,
        i,
        p,
        surge_sp,
        terrain,
        tun,
        positions,
        soldier_unit,
        facings,
        dt,
    } = args;

    if u.routing {
        // Broken men flee as a MOB, not a starburst. The whole unit
        // shares ONE escape heading — away from the enemy mass taken
        // from the UNIT centroid, so every man runs the same way. (A
        // per-man "away from MY spot" gives each soldier a different
        // radial heading, which is exactly what fans a rout across
        // the whole field.) A man who has drifted wide of his fellows
        // bends his run back toward the centroid, so the rout stays a
        // clump that holds together and can later rally.
        // Run for our OWN side — straight for the map edge (top or
        // bottom) this unit deployed from, where campaign
        // reinforcements also arrive. Broken men sprint for that
        // baseline as one body; they don't wheel around the nearest
        // enemy. The whole unit shares the one heading, so the rout
        // runs as a clump, not a starburst.
        let flee = Vec2::new(0.0, u.home_dir_y);
        let to_c = u.centroid - p;
        let cl = to_c.len();
        let bend = if cl > 1.0 {
            // up to half-weight toward the mob, ramped over ~15 m out
            to_c * ((0.5 * (cl / 15.0).min(1.0)) / cl)
        } else {
            Vec2::ZERO
        };
        let run = flee + bend;
        let run = run * (1.0 / run.len().max(1e-3));
        let sp = surge_sp
            * (terrain.speed_at(p)
                * (1.0 - tun.micro_rough * (1.0 - crate::terrain::micro_rough(p))))
            .max(0.0);
        positions[2 * i] = p.x + run.x * sp * dt;
        positions[2 * i + 1] = p.y + run.y * sp * dt;
        tracer.record(
            i,
            soldier_unit[i] as usize,
            ForceChannel::Routing,
            None,
            Vec2::new(positions[2 * i], positions[2 * i + 1]) - p,
            "routing_run",
        );
        let desired = run.y.atan2(run.x);
        let facing_before = facings[i];
        facings[i] = rotate_toward(
            facings[i],
            desired,
            tun.soldier_turn_rate * u.stats.turn_mult * dt,
        );
        if facings[i] != facing_before {
            tracer.record(
                i,
                soldier_unit[i] as usize,
                ForceChannel::SoldierFacing,
                None,
                Vec2::new(wrap_angle(facings[i] - facing_before), 0.0),
                "routing_facing",
            );
        }
        return true;
    }

    false
}

pub(super) struct PreparedSoldier {
    pub(super) p: Vec2,
    pub(super) aware: bool,
    pub(super) engaged: bool,
    pub(super) order_advancing: bool,
    pub(super) trampling: bool,
}

pub(super) struct PrepareSoldierArgs<'a> {
    pub(super) u: &'a Unit,
    pub(super) i: usize,
    pub(super) f: Vec2,
    pub(super) surge_sp: f32,
    pub(super) tun: &'a Tunables,
    pub(super) dt: f32,
    pub(super) alive: &'a [u8],
    pub(super) positions: &'a mut [f32],
    pub(super) press_x: &'a [f32],
    pub(super) press_y: &'a [f32],
    pub(super) mom_x: &'a mut [f32],
    pub(super) mom_y: &'a mut [f32],
    pub(super) mass: &'a [f32],
    pub(super) stun: &'a mut [f32],
    pub(super) trampled: &'a mut [f32],
    pub(super) target: &'a [i32],
    pub(super) fighting: &'a [u8],
    pub(super) terrain: &'a Terrain,
    pub(super) facings: &'a mut [f32],
    pub(super) soldier_unit: &'a [u32],
    pub(super) alive_n: &'a mut usize,
    pub(super) cx: &'a mut f32,
    pub(super) cy: &'a mut f32,
    pub(super) opp_press: &'a mut f32,
    pub(super) engaged_count: &'a mut usize,
}

pub(super) fn prepare_soldier(
    args: PrepareSoldierArgs<'_>,
    tracer: &mut Tracer<'_>,
) -> Option<PreparedSoldier> {
    let PrepareSoldierArgs {
        u,
        i,
        f,
        surge_sp,
        tun,
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
        alive_n,
        cx,
        cy,
        opp_press,
        engaged_count,
    } = args;

    if alive[i] == 0 {
        return None;
    }
    *alive_n += 1;
    let p = Vec2::new(positions[2 * i], positions[2 * i + 1]);
    *cx += p.x;
    *cy += p.y;
    *opp_press += (-(press_x[i] * f.x + press_y[i] * f.y)).max(0.0);

    // Only a TRAMPLER (cavalry) carries ballistic momentum — a horse
    // rides through. Infantry crash and grind: their carried momentum,
    // re-armed every tick by the strike/impact ledgers from grind
    // jitter, otherwise towed the whole block clean THROUGH the enemy
    // line (the centroid pass-through). A felling-blow knockback is a
    // separate concern (the victim is staggered out of the weave).
    if !u.tramples() {
        mom_x[i] = 0.0;
        mom_y[i] = 0.0;
    }
    // BODY, part 1 — carried momentum (p = m·v) moves the body
    // regardless of will: armed by impacts and by being struck
    // at speed, spent against the crowd, gone in ~a second.
    // The same law gives charges their punch, staggered men
    // their stumble-through, and fleeing men their escape.
    if mom_x[i] != 0.0 || mom_y[i] != 0.0 {
        let v = 1.0 / mass[i].max(0.2);
        let before = Vec2::new(positions[2 * i], positions[2 * i + 1]);
        positions[2 * i] += mom_x[i] * v * dt;
        positions[2 * i + 1] += mom_y[i] * v * dt;
        tracer.record(
            i,
            soldier_unit[i] as usize,
            ForceChannel::KnockbackMomentum,
            None,
            Vec2::new(positions[2 * i], positions[2 * i + 1]) - before,
            "carried_momentum_displacement",
        );
        let decay = 1.0 - (dt / 0.8);
        mom_x[i] *= decay;
        mom_y[i] *= decay;
        if mom_x[i] * mom_x[i] + mom_y[i] * mom_y[i] < 1.0 {
            mom_x[i] = 0.0;
            mom_y[i] = 0.0;
        }
    }
    if stun[i] > 0.0 {
        stun[i] -= dt; // staggered: no will, body coasts above
        return None;
    }
    // BOWLED by a committed charge: no will to hold the line, the body
    // just coasts under the collision/momentum — the weave is erased
    // here so the charge keeps its lane (the last soft force the
    // trample exemption was missing). Heals as the timer runs out.
    if trampled[i] > 0.0 {
        trampled[i] -= dt;
        return None;
    }

    if route_soldier(
        RouteArgs {
            u,
            i,
            p,
            surge_sp,
            terrain,
            tun,
            positions,
            soldier_unit,
            facings,
            dt,
        },
        tracer,
    ) {
        return None;
    }
    let aware_i = target[i] >= 0 && alive[target[i] as usize] == 1;
    let engaged_i = fighting[i] == 1 && aware_i;
    if engaged_i {
        *engaged_count += 1;
    }
    let order_advancing = u.move_target.is_some() || matches!(u.mode, OrderMode::Attack(_));
    // Trample = ride through, no glue, on either of two intents: a
    // MOVE order (the enemy is terrain to ride past) OR a charge
    // still carrying speed (the momentum overruns whatever it hits).
    // The move half never flickers when a thin screen checks the
    // gallop — the ORDER, not the instantaneous pace, holds the glue
    // off. The speed half lets a CHARGE (attack order) plow a thin
    // line and bloody it, yet still bog in a DEEP block: there the
    // mass stalls below charge speed, the glue snaps back on,
    // collision pins it, and the rider fights. Computed BEFORE the
    // weave so the enemy bond (which welds at reach) also yields to a
    // plowing mass — a horse must ride through, not glue to, its prey.
    let trampling =
        u.tramples() && (u.move_target.is_some() || u.mass_advance > tun.charge_spent_speed);

    Some(PreparedSoldier {
        p,
        aware: aware_i,
        engaged: engaged_i,
        order_advancing,
        trampling,
    })
}
