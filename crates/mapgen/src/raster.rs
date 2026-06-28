//! Background raster: stylized parchment-and-sea map painted from Natural Earth
//! layers, written as PNG. The campaign renderer drapes this under the road graph.

use crate::geo::BBox;
use crate::sources::Poly;

pub struct Raster {
    pub w: usize,
    pub h: usize,
    pub px: Vec<u8>, // RGBA8
    bb: BBox,
    scale: f64, // px per km
}

// TWIN: web/src/campaign/terrain.ts classifies map pixels by nearest match
// against these exact colors — recolor here, recolor there.
const SEA: [u8; 3] = [38, 60, 84];
const LAND: [u8; 3] = [196, 178, 138];
const MOUNTAIN: [u8; 3] = [142, 120, 96];
const LAKE: [u8; 3] = [52, 84, 110];
const RIVER: [u8; 3] = [60, 96, 124];

impl Raster {
    pub fn new(bb: BBox, px_per_km: f64) -> Raster {
        let w = ((bb.max[0] - bb.min[0]) * px_per_km).ceil() as usize;
        let h = ((bb.max[1] - bb.min[1]) * px_per_km).ceil() as usize;
        let mut px = vec![0u8; w * h * 4];
        for i in 0..w * h {
            px[i * 4..i * 4 + 3].copy_from_slice(&SEA);
            px[i * 4 + 3] = 255;
        }
        Raster {
            w,
            h,
            px,
            bb,
            scale: px_per_km,
        }
    }

    /// World km → pixel (y flipped: world +y north, raster row 0 top).
    fn to_px(&self, p: [f64; 2]) -> [f64; 2] {
        [
            (p[0] - self.bb.min[0]) * self.scale,
            (self.bb.max[1] - p[1]) * self.scale,
        ]
    }

    fn put(&mut self, x: i64, y: i64, c: [u8; 3]) {
        if x >= 0 && y >= 0 && (x as usize) < self.w && (y as usize) < self.h {
            let i = (y as usize * self.w + x as usize) * 4;
            self.px[i..i + 3].copy_from_slice(&c);
        }
    }

    fn is_water_at(&self, x: i64, y: i64) -> bool {
        if x < 0 || y < 0 || (x as usize) >= self.w || (y as usize) >= self.h {
            return false;
        }
        let i = (y as usize * self.w + x as usize) * 4;
        self.px[i..i + 3] == SEA || self.px[i..i + 3] == LAKE
    }

    pub fn is_water_world(&self, p: [f64; 2]) -> bool {
        let px = self.to_px(p);
        self.is_water_at(px[0].round() as i64, px[1].round() as i64)
    }

    fn put_land_if_water(&mut self, x: i64, y: i64) -> usize {
        if self.is_water_at(x, y) {
            self.put(x, y, LAND);
            1
        } else {
            0
        }
    }

    /// Scanline even-odd fill of one polygon (with holes) in pixel space.
    pub fn fill_poly(&mut self, poly: &Poly, c: [u8; 3]) {
        let rings: Vec<Vec<[f64; 2]>> = poly
            .rings
            .iter()
            .map(|r| r.iter().map(|&p| self.to_px(p)).collect())
            .collect();
        let bb = BBox::of(rings.iter().flatten().copied());
        let y0 = bb.min[1].floor().max(0.0) as usize;
        let y1 = (bb.max[1].ceil() as usize).min(self.h.saturating_sub(1));
        for y in y0..=y1.max(y0) {
            let yc = y as f64 + 0.5;
            let mut xs: Vec<f64> = Vec::new();
            for ring in &rings {
                let n = ring.len();
                if n < 2 {
                    continue;
                }
                let mut j = n - 1;
                for i in 0..n {
                    let (a, b) = (ring[i], ring[j]);
                    if (a[1] > yc) != (b[1] > yc) {
                        xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
                    }
                    j = i;
                }
            }
            xs.sort_by(|p, q| p.partial_cmp(q).unwrap());
            for pair in xs.chunks(2) {
                if let [xa, xb] = pair {
                    let x0 = xa.round().max(0.0) as usize;
                    let x1 = (xb.round() as usize).min(self.w.saturating_sub(1));
                    for x in x0..=x1.max(x0).min(self.w - 1) {
                        if *xa <= x as f64 + 0.5 && x as f64 + 0.5 <= *xb {
                            self.put(x as i64, y as i64, c);
                        }
                    }
                }
            }
        }
    }

    pub fn draw_line(&mut self, a: [f64; 2], b: [f64; 2], width_px: f64, c: [u8; 3]) {
        let (pa, pb) = (self.to_px(a), self.to_px(b));
        let steps = ((pb[0] - pa[0]).abs().max((pb[1] - pa[1]).abs()).ceil() as usize).max(1);
        let r = (width_px / 2.0).max(0.5);
        for s in 0..=steps {
            let t = s as f64 / steps as f64;
            let (x, y) = (pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t);
            let ri = r.ceil() as i64;
            for dy in -ri..=ri {
                for dx in -ri..=ri {
                    if (dx * dx + dy * dy) as f64 <= r * r {
                        self.put(x as i64 + dx, y as i64 + dy, c);
                    }
                }
            }
        }
    }

    /// Promote water pixels inside a world-space city/route land pad to land.
    /// Existing land, mountains, and rivers are preserved. The road graph is the
    /// gameplay truth here: land roads and inland cities must never be flooded by
    /// a generalized coastline raster.
    pub fn stamp_land_disc(&mut self, center: [f64; 2], radius_km: f64) -> usize {
        let c = self.to_px(center);
        let r = radius_km * self.scale;
        let min_x = (c[0] - r).floor().max(0.0) as i64;
        let max_x = (c[0] + r).ceil().min(self.w.saturating_sub(1) as f64) as i64;
        let min_y = (c[1] - r).floor().max(0.0) as i64;
        let max_y = (c[1] + r).ceil().min(self.h.saturating_sub(1) as f64) as i64;
        let rr = r * r;
        let mut changed = 0;
        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let dx = x as f64 + 0.5 - c[0];
                let dy = y as f64 + 0.5 - c[1];
                if dx * dx + dy * dy <= rr {
                    changed += self.put_land_if_water(x, y);
                }
            }
        }
        changed
    }

    pub fn stamp_land_capsule(&mut self, a: [f64; 2], b: [f64; 2], radius_km: f64) -> usize {
        let pa = self.to_px(a);
        let pb = self.to_px(b);
        let r = radius_km * self.scale;
        let min_x = (pa[0].min(pb[0]) - r).floor().max(0.0) as i64;
        let max_x = (pa[0].max(pb[0]) + r)
            .ceil()
            .min(self.w.saturating_sub(1) as f64) as i64;
        let min_y = (pa[1].min(pb[1]) - r).floor().max(0.0) as i64;
        let max_y = (pa[1].max(pb[1]) + r)
            .ceil()
            .min(self.h.saturating_sub(1) as f64) as i64;
        let vx = pb[0] - pa[0];
        let vy = pb[1] - pa[1];
        let len2 = (vx * vx + vy * vy).max(1.0);
        let rr = r * r;
        let mut changed = 0;
        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let px = x as f64 + 0.5;
                let py = y as f64 + 0.5;
                let t = (((px - pa[0]) * vx + (py - pa[1]) * vy) / len2).clamp(0.0, 1.0);
                let dx = px - (pa[0] + vx * t);
                let dy = py - (pa[1] + vy * t);
                if dx * dx + dy * dy <= rr {
                    changed += self.put_land_if_water(x, y);
                }
            }
        }
        changed
    }

    pub fn write_png(&self, path: &str) {
        let f = std::fs::File::create(path).unwrap();
        let mut enc = png::Encoder::new(std::io::BufWriter::new(f), self.w as u32, self.h as u32);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        enc.write_header()
            .unwrap()
            .write_image_data(&self.px)
            .unwrap();
    }
}

pub fn paint(
    bb: BBox,
    px_per_km: f64,
    land: &[Poly],
    lakes: &[Poly],
    mountains: &[Poly],
    rivers: &[Vec<[f64; 2]>],
) -> Raster {
    let mut r = Raster::new(bb, px_per_km);
    let visible = |p: &Poly| {
        p.bbox.max[0] >= bb.min[0]
            && p.bbox.min[0] <= bb.max[0]
            && p.bbox.max[1] >= bb.min[1]
            && p.bbox.min[1] <= bb.max[1]
    };
    for p in land.iter().filter(|p| visible(p)) {
        r.fill_poly(p, LAND);
    }
    for p in mountains.iter().filter(|p| visible(p)) {
        r.fill_poly(p, MOUNTAIN);
    }
    for line in rivers {
        for w in line.windows(2) {
            if bb.contains(w[0]) || bb.contains(w[1]) {
                r.draw_line(w[0], w[1], 1.2, RIVER);
            }
        }
    }
    for p in lakes.iter().filter(|p| visible(p)) {
        r.fill_poly(p, LAKE);
    }
    r
}
