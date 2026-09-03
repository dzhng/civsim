//! Golden-state regression: a fixed campaign must produce bit-identical state
//! forever. Any intended behavior change updates EXPECTED deliberately (run
//! with --nocapture to see the new hash); unintended changes fail loudly.

use campaign::state::{CampaignState, EncounterPhase, Loc, Stance};
use campaign::Campaign;

fn fnv1a(hash: &mut u64, value: u32) {
    *hash ^= value as u64;
    *hash = hash.wrapping_mul(0x100000001b3);
}

fn hash_u64(hash: &mut u64, value: u64) {
    fnv1a(hash, value as u32);
    fnv1a(hash, (value >> 32) as u32);
}

fn hash_loc(hash: &mut u64, loc: Loc) {
    match loc {
        Loc::Node(node) => {
            fnv1a(hash, 0);
            fnv1a(hash, node);
        }
        Loc::Edge { edge, tile } => {
            fnv1a(hash, 1);
            fnv1a(hash, edge);
            fnv1a(hash, tile as u32);
        }
    }
}

fn hash_stance(hash: &mut u64, stance: &Stance) {
    match stance {
        Stance::March => fnv1a(hash, 0),
        Stance::Hold => fnv1a(hash, 1),
        Stance::Camp { build_ticks_left } => {
            fnv1a(hash, 2);
            fnv1a(hash, *build_ticks_left as u32);
        }
        Stance::Ambush {
            spot,
            settle_ticks_left,
        } => {
            fnv1a(hash, 3);
            fnv1a(hash, *spot);
            fnv1a(hash, *settle_ticks_left as u32);
        }
        Stance::Routed {
            tiles_left,
            regroup_ticks_left,
            by,
        } => {
            fnv1a(hash, 4);
            fnv1a(hash, *tiles_left as u32);
            fnv1a(hash, *regroup_ticks_left);
            fnv1a(hash, *by);
        }
        Stance::Occupying { city, ticks_left } => {
            fnv1a(hash, 5);
            fnv1a(hash, *city);
            fnv1a(hash, *ticks_left as u32);
        }
        Stance::AtSea => fnv1a(hash, 6),
        Stance::Pursuing { target } => {
            fnv1a(hash, 7);
            fnv1a(hash, *target);
        }
    }
}

fn state_hash(state: &CampaignState) -> u64 {
    let mut hash = 0x245893d74d55793a;

    fnv1a(&mut hash, state.armies.len() as u32);
    for army in &state.armies {
        hash_loc(&mut hash, army.loc);
        hash_u64(&mut hash, army.path_idx as u64);
        fnv1a(&mut hash, army.progress.to_bits());
        fnv1a(&mut hash, army.soldiers());
        hash_stance(&mut hash, &army.stance);
    }

    fnv1a(&mut hash, state.cities.len() as u32);
    for city in state.cities.values() {
        fnv1a(&mut hash, city.owner);
    }

    fnv1a(&mut hash, state.factions.len() as u32);
    for faction in &state.factions {
        fnv1a(&mut hash, faction.treasury);
    }

    fnv1a(&mut hash, state.encounters.len() as u32);
    for encounter in &state.encounters {
        fnv1a(&mut hash, encounter.id);
        fnv1a(&mut hash, encounter.attacker);
        fnv1a(&mut hash, encounter.defender);
        fnv1a(&mut hash, encounter.prep_attacker as u32);
        fnv1a(&mut hash, encounter.prep_defender as u32);
        fnv1a(
            &mut hash,
            match encounter.phase {
                EncounterPhase::Preparing => 0,
                EncounterPhase::Pending => 1,
                EncounterPhase::Fighting => 2,
            },
        );
        fnv1a(&mut hash, encounter.ambush as u32);
        hash_u64(&mut hash, encounter.seed);
        fnv1a(&mut hash, encounter.reinforcements.len() as u32);
        for &(army, delay, bearing) in &encounter.reinforcements {
            fnv1a(&mut hash, army);
            fnv1a(&mut hash, delay.to_bits());
            fnv1a(&mut hash, bearing.to_bits());
        }
        fnv1a(&mut hash, encounter.no_retreat[0] as u32);
        fnv1a(&mut hash, encounter.no_retreat[1] as u32);
    }
    // Resolved encounters leave the live list; the monotonic id keeps their
    // existence in the final-state projection.
    fnv1a(&mut hash, state.next_encounter_id);

    hash
}

#[test]
fn golden_state_hash_stable() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../web/public/data/campaign-map.json"
    );
    let map = std::fs::read_to_string(path).expect("real campaign map should be present");
    let mut campaign = Campaign::new(&map, 7, 0);
    for faction in &mut campaign.state.factions {
        faction.ai = false;
    }
    campaign.state.armies[0].loc = Loc::Edge { edge: 0, tile: 4 };
    campaign.state.armies[2].loc = Loc::Edge { edge: 0, tile: 5 };

    let mut battles = 0;
    let mut saw_encounter = false;
    let mut saw_rout = false;
    for _ in 0..400 {
        campaign.tick();
        saw_encounter |= !campaign.state.encounters.is_empty();
        if let Some(encounter) = campaign.state.battle_ready {
            let setup = campaign
                .battle_setup(encounter)
                .expect("the pending encounter should produce a battle");
            let result = campaign::resolve::estimate(&campaign.map, &setup);
            campaign.apply_outcome(encounter, &result);
            battles += 1;
        }
        saw_rout |= campaign
            .state
            .armies
            .iter()
            .any(|army| matches!(army.stance, Stance::Routed { .. }));
    }
    assert!(saw_encounter, "the golden scenario must form an encounter");
    assert_eq!(battles, 1, "the golden scenario must cross an encounter");
    assert!(saw_rout, "the golden scenario must produce a rout");
    let hash = state_hash(&campaign.state);
    // The initial pin covers the committed map, one field encounter, and its
    // routed aftermath after 400 ticks.
    const EXPECTED: u64 = 0x1f256398f72cd05b;
    assert_eq!(
        hash, EXPECTED,
        "campaign behavior changed after {battles} battles: golden hash {hash:#018x} != pinned \
         {EXPECTED:#018x}. If the change is intentional, update EXPECTED."
    );
}
