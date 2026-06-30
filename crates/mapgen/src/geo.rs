//! Projection and computational geometry for the map pipeline.

pub const EARTH_R_KM: f64 = 6371.0;
/// Projection center: mid-Mediterranean, low distortion over the whole footprint.
pub const CENTER_LON: f64 = 18.0;
pub const CENTER_LAT: f64 = 38.0;

/// Lambert azimuthal equal-area, centered on (CENTER_LON, CENTER_LAT).
/// Returns game-world km, +x east, +y north.
pub fn project(lon: f64, lat: f64) -> [f64; 2] {
    let (l0, p0) = (CENTER_LON.to_radians(), CENTER_LAT.to_radians());
    let (l, p) = (lon.to_radians(), lat.to_radians());
    let c = 1.0 + p0.sin() * p.sin() + p0.cos() * p.cos() * (l - l0).cos();
    let k = (2.0 / c).sqrt() * EARTH_R_KM;
    [
        k * p.cos() * (l - l0).sin(),
        k * (p0.cos() * p.sin() - p0.sin() * p.cos() * (l - l0).cos()),
    ]
}

pub fn dist(a: [f64; 2], b: [f64; 2]) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt()
}

pub fn polyline_len(pts: &[[f64; 2]]) -> f64 {
    pts.windows(2).map(|w| dist(w[0], w[1])).sum()
}

/// Point at arc-length distance `d` along the polyline (clamped to ends).
pub fn point_along(pts: &[[f64; 2]], d: f64) -> [f64; 2] {
    let mut rem = d.max(0.0);
    for w in pts.windows(2) {
        let seg = dist(w[0], w[1]);
        if rem <= seg && seg > 0.0 {
            let t = rem / seg;
            return [
                w[0][0] + (w[1][0] - w[0][0]) * t,
                w[0][1] + (w[1][1] - w[0][1]) * t,
            ];
        }
        rem -= seg;
    }
    *pts.last().unwrap()
}

/// Even-odd point-in-ring test.
pub fn point_in_ring(p: [f64; 2], ring: &[[f64; 2]]) -> bool {
    let mut inside = false;
    let n = ring.len();
    let mut j = n - 1;
    for i in 0..n {
        let (a, b) = (ring[i], ring[j]);
        if (a[1] > p[1]) != (b[1] > p[1])
            && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]
        {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// Point in polygon-with-holes (even-odd over all rings).
pub fn point_in_poly(p: [f64; 2], rings: &[Vec<[f64; 2]>]) -> bool {
    let mut inside = false;
    for ring in rings {
        if point_in_ring(p, ring) {
            inside = !inside;
        }
    }
    inside
}

/// Proper segment-segment intersection (excludes collinear touching; fine for crossing tests).
pub fn segs_intersect(a: [f64; 2], b: [f64; 2], c: [f64; 2], d: [f64; 2]) -> bool {
    fn cross(o: [f64; 2], p: [f64; 2], q: [f64; 2]) -> f64 {
        (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
    }
    let (d1, d2) = (cross(c, d, a), cross(c, d, b));
    let (d3, d4) = (cross(a, b, c), cross(a, b, d));
    ((d1 > 0.0) != (d2 > 0.0)) && ((d3 > 0.0) != (d4 > 0.0))
}

#[derive(Clone, Copy)]
pub struct BBox {
    pub min: [f64; 2],
    pub max: [f64; 2],
}

impl BBox {
    pub fn of(pts: impl Iterator<Item = [f64; 2]>) -> BBox {
        let mut bb = BBox {
            min: [f64::MAX; 2],
            max: [f64::MIN; 2],
        };
        for p in pts {
            for k in 0..2 {
                bb.min[k] = bb.min[k].min(p[k]);
                bb.max[k] = bb.max[k].max(p[k]);
            }
        }
        bb
    }
    pub fn contains(&self, p: [f64; 2]) -> bool {
        p[0] >= self.min[0] && p[0] <= self.max[0] && p[1] >= self.min[1] && p[1] <= self.max[1]
    }
    pub fn pad(&self, m: f64) -> BBox {
        BBox {
            min: [self.min[0] - m, self.min[1] - m],
            max: [self.max[0] + m, self.max[1] + m],
        }
    }
}

/// Uniform grid over segments for fast crossing queries.
pub struct SegGrid {
    cell: f64,
    origin: [f64; 2],
    w: usize,
    h: usize,
    bins: Vec<Vec<u32>>,
    pub segs: Vec<([f64; 2], [f64; 2])>,
}

impl SegGrid {
    pub fn new(bb: BBox, cell: f64) -> SegGrid {
        let w = ((bb.max[0] - bb.min[0]) / cell).ceil().max(1.0) as usize;
        let h = ((bb.max[1] - bb.min[1]) / cell).ceil().max(1.0) as usize;
        SegGrid {
            cell,
            origin: bb.min,
            w,
            h,
            bins: vec![Vec::new(); w * h],
            segs: Vec::new(),
        }
    }
    fn cells_of(&self, a: [f64; 2], b: [f64; 2]) -> Vec<usize> {
        let x0 = (((a[0].min(b[0]) - self.origin[0]) / self.cell)
            .floor()
            .max(0.0) as usize)
            .min(self.w - 1);
        let x1 = (((a[0].max(b[0]) - self.origin[0]) / self.cell)
            .floor()
            .max(0.0) as usize)
            .min(self.w - 1);
        let y0 = (((a[1].min(b[1]) - self.origin[1]) / self.cell)
            .floor()
            .max(0.0) as usize)
            .min(self.h - 1);
        let y1 = (((a[1].max(b[1]) - self.origin[1]) / self.cell)
            .floor()
            .max(0.0) as usize)
            .min(self.h - 1);
        let mut out = Vec::new();
        for y in y0..=y1 {
            for x in x0..=x1 {
                out.push(y * self.w + x);
            }
        }
        out
    }
    pub fn insert(&mut self, a: [f64; 2], b: [f64; 2]) {
        let id = self.segs.len() as u32;
        self.segs.push((a, b));
        for c in self.cells_of(a, b) {
            self.bins[c].push(id);
        }
    }
    pub fn crosses(&self, a: [f64; 2], b: [f64; 2]) -> bool {
        for c in self.cells_of(a, b) {
            for &i in &self.bins[c] {
                let (p, q) = self.segs[i as usize];
                if segs_intersect(a, b, p, q) {
                    return true;
                }
            }
        }
        false
    }
}
