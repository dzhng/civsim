mod common;

use campaign::state::{Loc, RosterEntry};
use campaign::{economy, tunables, units, Campaign};
use common::{inert, test_map};

/// Tick to the next month boundary, where the economy settles.
fn run_month(c: &mut Campaign) {
    for _ in 0..tunables::TICKS_PER_MONTH {
        c.tick();
    }
}

#[test]
fn replenishment_and_garrison_regen_are_daily() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    // Wound red's roster; it should refill at its friendly city... red
    // starts at B (junction) — move it home to A first via teleport.
    c.state.armies[0].loc = Loc::Node(0);
    c.state.armies[0].roster[0].max = 500;
    c.state.armies[0].roster[0].count = 400;
    c.state.factions[0].treasury = 5_000; // a war chest to pay replenishment
    for _ in 0..tunables::TICKS_PER_DAY + 2 {
        c.tick();
    }
    assert!(
        c.state.armies[0].roster[0].count > 400,
        "should replenish toward its establishment at a friendly city (daily)"
    );
    // Garrisons regenerate toward the establishment (daily).
    let g = &c.state.cities[&0].garrison;
    assert!(g.iter().any(|r| r.count > 0), "garrison should regenerate");
}

#[test]
fn monthly_books_settle() {
    // Income (and upkeep) hit the treasury once a month, in one step — not daily.
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    // Silence upkeep so the treasury moves on income alone.
    for a in &mut c.state.armies {
        for r in &mut a.roster {
            r.count = 0;
        }
    }
    let t0 = c.state.factions[0].treasury;
    // No settlement before the boundary.
    for _ in 0..tunables::TICKS_PER_MONTH - 1 {
        c.tick();
    }
    assert_eq!(
        c.state.factions[0].treasury, t0,
        "treasury is flat between monthly settlements"
    );
    let expected = economy::faction_monthly_income(&c.state, 0);
    c.tick(); // crosses the month boundary
    assert_eq!(
        c.state.factions[0].treasury,
        t0 + expected,
        "the month settles income in one step"
    );
    assert!(expected > 0, "a populated tier-2 city earns gold");
}

#[test]
fn upkeep_is_half_recruitment_monthly() {
    // The economy's load-bearing ratio: a unit's monthly upkeep is exactly half
    // its raise cost, for every class.
    let c = Campaign::new(test_map(), 7, 0);
    for &class in &contract::ALL_CLASSES {
        let recruit = tunables::recruit_cost_milligold(class);
        let upkeep = tunables::upkeep_per_soldier_milligold(class);
        assert_eq!(
            upkeep,
            recruit / 2,
            "{class:?}: monthly upkeep is half raise"
        );
    }
    // And it holds through the unit-type table the sim actually bills against.
    let class = contract::UnitClassId::LightSpear;
    let ut = units::unit_type(&c.map, 0, class, 0);
    assert_eq!(
        ut.upkeep_per_soldier_milligold,
        ut.cost_per_soldier_milligold / 2
    );
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
    assert_eq!(
        garr(&c),
        0,
        "an enemy in the city's territory pins its garrison"
    );

    // Pull the enemy out to its own city (well beyond the radius); the walls
    // regenerate again.
    c.state.armies[1].loc = Loc::Node(2);
    for _ in 0..tunables::TICKS_PER_DAY + 2 {
        c.tick();
    }
    assert!(
        garr(&c) > 0,
        "a city with no enemy near regenerates its garrison"
    );
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
fn besieged_city_does_not_complete_a_muster() {
    // The other half of "no replenishment under invasion": a city with an enemy
    // in its territory holds its recruit queue. Otherwise a finished muster
    // falls back into the blockaded garrison (deliver_recruits) and re-arms the
    // walls mid-siege, just as regen would.
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.factions[0].treasury = 10_000;
    c.state.cities.get_mut(&0).unwrap().garrison.clear(); // no sortie to cloud the test
    assert!(c.order_recruit(0, contract::UnitClassId::Archers, 240)); // muster at A
    let mustered = |c: &Campaign| {
        c.state.armies.iter().any(|a| {
            a.faction == 0
                && a.roster
                    .iter()
                    .any(|r| r.class == contract::UnitClassId::Archers && r.count > 0)
        }) || c.state.cities[&0]
            .garrison
            .iter()
            .any(|r| r.class == contract::UnitClassId::Archers && r.count > 0)
    };
    // Enemy a few tiles into A's territory the whole time.
    c.state.armies[1].loc = Loc::Edge { edge: 0, tile: 4 };
    for _ in 0..4 * tunables::TICKS_PER_DAY + 2 {
        c.tick();
    }
    assert!(
        !mustered(&c),
        "a city under threat must not complete its muster"
    );
    // Pull the enemy out of territory; the muster finishes.
    c.state.armies[1].loc = Loc::Node(2);
    for _ in 0..3 * tunables::TICKS_PER_DAY + 2 {
        c.tick();
    }
    assert!(
        mustered(&c),
        "once the territory clears the muster completes"
    );
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
fn population_grows_toward_cap_monthly() {
    // Population climbs on month boundaries (fast when small, asymptotes to the
    // tier cap) and is flat in between. Slice 01.
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    // Own the neighbouring city too, so loyalty stays high and growth isn't
    // dragged or revolted away — this test is about population alone.
    c.state.cities.get_mut(&2).unwrap().owner = 0;
    let cap = tunables::city_pop_cap(c.map.nodes[0].tier);
    c.state.cities.get_mut(&0).unwrap().population = cap / 4;
    c.state.cities.get_mut(&0).unwrap().focus = -0.0; // balanced
    c.state.cities.get_mut(&0).unwrap().throttle = 0.0; // grow

    let p0 = c.state.cities[&0].population;
    for _ in 0..tunables::TICKS_PER_MONTH - 1 {
        c.tick();
    }
    assert_eq!(
        c.state.cities[&0].population, p0,
        "flat between settlements"
    );
    c.tick();
    let p1 = c.state.cities[&0].population;
    assert!(p1 > p0, "population grows on the monthly pulse");

    // Run it out: it asymptotes to (and never exceeds) the cap.
    for _ in 0..40 {
        run_month(&mut c);
    }
    assert!(c.state.cities[&0].population <= cap);
    assert!(
        c.state.cities[&0].population > cap * 8 / 10,
        "fills toward the cap"
    );
}

#[test]
fn military_focus_deepens_garrison_over_months() {
    // A city left on Military develops toward a fortress-town: military
    // development climbs and the garrison establishment deepens past the base.
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.cities.get_mut(&0).unwrap().focus = 1.0; // full Military
    let base = economy::garrison_establishment(c.map.nodes[0].tier, 0.0)
        .iter()
        .map(|(_, n)| *n)
        .sum::<u32>();
    for _ in 0..8 {
        run_month(&mut c);
    }
    assert!(
        c.state.cities[&0].mil_dev > 0.5,
        "military development ramps up"
    );
    let deep = economy::garrison_establishment(c.map.nodes[0].tier, c.state.cities[&0].mil_dev)
        .iter()
        .map(|(_, n)| *n)
        .sum::<u32>();
    assert!(deep > base, "a militarised city stands a deeper garrison");
}

#[test]
fn economy_focus_raises_output_and_exploit_trades_growth_for_yield() {
    // Slice 03: an Economy-focused city out-earns a Military one of equal size;
    // and Exploit buys immediate yield at the cost of population.
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    // Develop the city economically for a while.
    c.state.cities.get_mut(&0).unwrap().focus = -1.0; // Economy
    for _ in 0..8 {
        run_month(&mut c);
    }
    let econ_income = economy::city_monthly_income(&c.state.cities[&0]);

    // A second probe city forced to the same population but Military focus.
    let mut m = Campaign::new(test_map(), 7, 0);
    inert(&mut m);
    m.state.cities.get_mut(&0).unwrap().focus = 1.0; // Military
    for _ in 0..8 {
        run_month(&mut m);
    }
    m.state.cities.get_mut(&0).unwrap().population = c.state.cities[&0].population;
    let mil_income = economy::city_monthly_income(&m.state.cities[&0]);
    assert!(
        econ_income > mil_income,
        "economy focus earns more per head"
    );

    // Exploit lifts the take but drains population vs. Grow.
    let pop0 = c.state.cities[&0].population;
    let grow_income = economy::city_monthly_income(&c.state.cities[&0]);
    c.state.cities.get_mut(&0).unwrap().throttle = 1.0; // Exploit
    let exploit_income = economy::city_monthly_income(&c.state.cities[&0]);
    assert!(exploit_income > grow_income, "exploit yields more now");
    run_month(&mut c);
    assert!(
        c.state.cities[&0].population < pop0,
        "exploit shrinks the city"
    );
}

#[test]
fn development_decays_when_focus_switches() {
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.cities.get_mut(&0).unwrap().focus = 1.0; // build military
    for _ in 0..8 {
        run_month(&mut c);
    }
    let peak = c.state.cities[&0].mil_dev;
    assert!(peak > 0.5);
    c.state.cities.get_mut(&0).unwrap().focus = -1.0; // re-tool to economy
    for _ in 0..8 {
        run_month(&mut c);
    }
    assert!(
        c.state.cities[&0].mil_dev < peak,
        "military development decays once the focus switches away"
    );
    assert!(
        c.state.cities[&0].econ_dev > 0.5,
        "and economic development grows in"
    );
}

#[test]
fn recruit_draws_from_and_is_capped_by_population() {
    // Slice 04: recruiting spends population and can't exceed the pool.
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.factions[0].treasury = 100_000;
    c.state.cities.get_mut(&0).unwrap().population = 300;
    assert!(
        !c.order_recruit(0, contract::UnitClassId::LightSpear, 400),
        "can't recruit more soldiers than the city has people"
    );
    assert!(c.order_recruit(0, contract::UnitClassId::LightSpear, 200));
    assert_eq!(
        c.state.cities[&0].population, 100,
        "recruiting spends population from the pool"
    );
}

#[test]
fn military_city_unlocks_elite_class() {
    // Slice 04: a deeper class option needs a militarised city.
    let mut c = Campaign::new(test_map(), 7, 0);
    inert(&mut c);
    c.state.factions[0].treasury = 100_000;
    let class = contract::UnitClassId::LightSpear;
    // Point the faction's doctrine at the elite (option 2) directly.
    let elite = units::unit_type_id(0, class, 2);
    for s in &mut c.state.doctrines[0].slots {
        if s.class == class {
            s.selected = elite;
        }
    }
    c.state.cities.get_mut(&0).unwrap().population = 2_000;
    c.state.cities.get_mut(&0).unwrap().mil_dev = 0.0;
    assert!(
        !c.order_recruit(0, class, 100),
        "a raw city can't field the elite option"
    );
    c.state.cities.get_mut(&0).unwrap().mil_dev = 0.8;
    assert!(
        c.order_recruit(0, class, 100),
        "a militarised city unlocks the elite option"
    );
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
        c.state.factions[0].treasury < gold,
        "replenishment spends gold (income only arrives on the monthly pulse)"
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
    // The daily heartbeat charges replenishment only — income/upkeep settle
    // monthly — so the one topped-up soldier is the only cost this day.
    economy::day_tick(&c.map, &mut c.state);

    assert_eq!(c.state.armies[0].roster[0].count, 880);
    assert_eq!(
        c.state.factions[0].treasury,
        before - 1,
        "one sub-gold soldier still consumes one gold from the integer treasury"
    );
}
