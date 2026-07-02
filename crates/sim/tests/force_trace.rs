#![cfg(feature = "force-trace")]

mod common;

use common::force_trace::{
    cap_hit_histograms, per_soldier_ledger, seam_crossing_decomposition,
    unit_force_budget_by_channel,
};
use common::no_morale_parade;
use sim::{
    class_stats, ForceChannel, ForceTraceFilter, Pace, Sim, Tunables, UnitClassId, Vec2, DT,
};
use std::collections::{BTreeMap, BTreeSet};
use std::f32::consts::PI;

fn traced_heavy_clash(seconds: f32) -> Sim {
    let mut sim = Sim::new(no_morale_parade(), 0x5150);
    let a = sim.spawn_class_with_files(
        Vec2::new(0.0, -9.0),
        PI * 0.5,
        96,
        12,
        UnitClassId::HeavySword,
        0,
    );
    let b = sim.spawn_class_with_files(
        Vec2::new(0.0, 9.0),
        -PI * 0.5,
        96,
        12,
        UnitClassId::HeavySword,
        1,
    );
    sim.set_pace(a, Pace::Run);
    sim.set_pace(b, Pace::Run);
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    sim.clear_force_trace();
    for _ in 0..(seconds / DT) as usize {
        sim.tick();
    }
    sim
}

fn traced_probe_clash(seconds: f32) -> Sim {
    let mut sim = Sim::new(no_morale_parade(), 0x5150);
    let a = sim.spawn_class_with_files(
        Vec2::new(0.0, -7.0),
        PI * 0.5,
        48,
        8,
        UnitClassId::HeavySword,
        0,
    );
    let b = sim.spawn_class_with_files(
        Vec2::new(0.0, 7.0),
        -PI * 0.5,
        48,
        8,
        UnitClassId::HeavySword,
        1,
    );
    sim.set_pace(a, Pace::Run);
    sim.set_pace(b, Pace::Run);
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    sim.clear_force_trace();
    for _ in 0..(seconds / DT) as usize {
        sim.tick();
    }
    sim
}

fn trace_env_bool(name: &str) -> Option<bool> {
    std::env::var(name).ok().map(|v| {
        let v = v.trim().to_ascii_lowercase();
        !(v == "0" || v == "false" || v == "off" || v == "no")
    })
}

fn apply_trace_env_overrides(tun: &mut Tunables) {
    if let Ok(v) = std::env::var("SLIDE") {
        tun.separation_slide = v.parse().unwrap();
    }
    if let Ok(v) = std::env::var("TIEBREAK") {
        tun.body_separation_tiebreak = v.parse().unwrap();
    }
    if let Ok(v) = std::env::var("MAGNET") {
        tun.magnet_strength = v.parse().unwrap();
    }
    if let Some(on) = trace_env_bool("DEEPREFORM") {
        tun.engaged_deep_reform = on;
    }
    if let Some(on) = trace_env_bool("FLANKCURL") {
        tun.seeking_flank_curl = on;
    }
}

fn traced_attribution_heavy(seed: u64, immortal: bool) -> (Sim, usize, usize) {
    let mut tun = no_morale_parade();
    apply_trace_env_overrides(&mut tun);
    let mut sim = Sim::new(tun, seed);
    let stats = class_stats(UnitClassId::HeavySword);
    let a = sim.spawn_class_stats_with_files(
        Vec2::new(0.0, -13.0),
        PI * 0.5,
        240,
        24,
        UnitClassId::HeavySword,
        stats,
        0,
    );
    let b = sim.spawn_class_stats_with_files(
        Vec2::new(0.0, 13.0),
        -PI * 0.5,
        240,
        24,
        UnitClassId::HeavySword,
        stats,
        1,
    );
    if immortal {
        for k in 0..sim.soldier_count() {
            sim.health[k] = 1.0e9;
        }
    }
    sim.set_pace(a, Pace::Run);
    sim.set_pace(b, Pace::Run);
    sim.set_attack_order(a, b);
    sim.set_attack_order(b, a);
    let units = BTreeSet::from([a, b]);
    sim.set_force_trace_filter(ForceTraceFilter {
        units: Some(units),
        ..ForceTraceFilter::default()
    });
    (sim, a, b)
}

fn traced_live_positions(sim: &Sim, unit: usize) -> Vec<(usize, Vec2)> {
    let u = &sim.units[unit];
    (u.start..u.start + u.count)
        .filter(|&s| sim.alive[s] == 1)
        .map(|s| (s, sim.soldier_pos(s)))
        .collect()
}

fn traced_live_centroid(sim: &Sim, unit: usize) -> Vec2 {
    let pts = traced_live_positions(sim, unit);
    if pts.is_empty() {
        return sim.units[unit].centroid;
    }
    let sum = pts.iter().fold(Vec2::ZERO, |acc, &(_, p)| {
        Vec2::new(acc.x + p.x, acc.y + p.y)
    });
    sum * (1.0 / pts.len() as f32)
}

fn traced_engagement_rotation_deg(sim: &Sim, a: usize, b: usize) -> f32 {
    let d = traced_live_centroid(sim, b) - traced_live_centroid(sim, a);
    d.x.atan2(d.y).to_degrees()
}

#[derive(Clone, Debug)]
struct TorqueWindow {
    start: f32,
    end: f32,
    rot_start: f32,
    rot_end: f32,
    by_unit: [BTreeMap<ForceChannel, f32>; 2],
}

#[derive(Clone, Debug)]
struct CapClipWindow {
    start: f32,
    end: f32,
    rot_start: f32,
    rot_end: f32,
    removed_along_pivot: [f32; 2],
    removed_against_pivot: [f32; 2],
    removed_total: [f32; 2],
    samples: [usize; 2],
}

#[test]
#[ignore = "melee-blob: slice 03 long-window torque budget; run with --features force-trace"]
fn write_slice03_torque_budget() {
    for immortal in [true, false] {
        let (mut sim, a, b) = traced_attribution_heavy(0x4202, immortal);
        let mut windows: Vec<TorqueWindow> = (0..4)
            .map(|idx| {
                let start = 300.0 + idx as f32 * 25.0;
                TorqueWindow {
                    start,
                    end: start + 25.0,
                    rot_start: 0.0,
                    rot_end: 0.0,
                    by_unit: [BTreeMap::new(), BTreeMap::new()],
                }
            })
            .collect();
        let end_tick = (400.0 / DT) as usize;
        for step in 1..=end_tick {
            let t = step as f32 * DT;
            if t < 300.0 {
                sim.clear_force_trace();
                sim.tick();
                continue;
            }
            sim.clear_force_trace();
            sim.tick();
            for window in &mut windows {
                if t < window.start || t >= window.end {
                    continue;
                }
                if window.rot_start == 0.0 {
                    window.rot_start = traced_engagement_rotation_deg(&sim, a, b);
                }
                window.rot_end = traced_engagement_rotation_deg(&sim, a, b);
                for (slot, unit) in [a, b].into_iter().enumerate() {
                    let positions = traced_live_positions(&sim, unit);
                    for budget in unit_force_budget_by_channel(
                        &sim.force_trace,
                        unit,
                        sim.tick_count - 1,
                        &positions,
                    ) {
                        *window.by_unit[slot].entry(budget.channel).or_insert(0.0) += budget.torque;
                    }
                }
            }
        }
        for window in &windows {
            for unit_slot in [0usize, 1] {
                let mut rows: Vec<_> = window.by_unit[unit_slot].iter().collect();
                rows.sort_by(|a, b| b.1.abs().total_cmp(&a.1.abs()));
                let total: f32 = window.by_unit[unit_slot].values().copied().sum();
                eprintln!(
                    "SLICE03_TORQUE variant={} unit={} window={:.0}-{:.0}s rot={:.2}->{:.2}deg total_torque={:.4}",
                    if immortal { "immortal" } else { "mortal" },
                    unit_slot,
                    window.start,
                    window.end,
                    window.rot_start,
                    window.rot_end,
                    total,
                );
                for (channel, torque) in rows.into_iter().take(10) {
                    eprintln!(
                        "  SLICE03_TORQUE_CHANNEL variant={} unit={} window={:.0}-{:.0}s channel={channel:?} torque={torque:.4} source={}",
                        if immortal { "immortal" } else { "mortal" },
                        unit_slot,
                        window.start,
                        window.end,
                        channel.source_site(),
                    );
                }
            }
        }
    }
}

#[test]
#[ignore = "melee-blob: slice 04 cap-vs-pivot clipping attribution; run with --features force-trace"]
fn blob_probe_slice04_cap_clips_spring() {
    for immortal in [true, false] {
        let (mut sim, a, b) = traced_attribution_heavy(0x4202, immortal);
        let mut windows: Vec<CapClipWindow> = (0..4)
            .map(|idx| {
                let start = 300.0 + idx as f32 * 25.0;
                CapClipWindow {
                    start,
                    end: start + 25.0,
                    rot_start: 0.0,
                    rot_end: 0.0,
                    removed_along_pivot: [0.0; 2],
                    removed_against_pivot: [0.0; 2],
                    removed_total: [0.0; 2],
                    samples: [0; 2],
                }
            })
            .collect();
        let end_tick = (400.0 / DT) as usize;
        for step in 1..=end_tick {
            let t = step as f32 * DT;
            if t < 300.0 {
                sim.clear_force_trace();
                sim.tick();
                continue;
            }
            sim.clear_force_trace();
            sim.tick();
            let tick = sim.tick_count - 1;
            let mut pivot_by_soldier = BTreeMap::new();
            for record in sim.force_trace.records() {
                if record.tick == tick && record.channel == ForceChannel::PivotSpring {
                    pivot_by_soldier.insert(record.soldier, record.vec);
                }
            }
            for window in &mut windows {
                if t < window.start || t >= window.end {
                    continue;
                }
                if window.rot_start == 0.0 {
                    window.rot_start = traced_engagement_rotation_deg(&sim, a, b);
                }
                window.rot_end = traced_engagement_rotation_deg(&sim, a, b);
                for record in sim.force_trace.records() {
                    if record.tick != tick || record.channel != ForceChannel::SpeedCap {
                        continue;
                    }
                    let Some(pre) = record.pre else { continue };
                    let Some(post) = record.post else { continue };
                    let Some(pivot) = pivot_by_soldier.get(&record.soldier).copied() else {
                        continue;
                    };
                    let pivot_len = pivot.len();
                    if pivot_len <= 1.0e-6 {
                        continue;
                    }
                    let removed = pre - post;
                    let along = removed.dot(pivot * (1.0 / pivot_len));
                    let unit_slot = if record.unit == a {
                        0
                    } else if record.unit == b {
                        1
                    } else {
                        continue;
                    };
                    window.removed_along_pivot[unit_slot] += along.max(0.0);
                    window.removed_against_pivot[unit_slot] += (-along).max(0.0);
                    window.removed_total[unit_slot] += removed.len();
                    window.samples[unit_slot] += 1;
                }
            }
        }
        for window in &windows {
            for unit_slot in [0usize, 1] {
                let along = window.removed_along_pivot[unit_slot];
                let against = window.removed_against_pivot[unit_slot];
                let total = window.removed_total[unit_slot].max(1.0e-6);
                let directional = along / (along + against).max(1.0e-6);
                eprintln!(
                    "SLICE04_CAP_CLIP variant={} unit={} window={:.0}-{:.0}s rot={:.2}->{:.2}deg samples={} removed_total={:.3} removed_parallel_pivot={:.3} removed_antiparallel_pivot={:.3} parallel_frac_of_signed={:.3} parallel_frac_of_total={:.3}",
                    if immortal { "immortal" } else { "mortal" },
                    unit_slot,
                    window.start,
                    window.end,
                    window.rot_start,
                    window.rot_end,
                    window.samples[unit_slot],
                    window.removed_total[unit_slot],
                    along,
                    against,
                    directional,
                    along / total,
                );
            }
        }
    }
}

#[test]
fn force_trace_steering_conserves_pre_collision_displacement() {
    let mut sim = traced_heavy_clash(0.0);
    for _ in 0..(4.0 / DT) as usize {
        sim.tick();
        let tick = sim.tick_count - 1;
        for (soldier, residual) in sim.force_trace_steering_residuals(tick) {
            let err = residual.len();
            assert!(
                err < 2.0e-5,
                "untraced steering displacement at tick {tick} soldier {soldier}: {residual:?}"
            );
        }
    }
}

#[test]
fn force_trace_smoke_covers_expected_channels() {
    let mut sim = traced_heavy_clash(12.0);

    // Force the pure collision channels that a clean line clash may only touch
    // briefly or not at all.
    let c = sim.spawn_unit(
        Vec2::new(-1.0, -1.0),
        0.0,
        8,
        4,
        Vec2::new(0.2, 0.2),
        0,
        0.7,
    );
    let d = sim.spawn_unit(Vec2::new(-1.0, -1.0), PI, 8, 4, Vec2::new(0.2, 0.2), 1, 0.7);
    sim.set_attack_order(c, d);
    sim.set_attack_order(d, c);
    sim.tick();

    let _e = sim.spawn_class_with_files(
        Vec2::new(8.0, -0.9),
        PI * 0.5,
        48,
        12,
        UnitClassId::HeavySword,
        0,
    );
    let _f = sim.spawn_class_with_files(
        Vec2::new(8.0, 0.9),
        -PI * 0.5,
        48,
        12,
        UnitClassId::HeavySword,
        1,
    );
    for _ in 0..8 {
        sim.tick();
    }

    let _p = sim.spawn_class_with_files(
        Vec2::new(-9.0, -0.8),
        PI * 0.5,
        64,
        16,
        UnitClassId::HeavyPhalanx,
        0,
    );
    let _q = sim.spawn_class_with_files(
        Vec2::new(-8.2, 0.8),
        -PI * 0.5,
        64,
        16,
        UnitClassId::HeavyPhalanx,
        1,
    );
    for _ in 0..80 {
        sim.tick();
    }

    let seen: BTreeSet<ForceChannel> = sim
        .force_trace
        .records()
        .iter()
        .map(|r| r.channel)
        .collect();

    let expected = [
        ForceChannel::WeaveNet,
        ForceChannel::CompPush,
        ForceChannel::PivotSpring,
        ForceChannel::EnemyBondWeld,
        ForceChannel::EnemyBondInsideReachPush,
        ForceChannel::SlotPull,
        ForceChannel::CorridorClamp,
        ForceChannel::Magnet,
        ForceChannel::Cruise,
        ForceChannel::SpeedCap,
        ForceChannel::FightingPaceCap,
        ForceChannel::BodySeparationNormal,
        ForceChannel::BodySeparationFriendlySlide,
        ForceChannel::HardWall,
        ForceChannel::ProjectionPass,
        ForceChannel::WeaponRepel,
        ForceChannel::HitPush,
        ForceChannel::KnockbackMomentum,
        ForceChannel::SlotPullLean,
        ForceChannel::PikeLateralFriction,
        ForceChannel::SoldierFacing,
        ForceChannel::UnitFacing,
        ForceChannel::UnitFrame,
    ];
    for channel in expected {
        assert!(seen.contains(&channel), "missing force channel {channel:?}");
    }
    let soldier = sim.units[0].start;
    assert!(!per_soldier_ledger(&sim.force_trace, soldier).is_empty());
    assert!(!cap_hit_histograms(&sim.force_trace).is_empty());
    let crossing = seam_crossing_decomposition(&sim.force_trace, soldier, 0, Vec2::new(0.0, 1.0));
    assert!(crossing.values().all(|v| v.is_finite()));
}

#[test]
#[ignore = "writes specs/melee-blob/visualizations/force-budget-timeline.html"]
fn write_heavy_force_budget_timeline_html() {
    let sim = traced_probe_clash(7.0);
    let repo = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .unwrap()
        .to_path_buf();
    // Raw per-record JSONL is run output for offline analysis, not a reviewable
    // artifact — it goes under target/, never into specs/.
    let raw_dir = repo.join("target/force-trace");
    std::fs::create_dir_all(&raw_dir).unwrap();
    sim.force_trace
        .dump_jsonl(raw_dir.join("force-budget-heavy-v-heavy.jsonl"))
        .unwrap();

    // Per tick × unit × channel: net force vector and torque about the unit
    // centroid, as JSON rows the chart aggregates client-side.
    let mut rows = String::from("[");
    for tick in 0..sim.tick_count {
        for unit in 0..sim.units.len() {
            let positions: Vec<_> = (sim.units[unit].start
                ..sim.units[unit].start + sim.units[unit].count)
                .filter(|&s| sim.alive[s] == 1)
                .map(|s| (s, sim.soldier_pos(s)))
                .collect();
            for budget in unit_force_budget_by_channel(&sim.force_trace, unit, tick, &positions) {
                rows.push_str(&format!(
                    "[{},{},{:?},{:.4},{:.4},{:.4}],",
                    tick,
                    unit,
                    format!("{:?}", budget.channel),
                    budget.net.x,
                    budget.net.y,
                    budget.torque
                ));
            }
        }
    }
    if rows.ends_with(',') {
        rows.pop();
    }
    rows.push(']');

    let html = CHART_TEMPLATE
        .replace("__ROWS__", &rows)
        .replace("__DT__", &format!("{}", DT))
        .replace(
            "__PROVENANCE__",
            "Machine-generated by crates/sim/tests/force_trace.rs::write_heavy_force_budget_timeline_html \
             (immortal 48x8 HeavySword vs HeavySword probe, 7s, seed 0x5150, --features force-trace). \
             Raw per-record JSONL: target/force-trace/force-budget-heavy-v-heavy.jsonl.",
        );
    let dir = repo.join("specs/melee-blob/visualizations");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("force-budget-timeline.html"), html).unwrap();
}

/// Self-contained chart page: per-unit net-|force| and torque timelines by
/// channel (global top-6 channels get the categorical palette, the rest fold
/// into a gray "Other"), shared legend, crosshair tooltip, and a table view.
/// Palette is the validated dataviz reference instance (light+dark steps).
const CHART_TEMPLATE: &str = r##"<!doctype html>
<meta charset="utf-8">
<title>Force budget timeline — heavy v heavy probe</title>
<style>
.viz-root {
  --surface-1: #fcfcfb; --text-primary: #0b0b0b; --text-secondary: #52514e;
  --grid: #e4e3df; --other: #8a8984;
  --s1: #2a78d6; --s2: #1baf7a; --s3: #eda100; --s4: #008300; --s5: #4a3aa7; --s6: #e34948;
}
@media (prefers-color-scheme: dark) {
  .viz-root {
    --surface-1: #1a1a19; --text-primary: #ffffff; --text-secondary: #c3c2b7;
    --grid: #34332f; --other: #8a8984;
    --s1: #3987e5; --s2: #199e70; --s3: #c98500; --s4: #008300; --s5: #9085e9; --s6: #e66767;
  }
}
body { margin: 0; }
.viz-root { background: var(--surface-1); color: var(--text-primary);
  font: 13px system-ui; padding: 24px; min-height: 100vh; }
h1 { font-size: 16px; margin: 0 0 4px; }
.sub { color: var(--text-secondary); margin-bottom: 16px; }
.legend { display: flex; flex-wrap: wrap; gap: 12px; margin: 8px 0 16px; }
.legend span { display: inline-flex; align-items: center; gap: 5px; color: var(--text-secondary); }
.legend i { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
.panels { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 1200px; }
.panel h2 { font-size: 13px; font-weight: 600; margin: 0 0 4px; color: var(--text-secondary); }
svg { width: 100%; height: auto; display: block; }
.tip { position: fixed; pointer-events: none; background: var(--surface-1);
  border: 1px solid var(--grid); border-radius: 4px; padding: 6px 8px; font-size: 12px;
  display: none; box-shadow: 0 2px 8px rgba(0,0,0,.15); z-index: 2; }
details { margin-top: 20px; } summary { cursor: pointer; color: var(--text-secondary); }
table { border-collapse: collapse; margin-top: 8px; }
td, th { border: 1px solid var(--grid); padding: 3px 6px; text-align: right; font-size: 12px; }
th:nth-child(3), td:nth-child(3) { text-align: left; }
footer { margin-top: 20px; color: var(--text-secondary); font-size: 12px; max-width: 900px; }
</style>
<div class="viz-root">
<h1>Force budget timeline — heavy v heavy probe</h1>
<div class="sub">Per-channel net |force| (m/tick summed over soldiers) and torque about the unit centroid, per tick. Top 6 channels by peak net force; remainder folds into Other.</div>
<div class="legend" id="legend"></div>
<div class="panels" id="panels"></div>
<div class="tip" id="tip"></div>
<details><summary>Data table (per tick × unit × channel)</summary>
<table><thead><tr><th>tick</th><th>unit</th><th>channel</th><th>net x</th><th>net y</th><th>torque</th></tr></thead>
<tbody id="tbody"></tbody></table></details>
<footer>__PROVENANCE__</footer>
</div>
<script>
const ROWS = __ROWS__;
const DT = __DT__;
const COLORS = ['var(--s1)','var(--s2)','var(--s3)','var(--s4)','var(--s5)','var(--s6)'];
const peak = new Map();
for (const [,,c,x,y] of ROWS) {
  const m = Math.hypot(x, y);
  peak.set(c, Math.max(peak.get(c) || 0, m));
}
const topCh = [...peak.entries()].sort((a,b) => b[1]-a[1]).slice(0,6).map(e => e[0]);
const color = c => topCh.includes(c) ? COLORS[topCh.indexOf(c)] : 'var(--other)';
const units = [...new Set(ROWS.map(r => r[1]))].sort();
const maxTick = Math.max(...ROWS.map(r => r[0]));
// series[unit][name] = {net: Float64Array, tq: Float64Array} with Other folded.
const series = {};
for (const u of units) series[u] = {};
for (const [t,u,c,x,y,tq] of ROWS) {
  const name = topCh.includes(c) ? c : 'Other';
  const s = series[u][name] ||= { net: new Float64Array(maxTick+1), tq: new Float64Array(maxTick+1) };
  s.net[t] += Math.hypot(x, y);
  s.tq[t] += tq;
}
const legend = document.getElementById('legend');
for (const name of [...topCh, 'Other']) {
  const el = document.createElement('span');
  el.innerHTML = `<i style="background:${color(name)}"></i>${name}`;
  legend.appendChild(el);
}
const W = 560, H = 220, PL = 46, PB = 24, PT = 8, PR = 8;
function panel(title, unit, key, symmetric) {
  const names = Object.keys(series[unit]);
  let lo = 0, hi = 1e-9;
  for (const n of names) for (const v of series[unit][n][key]) {
    hi = Math.max(hi, v); if (symmetric) lo = Math.min(lo, v);
  }
  if (symmetric) { const a = Math.max(hi, -lo); hi = a; lo = -a; }
  const x = t => PL + (W-PL-PR) * t / maxTick;
  const y = v => PT + (H-PT-PB) * (1 - (v-lo)/(hi-lo));
  let g = '';
  const yt = symmetric ? [lo, lo/2, 0, hi/2, hi] : [0, hi/4, hi/2, 3*hi/4, hi];
  for (const v of yt) g += `<line x1="${PL}" x2="${W-PR}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/>` +
    `<text x="${PL-5}" y="${y(v)+4}" text-anchor="end" fill="var(--text-secondary)" font-size="10">${v.toPrecision(2)}</text>`;
  for (let s = 0; s <= maxTick*DT; s += 1) g += `<text x="${x(s/DT)}" y="${H-6}" text-anchor="middle" fill="var(--text-secondary)" font-size="10">${s}s</text>`;
  let paths = '';
  for (const n of names) {
    const d = [...series[unit][n][key]].map((v,t) => `${t ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('');
    paths += `<path d="${d}" fill="none" stroke="${color(n)}" stroke-width="2" data-name="${n}"/>`;
  }
  const div = document.createElement('div');
  div.className = 'panel';
  div.innerHTML = `<h2>${title}</h2><svg viewBox="0 0 ${W} ${H}" data-unit="${unit}" data-key="${key}" data-lo="${lo}" data-hi="${hi}">${g}${paths}<line class="xh" y1="${PT}" y2="${H-PB}" stroke="var(--text-secondary)" stroke-width="1" visibility="hidden"/></svg>`;
  document.getElementById('panels').appendChild(div);
}
for (const u of units) {
  panel(`Unit ${u} — net |force| by channel`, u, 'net', false);
  panel(`Unit ${u} — torque about centroid by channel`, u, 'tq', true);
}
const tip = document.getElementById('tip');
document.querySelectorAll('svg').forEach(svg => {
  svg.addEventListener('mousemove', ev => {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const t = Math.round((p.x - PL) / (W-PL-PR) * maxTick);
    if (t < 0 || t > maxTick) { tip.style.display = 'none'; return; }
    const xh = svg.querySelector('.xh');
    const xpx = PL + (W-PL-PR) * t / maxTick;
    xh.setAttribute('x1', xpx); xh.setAttribute('x2', xpx); xh.setAttribute('visibility', 'visible');
    const u = +svg.dataset.unit, key = svg.dataset.key;
    const lines = Object.entries(series[u]).map(([n,s]) =>
      `<span style="color:${color(n).startsWith('var') ? '' : color(n)}"><i style="display:inline-block;width:10px;height:3px;background:${color(n)};margin-right:4px"></i></span>${n}: ${s[key][t].toFixed(3)}`);
    tip.innerHTML = `<b>t=${(t*DT).toFixed(2)}s</b><br>` + lines.join('<br>');
    tip.style.display = 'block';
    tip.style.left = (ev.clientX + 14) + 'px'; tip.style.top = (ev.clientY + 14) + 'px';
  });
  svg.addEventListener('mouseleave', () => {
    tip.style.display = 'none';
    svg.querySelector('.xh').setAttribute('visibility', 'hidden');
  });
});
const tbody = document.getElementById('tbody');
tbody.innerHTML = ROWS.map(([t,u,c,x,y,tq]) =>
  `<tr><td>${t}</td><td>${u}</td><td>${c}</td><td>${x.toFixed(4)}</td><td>${y.toFixed(4)}</td><td>${tq.toFixed(4)}</td></tr>`).join('');
</script>
"##;

/// Slice 05 phase 1: WHY does a mortal grind saturate the per-soldier speed
/// cap? For every capped soldier-tick, attribute the steering ask by channel
/// and locate the capped men by distance-to-nearest-enemy band. The verdict
/// sentence this feeds: "capped soldiers are mostly X-positioned and their
/// demand is carried by CHANNEL Y at Z% share."
#[test]
#[ignore = "melee-blob slice 05: cap-saturation attribution (phase 1)"]
fn blob_probe_slice05_cap_saturation() {
    const WINDOW_S: f32 = 25.0;
    const RUN_S: f32 = 400.0;
    const BAND_LABELS: [&str; 4] = ["<1.5m", "1.5-3m", "3-6m", ">6m"];
    for immortal in [true, false] {
        let (mut sim, a, b) = traced_attribution_heavy(0x4202, immortal);
        let end_tick = (RUN_S / DT) as usize;
        let windows = (RUN_S / WINDOW_S) as usize;
        let mut capped_soldier_ticks = vec![0u64; windows];
        let mut alive_soldier_ticks = vec![0u64; windows];
        let mut removed_len = vec![0f64; windows];
        let mut pre_len = vec![0f64; windows];
        let mut ask_by_channel: Vec<BTreeMap<ForceChannel, f64>> = vec![BTreeMap::new(); windows];
        let mut ask_total = vec![0f64; windows];
        let mut band_counts = vec![[0u64; 4]; windows];
        for step in 1..=end_tick {
            sim.clear_force_trace();
            sim.tick();
            let tick = sim.tick_count - 1;
            let t = step as f32 * DT;
            let w = ((t / WINDOW_S) as usize).min(windows - 1);

            let mut capped: BTreeMap<usize, usize> = BTreeMap::new();
            for r in sim.force_trace.records() {
                if r.tick == tick && r.channel == ForceChannel::SpeedCap {
                    capped.insert(r.soldier, r.unit);
                    if let (Some(pre), Some(post)) = (r.pre, r.post) {
                        removed_len[w] += (pre - post).len() as f64;
                        pre_len[w] += pre.len() as f64;
                    }
                }
            }
            capped_soldier_ticks[w] += capped.len() as u64;
            for unit in [a, b] {
                alive_soldier_ticks[w] += traced_live_positions(&sim, unit).len() as u64;
            }
            for r in sim.force_trace.records() {
                if r.tick == tick && r.channel.is_steering() && capped.contains_key(&r.soldier) {
                    let m = r.vec.len() as f64;
                    *ask_by_channel[w].entry(r.channel).or_insert(0.0) += m;
                    ask_total[w] += m;
                }
            }
            if step % 15 == 0 {
                for (&s, &unit) in &capped {
                    let foe = if unit == a { b } else { a };
                    let p = sim.soldier_pos(s);
                    let mut dmin = f32::INFINITY;
                    for (_, q) in traced_live_positions(&sim, foe) {
                        let d = (q - p).len();
                        if d < dmin {
                            dmin = d;
                        }
                    }
                    let band = if dmin < 1.5 {
                        0
                    } else if dmin < 3.0 {
                        1
                    } else if dmin < 6.0 {
                        2
                    } else {
                        3
                    };
                    band_counts[w][band] += 1;
                }
            }
        }
        for w in 0..windows {
            let capped_frac =
                capped_soldier_ticks[w] as f64 / (alive_soldier_ticks[w] as f64).max(1.0);
            let clip_frac = removed_len[w] / pre_len[w].max(1.0e-9);
            let mut shares: Vec<(ForceChannel, f64)> = ask_by_channel[w]
                .iter()
                .map(|(&c, &v)| (c, v / ask_total[w].max(1.0e-9)))
                .collect();
            shares.sort_by(|x, y| y.1.total_cmp(&x.1));
            let top: Vec<String> = shares
                .iter()
                .take(6)
                .map(|(c, f)| format!("{c:?}={:.3}", f))
                .collect();
            let bands_total: u64 = band_counts[w].iter().sum();
            let bands: Vec<String> = BAND_LABELS
                .iter()
                .zip(band_counts[w].iter())
                .map(|(l, &n)| format!("{l}={:.2}", n as f64 / (bands_total as f64).max(1.0)))
                .collect();
            eprintln!(
                "SLICE05_CAP_SAT variant={} window={:.0}-{:.0}s capped_frac={:.3} clip_frac={:.3} shares[{}] bands[{}]",
                if immortal { "immortal" } else { "mortal" },
                w as f32 * WINDOW_S,
                (w + 1) as f32 * WINDOW_S,
                capped_frac,
                clip_frac,
                top.join(" "),
                bands.join(" ")
            );
        }
    }
}
