use super::*;

pub(crate) struct SoldierCtx<'a> {
    pub i: usize,
    pub u: &'a Unit,
    pub p: Vec2,
    pub f: Vec2,
    pub r: Vec2,
    pub pre: &'a UnitPre,
    pub aware: bool,
    pub engaged: bool,
    pub order_advancing: bool,
    pub trampling: bool,
}

pub(crate) struct WeaveAccum {
    pub soldier_stretch: f32,
    pub soldier_pivot: f32,
    pub net_target: Option<Vec2>,
    pub comp_push: Vec2,
    pub crush_scalar: f32,
    pub enemy_weld_component: Vec2,
    pub enemy_inside_push: Vec2,
}

pub(crate) fn slot_neighbours<'a>(
    u: &'a Unit,
    pre: &'a UnitPre,
    si: usize,
    skip: usize,
    alive: &'a [u8],
    trampled: &'a [f32],
) -> impl Iterator<Item = (usize, Vec2)> + 'a {
    let files = u.files_eff.max(1);
    let slot_capacity = pre.soldier_at_slot.len();
    let (file, rank) = (si % files, si / files);
    let (sx, sy) = (u.spacing.x, u.spacing.y);
    let f = dir(u.facing);
    let r = f.perp();
    let ranks = slot_capacity.div_ceil(files);
    let available = |j: usize| j != usize::MAX && alive[j] == 1 && trampled[j] <= 0.0;
    let mut left = None;
    for step in 1..=file.min(skip) {
        let j = pre.soldier_at_slot[si - step];
        if available(j) {
            left = Some((j, r * (sx * step as f32)));
            break;
        }
    }
    let right_steps = (files - 1 - file)
        .min(slot_capacity.saturating_sub(1).saturating_sub(si))
        .min(skip);
    let mut right = None;
    for step in 1..=right_steps {
        let j = pre.soldier_at_slot[si + step];
        if available(j) {
            right = Some((j, r * (-sx * step as f32)));
            break;
        }
    }
    let mut front = None;
    for step in 1..=rank.min(skip) {
        let j = pre.soldier_at_slot[si - files * step];
        if available(j) {
            front = Some((j, f * (-sy * step as f32)));
            break;
        }
    }
    let mut back = None;
    for step in 1..=((ranks - 1 - rank).min(skip)) {
        let ns = si + files * step;
        if ns >= slot_capacity {
            break;
        }
        let j = pre.soldier_at_slot[ns];
        if available(j) {
            back = Some((j, f * (sy * step as f32)));
            break;
        }
    }
    [left, right, front, back].into_iter().flatten()
}

pub(super) struct WeaveArgs<'a> {
    pub(super) ctx: &'a SoldierCtx<'a>,
    pub(super) tun: &'a Tunables,
    pub(super) prev_positions: &'a [f32],
    pub(super) alive: &'a [u8],
    pub(super) trampled: &'a [f32],
    pub(super) soldier_slot: &'a [u32],
    pub(super) target: &'a [i32],
    pub(super) terrain: &'a Terrain,
}

struct SlotBondAccum {
    soldier_stretch: f32,
    soldier_pivot: f32,
    net_target: Option<Vec2>,
    comp_push: Vec2,
    crush_scalar: f32,
}

fn accumulate_slot_and_pivot_bonds(args: &WeaveArgs<'_>) -> SlotBondAccum {
    let ctx = args.ctx;
    let tun = args.tun;
    let prev_positions = args.prev_positions;
    let alive = args.alive;
    let trampled = args.trampled;
    let soldier_slot = args.soldier_slot;
    let terrain = args.terrain;
    let i = ctx.i;
    let u = ctx.u;
    let p = ctx.p;
    let mut soldier_stretch = {
        let local = crate::unit::slot_local(soldier_slot[i] as usize, u.files_eff, u.spacing);
        let slot = u.anchor + ctx.r * local.x + ctx.f * (-local.y);
        (slot - p).len()
    };
    let mut soldier_pivot = 0.0f32;
    let mut net_target = None;
    let mut comp_push = Vec2::ZERO;
    let mut crush_scalar = 0.0f32;
    let si = soldier_slot[i] as usize;
    let neighbor_skip = if ctx.order_advancing && !ctx.pre.strict_formation {
        1
    } else {
        WEAVE_NEIGHBOR_SKIP
    };
    let mut nsum = Vec2::ZERO;
    let mut nn = 0.0f32;
    let mut bond_stretch = 0.0f32;
    let mut bond_pivot = 0.0f32;
    for (j, off) in slot_neighbours(u, ctx.pre, si, neighbor_skip, alive, trampled) {
        let jp = Vec2::new(prev_positions[2 * j], prev_positions[2 * j + 1]);
        let d = p - jp;
        let (al, rl) = (d.len(), off.len());
        if al > rl + WEAVE_TERRAIN_CHECK_STRETCH && !terrain.segment_passable(p, jp) {
            continue;
        }
        nsum = nsum + jp + off;
        nn += 1.0;
        bond_stretch += (al - rl).max(0.0);
        if al > 1e-3 && rl > 1e-3 {
            let (dh, oh) = (d * (1.0 / al), off * (1.0 / rl));
            let dot = (dh.x * oh.x + dh.y * oh.y).clamp(-1.0, 1.0);
            bond_pivot += dot.acos();
        }
        let comp = rl - al;
        if comp > 0.0 && al > 1e-3 {
            let push = tun.compress_strength * ((comp / tun.compress_scale).exp() - 1.0);
            comp_push = comp_push + d * (push / al);
            crush_scalar += push;
        }
    }
    if nn > 0.0 {
        let net_to = nsum * (1.0 / nn) - p;
        net_target = Some(net_to);
        soldier_stretch = bond_stretch / nn;
        soldier_pivot = bond_pivot / nn;
    }

    SlotBondAccum {
        soldier_stretch,
        soldier_pivot,
        net_target,
        comp_push,
        crush_scalar,
    }
}

fn apply_enemy_bond(args: &WeaveArgs<'_>, slot: SlotBondAccum) -> WeaveAccum {
    let SlotBondAccum {
        soldier_stretch,
        soldier_pivot,
        mut net_target,
        mut comp_push,
        mut crush_scalar,
    } = slot;
    let ctx = args.ctx;
    let tun = args.tun;
    let prev_positions = args.prev_positions;
    let target = args.target;
    let i = ctx.i;
    let p = ctx.p;
    let mut enemy_weld_component = Vec2::ZERO;
    let mut enemy_inside_push = Vec2::ZERO;
    if ctx.aware && ctx.engaged && !ctx.trampling {
        let te = target[i] as usize;
        let ep = Vec2::new(prev_positions[2 * te], prev_positions[2 * te + 1]);
        let d = p - ep;
        let al = d.len();
        if al > 1e-3 {
            let bond_to = ep + d * (ctx.pre.reach / al) - p;
            let before_bond = net_target.unwrap_or(Vec2::ZERO);
            net_target = Some(net_target.map_or(bond_to, |nt| (nt + bond_to) * 0.5));
            let after_bond = net_target.unwrap_or(Vec2::ZERO);
            enemy_weld_component = enemy_weld_component + (after_bond - before_bond);
            let comp = ctx.pre.reach - al;
            if comp > 0.0 {
                let push = tun.compress_strength * ((comp / tun.compress_scale).exp() - 1.0);
                let push_vec = d * (push / al);
                comp_push = comp_push + push_vec;
                enemy_inside_push = enemy_inside_push + push_vec;
                crush_scalar += push;
            }
        }
    }
    WeaveAccum {
        soldier_stretch,
        soldier_pivot,
        net_target,
        comp_push,
        crush_scalar,
        enemy_weld_component,
        enemy_inside_push,
    }
}

pub(crate) fn weave_forces(args: WeaveArgs<'_>) -> WeaveAccum {
    let slot = accumulate_slot_and_pivot_bonds(&args);
    apply_enemy_bond(&args, slot)
}

pub(super) struct MagnetArgs<'a> {
    pub(super) steer_to: &'a mut Vec2,
    pub(super) u: &'a Unit,
    pub(super) i: usize,
    pub(super) p: Vec2,
    pub(super) f: Vec2,
    pub(super) aware: bool,
    pub(super) trample_dive: bool,
    pub(super) strict_formation: bool,
    pub(super) formation_blocks_forward: bool,
    pub(super) reach: f32,
    pub(super) front_clear: &'a [u8],
    pub(super) target: &'a [i32],
    pub(super) prev_positions: &'a [f32],
    pub(super) tun: &'a Tunables,
    pub(super) dt: f32,
    pub(super) soldier_unit: &'a [u32],
}

pub(super) fn apply_magnet(args: MagnetArgs<'_>, tracer: &mut Tracer<'_>) -> bool {
    let MagnetArgs {
        steer_to,
        u,
        i,
        p,
        f,
        aware,
        trample_dive,
        strict_formation,
        formation_blocks_forward,
        reach,
        front_clear,
        target,
        prev_positions,
        tun,
        dt,
        soldier_unit,
    } = args;

    // ENEMY MAGNET — the SEEK, and nothing else. A pure attract
    // toward the foe a man is fighting: far off he is pulled in hard
    // (he RUNS to contact); at reach the force fades to zero (he STOPS
    // — "once attacking it stops moving"). It does NOT repel inside
    // reach: that standoff is the enemy BOND's job (one force, one
    // place), so the two no longer stack a capped push against an
    // uncapped one at the contact line. Because the bond is to the foe
    // he is FIGHTING, not the nearest body, he does not chase: he
    // advances a step only when that foe falls and he re-targets.
    // Gated on FRONT_CLEAR so for FORMED troops only the front (and an
    // overhang man with an open shot — the wrap) seeks. A TRAMPLER is
    // the exception: under an ATTACK order EVERY rider seeks its own
    // nearest foe, buried or not, so the unit pours INTO the enemy as a
    // swarm of individual hunters and breaks their cohesion — that
    // disruption is the whole point of a trample, and with the weak
    // slot above nothing reels the divers back into a line. A MOVE
    // order is NOT a dive: the trample rides through to its destination
    // (move==attack ride-through), so the swarm-seek is attack-only.
    let mut seeking_flank = false;
    if aware && (trample_dive || (front_clear[i] == 1 && !u.tramples())) {
        let te = target[i] as usize;
        // Tick-start snapshot, NOT live positions: the steer loop writes
        // positions[i] in place, so a live read gives an already-moved foe
        // for low-index soldiers and a stale one for high-index — a
        // Gauss-Seidel skew that breaks the 180° mirror of a head-on clash.
        // Every other neighbor read in this loop already snapshots; this
        // magnet was the lone hole (see specs/directional-bias.md).
        let ep = Vec2::new(prev_positions[2 * te], prev_positions[2 * te + 1]);
        let d = ep - p;
        let dist = d.len();
        if dist > 1e-3 {
            // Pull FADES to zero at reach (a man eases in, doesn't ram
            // his foe). For a trampler that fade is what lets MOMENTUM,
            // not the magnet, carry the mass through: the seek only AIMS
            // each rider at its nearest foe (the disruption), it does not
            // clamp him onto it — so the carried charge rides on out.
            let off = dist - reach;
            let pull = (tun.magnet_strength * (1.0 - (-off / tun.magnet_scale).exp())).max(0.0);
            let mut magnet = d * (pull / dist);
            let magnet_pre_clamp = magnet;
            if formation_blocks_forward {
                let forward = magnet.dot(f).max(0.0);
                magnet = magnet - f * forward;
            }
            if trample_dive {
                // The seek AIMS the disruption, it never BRAKES the ride:
                // drop any pull that opposes the unit's facing (a foe
                // already passed, now behind), so the carried momentum
                // takes the mass THROUGH and out the far side. The leash
                // (anchor chases the enemy) wheels it around for another
                // pass — the back-and-forth, with no rule coding it.
                let back = magnet.dot(f).min(0.0);
                magnet = magnet - f * back;
            }
            *steer_to = *steer_to + magnet;
            // An OVERHANGING flank man — his foe is well OFF the unit's
            // facing axis (to his inner side, not ahead) — must CURL IN
            // to envelop, not be towed straight ahead by the frame
            // feed-forward (which would pour the wing past the foe). The
            // magnet already pulls him inward; just don't override it.
            let md = dir(u.facing);
            if !strict_formation && d.dot(md) / dist < 0.45 {
                seeking_flank = true;
            }
            if magnet.x != 0.0 || magnet.y != 0.0 {
                tracer.record(
                    i,
                    soldier_unit[i] as usize,
                    ForceChannel::Magnet,
                    None,
                    magnet * (tun.soldier_gain * dt),
                    if seeking_flank {
                        "seeking_flank=true"
                    } else {
                        "seeking_flank=false"
                    },
                );
            }
            if formation_blocks_forward
                && (magnet_pre_clamp.x != magnet.x || magnet_pre_clamp.y != magnet.y)
            {
                tracer.record(
                    i,
                    soldier_unit[i] as usize,
                    ForceChannel::CorridorClamp,
                    Some(magnet_pre_clamp * (tun.soldier_gain * dt)),
                    magnet * (tun.soldier_gain * dt),
                    "magnet_forward_removed",
                );
            }
        }
    }
    seeking_flank
}

pub(super) struct SteerComposition {
    pub(super) steer_to: Vec2,
    pub(super) gathering: bool,
    pub(super) idle: bool,
    pub(super) trample_dive: bool,
}

pub(super) struct CompositionArgs<'a> {
    pub(super) u: &'a Unit,
    pub(super) i: usize,
    pub(super) s: usize,
    pub(super) strict_formation: bool,
    pub(super) trampling: bool,
    pub(super) net_target: Option<Vec2>,
    pub(super) comp_push: Vec2,
    pub(super) enemy_weld_component: Vec2,
    pub(super) enemy_inside_push: Vec2,
    pub(super) slot_anchor_vec: Vec2,
    pub(super) slot_pull_vec: Vec2,
    pub(super) corridor_slot_removed: Vec2,
    pub(super) projected_pivot: &'a [Vec2],
    pub(super) slot_pull: f32,
    pub(super) advancing: bool,
    pub(super) engaged: bool,
    pub(super) broad_press: bool,
    pub(super) my_files: usize,
    pub(super) err: f32,
    pub(super) hit_ttl: &'a [f32],
    pub(super) target: &'a [i32],
    pub(super) mounted: &'a [u8],
    pub(super) units: &'a [Unit],
    pub(super) soldier_unit: &'a [u32],
    pub(super) tun: &'a Tunables,
    pub(super) dt: f32,
}

pub(super) fn compose_weave_and_corridor(
    args: CompositionArgs<'_>,
    tracer: &mut Tracer<'_>,
) -> SteerComposition {
    let CompositionArgs {
        u,
        i,
        s,
        strict_formation,
        trampling,
        net_target,
        comp_push,
        enemy_weld_component,
        enemy_inside_push,
        slot_anchor_vec,
        slot_pull_vec,
        corridor_slot_removed,
        projected_pivot,
        slot_pull,
        advancing,
        engaged,
        broad_press,
        my_files,
        err,
        hit_ttl,
        target,
        mounted,
        units,
        soldier_unit,
        tun,
        dt,
    } = args;

    // GATHERING: a unit that just RE-SEATED onto a clean grid (its
    // `reform_timer` running) under a relocate order and is still
    // BLOBBED. It rides at a GATHER pace (a walk) with its weave kept
    // ON (below), so the lattice tightens it back into a COLUMN before
    // it opens up — you cannot re-form at a gallop: release a still-
    // blobbed unit to a sprint and it frays right back apart. Only once
    // formed (cohesion past the bar) does it release to full pace and
    // ride off. The "re-form, ride off" of a trampler pulled out of a
    // dive, emergent: a mob can't sprint until it sorts itself out.
    // Tying it to the RESEAT (not raw cohesion) keeps the weave pulling
    // toward a CLEAN grid; a stale-slot blob would only knot tighter,
    // and a unit that never re-seated (a Move ride-through) softens
    // normally. A DIVE (Attack) never gathers — its blob is the point.
    // A DISENGAGE never gathers (it flees, it doesn't re-form), so the
    // walk-clamp can't pin a unit peeling out of a grind.
    let gathering = u.reform_timer > 0.0
        && u.cohesion < REFORM_COH
        && !matches!(u.mode, OrderMode::Attack(_) | OrderMode::Disengage);
    let idle =
        u.at_ease && u.move_target.is_none() && u.engaged == 0 && hit_ttl[i] <= 0.0 && err < 0.6;
    // WEAVE, the sum of real forces — no walls, no clamps:
    //   net_target  the neighbour SPRINGS pulling toward rest shape
    //   comp_push   the exponential push-apart that guards spacing
    //   slot_pull   a weak locator the order drags the sheet by
    //   magnet      the pull onto the enemy (the front line's glue)
    // A man is steered by their sum; he is STOPPED only by real bodies
    // (collision), never by a positional rule.
    // WEAVE STIFFNESS scales the neighbour lattice — the rest-shape
    // spring AND the compression resistance — but NOT the slot
    // fallback (no live neighbours = no weave to stiffen). A stiffer
    // lattice holds its rank against the magnet, so only the
    // frontline closes and the back ranks don't pile in.
    // weave_stiffness stiffens the REST-SHAPE spring (hold the grid),
    // NOT the compression: a pressing block must still squeeze axially
    // (rear ranks compressing against the held front), so comp_push
    // stays at baseline. The two deformations are different animals —
    // a PANCAKE is a shear (pivot_stiffness resists it), while axial
    // depth compression is left free. Lumping compression into
    // stiffness fought the very press it's meant to win.
    // A COMMITTED CHARGE suspends its OWN cohesion: the formation
    // stretches INTO the charge, the front not reeled back by the
    // weave (which, stiff, otherwise bleeds the gallop — a charging
    // line arrives slow and spent). It rides forward on its order
    // (slot_pull) alone, and re-forms when the charge spends. Same
    // trample exemption as the magnet — the soft formation forces are
    // off while the hard physics (momentum, bodies, bleed) rule.
    // The weave is STIFF by default — every unit wants to hold its
    // grid, even while pressing (a grinding clash moves slowly but is
    // still trying to keep formation; speed does NOT mark unwillingness).
    // Two DISCRETE carve-outs, both "committed to movement, formation
    // stretches INTO the motion instead of the stiff weave dragging it":
    //   - a CHARGE (trampler riding through), and
    //   - a RUN under a MOVE order (a march/run to a destination — the
    //     stiff weave otherwise reels the stretching run back and bleeds
    //     ~20% of the pace).
    // A FIGHTING unit (no move order) or one that has ARRIVED (stalled,
    // mass_advance low) stays stiff and holds — so a press, a wrap-
    // attack, and a defence are all full-stiff; only genuine locomotion
    // is soft. This is NOT the continuous "soft when moving" gradient
    // (which wrongly softened a slow press and blobbed it).
    let running =
        !strict_formation && u.move_target.is_some() && u.mass_advance > tun.charge_spent_speed;
    // Locomotion softens the weave so a moving line stretches into its
    // stride instead of the stiff lattice reeling it back. The
    // exception is a unit still GATHERING: blobbed (cohesion below the
    // re-form bar) under a relocate order, having re-seated onto a
    // clean grid when it took the order. It keeps its weave ON so the
    // lattice tightens it back into a column while the accel-throttle
    // holds the blob to a gather pace — then, formed, it softens and
    // rides off. No "re-form" rule; the gather IS the re-form. A DIVE
    // (Attack) never gathers: its blob is the disruption. (`gathering`
    // computed above, where it also caps the gather pace.)
    let weave_active = !((trampling || running) && !gathering);
    let mut steer_to = if !weave_active {
        Vec2::ZERO
    } else {
        let weave_component = match net_target {
            Some(nt) => nt * tun.weave_stiffness + comp_push,
            None => slot_anchor_vec + comp_push,
        };
        weave_component + projected_pivot[s]
    };
    if weave_active {
        let net_component = match net_target {
            Some(nt) => (nt - enemy_weld_component) * tun.weave_stiffness,
            None => slot_anchor_vec,
        };
        let comp_component = comp_push - enemy_inside_push;
        let pivot_component = projected_pivot[s];
        for (channel, vec, meta) in [
            (
                ForceChannel::WeaveNet,
                net_component,
                "net_or_slot_fallback",
            ),
            (
                ForceChannel::CompPush,
                comp_component,
                "friendly_weave_compression",
            ),
            (
                ForceChannel::EnemyBondWeld,
                enemy_weld_component * tun.weave_stiffness,
                "fighting_target_reach_weld",
            ),
            (
                ForceChannel::EnemyBondInsideReachPush,
                enemy_inside_push,
                "inside_reach_exponential_push",
            ),
            (
                ForceChannel::PivotSpring,
                pivot_component,
                "bond_angle_spring",
            ),
        ] {
            if vec.x != 0.0 || vec.y != 0.0 {
                tracer.record(
                    i,
                    soldier_unit[i] as usize,
                    channel,
                    None,
                    vec * (tun.soldier_gain * dt),
                    meta,
                );
            }
        }
    }
    let fi = target[i];
    let foe_mounted = fi >= 0 && mounted[fi as usize] == 1;
    // The foe I'm fighting is itself ~as wide as my line — a single
    // equal press. This fires from FIRST contact (it needs no developed
    // band), so a set line leans in time to trade the OPENING exchange
    // evenly. `broad_press` (above) is the complement: a wide contact
    // band assembled from ANY number of narrower units. A narrow column
    // is narrow on BOTH, so it still can't trigger the lean.
    let foe_broad =
        fi >= 0 && units[soldier_unit[fi as usize] as usize].files_eff.max(1) * 2 >= my_files;
    // The engaged FRONT of a HOLDING line leans into a broad press: a
    // softened slot grip lets the enemy magnet draw it forward to MEET
    // the foe with as many men as the attacker leans in with, so a set
    // line trades the opening evenly instead of being pinned back and
    // ground down. The REAR keeps the strong hold-grip (it must not lunge
    // with the front and blob). Against a CHARGE (mounted) the braced
    // front PLANTS, it doesn't step onto the hooves, so the anti-charge
    // stop is untouched.
    // A trampler DIVING hunts as a swarm: weak slot here, per-rider
    // enemy seek below. The dive engages only once the charge has BOGGED
    // into the grind (`!running`) — while the gallop still carries
    // (running), the mass stays TIGHT so its impact lands concentrated
    // (the knock-down), and it disperses to hunt only after it stalls.
    // A MOVE order is never a dive (it rides through in normal order to
    // its destination — move==attack ride-through for the move case).
    let trample_dive = u.tramples() && matches!(u.mode, OrderMode::Attack(_)) && !running;
    let slot_pull_i = if trample_dive {
        // Weak slot: the rider hunts, it doesn't hold a line (see
        // TRAMPLE_SLOT_GRIP). The enemy seek below is its real pull.
        slot_pull * TRAMPLE_SLOT_GRIP
    } else if !advancing && engaged && !foe_mounted && (foe_broad || broad_press) {
        0.65
    } else {
        slot_pull
    };
    steer_to = steer_to + slot_pull_vec * slot_pull_i;
    let slot_channel = if slot_pull_i == 0.65 {
        ForceChannel::SlotPullLean
    } else {
        ForceChannel::SlotPull
    };
    let slot_vec = slot_pull_vec * slot_pull_i;
    if slot_vec.x != 0.0 || slot_vec.y != 0.0 {
        tracer.record(
            i,
            soldier_unit[i] as usize,
            slot_channel,
            None,
            slot_vec * (tun.soldier_gain * dt),
            if slot_pull_i == 0.65 {
                "engaged_lean_0_65"
            } else {
                "slot_pull"
            },
        );
    }
    let corridor_vec = corridor_slot_removed * slot_pull_i;
    if corridor_vec.x != 0.0 || corridor_vec.y != 0.0 {
        tracer.record(
            i,
            soldier_unit[i] as usize,
            ForceChannel::CorridorClamp,
            Some((slot_pull_vec - corridor_slot_removed) * slot_pull_i * (tun.soldier_gain * dt)),
            slot_pull_vec * slot_pull_i * (tun.soldier_gain * dt),
            "slot_forward_removed",
        );
    }
    SteerComposition {
        steer_to,
        gathering,
        idle,
        trample_dive,
    }
}

struct CorridorArgs<'a> {
    u: &'a Unit,
    p: Vec2,
    f: Vec2,
    slot: Vec2,
    slot_anchor_vec: Vec2,
    units: &'a [Unit],
}

struct CorridorTerm {
    slot_pull_vec: Vec2,
    formation_blocks_forward: bool,
    corridor_slot_removed: Vec2,
}

fn corridor_term(args: CorridorArgs<'_>) -> CorridorTerm {
    let CorridorArgs {
        u,
        p,
        f,
        slot,
        slot_anchor_vec,
        units,
    } = args;
    let mut slot_pull_vec = slot_anchor_vec;
    let mut formation_blocks_forward = false;
    let mut corridor_slot_removed = Vec2::ZERO;
    // A footman may not power himself forward through a living,
    // opposing foot formation's frontage. This is local and geometric:
    // inside that enemy's lateral corridor, remove the forward slot /
    // magnet tow and later cap sim-drive to a fighting step. Flanks
    // outside the corridor still curl and wrap; collision can still
    // shove bodies either way. This closes the infantry "trample"
    // hole without turning the whole enemy face into a wall.
    if !u.tramples() {
        for v in units.iter() {
            if v.team == u.team || v.alive_count == 0 || v.is_mounted() || v.tramples() {
                continue;
            }
            let vf = dir(v.facing);
            if f.dot(vf) > -0.35 {
                continue;
            }
            let vr = vf.perp();
            let half_w = 0.5 * (v.files_eff.max(1) - 1) as f32 * v.spacing.x + 0.5 * v.spacing.x;
            let p_lat = (p - v.center()).dot(vr);
            let slot_lat = (slot - v.center()).dot(vr);
            if p_lat.abs().min(slot_lat.abs()) > half_w {
                continue;
            }
            let v_mid = v.center().dot(f);
            if p.dot(f) > v_mid && slot.dot(f) > v_mid {
                let forward_pull = slot_pull_vec.dot(f).max(0.0);
                let removed = f * forward_pull;
                slot_pull_vec = slot_pull_vec - removed;
                corridor_slot_removed = corridor_slot_removed - removed;
                formation_blocks_forward = true;
                break;
            }
        }
    }
    CorridorTerm {
        slot_pull_vec,
        formation_blocks_forward,
        corridor_slot_removed,
    }
}

pub(super) struct PreparedWeave {
    pub(super) slot_anchor_vec: Vec2,
    pub(super) slot_pull_vec: Vec2,
    pub(super) corridor_slot_removed: Vec2,
    pub(super) formation_blocks_forward: bool,
    pub(super) net_target: Option<Vec2>,
    pub(super) comp_push: Vec2,
    pub(super) crush_scalar: f32,
    pub(super) enemy_weld_component: Vec2,
    pub(super) enemy_inside_push: Vec2,
    pub(super) err: f32,
    pub(super) max_sp: f32,
}

pub(super) struct PrepareWeaveArgs<'a> {
    pub(super) i: usize,
    pub(super) u: &'a Unit,
    pub(super) pre: &'a UnitPre,
    pub(super) p: Vec2,
    pub(super) f: Vec2,
    pub(super) r: Vec2,
    pub(super) aware: bool,
    pub(super) engaged: bool,
    pub(super) order_advancing: bool,
    pub(super) trampling: bool,
    pub(super) tun: &'a Tunables,
    pub(super) units: &'a [Unit],
    pub(super) prev_positions: &'a [f32],
    pub(super) alive: &'a [u8],
    pub(super) trampled: &'a [f32],
    pub(super) soldier_slot: &'a [u32],
    pub(super) target: &'a [i32],
    pub(super) terrain: &'a Terrain,
    pub(super) ema_disp_x: &'a [f32],
    pub(super) ema_disp_y: &'a [f32],
    pub(super) nearest_enemy_d: &'a [f32],
    pub(super) err_sum: &'a mut f32,
    pub(super) pivot_sum: &'a mut f32,
}

pub(super) fn prepare_weave(args: PrepareWeaveArgs<'_>) -> PreparedWeave {
    let PrepareWeaveArgs {
        i,
        u,
        pre,
        p,
        f,
        r,
        aware,
        engaged,
        order_advancing,
        trampling,
        tun,
        units,
        prev_positions,
        alive,
        trampled,
        soldier_slot,
        target,
        terrain,
        ema_disp_x,
        ema_disp_y,
        nearest_enemy_d,
        err_sum,
        pivot_sum,
    } = args;

    let local = slot_local(soldier_slot[i] as usize, u.files_eff, u.spacing);
    let slot = u.anchor + r * local.x + f * (-local.y);
    let to = slot - p;
    // Soldiers have no pathfinding: a HALTED unit's slot behind a
    // wall must stop driving the man, or he grinds at the wall
    // forever. Only while the frame rests — a MARCHING frame's slot
    // sweeps past obstacles, and the through-rock pull composed
    // with the terrain slide is exactly what walks a man around a
    // boulder (zeroing it mid-march strands him behind it).
    let slot_anchor_blocked = u.move_target.is_none()
        && u.frame_speed < 0.05
        && to.len() > SLOT_TERRAIN_CHECK_DIST
        && !terrain.segment_passable(p, slot);
    let slot_anchor_vec = if slot_anchor_blocked { Vec2::ZERO } else { to };
    let CorridorTerm {
        slot_pull_vec,
        formation_blocks_forward,
        corridor_slot_removed,
    } = corridor_term(CorridorArgs {
        u,
        p,
        f,
        slot,
        slot_anchor_vec,
        units,
    });
    let weave = weave_forces(WeaveArgs {
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
        prev_positions,
        alive,
        trampled,
        soldier_slot,
        target,
        terrain,
    });
    let soldier_stretch = weave.soldier_stretch;
    let soldier_pivot = weave.soldier_pivot;
    let net_target = weave.net_target;
    let comp_push = weave.comp_push;
    let crush_scalar = weave.crush_scalar;
    let enemy_weld_component = weave.enemy_weld_component;
    let enemy_inside_push = weave.enemy_inside_push;
    // STRETCH drives "out of place" (surge / straggler): a man torn
    // from his neighbours has long bonds; a packed man (compression)
    // does not surge. PIVOT feeds cohesion only (a wrapped line is in
    // formation, just bent).
    let err = soldier_stretch;
    *err_sum += err;
    *pivot_sum += soldier_pivot;
    let max_sp = speed_caps(SpeedCapsArgs {
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
        err,
        soldier_slot,
        ema_disp_x,
        ema_disp_y,
        nearest_enemy_d,
    });
    PreparedWeave {
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
    }
}
