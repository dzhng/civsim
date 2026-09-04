//! Full-campaign measurement harness: play the whole map AI-vs-AI to a verdict
//! and read out whether the strategic loop is *alive* — do the powers make
//! contact, fight, take ground, and eventually decide a war — or do they sit
//! inert in their corners? Battles resolve through the real sim
//! (the shared test auto-resolver), so this drives the same campaign→battle→campaign
//! loop a player drives, not a stubbed model of it.
//!
//! `grand_map_report` is the instrument (heavy, #[ignore]d — run on demand with
//! `cargo test -p campaign --test full_game -- --ignored --nocapture`).
//! `lopsided_war_concludes` is the always-on gate that the loop actually
//! reaches a latched `Outcome` through a real battle.

use campaign::state::{CampaignState, Outcome};
use campaign::Campaign;
mod common;

use common::{lopsided_map, real_map};

/// How long a single battle may run headless before the stronger remnant is
/// declared the winner. Bounded so a stalemated stack-vs-stack can't dominate
/// the harness; the forced result still picks the stronger remnant.
const BATTLE_CAP: u64 = 8_000;

const TICKS_PER_DAY: u64 = 1440;

struct FactionStat {
    cities: usize,
    soldiers: u32,
    treasury: u32,
    population: u32,
    /// Mean loyalty across held cities (×100), the overextension read.
    mean_loyalty: u32,
}

fn faction_stat(st: &CampaignState, f: u32) -> FactionStat {
    let cities = st.cities.values().filter(|c| c.owner == f).count();
    let field: u32 = st
        .armies
        .iter()
        .filter(|a| a.faction == f)
        .map(|a| a.soldiers())
        .sum();
    let garrison: u32 = st
        .cities
        .values()
        .filter(|c| c.owner == f)
        .map(|c| c.garrison.iter().map(|r| r.count).sum::<u32>())
        .sum();
    let population: u32 = st
        .cities
        .values()
        .filter(|c| c.owner == f)
        .map(|c| c.population)
        .sum();
    let loyalty_sum: f32 = st
        .cities
        .values()
        .filter(|c| c.owner == f)
        .map(|c| c.loyalty)
        .sum();
    FactionStat {
        cities,
        soldiers: field + garrison,
        treasury: st.factions[f as usize].treasury,
        population,
        mean_loyalty: if cities > 0 {
            (100.0 * loyalty_sum / cities as f32) as u32
        } else {
            0
        },
    }
}

/// Stable per-city ownership vector (BTreeMap iteration is ordered).
fn owner_snapshot(st: &CampaignState) -> Vec<u32> {
    st.cities.values().map(|c| c.owner).collect()
}

fn sample_stats(st: &CampaignState, playable: &[u32]) -> Vec<FactionStat> {
    playable.iter().map(|&f| faction_stat(st, f)).collect()
}

// `campaign::resolve::estimate` is the cheap full-battle estimator
// (promoted to production for the AI's lookahead). The harness uses it for fast
// multi-year sweeps; the real sim is exercised by `lopsided_war_concludes`.

struct Report {
    days: u64,
    battles: u32,
    first_contact_day: Option<u64>,
    city_flips: u32,
    longest_inert_days: u64,
    outcome: Option<Outcome>,
    /// (day, per-faction (cities, soldiers, treasury)) at sample points.
    samples: Vec<(u64, Vec<FactionStat>)>,
    playable: Vec<u32>,
    names: Vec<String>,
}

/// Run a fully-autonomous campaign for at most `max_days`, resolving every
/// battle through the real sim. Returns the loop-health report.
fn play(
    map_json: &str,
    seed: u64,
    max_days: u64,
    sample_every_days: u64,
    fast: bool,
    verbose: bool,
) -> Report {
    let clock = std::time::Instant::now();
    let mut c = Campaign::new(map_json, seed, 0);
    // Every power thinks for itself — no human hand on the map.
    for f in &mut c.state.factions {
        f.ai = true;
    }
    let names: Vec<String> = c.map.factions.iter().map(|f| f.id.clone()).collect();
    let playable: Vec<u32> = (0..c.map.factions.len() as u32)
        .filter(|&f| c.map.factions[f as usize].playable)
        .collect();

    let mut battles = 0u32;
    let mut first_contact_day: Option<u64> = None;
    let mut city_flips = 0u32;
    let mut prev_owners = owner_snapshot(&c.state);
    let mut last_event_day = 0u64;
    let mut longest_inert_days = 0u64;
    let mut samples: Vec<(u64, Vec<FactionStat>)> = Vec::new();

    samples.push((0, sample_stats(&c.state, &playable)));

    let max_ticks = max_days * TICKS_PER_DAY;
    let mut day = 0u64;
    for tick in 1..=max_ticks {
        c.tick();
        if c.state.tick % 60 == 0 {
            c.drive_ai();
        }

        if let Some(eid) = c.state.battle_ready {
            match c.battle_setup(eid) {
                Some(setup) => {
                    let result = if fast {
                        campaign::resolve::estimate(&c.map, &setup)
                    } else {
                        common::auto_resolve(&setup, BATTLE_CAP)
                    };
                    c.apply_outcome(eid, &result);
                    battles += 1;
                    first_contact_day.get_or_insert(day);
                    last_event_day = day;
                }
                // Defensive: a pending encounter that won't set up would
                // otherwise spin forever. Drop the flag and move on.
                None => c.state.battle_ready = None,
            }
        }

        if tick % TICKS_PER_DAY == 0 {
            day = tick / TICKS_PER_DAY;
            let owners = owner_snapshot(&c.state);
            let flips = owners
                .iter()
                .zip(&prev_owners)
                .filter(|(a, b)| a != b)
                .count() as u32;
            if flips > 0 {
                city_flips += flips;
                last_event_day = day;
            }
            prev_owners = owners;
            longest_inert_days = longest_inert_days.max(day - last_event_day);

            if day % sample_every_days == 0 {
                samples.push((day, sample_stats(&c.state, &playable)));
                if verbose {
                    eprintln!(
                        "  day {day:>4}  battles={battles:<4} flips={city_flips:<4} \
                         elapsed={:.1}s",
                        clock.elapsed().as_secs_f64()
                    );
                }
            }
            if c.state.outcome.is_some() {
                samples.push((day, sample_stats(&c.state, &playable)));
                return Report {
                    days: day,
                    battles,
                    first_contact_day,
                    city_flips,
                    longest_inert_days,
                    outcome: c.state.outcome,
                    samples,
                    playable,
                    names,
                };
            }
        }
    }

    Report {
        days: max_days,
        battles,
        first_contact_day,
        city_flips,
        longest_inert_days,
        outcome: c.state.outcome,
        samples,
        playable,
        names,
    }
}

fn print_report(r: &Report) {
    println!("\n========== CAMPAIGN LOOP REPORT ==========");
    println!(
        "simulated:          {} days ({:.1} years)",
        r.days,
        r.days as f64 / 365.0
    );
    println!("battles fought:     {}", r.battles);
    println!(
        "first contact:      {}",
        r.first_contact_day
            .map(|d| format!("day {d}"))
            .unwrap_or_else(|| "NEVER".into())
    );
    println!("city flips:         {}", r.city_flips);
    println!(
        "longest inert run:  {} days (no battle, no flip)",
        r.longest_inert_days
    );
    println!(
        "outcome:            {}",
        match r.outcome {
            Some(Outcome::Victory(f)) => format!("VICTORY — {}", r.names[f as usize]),
            Some(Outcome::Draw) => "DRAW (mutual collapse)".into(),
            None => "UNDECIDED at horizon".into(),
        }
    );

    // Per-faction trajectory: start → end.
    let (sd0, s0) = &r.samples[0];
    let (sdn, sn) = r.samples.last().unwrap();
    println!("\nfaction        cities (d{sd0}->d{sdn})   soldiers           treasury");
    for (i, &f) in r.playable.iter().enumerate() {
        println!(
            "  {:<12} {:>4} -> {:<4}        {:>7} -> {:<7}   {:>6} -> {}",
            r.names[f as usize],
            s0[i].cities,
            sn[i].cities,
            s0[i].soldiers,
            sn[i].soldiers,
            s0[i].treasury,
            sn[i].treasury,
        );
    }

    // Population & mean loyalty at the horizon — the overextension read: a leader
    // that sprawls should show a big, restive (low-loyalty) frontier.
    println!("\nfaction        population       mean loyalty");
    for (i, &f) in r.playable.iter().enumerate() {
        println!(
            "  {:<12} {:>9}        {:>3}%",
            r.names[f as usize], sn[i].population, sn[i].mean_loyalty
        );
    }

    // Runaway gap: strongest-vs-weakest playable power by cities, over time. The
    // headline macro-health metric — a healthy loop keeps this from blowing out
    // early and never recovering; the baseline judges that macro-health contract.
    println!("\nrunaway gap (max−min cities held over time):");
    for (day, s) in &r.samples {
        let (max, min) = (
            s.iter().map(|x| x.cities).max().unwrap_or(0),
            s.iter().map(|x| x.cities).min().unwrap_or(0),
        );
        println!("  d{day:>5}: gap {}  (max {max}, min {min})", max - min);
    }

    // City-count trajectory over time — the clearest "is anyone winning?" view.
    println!("\ncities held over time:");
    print!("  {:>6}", "day");
    for &f in &r.playable {
        print!(
            "  {:>10}",
            &r.names[f as usize][..r.names[f as usize].len().min(10)]
        );
    }
    println!();
    for (day, stats) in &r.samples {
        print!("  {day:>6}");
        for s in stats {
            print!("  {:>10}", s.cities);
        }
        println!();
    }
    println!("==========================================\n");
}

/// The instrument. Heavy — plays the real grand map AI-vs-AI for a multi-year
/// horizon and prints the loop-health report. Run on demand:
///   cargo test -p campaign --test full_game grand_map_report -- --ignored --nocapture
#[test]
#[ignore]
fn grand_map_report() {
    let map_json = real_map();

    // Horizon override for probing: CAMPAIGN_DAYS=365 cargo test ...
    let days: u64 = std::env::var("CAMPAIGN_DAYS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(1095);
    let sample_every = (days / 12).max(1);
    // Fast strength-resolver by default (sweeps years); CAMPAIGN_REAL=1 drives
    // the real battle sim instead (accurate, but only a short horizon is sane).
    let fast = std::env::var("CAMPAIGN_REAL").is_err();
    let start = std::time::Instant::now();
    let r = play(&map_json, 1, days, sample_every, fast, true);
    let elapsed = start.elapsed();
    print_report(&r);
    println!("wall time: {:.1}s", elapsed.as_secs_f64());

    // The loop is only worth tuning if it produces conflict at all.
    assert!(
        r.battles > 0,
        "the powers never fought a single battle in 3 years"
    );
}

#[test]
fn lopsided_war_concludes() {
    let r = play(
        lopsided_map(),
        7,
        200,
        50,
        /* fast */ false,
        /* verbose */ false,
    );
    assert!(r.battles > 0, "the strong power never engaged the weak one");
    assert_eq!(
        r.outcome,
        Some(Outcome::Victory(0)),
        "red should conquer blue and trip the victory latch (got {:?} after {} days)",
        r.outcome,
        r.days,
    );
}
