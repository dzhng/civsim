use crate::class::HORSE_HALF_LEN;
use crate::force_trace::{ForceChannel, Tracer};
use crate::grid::SpatialHash;
use crate::math::Vec2;
use crate::terrain::Terrain;
use crate::tunables::Tunables;
use crate::unit::Unit;

pub(super) fn project_to_contact_ring(p: Vec2, center: Vec2, radius: f32) -> Vec2 {
    let to = p - center;
    let distance = to.len();
    if distance > 1e-4 && distance < radius {
        center + to * (radius / distance)
    } else {
        p
    }
}

pub(super) struct WallsCtx<'a> {
    pub(super) n: usize,
    pub(super) tun: Tunables,
    pub(super) scratch: &'a mut Vec<f32>,
    pub(super) repel: &'a [f32],
    pub(super) positions: &'a mut [f32],
    pub(super) terrain: &'a Terrain,
    pub(super) wall_depth: &'a [f32],
    pub(super) wall_cx: &'a [f32],
    pub(super) wall_cy: &'a [f32],
    pub(super) wall_r: &'a [f32],
    pub(super) soldier_unit: &'a [u32],
    pub(super) project_any: bool,
    pub(super) body_pos: &'a mut Vec<f32>,
    pub(super) body_r: &'a [f32],
    pub(super) body_owner: &'a [u32],
    pub(super) alive: &'a [u8],
    pub(super) mounted: &'a [u8],
    pub(super) facings: &'a [f32],
    pub(super) grid: &'a mut SpatialHash,
    pub(super) cell: f32,
    pub(super) project_unit_active: &'a [u8],
    pub(super) units: &'a [Unit],
}

pub(super) fn apply<F>(ctx: WallsCtx<'_>, tracer: &mut Tracer<'_>, m_eff: &F)
where
    F: Fn(usize, f32, f32, bool) -> f32,
{
    let WallsCtx {
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
    } = ctx;
    // --- apply the non-overlap correction (capped per soldier, walls slide).
    for i in 0..n {
        let mut px = scratch[2 * i];
        let mut py = scratch[2 * i + 1];
        let mag = (px * px + py * py).sqrt();
        if mag > tun.separation_max_push {
            let pre_cap = Vec2::new(px, py);
            let k = tun.separation_max_push / mag;
            px *= k;
            py *= k;
            tracer.record(
                i,
                soldier_unit[i] as usize,
                ForceChannel::BodySeparationNormal,
                Some(pre_cap),
                Vec2::new(px, py),
                "separation_max_push",
            );
        }
        // The weapon repel is its OWN capped correction, summed after the
        // body separation. Capping it (like the bodies) is what keeps a
        // symmetric front STABLE: an uncapped frontal shove is positive
        // feedback — the side that slips a hair ahead shoves the other back
        // harder, and a head-on clash of identical lines BUCKLES one way and
        // routs (the "heavy-v-heavy isn't even" failure). Capped, it can't
        // overshoot, so two equal fronts settle at weapon's length and grind
        // evenly — exactly as two equal bodies settle at contact.
        let mut rx = repel[2 * i];
        let mut ry = repel[2 * i + 1];
        let rmag = (rx * rx + ry * ry).sqrt();
        if rmag > tun.separation_max_push {
            let pre_cap = Vec2::new(rx, ry);
            let k = tun.separation_max_push / rmag;
            rx *= k;
            ry *= k;
            tracer.record(
                i,
                soldier_unit[i] as usize,
                ForceChannel::WeaponRepel,
                Some(pre_cap),
                Vec2::new(rx, ry),
                "weapon_repel_cap",
            );
        }
        px += rx;
        py += ry;
        let p = Vec2::new(positions[2 * i], positions[2 * i + 1]);
        let np = Vec2::new(p.x + px, p.y + py);
        let np = if terrain.speed_at(np) > 0.0 || terrain.speed_at(p) <= 0.0 {
            np
        } else {
            let sx = Vec2::new(np.x, p.y);
            let sy = Vec2::new(p.x, np.y);
            if terrain.speed_at(sx) > 0.0 {
                sx
            } else if terrain.speed_at(sy) > 0.0 {
                sy
            } else {
                p
            }
        };
        // Hard wall: a man may not end the tick inside an enemy body. Snap
        // him out to the contact ring of the deepest one he overlaps.
        let before_wall = np;
        let np = if wall_depth[i] >= 0.0 {
            project_to_contact_ring(np, Vec2::new(wall_cx[i], wall_cy[i]), wall_r[i])
        } else {
            np
        };
        if np.x != before_wall.x || np.y != before_wall.y {
            tracer.record(
                i,
                soldier_unit[i] as usize,
                ForceChannel::HardWall,
                None,
                np - before_wall,
                "deepest_enemy_body_snap",
            );
        }
        positions[2 * i] = np.x;
        positions[2 * i + 1] = np.y;
    }

    // ITERATIVE BODY PROJECTION: the one-shot separation above is capped as
    // crowd relief, but after a deep press it can leave enemy bodies still
    // interpenetrating. A second, symmetric constraint solve removes only
    // the remaining physical impossibility: two bodies occupying the same
    // space. Corrections are Jacobi-staged per pass (all reads come from the
    // pass-start candidate positions, then apply together) so pair order does
    // not make one line shove with freshly-updated state.
    const BODY_PROJECTION_PASSES: usize = 3;
    perf_scope!(_timer, "separation projection");
    if project_any {
        // Alive state, mounts and radii stay fixed until impact casualties apply.
        // Only body positions change between these Jacobi passes.
        for _ in 0..BODY_PROJECTION_PASSES {
            body_pos.clear();
            for i in 0..n {
                if alive[i] == 0 {
                    continue;
                }
                let px = positions[2 * i];
                let py = positions[2 * i + 1];
                if mounted[i] == 1 {
                    let f = crate::math::dir(facings[i]);
                    for s in [-1.0f32, 1.0] {
                        body_pos.push(px + f.x * HORSE_HALF_LEN * s);
                        body_pos.push(py + f.y * HORSE_HALF_LEN * s);
                    }
                } else {
                    body_pos.push(px);
                    body_pos.push(py);
                }
            }
            grid.rebuild(cell, body_pos);
            scratch.clear();
            scratch.resize(2 * n, 0.0);
            let mut any = false;
            for bi in 0..body_owner.len() {
                let i = body_owner[bi] as usize;
                let ui = soldier_unit[i] as usize;
                if project_unit_active[ui] == 0 {
                    continue;
                }
                let px = body_pos[2 * bi];
                let py = body_pos[2 * bi + 1];
                let cx = (px / cell).floor() as i32;
                let cy = (py / cell).floor() as i32;
                let mut seen = [usize::MAX; 9];
                let mut seen_len = 0;
                for oy in -1..=1i32 {
                    for ox in -1..=1i32 {
                        let b = grid.bucket(cx + ox, cy + oy);
                        if seen[..seen_len].contains(&b) {
                            continue;
                        }
                        seen[seen_len] = b;
                        seen_len += 1;
                        let (lo, hi) = (grid.starts[b] as usize, grid.starts[b + 1] as usize);
                        for &bj in &grid.entries[lo..hi] {
                            let bj = bj as usize;
                            let j = body_owner[bj] as usize;
                            let uj = soldier_unit[j] as usize;
                            if j == i || (project_unit_active[uj] != 0 && bj <= bi) {
                                continue;
                            }
                            if units[ui].team != units[uj].team
                                && ((units[ui].tramples()
                                    && units[ui].mass_advance > tun.charge_spent_speed)
                                    || (units[uj].tramples()
                                        && units[uj].mass_advance > tun.charge_spent_speed))
                            {
                                continue;
                            }
                            let relax = if units[ui].team == units[uj].team {
                                0.5
                            } else {
                                1.0
                            };
                            let dx = px - body_pos[2 * bj];
                            let dy = py - body_pos[2 * bj + 1];
                            let min_dist = body_r[bi] + body_r[bj];
                            let d2 = dx * dx + dy * dy;
                            if d2 >= min_dist * min_dist {
                                continue;
                            }
                            let (nx, ny, d) = if d2 > 1e-8 {
                                let d = d2.sqrt();
                                (dx / d, dy / d, d)
                            } else if i < j {
                                (1.0, 0.0, 0.0)
                            } else {
                                (-1.0, 0.0, 0.0)
                            };
                            let foe = units[ui].team != units[uj].team;
                            let w_i = m_eff(i, -nx, -ny, foe);
                            let w_j = m_eff(j, nx, ny, foe);
                            let inv = 1.0 / (w_i + w_j);
                            let overlap = min_dist - d;
                            let si = w_j * inv;
                            let sj = w_i * inv;
                            scratch[2 * i] += nx * overlap * si * relax;
                            scratch[2 * i + 1] += ny * overlap * si * relax;
                            scratch[2 * j] -= nx * overlap * sj * relax;
                            scratch[2 * j + 1] -= ny * overlap * sj * relax;
                            any = true;
                        }
                    }
                }
            }
            if !any {
                break;
            }
            for i in 0..n {
                if alive[i] == 0 {
                    continue;
                }
                let p = Vec2::new(positions[2 * i], positions[2 * i + 1]);
                let np = Vec2::new(p.x + scratch[2 * i], p.y + scratch[2 * i + 1]);
                if terrain.speed_at(np) > 0.0 || terrain.speed_at(p) <= 0.0 {
                    positions[2 * i] = np.x;
                    positions[2 * i + 1] = np.y;
                    if scratch[2 * i] != 0.0 || scratch[2 * i + 1] != 0.0 {
                        tracer.record(
                            i,
                            soldier_unit[i] as usize,
                            ForceChannel::ProjectionPass,
                            None,
                            Vec2::new(scratch[2 * i], scratch[2 * i + 1]),
                            "iterative_body_projection",
                        );
                    }
                }
            }
        }
    }
}
