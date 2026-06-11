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
        Raster { w, h, px, bb, scale: px_per_km }
    }

    /// World km → pixel (y flipped: world +y north, raster row 0 top).
    fn to_px(&self, p: [f64; 2]) -> [f64; 2] {
        [(p[0] - self.bb.min[0]) * self.scale, (self.bb.max[1] - p[1]) * self.scale]
    }

    fn put(&mut self, x: i64, y: i64, c: [u8; 3]) {
        if x >= 0 && y >= 0 && (x as usize) < self.w && (y as usize) < self.h {
            let i = (y as usize * self.w + x as usize) * 4;
            self.px[i..i + 3].copy_from_slice(&c);
        }
    }

    /// Scanline even-odd fill of one polygon (with holes) in pixel space.
    pub fn fill_poly(&mut self, poly: &Poly, c: [u8; 3]) {
        let rings: Vec<Vec<[f64; 2]>> =
            poly.rings.iter().map(|r| r.iter().map(|&p| self.to_px(p)).collect()).collect();
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

    pub fn write_png(&self, path: &str) {
        let f = std::fs::File::create(path).unwrap();
        let mut enc = png::Encoder::new(std::io::BufWriter::new(f), self.w as u32, self.h as u32);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        enc.write_header().unwrap().write_image_data(&self.px).unwrap();
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
    let visible = |p: &Poly| p.bbox.max[0] >= bb.min[0] && p.bbox.min[0] <= bb.max[0] && p.bbox.max[1] >= bb.min[1] && p.bbox.min[1] <= bb.max[1];
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
