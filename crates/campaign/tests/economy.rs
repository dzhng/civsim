mod common;

use campaign::state::{BuildKind, Loc, RosterEntry};
use campaign::{tunables, Campaign};
use common::{inert, test_map};

#[test]
fn economy_income_upkeep_replenish() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    // Wound red's roster; it should refill at its friendly city... red
    // starts at B (junction) — move it home to A first via teleport.
    c.state.armies[0].loc = Loc::Node(0);
    c.state.armies[0].roster[0].count = 500; // max 880
    let t0 = c.state.factions[0].treasury;
    for _ in 0..tunables::TICKS_PER_DAY + 2 {
        c.tick();
    }
    // Income (tier 2 = 140) beats light-infantry upkeep (~13).
    assert!(c.state.factions[0].treasury > t0, "treasury should grow");
    assert!(
        c.state.armies[0].roster[0].count > 500,
        "should replenish at a friendly city"
    );
    // Garrisons regenerate toward the establishment.
    let g = &c.state.cities[&0].garrison;
    assert!(g.iter().any(|r| r.count > 0), "garrison should regenerate");
}

#[test]
fn broke_faction_bleeds_soldiers() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.factions[0].treasury = 0;
    // An upkeep far beyond tier-2 income: 20k shock cavalry.
    c.state.armies[0].roster[0] = RosterEntry {
        class: contract::UnitClassId::ShockCavalry,
        count: 20_000,
        max: 20_000,
        morale_cap: 1.0,
    };
    for _ in 0..2 * tunables::TICKS_PER_DAY + 2 {
        c.tick();
    }
    assert!(
        c.state.armies[0].roster[0].count < 20_000,
        "unpaid armies desert"
    );
}

#[test]
fn recruiting_delivers_a_new_army() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.factions[0].treasury = 10_000;
    assert!(c.order_recruit(0, contract::UnitClassId::Archers, 240));
    assert!(c.state.factions[0].treasury < 10_000, "cost paid up front");
    for _ in 0..2 * tunables::TICKS_PER_DAY + 2 {
        c.tick();
    }
    let recruited = c.state.armies.iter().any(|a| {
        a.faction == 0
            && a.roster
                .iter()
                .any(|r| r.class == contract::UnitClassId::Archers && r.count == 240)
    });
    assert!(recruited, "archers should muster at A");
}

#[test]
fn undefended_city_is_occupied_and_flips() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.cities.get_mut(&2).unwrap().garrison.clear();
    c.state.armies[1].loc = Loc::Node(0); // move blue off C so red can take it... blue holds C
    c.state.armies[1].roster[0].count = 0; // simpler: tombstone blue
    c.state.armies[0].loc = Loc::Node(2); // red stands on C
    for _ in 0..tunables::OCCUPY_TICKS as u32 + 5 {
        c.tick();
    }
    assert_eq!(c.state.cities[&2].owner, 0, "C should flip to red");
}

#[test]
fn road_works_pay_build_and_persist() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    let gold0 = c.state.factions[0].treasury;
    assert!(c.order_upgrade_road(0)); // edge 0 touches red's A
    assert!(!c.order_upgrade_road(0), "one job per edge");
    let cost = tunables::ROAD_COST_PER_TILE * 12;
    assert_eq!(c.state.factions[0].treasury, gold0 - cost, "paid up front");
    // Save/load mid-build: the job must survive.
    let save = c.save();
    let mut c = Campaign::load(test_map(), &save).unwrap();
    inert(&mut c);
    assert_eq!(c.state.road_jobs.len(), 1);
    for _ in 0..tunables::ROAD_BUILD_TICKS_PER_TILE * 12 + 5 {
        c.tick();
    }
    assert_eq!(c.state.road_level(0), 2, "paving completed");
    assert!(c.state.road_jobs.is_empty());
    // And the finished level round-trips too.
    let c2 = Campaign::load(test_map(), &c.save()).unwrap();
    assert_eq!(c2.state.road_level(0), 2);
}

#[test]
fn city_buildings_raise_income_and_speed_recruits() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    // Silence upkeep so treasury moves on income alone.
    for a in &mut c.state.armies {
        for r in &mut a.roster {
            r.count = 0;
        }
    }
    let day = |c: &mut Campaign| {
        let t0 = c.state.factions[0].treasury;
        for _ in 0..tunables::TICKS_PER_DAY {
            c.tick();
        }
        c.state.factions[0].treasury as i64 - t0 as i64
    };
    assert_eq!(
        day(&mut c),
        tunables::CITY_INCOME[2] as i64,
        "tier-2 base income"
    );

    assert!(c.order_build(0, BuildKind::Market));
    assert!(!c.order_build(0, BuildKind::Barracks), "one site per city");
    for _ in 0..tunables::BUILD_TICKS + tunables::TICKS_PER_DAY {
        c.tick();
    }
    assert_eq!(c.state.cities[&0].market_lvl, 1);
    assert!(c.state.cities[&0].build_job.is_none());
    assert_eq!(
        day(&mut c),
        (tunables::CITY_INCOME[2] * tunables::MARKET_MULT_PCT[1] / 100) as i64,
        "market multiplies the next day's income"
    );

    assert!(c.order_build(0, BuildKind::Barracks));
    for _ in 0..tunables::BUILD_TICKS + tunables::TICKS_PER_DAY {
        c.tick();
    }
    assert_eq!(c.state.cities[&0].barracks_lvl, 1);
    // Barracks cuts recruit time by a quarter per level.
    assert!(c.order_recruit(0, contract::UnitClassId::LightSpear, 400));
    let ticks = c.state.cities[&0].recruit_queue[0].ticks_left;
    assert_eq!(ticks, 400 * 2 * 75 / 100);
}
