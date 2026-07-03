use crate::geo::{dist, BBox};
use crate::raster::Raster;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const GRID_STEP_KM: f64 = 50.0;
const COAST_SCAN_KM: f64 = 40.0;

#[derive(Debug, Deserialize, Serialize, PartialEq)]
pub struct MaskProbe {
    pub meta: ProbeMeta,
    pub grid: Vec<(f64, f64, bool)>,
    pub cities: Vec<CityProbe>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
pub struct ProbeMeta {
    pub bg_rect: BgRect,
    pub px_per_km: PxPerKm,
    pub grid_step_km: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
pub struct BgRect {
    pub min: [f64; 2],
    pub max: [f64; 2],
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
pub struct PxPerKm {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
pub struct CityProbe {
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub land: bool,
    pub coast_km: Option<f64>,
}

#[derive(Deserialize)]
struct MapFixture {
    nodes: Vec<NodeFixture>,
}

#[derive(Deserialize)]
struct NodeFixture {
    name: String,
    pos: [f64; 2],
    kind: String,
}

struct BgMask {
    rect: BgRect,
    w: usize,
    h: usize,
    px: Vec<u8>,
}

impl BgMask {
    fn sx(&self) -> f64 {
        self.w as f64 / (self.rect.max[0] - self.rect.min[0])
    }

    fn sy(&self) -> f64 {
        self.h as f64 / (self.rect.max[1] - self.rect.min[1])
    }

    fn pixel_of(&self, p: [f64; 2]) -> Option<[usize; 2]> {
        if p[0] < self.rect.min[0]
            || p[0] > self.rect.max[0]
            || p[1] < self.rect.min[1]
            || p[1] > self.rect.max[1]
        {
            return None;
        }
        let x = ((p[0] - self.rect.min[0]) * self.sx()).floor();
        let y = ((self.rect.max[1] - p[1]) * self.sy()).floor();
        Some([
            (x as isize).clamp(0, self.w as isize - 1) as usize,
            (y as isize).clamp(0, self.h as isize - 1) as usize,
        ])
    }

    fn pixel_center(&self, x: usize, y: usize) -> [f64; 2] {
        [
            self.rect.min[0] + (x as f64 + 0.5) / self.sx(),
            self.rect.max[1] - (y as f64 + 0.5) / self.sy(),
        ]
    }

    fn land_cell(&self, x: usize, y: usize) -> bool {
        let i = (y * self.w + x) * 4;
        Raster::rgb_is_land([self.px[i], self.px[i + 1], self.px[i + 2]])
    }

    fn land_at(&self, p: [f64; 2]) -> bool {
        self.pixel_of(p)
            .map(|[x, y]| self.land_cell(x, y))
            .unwrap_or(false)
    }

    fn coast_km(&self, p: [f64; 2], max_radius_km: f64) -> Option<f64> {
        let [cx, cy] = self.pixel_of(p)?;
        let center_land = self.land_cell(cx, cy);
        let r = (max_radius_km * self.sx().max(self.sy())).ceil() as isize;
        let mut best: Option<f64> = None;
        for dy in -r..=r {
            let y = cy as isize + dy;
            if y < 0 || y >= self.h as isize {
                continue;
            }
            for dx in -r..=r {
                let x = cx as isize + dx;
                if x < 0 || x >= self.w as isize {
                    continue;
                }
                if self.land_cell(x as usize, y as usize) == center_land {
                    continue;
                }
                let d = dist(p, self.pixel_center(x as usize, y as usize));
                if d <= max_radius_km && best.map(|b| d < b).unwrap_or(true) {
                    best = Some(d);
                }
            }
        }
        best.map(round_km)
    }
}

pub fn write_committed_probe() {
    let root = repo_root();
    write_probe(
        &root.join("web/public/data"),
        &root.join("specs/campaign-map-bugs/assets/probe/mask-probe.json"),
    );
}

#[cfg(test)]
pub fn build_committed_probe() -> MaskProbe {
    build_probe(&repo_root().join("web/public/data"))
}

#[cfg(test)]
pub fn committed_probe_path() -> PathBuf {
    repo_root().join("specs/campaign-map-bugs/assets/probe/mask-probe.json")
}

fn write_probe(data_dir: &Path, out_path: &Path) {
    let probe = build_probe(data_dir);
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(
        out_path,
        serde_json::to_string_pretty(&probe).unwrap() + "\n",
    )
    .unwrap();
    eprintln!("wrote {}", out_path.display());
}

fn build_probe(data_dir: &Path) -> MaskProbe {
    let map: MapFixture =
        serde_json::from_str(&std::fs::read_to_string(data_dir.join("campaign-map.json")).unwrap())
            .unwrap();
    let rect: BgRect =
        serde_json::from_str(&std::fs::read_to_string(data_dir.join("campaign-bg.json")).unwrap())
            .unwrap();
    let (w, h, px) = read_png(&data_dir.join("campaign-bg.png"));
    let bg = BgMask { rect, w, h, px };

    let mut grid = Vec::new();
    let bb = BBox {
        min: rect.min,
        max: rect.max,
    };
    let mut y = bb.min[1];
    while y <= bb.max[1] + f64::EPSILON {
        let mut x = bb.min[0];
        while x <= bb.max[0] + f64::EPSILON {
            grid.push((round_km(x), round_km(y), bg.land_at([x, y])));
            x += GRID_STEP_KM;
        }
        y += GRID_STEP_KM;
    }

    let cities = map
        .nodes
        .into_iter()
        .filter(|n| n.kind == "city")
        .map(|n| {
            let land = bg.land_at(n.pos);
            CityProbe {
                name: n.name,
                x: n.pos[0],
                y: n.pos[1],
                land,
                coast_km: bg.coast_km(n.pos, COAST_SCAN_KM),
            }
        })
        .collect();

    MaskProbe {
        meta: ProbeMeta {
            bg_rect: rect,
            px_per_km: PxPerKm {
                x: bg.sx(),
                y: bg.sy(),
            },
            grid_step_km: GRID_STEP_KM,
        },
        grid,
        cities,
    }
}

pub(crate) fn read_png(path: &Path) -> (usize, usize, Vec<u8>) {
    let file = std::fs::File::open(path).unwrap();
    let decoder = png::Decoder::new(file);
    let mut reader = decoder.read_info().unwrap();
    let mut buf = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).unwrap();
    assert_eq!(info.color_type, png::ColorType::Rgba);
    assert_eq!(info.bit_depth, png::BitDepth::Eight);
    (
        info.width as usize,
        info.height as usize,
        buf[..info.buffer_size()].to_vec(),
    )
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn round_km(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}
