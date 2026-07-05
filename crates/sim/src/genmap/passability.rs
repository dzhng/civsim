//! Passability derived from the generated true-meter landform.

use super::{landform, MapRecipe};
use crate::math::Vec2;
use crate::terrain::Terrain;
use std::collections::VecDeque;

const TINT_GRASS: u8 = 0;
const TINT_WATER: u8 = 1;
const TINT_ROCK: u8 = 2;
const TINT_SCREE: u8 = 6;

pub fn derive(recipe: &MapRecipe, t: &mut Terrain) {
    let slope = slope_field(t);
    let cliff = cliff_mask(
        t,
        &slope,
        recipe.slope_bands.cliff_min,
        recipe.slope_bands.cliff_dilate_cells,
    );
    let highland = edge_connected_highland_cap(t, recipe.slope_bands.highland_cap_min_m);
    for cy in 0..t.h {
        for cx in 0..t.w {
            let i = cy * t.w + cx;
            if t.tint[i] == TINT_WATER {
                t.speed[i] = 0.0;
                t.rough[i] = 0.0;
                continue;
            }
            let p = Vec2::new(
                t.origin.x + (cx as f32 + 0.5) * t.cell,
                t.origin.y + (cy as f32 + 0.5) * t.cell,
            );
            let fine = landform::slice01_rough_noise(recipe.seed, p);
            if cliff[i] != 0 || highland[i] != 0 {
                t.speed[i] = 0.0;
                t.rough[i] = 0.0;
                t.tint[i] = TINT_ROCK;
            } else if slope[i] >= recipe.slope_bands.slow_min {
                t.speed[i] = 0.62;
                t.rough[i] = 0.18 + fine * 0.12;
                t.tint[i] = TINT_SCREE;
            } else {
                t.speed[i] = 1.0;
                let roll_t = ((slope[i] - recipe.slope_bands.flat_max)
                    / (recipe.slope_bands.rolling_max - recipe.slope_bands.flat_max).max(0.001))
                .clamp(0.0, 1.0);
                t.rough[i] = 0.03 + fine * 0.055 + roll_t * 0.075;
                t.tint[i] = TINT_GRASS;
            }
        }
    }
    seal_isolated_passable_pockets(t);
}

pub fn slope_field(t: &Terrain) -> Vec<f32> {
    let mut out = vec![0.0; t.w * t.h];
    if t.w == 0 || t.h == 0 {
        return out;
    }
    for cy in 0..t.h {
        for cx in 0..t.w {
            let xl = cx.saturating_sub(1);
            let xr = (cx + 1).min(t.w - 1);
            let yb = cy.saturating_sub(1);
            let yt = (cy + 1).min(t.h - 1);
            let dx_den = ((xr - xl).max(1) as f32) * t.cell;
            let dy_den = ((yt - yb).max(1) as f32) * t.cell;
            let dzdx = (t.height[cy * t.w + xr] - t.height[cy * t.w + xl]) / dx_den;
            let dzdy = (t.height[yt * t.w + cx] - t.height[yb * t.w + cx]) / dy_den;
            out[cy * t.w + cx] = (dzdx * dzdx + dzdy * dzdy).sqrt();
        }
    }
    out
}

fn cliff_mask(t: &Terrain, slope: &[f32], cliff_min: f32, dilate_cells: u16) -> Vec<u8> {
    let mut out = vec![0u8; t.w * t.h];
    let r = dilate_cells as isize;
    let r2 = r * r;
    for cy in 0..t.h {
        for cx in 0..t.w {
            let i = cy * t.w + cx;
            if slope[i] < cliff_min {
                continue;
            }
            let x0 = (cx as isize - r).max(0) as usize;
            let x1 = (cx as isize + r).min(t.w.saturating_sub(1) as isize) as usize;
            let y0 = (cy as isize - r).max(0) as usize;
            let y1 = (cy as isize + r).min(t.h.saturating_sub(1) as isize) as usize;
            for yy in y0..=y1 {
                for xx in x0..=x1 {
                    let dx = xx as isize - cx as isize;
                    let dy = yy as isize - cy as isize;
                    if dx * dx + dy * dy <= r2 {
                        out[yy * t.w + xx] = 1;
                    }
                }
            }
        }
    }
    out
}

fn edge_connected_highland_cap(t: &Terrain, cap_min_m: f32) -> Vec<u8> {
    let mut seen = vec![0u8; t.w * t.h];
    let mut q = VecDeque::new();
    if t.w == 0 || t.h == 0 {
        return seen;
    }
    let seed = |i: usize, seen: &mut [u8], q: &mut VecDeque<usize>| {
        if seen[i] == 0 && t.height[i] >= cap_min_m {
            seen[i] = 1;
            q.push_back(i);
        }
    };
    for cx in 0..t.w {
        seed(cx, &mut seen, &mut q);
        seed((t.h - 1) * t.w + cx, &mut seen, &mut q);
    }
    for cy in 0..t.h {
        seed(cy * t.w, &mut seen, &mut q);
        seed(cy * t.w + t.w - 1, &mut seen, &mut q);
    }
    while let Some(i) = q.pop_front() {
        let cx = i % t.w;
        let cy = i / t.w;
        let push = |ni: usize, seen: &mut [u8], q: &mut VecDeque<usize>| {
            if seen[ni] == 0 && t.height[ni] >= cap_min_m {
                seen[ni] = 1;
                q.push_back(ni);
            }
        };
        if cx > 0 {
            push(i - 1, &mut seen, &mut q);
        }
        if cx + 1 < t.w {
            push(i + 1, &mut seen, &mut q);
        }
        if cy > 0 {
            push(i - t.w, &mut seen, &mut q);
        }
        if cy + 1 < t.h {
            push(i + t.w, &mut seen, &mut q);
        }
    }
    seen
}

fn seal_isolated_passable_pockets(t: &mut Terrain) {
    if t.w == 0 || t.h == 0 {
        return;
    }
    let mut seen = vec![0u8; t.w * t.h];
    let mut q = VecDeque::new();
    let half_h = 0.5 * t.h as f32 * t.cell;
    for cy in 0..t.h {
        let wy = t.origin.y + (cy as f32 + 0.5) * t.cell;
        let in_deploy_band =
            (wy + 0.75 * half_h).abs() <= 45.0 || (wy - 0.75 * half_h).abs() <= 45.0;
        if !in_deploy_band {
            continue;
        }
        for cx in 0..t.w {
            let wx = t.origin.x + (cx as f32 + 0.5) * t.cell;
            if wx.abs() > 350.0 {
                continue;
            }
            let i = cy * t.w + cx;
            if t.speed[i] > 0.0 && seen[i] == 0 {
                seen[i] = 1;
                q.push_back(i);
            }
        }
    }
    while let Some(i) = q.pop_front() {
        let cx = i % t.w;
        let cy = i / t.w;
        let push = |ni: usize, seen: &mut [u8], q: &mut VecDeque<usize>, t: &Terrain| {
            if seen[ni] == 0 && t.speed[ni] > 0.0 {
                seen[ni] = 1;
                q.push_back(ni);
            }
        };
        if cx > 0 {
            push(i - 1, &mut seen, &mut q, t);
        }
        if cx + 1 < t.w {
            push(i + 1, &mut seen, &mut q, t);
        }
        if cy > 0 {
            push(i - t.w, &mut seen, &mut q, t);
        }
        if cy + 1 < t.h {
            push(i + t.w, &mut seen, &mut q, t);
        }
    }
    for (i, was_seen) in seen.into_iter().enumerate() {
        if was_seen == 0 && t.speed[i] > 0.0 {
            t.speed[i] = 0.0;
            t.rough[i] = 0.0;
            t.tint[i] = TINT_ROCK;
        }
    }
}
