mod common;

use campaign::state::{BuildKind, Loc, RosterEntry};
use campaign::{economy, tunables, units, Campaign};
use common::{inert, test_map};

#[test]
fn economy_income_upkeep_replenish() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    // Wound red's roster; it should refill at its friendly city... red
    // starts at B (junction) — move it home to A first via teleport.
    c.state.armies[0].loc = Loc::Node(0);
    // Test-owned sizing (a fake reference unit): replenishment caps at the roster
    // entry's own `max`, so set the establishment and wound below it HERE — the
    // test stays put when `contract::unit_size` or class balance changes.
    c.state.armies[0].roster[0].max = 500;
    c.state.armies[0].roster[0].count = 400;
    let t0 = c.state.factions[0].treasury;
    for _ in 0..tunables::TICKS_PER_DAY + 2 {
        c.tick();
    }
    // Income (tier 2 = 140) beats light-infantry upkeep (~13).
    assert!(c.state.factions[0].treasury > t0, "treasury should grow");
    assert!(
        c.state.armies[0].roster[0].count > 400,
        "should replenish toward its establishment at a friendly city"
    );
    // Garrisons regenerate toward the establishment.
    let g = &c.state.cities[&0].garrison;
    assert!(g.iter().any(|r| r.count > 0), "garrison should regenerate");
}

#[test]
fn garrison_regens_only_when_territory_is_clear() {
    // A garrison rebuilds in peace, not under invasion: regen is suppressed
    // while ANY enemy is within GARRISON_SAFE_TILES of the city — not only when
    // the gate is directly besieged. The besieged case is what makes a siege
    // winnable (otherwise the walls regrow mid-assault and the city can never be
    // taken); the territory case is the same rule, one radius wider.
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    let garr = |c: &Campaign| -> u32 { c.state.cities[&0].garrison.iter().map(|r| r.count).sum() };

    // Enemy a few tiles into red's territory near A — not at the gate, but
    // inside the safe radius. The walls do not regrow.
    c.state.cities.get_mut(&0).unwrap().garrison.clear();
    c.state.armies[1].loc = Loc::Edge { edge: 0, tile: 4 };
    for _ in 0..tunables::TICKS_PER_DAY + 2 {
        c.tick();
    }
    assert_eq!(garr(&c), 0, "an enemy in the city's territory pins its garrison");

    // Pull the enemy out to its own city (well beyond the radius); the walls
    // regenerate again.
    c.state.armies[1].loc = Loc::Node(2);
    for _ in 0..tunables::TICKS_PER_DAY + 2 {
        c.tick();
    }
    assert!(garr(&c) > 0, "a city with no enemy near regenerates its garrison");
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
    // Barracks cuts recruit time by a quarter per level. Recruit minutes
    // (count × per-soldier × barracks discount) convert to the current tick
    // scale, so the queue length tracks MINUTES_PER_TICK.
    assert!(c.order_recruit(0, contract::UnitClassId::LightSpear, 400));
    let ticks = c.state.cities[&0].recruit_queue[0].ticks_left;
    assert_eq!(ticks, (400 * 2 * 75 / 100 / tunables::MINUTES_PER_TICK).max(1));
}

#[test]
fn class_doctrine_upgrade_charges_living_delta_once_and_cools_down() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.factions[0].treasury = 1_000;
    let class = contract::UnitClassId::LightSpear;
    let elite = units::unit_type_id(0, class, 2);
    let old_gold = c.state.factions[0].treasury;

    assert!(c.order_set_class_doctrine(class, elite, 1));

    let base = units::unit_type(&c.map, 0, class, 0).cost_per_soldier_milligold;
    let new = units::unit_type(&c.map, 0, class, 2).cost_per_soldier_milligold;
    let expected_upgrade = ((new - base) as u64 * 500 + 999) / 1000;
    assert_eq!(
        c.state.factions[0].treasury,
        old_gold - tunables::CLASS_SWITCH_FEE - expected_upgrade as u32
    );
    assert_eq!(units::selected_unit_type(&c.state, 0, class), elite);
    assert!(
        !c.order_set_class_doctrine(class, units::unit_type_id(0, class, 1), 1),
        "cooldown blocks immediate switching"
    );
}

#[test]
fn class_size_change_raises_establishment_without_free_soldiers() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.factions[0].treasury = 1_000;
    let class = contract::UnitClassId::LightSpear;

    assert!(c.order_set_class_doctrine(class, units::unit_type_id(0, class, 0), 2));

    let r = &c.state.armies[0].roster[0];
    assert_eq!(r.count, 500, "size change should not mint soldiers");
    assert_eq!(r.max, tunables::unit_establishment(class) * 2);
    assert_eq!(
        c.state.factions[0].treasury,
        1_000 - tunables::CLASS_SWITCH_FEE
    );
}

#[test]
fn class_doctrine_rejects_non_catalog_unit_type() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.factions[0].treasury = 10_000;
    let class = contract::UnitClassId::LightSpear;
    let before = units::selected_unit_type(&c.state, 0, class);
    let hidden = units::unit_type_id(0, class, units::DEFAULT_OPTIONS_PER_CLASS);

    assert!(!c.order_set_class_doctrine(class, hidden, 1));
    assert_eq!(units::selected_unit_type(&c.state, 0, class), before);
}

#[test]
fn auto_replenish_is_paid_friendly_only_and_toggleable() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.armies[1].roster[0].count = 0; // keep blue out of the way
    c.state.armies[0].loc = Loc::Edge { edge: 1, tile: 6 }; // hostile road territory
    c.state.armies[0].roster[0].count = 500;
    c.state.armies[0].roster[0].max = 880;
    c.state.factions[0].treasury = 10_000;

    for _ in 0..tunables::TICKS_PER_DAY + 1 {
        c.tick();
    }
    assert_eq!(
        c.state.armies[0].roster[0].count, 500,
        "hostile territory cannot auto-replenish"
    );

    c.state.armies[0].loc = Loc::Node(0);
    let gold = c.state.factions[0].treasury;
    for _ in 0..tunables::TICKS_PER_DAY + 1 {
        c.tick();
    }
    assert!(
        c.state.armies[0].roster[0].count > 500,
        "friendly territory replenishes"
    );
    assert!(
        c.state.factions[0].treasury < gold + tunables::CITY_INCOME[2],
        "replenishment spends part of the day's income"
    );

    c.state.armies[0].roster[0].count = 500;
    assert!(c.order_auto_replenish(0, false));
    for _ in 0..tunables::TICKS_PER_DAY + 1 {
        c.tick();
    }
    assert_eq!(
        c.state.armies[0].roster[0].count, 500,
        "army toggle disables paid replenishment"
    );
}

#[test]
fn auto_replenish_charges_for_single_soldier_trickles() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.armies[1].roster[0].count = 0; // keep blue out of the way
    c.state.armies[0].loc = Loc::Node(0);
    c.state.armies[0].roster[0].count = 879;
    c.state.armies[0].roster[0].max = 880;
    c.state.factions[0].treasury = 1_000;

    let before = c.state.factions[0].treasury;
    let baseline = before + economy::daily_income(&c.map, &c.state, 0)
        - economy::daily_upkeep(&c.map, &c.state, 0);
    economy::day_tick(&c.map, &mut c.state);

    assert_eq!(c.state.armies[0].roster[0].count, 880);
    assert_eq!(
        c.state.factions[0].treasury,
        baseline - 1,
        "one sub-gold soldier still consumes one gold from the integer treasury"
    );
}
