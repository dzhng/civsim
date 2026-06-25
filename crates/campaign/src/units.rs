//! Concrete campaign unit types. A `UnitClassId` is the tactical slot; a
//! `UnitTypeId` is the faction's current equipment/cultural choice inside it.

use crate::mapdata::WorldMap;
use crate::state::{BuildKind, CampaignState, FactionId};
use crate::tunables as tun;
use contract::{UnitClassId, UnitTypeId};
use serde::{Deserialize, Serialize};

pub const DEFAULT_OPTIONS_PER_CLASS: u8 = 3;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum UnitUnlock {
    Default,
    Building(BuildKind),
    Conquest(crate::mapdata::NodeId),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UnitType {
    pub id: UnitTypeId,
    pub faction: FactionId,
    pub class: UnitClassId,
    pub option: u8,
    pub name: String,
    pub cost_per_soldier_milligold: u32,
    pub upkeep_per_soldier_milligold: u32,
    pub recruit_ticks_per_soldier: u32,
    pub unlock: UnitUnlock,
}

pub fn unit_type_id(faction: FactionId, class: UnitClassId, option: u8) -> UnitTypeId {
    UnitTypeId(faction * 1000 + class as u32 * 10 + option as u32)
}

pub fn decode_unit_type(id: UnitTypeId) -> Option<(FactionId, UnitClassId, u8)> {
    let faction = id.0 / 1000;
    let class_idx = (id.0 % 1000) / 10;
    let option = (id.0 % 10) as u8;
    let class = contract::ALL_CLASSES.get(class_idx as usize).copied()?;
    Some((faction, class, option))
}

pub fn unit_type(map: &WorldMap, faction: FactionId, class: UnitClassId, option: u8) -> UnitType {
    let fkey = map
        .factions
        .get(faction as usize)
        .map(|f| f.id.as_str())
        .unwrap_or("unknown");
    let up_mult = match option {
        0 => 100,
        1 => 82,
        2 => 126,
        _ => 145 + option as u32 * 10,
    };
    let keep_mult = match option {
        0 => 100,
        1 => 88,
        2 => 122,
        _ => 130 + option as u32 * 8,
    };
    let time_mult = match option {
        0 => 100,
        1 => 85,
        2 => 115,
        _ => 125,
    };
    UnitType {
        id: unit_type_id(faction, class, option),
        faction,
        class,
        option,
        name: unit_name(fkey, class, option),
        cost_per_soldier_milligold: tun::recruit_cost_milligold(class) * up_mult / 100,
        upkeep_per_soldier_milligold: tun::upkeep_per_soldier_milligold(class) * keep_mult / 100,
        recruit_ticks_per_soldier: (tun::recruit_ticks_per_soldier(class) * time_mult / 100).max(1),
        unlock: if option < DEFAULT_OPTIONS_PER_CLASS {
            UnitUnlock::Default
        } else {
            UnitUnlock::Building(BuildKind::Barracks)
        },
    }
}

pub fn unit_type_by_id(map: &WorldMap, id: UnitTypeId) -> Option<UnitType> {
    let (faction, class, option) = decode_unit_type(id)?;
    if option >= DEFAULT_OPTIONS_PER_CLASS {
        return None;
    }
    ((faction as usize) < map.factions.len()).then(|| unit_type(map, faction, class, option))
}

pub fn available_options(map: &WorldMap, faction: FactionId, class: UnitClassId) -> Vec<UnitType> {
    (0..DEFAULT_OPTIONS_PER_CLASS)
        .map(|o| unit_type(map, faction, class, o))
        .collect()
}

pub fn default_slots(faction: FactionId) -> Vec<crate::state::DoctrineSlot> {
    contract::ALL_CLASSES
        .iter()
        .map(|&class| crate::state::DoctrineSlot {
            class,
            selected: unit_type_id(faction, class, 0),
            size_mult: 1,
            cooldown_until: 0,
        })
        .collect()
}

pub fn selected_unit_type(
    st: &CampaignState,
    faction: FactionId,
    class: UnitClassId,
) -> UnitTypeId {
    st.doctrines
        .get(faction as usize)
        .and_then(|d| d.slots.iter().find(|s| s.class == class))
        .map(|s| s.selected)
        .unwrap_or_else(|| unit_type_id(faction, class, 0))
}

pub fn size_mult(st: &CampaignState, faction: FactionId, class: UnitClassId) -> u8 {
    st.doctrines
        .get(faction as usize)
        .and_then(|d| d.slots.iter().find(|s| s.class == class))
        .map(|s| s.size_mult)
        .unwrap_or(1)
}

pub fn option_index(id: UnitTypeId) -> u8 {
    decode_unit_type(id).map(|(_, _, o)| o).unwrap_or(0)
}

fn unit_name(faction: &str, class: UnitClassId, option: u8) -> String {
    let fallback = || {
        let arm = match option {
            0 => "Regular",
            1 => "Auxiliary",
            2 => "Elite",
            _ => "Reform",
        };
        format!("{arm} {class:?}")
    };
    let names: Option<[&str; 3]> = match faction {
        "rome" => roman_names(class),
        "carthage" => carthaginian_names(class),
        "macedon" => macedonian_names(class),
        "arverni" => arverni_names(class),
        "egypt" => egyptian_names(class),
        "seleucid" => seleucid_names(class),
        _ => None,
    };
    names
        .and_then(|n| n.get(option as usize).copied())
        .map(str::to_string)
        .unwrap_or_else(fallback)
}

fn roman_names(class: UnitClassId) -> Option<[&'static str; 3]> {
    use UnitClassId::*;
    Some(match class {
        HeavySword => [
            "Roman Heavy Swordsmen",
            "Italian Allied Cohorts",
            "Armoured Legionaries",
        ],
        LightSpear => [
            "Italian Spear Levy",
            "Italian Spear Auxilia",
            "Campanian Spearmen",
        ],
        LongSwords => [
            "Gallic Auxilia",
            "Ligurian Swordsmen",
            "Samnite Heavy Blades",
        ],
        Phalanx => [
            "Greek Allied Hoplites",
            "Campanian Hoplites",
            "Magna Graecia Phalanx",
        ],
        Archers => [
            "Local Archers",
            "Cretan Archers",
            "Syrian Auxiliary Archers",
        ],
        Skirmishers => [
            "Roman Javelinmen",
            "Italian Light Skirmishers",
            "Numidian Javelinmen",
        ],
        ShockCavalry => [
            "Roman Cavalry",
            "Italian Allied Cavalry",
            "Armoured Household Cavalry",
        ],
        HorseArchers => [
            "Tarentine Scouts",
            "Numidian Horsemen",
            "Eastern Horse Archers",
        ],
        ArtilleryCrew => [
            "Field Ballista Crew",
            "Heavy Ballista Crew",
            "Siege Engineers",
        ],
        Peasant => ["Citizen Levy", "Accensi", "Pressed Camp Followers"],
        LightSword => [
            "Roman Shield Swordsmen",
            "Italian Allied Swordsmen",
            "Gallic Auxilia",
        ],
        HeavySpear => [
            "Roman Heavy Spearmen",
            "Allied Spear Cohorts",
            "Eagle Guard Spearmen",
        ],
    })
}

fn carthaginian_names(class: UnitClassId) -> Option<[&'static str; 3]> {
    use UnitClassId::*;
    Some(match class {
        HeavySword => [
            "Liby-Phoenician Infantry",
            "Iberian Scutarii",
            "Sacred Band Infantry",
        ],
        LightSpear => [
            "Libyan Spearmen",
            "Punic Militia Spears",
            "Campanian Mercenary Spears",
        ],
        LongSwords => [
            "Gallic Mercenaries",
            "Iberian Falcata Men",
            "Celtiberian Heavy Swords",
        ],
        Phalanx => [
            "Greek Mercenary Hoplites",
            "Libyan Pike Levy",
            "Punic Phalangites",
        ],
        Archers => [
            "Punic Archers",
            "Cretan Mercenary Archers",
            "Sicilian Archers",
        ],
        Skirmishers => ["Libyan Javelinmen", "Balearic Slingers", "Iberian Caetrati"],
        ShockCavalry => [
            "Punic Noble Cavalry",
            "Iberian Heavy Cavalry",
            "Sacred Band Cavalry",
        ],
        HorseArchers => [
            "Numidian Horsemen",
            "Moorish Horse Archers",
            "Numidian Noble Riders",
        ],
        ArtilleryCrew => [
            "Punic Ballista Crew",
            "Harbor Arsenal Crew",
            "Siege Masters",
        ],
        Peasant => ["Punic Levy", "Libyan Levy", "Mercenary Rabble"],
        LightSword => ["Iberian Scutarii", "Libyan Swordsmen", "Gallic Warband"],
        HeavySpear => [
            "Armoured Libyan Spears",
            "Punic Shield Spears",
            "Libyan Guard Spears",
        ],
    })
}

fn macedonian_names(class: UnitClassId) -> Option<[&'static str; 3]> {
    use UnitClassId::*;
    Some(match class {
        HeavySword => ["Hypaspist Swordsmen", "Thorakitai", "Agema Guard"],
        LightSpear => ["Peltast Spears", "Thureophoroi", "Agrianian Spearmen"],
        LongSwords => [
            "Thracian Rhomphaia Men",
            "Illyrian Swordsmen",
            "Royal Thracians",
        ],
        Phalanx => ["Phalangites", "Bronze Shield Phalanx", "Royal Peltasts"],
        Archers => ["Macedonian Archers", "Cretan Archers", "Rhodian Marksmen"],
        Skirmishers => [
            "Agrianian Javelins",
            "Thracian Peltasts",
            "Elite Agrianians",
        ],
        ShockCavalry => [
            "Companion Cavalry",
            "Thessalian Cavalry",
            "Royal Companions",
        ],
        HorseArchers => [
            "Paeonian Horsemen",
            "Scythian Horse Archers",
            "Dahae Mounted Archers",
        ],
        ArtilleryCrew => [
            "Torsion Catapult Crew",
            "Royal Engineers",
            "Siege Train Crew",
        ],
        Peasant => ["Macedonian Levy", "Hill Levy", "Camp Followers"],
        LightSword => [
            "Thureophoroi Swords",
            "Illyrian Auxilia",
            "Thorakitai Swords",
        ],
        HeavySpear => [
            "Shield Bearer Spears",
            "Heavy Thureophoroi",
            "Royal Spear Guard",
        ],
    })
}

fn arverni_names(class: UnitClassId) -> Option<[&'static str; 3]> {
    use UnitClassId::*;
    Some(match class {
        HeavySword => ["Armoured Nobles", "Sworn Swordsmen", "Oathbound Retinue"],
        LightSpear => ["Tribal Spearmen", "Hill Spear Levy", "Client Spearmen"],
        LongSwords => ["Longsword Warriors", "Naked Fanatics", "Noble Longswords"],
        Phalanx => [
            "Greek Hireling Hoplites",
            "Massed Spear Levy",
            "Mercenary Pike Band",
        ],
        Archers => ["Forest Archers", "Aquitanian Archers", "Mercenary Bowmen"],
        Skirmishers => ["Javelin Skirmishers", "Slingers", "Hunter Scouts"],
        ShockCavalry => [
            "Noble Cavalry",
            "Client Heavy Riders",
            "Arvernian Horse Nobles",
        ],
        HorseArchers => [
            "Mounted Skirmishers",
            "Germanic Horsemen",
            "Steppe Mercenaries",
        ],
        ArtilleryCrew => [
            "Captured Ballista Crew",
            "Tribal Engineers",
            "Siege Hirelings",
        ],
        Peasant => ["Tribal Levy", "Farm Levy", "War Camp Mob"],
        LightSword => ["Young Warriors", "Client Swordsmen", "Gallic Auxilia"],
        HeavySpear => ["Oath Spears", "Armoured Spear Retinue", "Noble Spear Guard"],
    })
}

fn egyptian_names(class: UnitClassId) -> Option<[&'static str; 3]> {
    use UnitClassId::*;
    Some(match class {
        HeavySword => [
            "Machimoi Swordsmen",
            "Greek Cleruch Swords",
            "Royal Guard Swords",
        ],
        LightSpear => ["Machimoi Spears", "Nile Spear Levy", "Libyan Spearmen"],
        LongSwords => [
            "Galatian Mercenaries",
            "Thracian Mercenaries",
            "Royal Galatians",
        ],
        Phalanx => ["Cleruch Phalanx", "Egyptian Phalangites", "Royal Phalanx"],
        Archers => ["Nile Archers", "Nubian Archers", "Cretan Archers"],
        Skirmishers => ["Nile Javelinmen", "Libyan Skirmishers", "Desert Scouts"],
        ShockCavalry => [
            "Greek Heavy Cavalry",
            "Cleruch Cavalry",
            "Royal Guard Cavalry",
        ],
        HorseArchers => [
            "Libyan Horsemen",
            "Arabian Horse Archers",
            "Desert Horse Archers",
        ],
        ArtilleryCrew => [
            "Alexandrian Engineers",
            "Tower Artillery Crew",
            "Royal Siege Crew",
        ],
        Peasant => ["Nile Levy", "Village Levy", "Pressed Laborers"],
        LightSword => [
            "Machimoi Swords",
            "Greek Settler Swords",
            "Galatian Auxilia",
        ],
        HeavySpear => ["Cleruch Spearmen", "Armoured Machimoi", "Royal Spear Guard"],
    })
}

fn seleucid_names(class: UnitClassId) -> Option<[&'static str; 3]> {
    use UnitClassId::*;
    Some(match class {
        HeavySword => ["Argyraspid Swordsmen", "Thorakitai", "Royal Guard Swords"],
        LightSpear => ["Thureophoroi", "Syrian Spearmen", "Anatolian Spear Auxilia"],
        LongSwords => [
            "Galatian Mercenaries",
            "Pisidian Swordsmen",
            "Elite Galatians",
        ],
        Phalanx => [
            "Settler Phalanx",
            "Silver Shield Phalanx",
            "Royal Phalangites",
        ],
        Archers => ["Syrian Archers", "Cretan Archers", "Persian Archers"],
        Skirmishers => ["Arabian Javelinmen", "Cilician Skirmishers", "Dahae Scouts"],
        ShockCavalry => ["Agema Cavalry", "Median Lancers", "Cataphracts"],
        HorseArchers => [
            "Dahae Horse Archers",
            "Parthian Horsemen",
            "Saka Horse Archers",
        ],
        ArtilleryCrew => [
            "Royal Engineers",
            "Antiochene Ballista Crew",
            "Siege Train Crew",
        ],
        Peasant => ["Syrian Levy", "Village Levy", "Satrapal Levy"],
        LightSword => [
            "Thureophoroi Swords",
            "Anatolian Auxilia",
            "Thorakitai Swords",
        ],
        HeavySpear => [
            "Heavy Thureophoroi",
            "Median Spear Guard",
            "Royal Spear Guard",
        ],
    })
}
