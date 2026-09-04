use super::*;

pub(super) struct SpeedCapsArgs<'a> {
    pub(super) ctx: &'a SoldierCtx<'a>,
    pub(super) tun: &'a Tunables,
    pub(super) err: f32,
    pub(super) soldier_slot: &'a [u32],
    pub(super) ema_disp_x: &'a [f32],
    pub(super) ema_disp_y: &'a [f32],
    pub(super) nearest_enemy_d: &'a [f32],
}

pub(super) fn speed_caps(args: SpeedCapsArgs<'_>) -> f32 {
    let SpeedCapsArgs {
        ctx,
        tun,
        err,
        soldier_slot,
        ema_disp_x,
        ema_disp_y,
        nearest_enemy_d,
    } = args;

    let i = ctx.i;
    let u = ctx.u;
    let mut max_sp = if err > tun.surge_err_threshold {
        ctx.pre.sprint_sp
    } else {
        ctx.pre.keep_up_sp
    };
    // Each soldier has a mirror-invariant personal top speed. Catch-up escapes
    // that marching texture only on an unjammed open-road run far from contact.
    let files = u.files_eff.max(1);
    let slot = soldier_slot[i] as usize;
    let (file, rank) = (slot % files, slot / files);
    let mkey = rank * files + file.min(files - 1 - file);
    let drift = Vec2::new(ema_disp_x[i], ema_disp_y[i]).len();
    let digging_deep = err > tun.surge_err_threshold
        && u.move_target.is_some()
        && matches!(u.pace, Pace::Run)
        && nearest_enemy_d[i] > 2.0 * tun.surge_speed
        && drift > 0.1 * tun.base_speed * DT;
    if !digging_deep {
        max_sp = max_sp.min((0.62 + 0.44 * stagger01(mkey, 0xCAFE)) * ctx.pre.sprint_sp);
    }
    max_sp
}

pub(super) struct CruiseArgs<'a> {
    pub(super) v: &'a mut Vec2,
    pub(super) u: &'a Unit,
    pub(super) i: usize,
    pub(super) p: Vec2,
    pub(super) facings: &'a [f32],
    pub(super) max_sp: f32,
    pub(super) ground: f32,
    pub(super) engaged: bool,
    pub(super) seeking_flank: bool,
    pub(super) formation_blocks_forward: bool,
    pub(super) gathering: bool,
    pub(super) tun: &'a Tunables,
    pub(super) dt: f32,
    pub(super) soldier_unit: &'a [u32],
}

fn apply_cruise(args: CruiseArgs<'_>, tracer: &mut Tracer<'_>) {
    let CruiseArgs {
        v,
        u,
        i,
        p,
        facings,
        max_sp,
        ground,
        engaged,
        seeking_flank,
        formation_blocks_forward,
        gathering,
        tun,
        dt,
        soldier_unit,
    } = args;

    // FRAME FEED-FORWARD: under a MOVE order a man rides at the FRAME's
    // own advance speed, not the weak slot-chase. The slot-chase is a
    // first-order lag — the men trail the moving frame, the leash caps
    // the lead, and the unit never reaches its pace (worse, a slow/deep
    // frame gets PINNED by the leash and the loop deadlocks into a
    // walk). Carrying the frame's velocity makes the formation TRACK
    // its frame with no lag; the slots/weave still dress it laterally,
    // and the per-man max_sp cap below leaves the slow tail to fray.
    // Applies to ANY advancing order — a MOVE (relocate) or an ATTACK
    // (close to contact, incl. a charge): the men track the frame's
    // cruise so the unit reaches its commanded pace / charge speed
    // instead of lagging. Stops per-man once he ENGAGES (the fighting
    // pace owns him then), so the rear ranks keep pressing up while the
    // front fights. (cruise ramps to charge_speed when u.charging.)
    let advancing = u.move_target.is_some() || matches!(u.mode, OrderMode::Attack(_));
    // A man whose move target is BEHIND his facing is BACKING OFF (the
    // engage withdrawal: shields to the threat, feet to the rear). Don't
    // carry the cruise FORWARD along his facing then — it shoves him back
    // INTO the threat and deadlocks the retreat; the slot-chase walks him
    // out. (Attacks/advances face their target, so dot ≥ 0 — unaffected.)
    let backing_off = u
        .move_target
        .is_some_and(|mt| (mt - p).dot(dir(u.facing)) < 0.0);
    if matches!(u.mode, OrderMode::Disengage) {
        if let Some(mt) = u.move_target {
            let escape = mt - p;
            let escape_len = escape.len();
            if escape_len > 1e-3 {
                let escape_dir = escape * (1.0 / escape_len);
                let desired = escape_dir.y.atan2(escape_dir.x);
                let escape_speed = soldier_surge_speed(tun, u);
                let escape_factor = drift_factor(desired, facings[i]).max(0.75);
                let want = (escape_speed * escape_factor * ground).min(max_sp);
                let along = v.dot(escape_dir);
                if want > along {
                    let pre_escape = *v;
                    *v = *v + escape_dir * (want - along);
                    tracer.record(
                        i,
                        soldier_unit[i] as usize,
                        ForceChannel::DisengageEscape,
                        None,
                        (*v - pre_escape) * dt,
                        "disengage_escape_drive",
                    );
                }
            }
        }
    } else if advancing
        && !engaged
        && !seeking_flank
        && !backing_off
        && !formation_blocks_forward
        && !gathering
    {
        // (A GATHERING unit gets no cruise drive: it re-forms IN PLACE
        // around its re-seated grid — you cannot tighten a blob while
        // marching it forward, the slots race the laggards — then,
        // formed, gathering ends and the cruise rides it off.)
        let md = dir(u.facing);
        let fwd = v.x * md.x + v.y * md.y;
        let want = u.cruise.min(max_sp);
        if want > fwd {
            let pre_cruise = *v;
            *v = *v + md * (want - fwd);
            tracer.record(
                i,
                soldier_unit[i] as usize,
                ForceChannel::Cruise,
                None,
                (*v - pre_cruise) * dt,
                "frame_feed_forward",
            );
        }
    }
}

pub(super) struct FightingPaceArgs<'a> {
    pub(super) v: &'a mut Vec2,
    pub(super) u: &'a Unit,
    pub(super) i: usize,
    pub(super) p: Vec2,
    pub(super) engaged: bool,
    pub(super) err: f32,
    pub(super) tun: &'a Tunables,
    pub(super) target: &'a [i32],
    pub(super) prev_positions: &'a [f32],
    pub(super) nearest_enemy: &'a [i32],
    pub(super) nearest_enemy_d: &'a [f32],
    pub(super) soldier_unit: &'a [u32],
    pub(super) dt: f32,
}

fn apply_fighting_pace(args: FightingPaceArgs<'_>, tracer: &mut Tracer<'_>) {
    let FightingPaceArgs {
        v,
        u,
        i,
        p,
        engaged,
        err,
        tun,
        target,
        prev_positions,
        nearest_enemy,
        nearest_enemy_d,
        soldier_unit,
        dt,
    } = args;

    // FIGHTING PACE, directional: a man already engaged may not drive
    // INTO his foe faster than a fighting step. This caps only the
    // velocity component TOWARD the foe — so a charging front rank
    // can't punch through its enemy and stretch off its own rank (the
    // violent depth spike at contact) — while leaving his LATERAL
    // motion free, so an attacker still drapes/wraps along the line.
    // He still surges if torn badly out of place (err high).
    if engaged && err < tun.surge_err_threshold {
        let te = target[i] as usize;
        // Snapshot, not live: this fighting-pace clamp reads the FOE's
        // position; in place a low-index front-ranker reads his foe
        // already moved this tick and a high-index one does not — a
        // front-line Gauss-Seidel skew that compounds with depth.
        let ep = Vec2::new(prev_positions[2 * te], prev_positions[2 * te + 1]);
        let e = ep - p;
        let el = e.len();
        if el > 1e-3 {
            let eh = e * (1.0 / el);
            let fwd = v.x * eh.x + v.y * eh.y;
            if fwd > tun.base_speed {
                let pre_cap = *v;
                *v = *v - eh * (fwd - tun.base_speed);
                tracer.record(
                    i,
                    soldier_unit[i] as usize,
                    ForceChannel::FightingPaceCap,
                    Some(pre_cap * dt),
                    *v * dt,
                    "toward_foe_base_speed",
                );
            }
        }
    }
    // FIGHTING TEMPO, tangential: you cannot CROSS a man's
    // front at speed. In blade-lock range, the velocity component
    // PERPENDICULAR to the nearest enemy's bearing is capped at
    // fighting tempo; radial motion stays free — closing is
    // already paced by the directional cap above and backing out
    // is how the wounded circulate. Without the tangential cap,
    // two casualty-offset fronts can thrust past each other's
    // flanks and orbit. A trampler rides through and a routing man
    // flees at fear pace — both exempt; a man torn far out of place
    // still surges (same exemption as the directional cap above).
    let ne = nearest_enemy[i];
    if engaged
        && err < tun.surge_err_threshold
        && !u.routing
        && !u.tramples()
        && ne >= 0
        && nearest_enemy_d[i] <= tun.fighting_tempo_radius
    {
        let ep = Vec2::new(
            prev_positions[2 * ne as usize],
            prev_positions[2 * ne as usize + 1],
        );
        let e = ep - p;
        let el = e.len();
        if el > 1e-3 {
            let eh = e * (1.0 / el);
            let radial = eh * v.dot(eh);
            let tangent = *v - radial;
            let tl = tangent.len();
            let tmax = tun.base_speed * tun.fighting_tempo_tangent_mult;
            if tl > tmax {
                let pre_cap = *v;
                *v = radial + tangent * (tmax / tl);
                tracer.record(
                    i,
                    soldier_unit[i] as usize,
                    ForceChannel::FightingTempoCap,
                    Some(pre_cap * dt),
                    *v * dt,
                    "blade_lock_tangential_tempo",
                );
            }
        }
    }
}

pub(super) struct FrictionArgs<'a> {
    pub(super) v: &'a mut Vec2,
    pub(super) u: &'a Unit,
    pub(super) i: usize,
    pub(super) r: Vec2,
    pub(super) seeking_flank: bool,
    pub(super) fighting: &'a [u8],
    pub(super) last_disp_x: &'a [f32],
    pub(super) last_disp_y: &'a [f32],
    pub(super) tun: &'a Tunables,
    pub(super) soldier_unit: &'a [u32],
    pub(super) dt: f32,
}

fn apply_lateral_friction(args: FrictionArgs<'_>, tracer: &mut Tracer<'_>) {
    let FrictionArgs {
        v,
        u,
        i,
        r,
        seeking_flank,
        fighting,
        last_disp_x,
        last_disp_y,
        tun,
        soldier_unit,
        dt,
    } = args;

    if u.mass_advance < tun.charge_spent_speed
        && !u.is_mounted()
        && u.engaged > 0
        && !seeking_flank
        && fighting[i] == 0
    {
        // Packed contact lateral friction: a man wedged in a press
        // cannot freely crab sideways without tangling weapons and
        // neighbours — pike or sword alike. The spring/collision
        // lattice otherwise rings side-to-side and the BACKLINE
        // buzzes hardest despite taking no casualties (measured:
        // rank 5 of an immortal grind carried MORE lateral speed
        // than the front rank trading blows). Damp only the
        // lateral component that reverses against the last TRUE
        // step (trajectory frame — the ring closes through the
        // separation solver, invisible to steer-only kin_v), so a
        // steady shove is not dragged down and true flank wrap
        // stays free (seeking_flank exempts it wholesale). Keyed
        // on MEASURED advance, not the order (Move==Attack): a
        // stalled grind gets the friction whatever its order
        // says; a genuinely advancing mass stays loose. A man
        // TRADING BLOWS keeps full lateral freedom (fighting[i]);
        // the measured ring lives in the ranks behind the fight,
        // and they alone pay the drag.
        let lat = v.dot(r);
        let last_lat = Vec2::new(last_disp_x[i], last_disp_y[i]).dot(r);
        if lat * last_lat < 0.0 {
            let pre_friction = *v;
            *v = *v - r * (lat * (1.0 - tun.idle_settle_damp));
            tracer.record(
                i,
                soldier_unit[i] as usize,
                ForceChannel::PackedLateralFriction,
                Some(pre_friction * dt),
                *v * dt,
                "packed_contact_lateral_reversal",
            );
        }
    }
}

pub(super) struct DriveArgs<'a> {
    pub(super) steer_to: Vec2,
    pub(super) max_sp: f32,
    pub(super) u: &'a Unit,
    pub(super) i: usize,
    pub(super) p: Vec2,
    pub(super) f: Vec2,
    pub(super) r: Vec2,
    pub(super) engaged: bool,
    pub(super) seeking_flank: bool,
    pub(super) formation_blocks_forward: bool,
    pub(super) gathering: bool,
    pub(super) idle: bool,
    pub(super) err: f32,
    pub(super) tun: &'a Tunables,
    pub(super) dt: f32,
    pub(super) tick_now: u64,
    pub(super) fidget_offset: &'a mut [Vec2],
    pub(super) terrain: &'a Terrain,
    pub(super) facings: &'a [f32],
    pub(super) soldier_unit: &'a [u32],
    pub(super) target: &'a [i32],
    pub(super) prev_positions: &'a [f32],
    pub(super) nearest_enemy: &'a [i32],
    pub(super) nearest_enemy_d: &'a [f32],
    pub(super) fighting: &'a [u8],
    pub(super) last_disp_x: &'a [f32],
    pub(super) last_disp_y: &'a [f32],
    pub(super) effort: &'a mut f32,
}

pub(super) fn drive_velocity(args: DriveArgs<'_>, tracer: &mut Tracer<'_>) -> (Vec2, f32) {
    let DriveArgs {
        mut steer_to,
        mut max_sp,
        u,
        i,
        p,
        f,
        r,
        engaged,
        seeking_flank,
        formation_blocks_forward,
        gathering,
        idle,
        err,
        tun,
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
        effort,
    } = args;

    // Idle fidget: a few standing men ease off-slot at a time
    // (recorded so the re-form sort can subtract it).
    fidget_offset[i] = Vec2::ZERO;
    if idle && !engaged && stagger01(i * 7 + 5, tick_now / 4) > 0.65 {
        let fx = stagger01(i * 3, tick_now / 4) - 0.5;
        let fy = stagger01(i * 3 + 1, tick_now / 4) - 0.5;
        fidget_offset[i] = Vec2::new(fx, fy) * IDLE_FIDGET;
        steer_to = steer_to + fidget_offset[i];
        tracer.record(
            i,
            soldier_unit[i] as usize,
            ForceChannel::Fidget,
            None,
            fidget_offset[i] * (tun.soldier_gain * dt),
            "idle_fidget",
        );
    }

    let micro = 1.0 - tun.micro_rough * (1.0 - crate::terrain::micro_rough(p));
    let ground = terrain.speed_at(p) * micro;
    if ground < 1.0 {
        max_sp *= ground;
    }
    let rough = terrain.rough_at(p);
    if rough > 0.0 {
        max_sp *= 1.0 - 0.5 * rough * stagger01(i, tick_now);
    }

    let mut v = steer_to * tun.soldier_gain;
    let vl = v.len();
    if vl > max_sp {
        let pre_cap = v;
        v = v * (max_sp / vl);
        tracer.record(
            i,
            soldier_unit[i] as usize,
            ForceChannel::SpeedCap,
            Some(pre_cap * dt),
            v * dt,
            "soldier_max_speed",
        );
    }
    if formation_blocks_forward {
        let forward = v.dot(f);
        // Slow press is allowed; march/slot/cruise speed through the
        // enemy corridor is not. Pure Move gets a little more creep
        // to preserve move==attack; combat latches get the tighter
        // cap that keeps rear ranks from feeding center trampling.
        let cap = tun.base_speed
            * if u.move_target.is_some() && matches!(u.mode, OrderMode::Move) {
                0.2
            } else {
                0.15
            };
        if forward > cap {
            let pre_cap = v;
            v = v - f * (forward - cap);
            tracer.record(
                i,
                soldier_unit[i] as usize,
                ForceChannel::CorridorClamp,
                Some(pre_cap * dt),
                v * dt,
                "forward_speed_cap",
            );
        }
    }
    if vl > 0.2 {
        *effort += 1.0 - ground;
    }
    apply_cruise(
        CruiseArgs {
            v: &mut v,
            u,
            i,
            p,
            facings,
            max_sp,
            ground,
            engaged,
            seeking_flank,
            formation_blocks_forward,
            gathering,
            tun,
            dt,
            soldier_unit,
        },
        tracer,
    );
    apply_fighting_pace(
        FightingPaceArgs {
            v: &mut v,
            u,
            i,
            p,
            engaged,
            err,
            tun,
            target,
            prev_positions,
            nearest_enemy,
            nearest_enemy_d,
            soldier_unit,
            dt,
        },
        tracer,
    );
    apply_lateral_friction(
        FrictionArgs {
            v: &mut v,
            u,
            i,
            r,
            seeking_flank,
            fighting,
            last_disp_x,
            last_disp_y,
            tun,
            soldier_unit,
            dt,
        },
        tracer,
    );
    (v, ground)
}
