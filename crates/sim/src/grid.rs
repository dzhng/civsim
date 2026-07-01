//! Hashed uniform grid (counting-sort layout, no per-tick allocation after
//! warmup). Cells are hashed into a power-of-two table, so the battlefield
//! needs no fixed bounds. Deterministic for identical input.

pub struct SpatialHash {
    pub(crate) cell_size: f32,
    table_mask: usize,
    /// starts[b]..starts[b+1] is bucket b's slice of `entries`.
    pub(crate) starts: Vec<u32>,
    pub(crate) entries: Vec<u32>,
}

impl SpatialHash {
    pub fn new() -> Self {
        Self {
            cell_size: 1.0,
            table_mask: 0,
            starts: Vec::new(),
            entries: Vec::new(),
        }
    }

    pub(crate) fn bucket(&self, cx: i32, cy: i32) -> usize {
        let h = cx.wrapping_mul(92_837_111) ^ cy.wrapping_mul(689_287_499);
        (h as usize) & self.table_mask
    }

    fn bucket_of(&self, positions: &[f32], i: usize) -> usize {
        let cx = (positions[2 * i] / self.cell_size).floor() as i32;
        let cy = (positions[2 * i + 1] / self.cell_size).floor() as i32;
        self.bucket(cx, cy)
    }

    pub fn rebuild(&mut self, cell_size: f32, positions: &[f32]) {
        let n = positions.len() / 2;
        self.cell_size = cell_size;
        let table = (2 * n).next_power_of_two().max(64);
        self.table_mask = table - 1;
        self.starts.clear();
        self.starts.resize(table + 1, 0);
        self.entries.resize(n, 0);
        for i in 0..n {
            let b = self.bucket_of(positions, i);
            self.starts[b] += 1;
        }
        let mut sum = 0u32;
        for s in self.starts.iter_mut() {
            sum += *s;
            *s = sum;
        }
        for i in 0..n {
            let b = self.bucket_of(positions, i);
            self.starts[b] -= 1;
            self.entries[self.starts[b] as usize] = i as u32;
        }
    }
}

impl Default for SpatialHash {
    fn default() -> Self {
        Self::new()
    }
}
