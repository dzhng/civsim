//! Background raster: stylized parchment-and-sea map painted from Natural Earth
//! layers, written as PNG. The campaign renderer drapes this under the road graph.

use crate::geo::BBox;
use crate::sources::Poly;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RenderMaskClass {
    Sea,
    Land,
    Mountain,
    Lake,
    River,
}

impl RenderMaskClass {
    pub fn rgb(self) -> [u8; 3] {
        match self {
            RenderMaskClass::Sea => [38, 60, 84],
            RenderMaskClass::Land => [196, 178, 138],
            RenderMaskClass::Mountain => [142, 120, 96],
            RenderMaskClass::Lake => [52, 84, 110],
            RenderMaskClass::River => [60, 96, 124],
        }
    }

    pub fn is_land(self) -> bool {
        matches!(
            self,
            RenderMaskClass::Land | RenderMaskClass::Mountain | RenderMaskClass::River
        )
    }
}

pub struct Raster {
    pub w: usize,
    pub h: usize,
    pub px: Vec<u8>, // RGBA8
    bb: BBox,
    scale: f64, // px per km
}

// TWIN: web/src/campaign/terrain.ts classifies map pixels by nearest match
// against these exact colors — recolor here, recolor there.
pub const RENDER_MASK_CLASSES: [RenderMaskClass; 5] = [
    RenderMaskClass::Sea,
    RenderMaskClass::Land,
    RenderMaskClass::Mountain,
    RenderMaskClass::Lake,
    RenderMaskClass::River,
];

/// A strait too narrow for the 50m coastline vector — and, downstream, for the
/// frontend's 8 km terrain grid — to resolve, so it paints as a fake land
/// bridge. `carve_straits` repaints the channel to Sea: every raster cell within
/// `half_w_km` of the `centerline` polyline becomes water. This is the ONE owner
/// of "a strait is water" — `web/src/campaign/terrain.ts` reads the same
/// committed PNG, so there is no separate frontend hack.
///
/// The carved channel must survive the frontend's 8 km downsample (terrain.ts
/// cell = 8), so a corridor is sized to leave >= 2 water cells across the
/// narrowest point after downsampling — the STRAIT-WATER invariant in main.rs
/// measures the result, not the carve width, because the endpoint ports sit
/// only ~16 km apart and a uniformly-16 km corridor would drown them.
pub struct StraitCarve {
    pub name: &'static str,
    pub centerline: &'static [[f64; 2]],
    pub half_w_km: f64,
}

pub const STRAIT_CARVES: &[StraitCarve] = &[
    // Messina: separate Sicily (Messana) from the Calabrian toe (Rhegium). The
    // centerline threads the existing sea channel so neither port is drowned.
    StraitCarve {
        name: "Messina",
        centerline: &[
            [-205.0, 44.0],
            [-210.0, 28.0],
            [-213.0, 14.0],
            [-217.0, -4.0],
        ],
        half_w_km: 5.0,
    },
    // Bosphorus: separate Constantinopolis (European bank) from Asia Minor,
    // connecting the Black Sea (N) to the Marmara (S). Hugs just east of
    // Constantinopolis [917, 394] so a narrow carve keeps its harbor on land.
    StraitCarve {
        name: "Bosphorus",
        centerline: &[
            [926.0, 424.0],
            [925.0, 404.0],
            [924.0, 390.0],
            [923.0, 384.0],
            [921.0, 378.0],
        ],
        half_w_km: 4.5,
    },
    // Gulf of Izmit: the real E-W gulf Nicomedia sits at the head of, absent from
    // the 50m coastline, so the Const<->Nicomedia lane crossed solid Bithynian
    // land. Open it from the Marmara east to Nicomedia's [1000, 373] doorstep so
    // the lane rides water; ends short of Nicomedia to keep its harbor on land.
    StraitCarve {
        name: "Gulf of Izmit",
        centerline: &[
            [935.0, 378.0],
            [945.0, 371.0],
            [970.0, 372.0],
            [990.0, 373.0],
        ],
        half_w_km: 5.0,
    },
];

impl Raster {
    pub fn new(bb: BBox, px_per_km: f64) -> Raster {
        let w = ((bb.max[0] - bb.min[0]) * px_per_km).ceil() as usize;
        let h = ((bb.max[1] - bb.min[1]) * px_per_km).ceil() as usize;
        let mut px = vec![0u8; w * h * 4];
        for i in 0..w * h {
            px[i * 4..i * 4 + 3].copy_from_slice(&RenderMaskClass::Sea.rgb());
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

    /// Rehydrate a raster from committed RGBA pixels — the invariant tests wrap
    /// the committed campaign-bg.png so they query it through the same
    /// classification owner the bake used.
    pub fn from_rgba(bb: BBox, w: usize, h: usize, px: Vec<u8>) -> Raster {
        assert_eq!(px.len(), w * h * 4, "raster pixel buffer size mismatch");
        let scale = w as f64 / (bb.max[0] - bb.min[0]);
        Raster {
            w,
            h,
            px,
            bb,
            scale,
        }
    }

    pub fn classify_rgb(rgb: [u8; 3]) -> RenderMaskClass {
        let mut best = RenderMaskClass::Sea;
        let mut best_d = u32::MAX;
        for class in RENDER_MASK_CLASSES {
            let c = class.rgb();
            let d = (rgb[0] as i32 - c[0] as i32).pow(2) as u32
                + (rgb[1] as i32 - c[1] as i32).pow(2) as u32
                + (rgb[2] as i32 - c[2] as i32).pow(2) as u32;
            if d < best_d {
                best_d = d;
                best = class;
            }
        }
        best
    }

    pub fn rgb_is_land(rgb: [u8; 3]) -> bool {
        Self::classify_rgb(rgb).is_land()
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

    pub fn cell_of(&self, p: [f64; 2]) -> Option<[usize; 2]> {
        let sx = self.w as f64 / (self.bb.max[0] - self.bb.min[0]);
        let sy = self.h as f64 / (self.bb.max[1] - self.bb.min[1]);
        let q = [(p[0] - self.bb.min[0]) * sx, (self.bb.max[1] - p[1]) * sy];
        if q[0] < 0.0 || q[1] < 0.0 || q[0] >= self.w as f64 || q[1] >= self.h as f64 {
            return None;
        }
        Some([q[0].floor() as usize, q[1].floor() as usize])
    }

    pub fn cell_center(&self, x: usize, y: usize) -> [f64; 2] {
        let cell_w = (self.bb.max[0] - self.bb.min[0]) / self.w as f64;
        let cell_h = (self.bb.max[1] - self.bb.min[1]) / self.h as f64;
        [
            self.bb.min[0] + (x as f64 + 0.5) * cell_w,
            self.bb.max[1] - (y as f64 + 0.5) * cell_h,
        ]
    }

    pub fn is_land_cell(&self, x: usize, y: usize) -> bool {
        self.classify_cell(x, y)
            .map(RenderMaskClass::is_land)
            .unwrap_or(false)
    }

    pub fn is_land_neighborhood(&self, x: usize, y: usize, margin_cells: usize) -> bool {
        let margin = margin_cells as isize;
        for dy in -margin..=margin {
            let yy = y as isize + dy;
            if yy < 0 || yy >= self.h as isize {
                return false;
            }
            for dx in -margin..=margin {
                let xx = x as isize + dx;
                if xx < 0 || xx >= self.w as isize {
                    return false;
                }
                if !self.is_land_cell(xx as usize, yy as usize) {
                    return false;
                }
            }
        }
        true
    }

    pub fn classify_cell(&self, x: usize, y: usize) -> Option<RenderMaskClass> {
        if x >= self.w || y >= self.h {
            return None;
        }
        let i = (y * self.w + x) * 4;
        Some(Self::classify_rgb([
            self.px[i],
            self.px[i + 1],
            self.px[i + 2],
        ]))
    }

    pub fn nearest_land_neighborhood_center(
        &self,
        p: [f64; 2],
        max_radius_km: f64,
        margin_cells: usize,
    ) -> Option<[f64; 2]> {
        let [cx, cy] = self.cell_of(p)?;
        let cell_km = ((self.bb.max[0] - self.bb.min[0]) / self.w as f64)
            .max((self.bb.max[1] - self.bb.min[1]) / self.h as f64);
        let r = (max_radius_km / cell_km).ceil() as isize;
        let mut best: Option<([f64; 2], f64)> = None;
        for dy in -r..=r {
            let y = cy as isize + dy;
            if y < 0 || y >= self.h as isize {
                continue;
            }
            for dx in -r..=r {
                let x = cx as isize + dx;
                if x < 0
                    || x >= self.w as isize
                    || !self.is_land_neighborhood(x as usize, y as usize, margin_cells)
                {
                    continue;
                }
                let q = self.cell_center(x as usize, y as usize);
                let d2 = (p[0] - q[0]).powi(2) + (p[1] - q[1]).powi(2);
                match best {
                    Some((_, bd2)) if bd2 <= d2 => {}
                    _ => best = Some((q, d2)),
                }
            }
        }
        best.map(|(q, _)| q)
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

    /// Repaint each strait corridor to Sea (see `StraitCarve`). Runs after
    /// `paint()` and before `build()` so city-snap, the ownership flood, and
    /// landroute all reason about the carved water.
    pub fn carve_straits(&mut self, carves: &[StraitCarve]) {
        let sea = RenderMaskClass::Sea.rgb();
        for carve in carves {
            let width_px = carve.half_w_km * 2.0 * self.scale;
            for w in carve.centerline.windows(2) {
                self.draw_line(w[0], w[1], width_px, sea);
            }
        }
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
        r.fill_poly(p, RenderMaskClass::Land.rgb());
    }
    for p in mountains.iter().filter(|p| visible(p)) {
        r.fill_poly(p, RenderMaskClass::Mountain.rgb());
    }
    for line in rivers {
        for w in line.windows(2) {
            if bb.contains(w[0]) || bb.contains(w[1]) {
                r.draw_line(w[0], w[1], 1.2, RenderMaskClass::River.rgb());
            }
        }
    }
    for p in lakes.iter().filter(|p| visible(p)) {
        r.fill_poly(p, RenderMaskClass::Lake.rgb());
    }
    r
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect_poly(x0: f64, y0: f64, x1: f64, y1: f64) -> Poly {
        let ring = vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
        Poly {
            bbox: BBox::of(ring.iter().copied()),
            rings: vec![ring],
        }
    }

    fn assert_written_pixels_classify_as(
        before: &[u8],
        raster: &Raster,
        expected: RenderMaskClass,
        label: &str,
    ) {
        let mut changed = 0usize;
        for i in 0..raster.w * raster.h {
            let off = i * 4;
            if before[off..off + 3] != raster.px[off..off + 3] {
                changed += 1;
                let got =
                    Raster::classify_rgb([raster.px[off], raster.px[off + 1], raster.px[off + 2]]);
                assert_eq!(got, expected, "{label} wrote pixel {i} as {got:?}");
            }
        }
        assert!(changed > 0, "{label} did not paint any pixels");
    }

    #[test]
    fn painter_pixels_round_trip_through_render_mask_classifier() {
        let bb = BBox {
            min: [0.0, 0.0],
            max: [32.0, 32.0],
        };

        for class in [
            RenderMaskClass::Land,
            RenderMaskClass::Mountain,
            RenderMaskClass::Lake,
        ] {
            let mut raster = Raster::new(bb, 1.0);
            let before = raster.px.clone();
            raster.fill_poly(&rect_poly(4.0, 4.0, 18.0, 18.0), class.rgb());
            assert_written_pixels_classify_as(&before, &raster, class, "fill_poly");
        }

        let mut raster = Raster::new(bb, 1.0);
        let before = raster.px.clone();
        raster.draw_line([2.0, 2.0], [28.0, 24.0], 2.0, RenderMaskClass::River.rgb());
        assert_written_pixels_classify_as(&before, &raster, RenderMaskClass::River, "draw_line");

        for class in RENDER_MASK_CLASSES {
            assert_eq!(
                Raster::rgb_is_land(class.rgb()),
                class.is_land(),
                "{class:?} land flag changed"
            );
        }
    }
}
