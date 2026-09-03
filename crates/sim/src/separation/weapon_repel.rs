use crate::force_trace::{ForceChannel, Tracer};
use crate::grid::SpatialHash;
use crate::tunables::{Tunables, DT};
use crate::unit::Unit;

pub(super) const BRACED_REPEL_FILE_OVERLAP: f32 = 4.0;
pub(super) const SWORD_STANDOFF: f32 = 0.5;
pub(super) const SWORD_STANDOFF_SOFT: f32 = 0.2;

pub(super) struct WeaponRepelCtx<'a> {
    pub(super) units: &'a [Unit],
    pub(super) tun: Tunables,
    pub(super) cell: f32,
    pub(super) nb: usize,
    pub(super) body_owner: &'a [u32],
    pub(super) soldier_unit: &'a [u32],
    pub(super) cur_weapon: &'a [u8],
    pub(super) body_pos: &'a [f32],
    pub(super) grid: &'a SpatialHash,
    pub(super) body_r: &'a [f32],
    pub(super) mounted: &'a [u8],
    pub(super) project_unit_active: &'a mut [u8],
    pub(super) project_any: &'a mut bool,
    pub(super) repel: &'a mut [f32],
}

pub(super) fn apply<F>(ctx: WeaponRepelCtx<'_>, m_eff: &F, tracer: &mut Tracer<'_>)
where
    F: Fn(usize, f32, f32, bool) -> f32,
{
    let WeaponRepelCtx {
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
        project_any,
        repel,
    } = ctx;
    // --- WEAPON REPEL: a leveled weapon PUSHES the enemy out of its reach.
    // A man holds a foe off not with a wall but with a FORCE: the points (or
    // the blade) shove an enemy who is inside reach back out, along the
    // weapon's line, harder the deeper he is. It's a real TWO-WAY force —
    // each front man's weapon pushes the other's — so the line holds at
    // weapon's length on its own, the contest of pushes (not a clamp)
    // deciding the distance: a deeper, better-backed enemy can OVERPOWER the
    // repel and close (a sword line presses into a pike hedge if it has the
    // weight), which a wall could never allow. Posted into the same push
    // accumulator as the body separation, so it competes in the SAME medium
    // as the rear-rank shove that used to overrun the soft steering magnet.
    // A pike (long reach) pushes far, a sword (short) at arm's length — same
    // rule, the reach is the only difference.
    let max_reach = units.iter().fold(0.0f32, |m, u| {
        m.max(u.stats.weapons.iter().fold(0.0, |a, w| a.max(w.reach)))
    });
    if max_reach > 0.0 && tun.weapon_repel > 0.0 {
        // The grid is built at body-pair resolution; reach runs far past
        // that, so scan a wider window around each man.
        let reach_cells = (max_reach / cell).ceil() as i32 + 1;
        for bi in 0..nb {
            let j = body_owner[bi] as usize;
            let uj = soldier_unit[j] as usize;
            // A trampler rides THROUGH contact — it holds no line and repels
            // no one (the trample bleed, not a repel, spends its charge).
            if units[uj].tramples() {
                continue;
            }
            // The weapon IN HAND sets the reach (a pike on its side-sword
            // pushes close, not at pike length).
            let held = cur_weapon[j] as usize;
            let weapons = units[uj].stats.weapons;
            if held >= weapons.len() {
                continue;
            }
            // A BRACED weapon pushes from its points (its reach); everything
            // else pushes from the BODY (an arm's length is a body's length —
            // a sword has no standoff). Keeping non-braced at body radius
            // leaves the contact DISTANCE exactly where the plain body wall
            // already put it — the repel only makes that push DIRECTIONAL and
            // uncapped (so it holds the line), it does not move where men
            // fight, so it doesn't ripple the combat balance.
            let hedge = weapons[held].hedge();
            let reach = weapons[held].reach;
            // The weapon points down the UNIT's frontage; its push is frontal,
            // along that line. Swords cover one file; braced pole points overlap
            // several files into a continuous hedge so a staggered front cannot
            // zipper between isolated columns.
            let aim = crate::math::dir(units[uj].facing);
            let (perp_x, perp_y) = (-aim.y, aim.x);
            let half_w = units[uj].spacing.x.max(0.5)
                * if hedge {
                    BRACED_REPEL_FILE_OVERLAP
                } else {
                    1.0
                };
            let (jx, jy) = (body_pos[2 * bi], body_pos[2 * bi + 1]);
            let cx = (jx / cell).floor() as i32;
            let cy = (jy / cell).floor() as i32;
            // The NEAREST frontal foe in this bearer's column — the one man his
            // points actually fence. Only that pair is pushed: a pike bears on
            // the enemy DIRECTLY ahead, not on the ranks stacked behind him
            // (their own front man is between). Summing a push against every
            // foe in the reach cone (3-4 enemy ranks deep) over-counts and
            // launches the front man clean out — the standoff is one foe, one
            // hold.
            let mut near_i = usize::MAX;
            let mut near_fwd = f32::INFINITY;
            let mut near_pen = 0.0f32;
            for oy in -reach_cells..=reach_cells {
                for ox in -reach_cells..=reach_cells {
                    let b = grid.bucket(cx + ox, cy + oy);
                    let (lo, hi) = (grid.starts[b] as usize, grid.starts[b + 1] as usize);
                    for &bk in &grid.entries[lo..hi] {
                        let i = body_owner[bk as usize] as usize;
                        let ui = soldier_unit[i] as usize;
                        if units[ui].team == units[uj].team {
                            continue;
                        }
                        // A committed charge rides ONTO the points (the impale
                        // is its reckoning) — it is not pushed back out.
                        if units[ui].tramples() {
                            continue;
                        }
                        let bsum = body_r[bi] + body_r[bk as usize];
                        let dx = body_pos[2 * bk as usize] - jx;
                        let dy = body_pos[2 * bk as usize + 1] - jy;
                        let fwd = dx * aim.x + dy * aim.y;
                        // The standoff holds only in a FRONTAL clash — where this
                        // bearer sits along the foe's OWN facing axis (the foe is
                        // squared up to him, two lines meeting). When the foe is
                        // taken on his FLANK or rear (this bearer is off to the
                        // foe's side — a wide line wrapping a block) there is no
                        // standoff: the wrapping man closes to body contact so the
                        // block is ENVELOPED, not held at arm's length. Keyed on
                        // the CONTACT direction (foe→bearer) vs the foe's facing,
                        // not the bearer's — a held block faces one way, so its
                        // flank men only read as flanked by where the foe stands.
                        // This is what separates the blob (frontal interleave,
                        // bad) from a wrap (flank envelopment, the point).
                        let foe_aim = crate::math::dir(units[ui].facing);
                        let d2c = dx * dx + dy * dy;
                        let frontal = (-dx * foe_aim.x - dy * foe_aim.y) > 0.55 * d2c.sqrt();
                        // A sword holds a SOFT standoff past body contact: full
                        // repel on overlap (front contact, where men FIGHT, is
                        // unchanged) plus a WEAK ramp in the standoff band beyond
                        // it — enough to resist a rear man squirting into the
                        // gaps between enemies (the blob), not enough to move the
                        // front line out. A braced point holds at its full reach.
                        // FOOT vs FOOT only: the blob is an infantry-line
                        // problem. Cavalry rides through and maneuvers in contact
                        // (its reach is the rider-reachability contract), so a
                        // horse-involved contact keeps body radius — no standoff.
                        let foot = mounted[j] == 0 && mounted[i] == 0;
                        let standoff_dist = if frontal && foot { SWORD_STANDOFF } else { 0.0 };
                        let rdist = if hedge { reach } else { bsum + standoff_dist };
                        // Inside the forward reach band, in this man's column.
                        if fwd <= 0.0 || fwd >= rdist {
                            continue;
                        }
                        let lat = dx * perp_x + dy * perp_y;
                        if lat.abs() > half_w {
                            continue;
                        }
                        if fwd < near_fwd {
                            near_fwd = fwd;
                            near_i = i;
                            near_pen = if hedge {
                                rdist - fwd
                            } else {
                                let overlap = (bsum - fwd).max(0.0);
                                let standoff = (rdist - fwd.max(bsum)).max(0.0);
                                overlap + SWORD_STANDOFF_SOFT * standoff
                            };
                        }
                    }
                }
            }
            if near_i != usize::MAX {
                // The weapon's points are a leveled body: the SAME two-way,
                // mass-shared separation the bodies use (above), just acting at
                // REACH instead of body radius. Newton's third law — the pike
                // PUSHES the foe back out (resisting his advance, not merely
                // backing the bearer off; a force that moves only its bearer
                // can't hold a line) and recoils the bearer by the equal
                // reaction. The split is by effective mass (brace included),
                // exactly as for two colliding bodies: a BRACED, deep-backed
                // bearer has a huge m_eff, so he barely recoils and the foe is
                // shoved out — the standoff holds — while his own rear ranks get
                // no back-shove to squirt sideways through. SOFT (∝ how deep the
                // foe is inside reach), so it is no wall: a heavier / better-
                // backed enemy out-masses the share and presses in, the contest
                // of forces deciding the distance.
                let i = near_i;
                let ui = soldier_unit[i] as usize;
                project_unit_active[ui] = 1;
                project_unit_active[uj] = 1;
                *project_any = true;
                // The foe j is thrust along +aim (the bearer i is at -aim from
                // him); i's threat is the foe at +aim. Each braces toward it.
                let (wj, wi) = (m_eff(j, -aim.x, -aim.y, true), m_eff(i, aim.x, aim.y, true));
                let inv = 1.0 / (wi + wj);
                let push = near_pen * tun.weapon_repel * DT;
                repel[2 * i] += aim.x * push * (wj * inv);
                repel[2 * i + 1] += aim.y * push * (wj * inv);
                repel[2 * j] -= aim.x * push * (wi * inv);
                repel[2 * j + 1] -= aim.y * push * (wi * inv);
                let push_i = aim * (push * (wj * inv));
                let push_j = aim * (-push * (wi * inv));
                tracer.record(
                    i,
                    ui,
                    ForceChannel::WeaponRepel,
                    None,
                    push_i,
                    "frontal_gate=true bearer_repel",
                );
                tracer.record(
                    j,
                    uj,
                    ForceChannel::WeaponRepel,
                    None,
                    push_j,
                    "frontal_gate=true recoil",
                );
            }
        }
    }
}
