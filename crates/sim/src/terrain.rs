//! Terrain: a grid of cells with a ground-speed multiplier and a roughness
//! factor. That's the entire mechanic — chokepoint disorder, ragged mud
//! charges, and draining climbs all emerge from soldiers reading the ground
//! under their own feet.
//!
//! speed 0 = impassable: soldiers inside are pushed toward passable ground
//! and cannot move under their own power.

use crate::math::Vec2;

pub struct Terrain {
    /// Meters per cell.
    pub cell: f32,
    pub w: usize,
    pub h: usize,
    /// World position of the grid's (0,0) corner.
    pub origin: Vec2,
    /// Ground speed multiplier per cell, 0..1. 0 = impassable.
    pub speed: Vec<f32>,
    /// Roughness per cell, 0..1: uneven footing that staggers soldiers.
    pub rough: Vec<f32>,
}

impl Terrain {
    pub fn flat(w: usize, h: usize, cell: f32, origin: Vec2) -> Self {
        Self {
            cell,
            w,
            h,
            origin,
            speed: vec![1.0; w * h],
            rough: vec![0.0; w * h],
        }
    }

    fn index(&self, p: Vec2) -> Option<usize> {
        let cx = ((p.x - self.origin.x) / self.cell).floor();
        let cy = ((p.y - self.origin.y) / self.cell).floor();
        if cx < 0.0 || cy < 0.0 || cx >= self.w as f32 || cy >= self.h as f32 {
            return None;
        }
        Some(cy as usize * self.w + cx as usize)
    }

    /// Off-map ground is ordinary (1.0): the map paints exceptions.
    pub fn speed_at(&self, p: Vec2) -> f32 {
        self.index(p).map_or(1.0, |i| self.speed[i])
    }

    pub fn rough_at(&self, p: Vec2) -> f32 {
        self.index(p).map_or(0.0, |i| self.rough[i])
    }

    /// Direction toward passable ground for a soldier standing in a wall:
    /// search rings of 8 bearings at growing radius for the nearest passable
    /// cell. Deterministic; zero vector only if fully entombed.
    pub fn escape_dir(&self, p: Vec2) -> Vec2 {
        const DIRS: [(f32, f32); 8] = [
            (1.0, 0.0),
            (-1.0, 0.0),
            (0.0, 1.0),
            (0.0, -1.0),
            (0.7071, 0.7071),
            (0.7071, -0.7071),
            (-0.7071, 0.7071),
            (-0.7071, -0.7071),
        ];
        for ring in 1..=6 {
            let dist = ring as f32 * self.cell;
            for &(dx, dy) in &DIRS {
                if self.speed_at(Vec2::new(p.x + dx * dist, p.y + dy * dist)) > 0.0 {
                    return Vec2::new(dx, dy);
                }
            }
        }
        Vec2::ZERO
    }

    pub fn paint_rect(&mut self, min: Vec2, max: Vec2, speed: f32, rough: f32) {
        self.paint(|p| p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y, speed, rough);
    }

    pub fn paint_circle(&mut self, center: Vec2, radius: f32, speed: f32, rough: f32) {
        let r2 = radius * radius;
        self.paint(
            |p| {
                let d = p - center;
                d.x * d.x + d.y * d.y <= r2
            },
            speed,
            rough,
        );
    }

    fn paint<F: Fn(Vec2) -> bool>(&mut self, inside: F, speed: f32, rough: f32) {
        for cy in 0..self.h {
            for cx in 0..self.w {
                let p = Vec2::new(
                    self.origin.x + (cx as f32 + 0.5) * self.cell,
                    self.origin.y + (cy as f32 + 0.5) * self.cell,
                );
                if inside(p) {
                    let i = cy * self.w + cx;
                    self.speed[i] = speed;
                    self.rough[i] = rough;
                }
            }
        }
    }
}

/// Deterministic per-soldier stagger in [0,1): hashes soldier index and a
/// coarse time bucket, so rough ground staggers different men differently
/// each moment — without touching the sim RNG stream.
pub fn stagger01(soldier: usize, tick: u64) -> f32 {
    let mut x = (soldier as u64).wrapping_mul(0x9E3779B97F4A7C15) ^ (tick / 8).wrapping_mul(0xBF58476D1CE4E5B9);
    x ^= x >> 30;
    x = x.wrapping_mul(0xBF58476D1CE4E5B9);
    x ^= x >> 27;
    (x >> 40) as f32 / 16_777_216.0
}
