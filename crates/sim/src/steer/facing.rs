use super::*;

pub(super) struct FacingArgs<'a> {
    pub(super) ctx: &'a SoldierCtx<'a>,
    pub(super) tun: &'a Tunables,
    pub(super) velocity: Vec2,
    pub(super) err: f32,
    pub(super) idle: bool,
    pub(super) tick: u64,
    pub(super) units: &'a [Unit],
    pub(super) soldier_unit: &'a [u32],
    pub(super) prev_positions: &'a [f32],
    pub(super) mounted: &'a [u8],
    pub(super) target: &'a [i32],
    pub(super) hit_dir: &'a [f32],
    pub(super) hit_ttl: &'a mut [f32],
    pub(super) dt: f32,
}

pub(crate) fn soldier_facing(args: FacingArgs<'_>) -> f32 {
    let FacingArgs {
        ctx,
        tun,
        velocity,
        err,
        idle,
        tick,
        units,
        soldier_unit,
        prev_positions,
        mounted,
        target,
        hit_dir,
        hit_ttl,
        dt,
    } = args;

    let i = ctx.i;
    let u = ctx.u;
    if ctx.aware {
        // Tick-start target positions keep opposing front ranks symmetric.
        let tp = Vec2::new(
            prev_positions[2 * target[i] as usize],
            prev_positions[2 * target[i] as usize + 1],
        );
        let raw = (tp - ctx.p).y.atan2((tp - ctx.p).x);
        if mounted[i] == 1 && u.mass_advance <= tun.charge_spent_speed {
            let grind_zones = u
                .stats
                .weapons
                .iter()
                .filter(|w| !w.is_charge())
                .max_by(|a, b| a.zones.swing_arc().total_cmp(&b.zones.swing_arc()))
                .map(|w| w.zones)
                .unwrap_or(u.stats.weapons[0].zones);
            crate::strike::face_foe_into_flank(raw, u.facing, grind_zones)
        } else if wrap_angle(raw - u.facing).abs() < FACING_FRONT_ARC {
            u.facing
        } else {
            let foe_unit = soldier_unit[target[i] as usize] as usize;
            let c = units[foe_unit].centroid;
            (c - ctx.p).y.atan2((c - ctx.p).x)
        }
    } else if hit_ttl[i] > 0.0 {
        hit_ttl[i] -= dt;
        hit_dir[i]
    } else if err > 0.5 {
        velocity.y.atan2(velocity.x)
    } else if idle {
        u.facing + (stagger01(i * 3 + 2, tick / 4) - 0.5) * IDLE_GLANCE
    } else {
        u.facing
    }
}

pub(super) struct FinishArgs<'a> {
    pub(super) v: Vec2,
    pub(super) u: &'a Unit,
    pub(super) pre: &'a UnitPre,
    pub(super) i: usize,
    pub(super) p: Vec2,
    pub(super) f: Vec2,
    pub(super) r: Vec2,
    pub(super) aware: bool,
    pub(super) engaged: bool,
    pub(super) order_advancing: bool,
    pub(super) trampling: bool,
    pub(super) mounted_threat_near: bool,
    pub(super) idle: bool,
    pub(super) err: f32,
    pub(super) ground: f32,
    pub(super) crush_scalar: f32,
    pub(super) comp_push: Vec2,
    pub(super) press_alpha: f32,
    pub(super) tun: &'a Tunables,
    pub(super) tick_now: u64,
    pub(super) dt: f32,
    pub(super) units: &'a [Unit],
    pub(super) soldier_unit: &'a [u32],
    pub(super) positions: &'a mut [f32],
    pub(super) prev_positions: &'a [f32],
    pub(super) last_disp_x: &'a [f32],
    pub(super) last_disp_y: &'a [f32],
    pub(super) ema_disp_x: &'a [f32],
    pub(super) ema_disp_y: &'a [f32],
    pub(super) pressure: &'a mut [f32],
    pub(super) press_x: &'a mut [f32],
    pub(super) press_y: &'a mut [f32],
    pub(super) awareness: &'a [f32],
    pub(super) facings: &'a mut [f32],
    pub(super) terrain: &'a Terrain,
    pub(super) mounted: &'a [u8],
    pub(super) target: &'a [i32],
    pub(super) hit_dir: &'a [f32],
    pub(super) hit_ttl: &'a mut [f32],
}

pub(super) fn finish_soldier(args: FinishArgs<'_>, tracer: &mut Tracer<'_>) {
    let FinishArgs {
        mut v,
        u,
        pre,
        i,
        p,
        f,
        r,
        aware,
        engaged,
        order_advancing,
        trampling,
        mounted_threat_near,
        idle,
        err,
        ground,
        crush_scalar,
        comp_push,
        press_alpha,
        tun,
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
    } = args;

    // Idle/hold settle damping: a HALTED formation with no order and
    // no contact has no force left to chase — only its own spring
    // residual. A frictionless lattice re-injects that residual every
    // tick and RINGS in a limit cycle: the edge men step out, the
    // separation solver shoves them back, repeat — a velocity that
    // REVERSES every tick. Damping only that reversing component (the
    // steer velocity opposing last tick's motion) turns the spring
    // into a damped oscillator that settles to rest, WITHOUT dragging
    // a steady motion — so a friendly push compressing this block
    // (consistent, non-reversing motion) is untouched; only the
    // oscillation dies.
    //
    // This remains active after a foot threat makes the line ALERT:
    // alertness stops casual fidget, but it should not remove the
    // shock absorber from a braced, unordered formation. Incoming
    // cavalry is different: a not-yet-contacting line needs normal
    // pre-impact looseness so the collision/brace physics, not this
    // settling damper, decide how the charge lands. It still never
    // reaches a man with an order, a moving frame, or actual contact.
    //
    // The reversal is judged against the TRUE trajectory (total
    // displacement, separation solver included), not the steer-only
    // kin_v*: a limit cycle that closes THROUGH the solver — steer
    // onto an occupied spot, get shoved back out — never reverses
    // in the steer frame, so the old steer-frame damp was blind to
    // the friendly-overlap rest buzz by construction. The steady
    // friendly PUSH is the mirror trap: the pressed men's restoring
    // spring opposes the solver-carried motion forever, so
    // resistance alone must not trigger the damp — the drift term
    // below (sustained EMA vs instantaneous step) tells a man
    // being TAKEN somewhere from a man oscillating in place.
    if (u.at_ease || !mounted_threat_near)
        && u.move_target.is_none()
        && u.engaged == 0
        && !engaged
        && u.frame_speed < 0.5
    {
        let last = Vec2::new(last_disp_x[i], last_disp_y[i]);
        let ema = Vec2::new(ema_disp_x[i], ema_disp_y[i]);
        // Oscillating = the spring resists the last step AND the
        // trajectory carries no sustained drift (the EMA projects
        // to less than half the instantaneous step — a shape
        // factor, not a magnitude knob). A steady push has drift
        // ~= step and is exempt; a solver cycle and a standing
        // sway both average to nothing and die.
        if v.dot(last) < 0.0 && last.dot(ema) < 0.5 * last.dot(last) {
            let pre_damp = v;
            v = v * tun.idle_settle_damp;
            tracer.record(
                i,
                soldier_unit[i] as usize,
                ForceChannel::IdleSettleDamp,
                Some(pre_damp * dt),
                v * dt,
                "idle_reversal_damp",
            );
        }
    }
    let mut np = Vec2::new(p.x + v.x * dt, p.y + v.y * dt);
    let pre_terrain_np = np;
    // No "halt at your foe" clamp, no "hold the rank" clamp: the man
    // is stopped by his foe's BODY (collision) and held on it by the
    // magnet. The ranks behind stop because the lattice in front of
    // them won't compress flat. Real forces only.
    if ground <= 0.0 {
        np = p + terrain.escape_dir(p) * (3.0 * dt);
    } else if terrain.speed_at(np) <= 0.0 {
        let slide_x = Vec2::new(np.x, p.y);
        let slide_y = Vec2::new(p.x, np.y);
        np = if terrain.speed_at(slide_x) > 0.0 {
            slide_x
        } else if terrain.speed_at(slide_y) > 0.0 {
            slide_y
        } else {
            p
        };
    }
    if np.x != pre_terrain_np.x || np.y != pre_terrain_np.y {
        tracer.record(
            i,
            soldier_unit[i] as usize,
            ForceChannel::TerrainProject,
            Some(pre_terrain_np - p),
            np - p,
            "terrain_projection",
        );
    }
    positions[2 * i] = np.x;
    positions[2 * i + 1] = np.y;

    // Read the crush off the weave: EMA the spring load so a strike's
    // jolt or a momentary squeeze doesn't flicker the vice/evade.
    pressure[i] += (crush_scalar - pressure[i]) * press_alpha;
    press_x[i] += (comp_push.x - press_x[i]) * press_alpha;
    press_y[i] += (comp_push.y - press_y[i]) * press_alpha;

    // Facing: a nearby enemy (turn to meet a threat even before he's
    // in reach, and even while the crowd shoves you), then the man who
    // just hit you, then where you're going. This is per-SOLDIER only
    // — the unit's commanded facing never changes, so a flanked block
    // doesn't wheel itself and override the player's order; its edge
    // men just turn outward to face who's on them.
    let desired_face = soldier_facing(FacingArgs {
        ctx: &SoldierCtx {
            i,
            u,
            p,
            f,
            r,
            pre,
            aware,
            engaged,
            order_advancing,
            trampling,
        },
        tun,
        velocity: v,
        err,
        idle,
        tick: tick_now,
        units,
        soldier_unit,
        prev_positions,
        mounted,
        target,
        hit_dir,
        hit_ttl,
        dt,
    });
    // Deadzone: a man holds his stance and only re-aims when the threat
    // has genuinely shifted off it (> ~8°). Without this his facing
    // CHASES the tick-to-tick separation churn of a packed grind —
    // bodies shoved a few cm back and forth move the bearing a hair, and
    // he was re-aiming (and REVERSING) ~25% of ticks at his full turn
    // rate. Real stances don't twitch 30x/s; the deadzone makes facing a
    // deliberate turn, not a servo on positional noise.
    if wrap_angle(desired_face - facings[i]).abs() > FACING_DEADZONE {
        // A man turns to a THREAT only as fast as he SEES it: scale the
        // re-face by his awareness, so a buried interior man (low view)
        // barely turns and holds his frontage while the exposed edge men
        // wheel to meet a flanker. Non-threat re-aims (march heading, the
        // last blow that landed) are unscaled — those he feels regardless.
        let see = if aware { awareness[i] } else { 1.0 };
        let facing_before = facings[i];
        facings[i] = rotate_toward(
            facings[i],
            desired_face,
            tun.soldier_turn_rate * u.stats.turn_mult * see * dt,
        );
        if facings[i] != facing_before {
            tracer.record(
                i,
                soldier_unit[i] as usize,
                ForceChannel::SoldierFacing,
                None,
                Vec2::new(wrap_angle(facings[i] - facing_before), 0.0),
                "threat_or_motion_facing",
            );
        }
    }
}
