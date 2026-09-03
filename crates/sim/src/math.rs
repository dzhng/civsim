//! 2D math primitives. All angle math wraps to (-PI, PI].

use std::f32::consts::{PI, TAU};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Vec2 {
    pub x: f32,
    pub y: f32,
}

impl Vec2 {
    pub const ZERO: Vec2 = Vec2 { x: 0.0, y: 0.0 };

    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

    pub fn len(self) -> f32 {
        (self.x * self.x + self.y * self.y).sqrt()
    }

    pub fn dot(self, o: Vec2) -> f32 {
        self.x * o.x + self.y * o.y
    }

    pub fn perp(self) -> Vec2 {
        Vec2::new(self.y, -self.x)
    }
}

impl std::ops::Add for Vec2 {
    type Output = Vec2;
    fn add(self, o: Vec2) -> Vec2 {
        Vec2::new(self.x + o.x, self.y + o.y)
    }
}

impl std::ops::Sub for Vec2 {
    type Output = Vec2;
    fn sub(self, o: Vec2) -> Vec2 {
        Vec2::new(self.x - o.x, self.y - o.y)
    }
}

impl std::ops::Mul<f32> for Vec2 {
    type Output = Vec2;
    fn mul(self, s: f32) -> Vec2 {
        Vec2::new(self.x * s, self.y * s)
    }
}

/// Unit-length direction vector for an angle (0 = +x, counterclockwise).
pub fn dir(angle: f32) -> Vec2 {
    Vec2::new(angle.cos(), angle.sin())
}

/// Wrap an angle to (-PI, PI].
pub fn wrap_angle(a: f32) -> f32 {
    let mut a = a % TAU;
    if a > PI {
        a -= TAU;
    } else if a < -PI {
        a += TAU;
    }
    a
}

pub fn rotate_toward(cur: f32, target: f32, max_step: f32) -> f32 {
    let d = wrap_angle(target - cur);
    if d.abs() <= max_step {
        target
    } else {
        cur + max_step * d.signum()
    }
}

pub fn move_toward(cur: f32, target: f32, max_step: f32) -> f32 {
    let d = target - cur;
    if d.abs() <= max_step {
        target
    } else {
        cur + max_step * d.signum()
    }
}

pub fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}
