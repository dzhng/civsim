//! A dragged front edge owns both the preview and the issued formation orders.
use crate::unit::{OrderMode, QueuedOrder, Unit};
use crate::{Sim, Vec2};

#[derive(Clone, Debug)]
pub struct FormationPlacement {
    pub unit: usize,
    pub target: Vec2,
    pub facing: f32,
    pub files: usize,
}

impl Sim {
    /// Paint a front edge from left to right; ranks extend behind its left-hand normal.
    pub fn formation_line(
        &self,
        units: &[usize],
        start: Vec2,
        end: Vec2,
    ) -> Vec<FormationPlacement> {
        let delta = end - start;
        let length = delta.len();
        if !length.is_finite() || length < 0.001 {
            return Vec::new();
        }
        let right = delta * (1.0 / length);
        let facing = right.y.atan2(right.x) + std::f32::consts::FRAC_PI_2;
        let mut selected: Vec<_> = units
            .iter()
            .copied()
            .filter(|&i| {
                self.units
                    .get(i)
                    .is_some_and(|u| u.alive_count > 0 && !u.routing)
            })
            .collect();
        selected.sort_unstable();
        selected.dedup();
        selected.sort_by(|&a, &b| {
            self.units[a]
                .anchor
                .dot(right)
                .total_cmp(&self.units[b].anchor.dot(right))
                .then(a.cmp(&b))
        });
        if selected.is_empty() {
            return Vec::new();
        }
        // Leave two soldier spacings between neighbouring blocks.
        let gaps: Vec<_> = selected
            .windows(2)
            .map(|pair| {
                2.0 * self.units[pair[0]]
                    .spacing
                    .x
                    .max(self.units[pair[1]].spacing.x)
            })
            .collect();
        let available = (length - gaps.iter().sum::<f32>()).max(0.0);
        let weights: Vec<_> = selected
            .iter()
            .map(|&i| {
                let u = &self.units[i];
                u.files.max(2) as f32 * u.spacing.x
            })
            .collect();
        let weight_sum = weights.iter().sum::<f32>();
        let minimums: Vec<_> = selected
            .iter()
            .map(|&i| {
                let u = &self.units[i];
                (*Unit::files_bounds(u.alive_count).start() - 1) as f32 * u.spacing.x
            })
            .collect();
        let extra = (available - minimums.iter().sum::<f32>()).max(0.0);
        let ideals: Vec<_> = weights
            .iter()
            .enumerate()
            .map(|(n, w)| minimums[n] + extra * w / weight_sum)
            .collect();
        let mut files: Vec<_> = selected
            .iter()
            .enumerate()
            .map(|(n, &i)| {
                let u = &self.units[i];
                let bounds = Unit::files_bounds(u.alive_count);
                (ideals[n] / u.spacing.x + 1.0)
                    .floor()
                    .clamp(*bounds.start() as f32, *bounds.end() as f32) as usize
            })
            .collect();
        let width = |n: usize, files: usize| {
            let u = &self.units[selected[n]];
            (files.min(u.alive_count).saturating_sub(1)) as f32 * u.spacing.x
        };
        let mut remaining = available
            - files
                .iter()
                .enumerate()
                .map(|(n, &f)| width(n, f))
                .sum::<f32>();
        // Spend rounding leftovers on whole files, without extending past the cursor.
        loop {
            let next = (0..selected.len())
                .filter(|&n| {
                    let u = &self.units[selected[n]];
                    files[n] < (*Unit::files_bounds(u.alive_count).end()).min(u.alive_count)
                        && u.spacing.x <= remaining + 0.0001
                })
                .max_by(|&a, &b| {
                    let deficit =
                        |n| (ideals[n] - width(n, files[n])) / self.units[selected[n]].spacing.x;
                    deficit(a).total_cmp(&deficit(b)).then(b.cmp(&a))
                });
            let Some(n) = next else {
                break;
            };
            files[n] += 1;
            remaining -= self.units[selected[n]].spacing.x;
        }
        let mut cursor = start;
        selected
            .iter()
            .enumerate()
            .map(|(n, &unit)| {
                let span = width(n, files[n]);
                let placement = FormationPlacement {
                    unit,
                    target: crate::path::clamp_to_passable(
                        &self.terrain,
                        self.units[unit].anchor,
                        cursor + right * (span / 2.0),
                    ),
                    facing,
                    files: files[n],
                };
                cursor = cursor + right * (span + gaps.get(n).copied().unwrap_or(0.0));
                placement
            })
            .collect()
    }

    pub fn order_formation_line(&mut self, units: &[usize], start: Vec2, end: Vec2, queued: bool) {
        for p in self.formation_line(units, start, end) {
            if queued {
                self.enqueue_command(
                    p.unit,
                    QueuedOrder {
                        mode: OrderMode::Move,
                        target: p.target,
                        facing: Some(p.facing),
                        files: Some(p.files),
                    },
                );
            } else {
                self.set_move_order_facing(p.unit, p.target, p.facing);
                self.set_files(p.unit, p.files);
            }
        }
    }
}
