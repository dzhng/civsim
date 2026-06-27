//! Campaign tuning constants. Data, not code — same doctrine as sim's class
//! tables. Campaign march speeds are deliberately separate from battle
//! speed_mult: they answer "km/day on a road", not "m/s on a field".

use contract::UnitClassId;

/// Game-minutes one tick represents. The render/AI budget is fixed at the
/// frontend's ticks-per-second, so raising this advances the whole campaign
/// world faster per real second — units cross more ground, days pass sooner —
/// for the same compute. Game-world durations below scale with it (so they keep
/// their in-world length while playing out faster); real-time-anchored windows
/// (battle prep) and the AI's real-time cadence stay in raw ticks. 10 = the old
/// max speed becomes the new base. Tune against in-game feel.
pub const MINUTES_PER_TICK: u32 = 10;
/// Campaign ticks per day (24h × 60min ÷ minutes-per-tick).
pub const TICKS_PER_DAY: u32 = 24 * 60 / MINUTES_PER_TICK;
/// Campaign ticks per game-month (a flat 30-day month). The realm settles its
/// whole economy once a month in one legible pulse — income, upkeep, population,
/// development, loyalty — instead of trickling every day. ≈ 72 s real at 1×.
pub const TICKS_PER_MONTH: u32 = 30 * TICKS_PER_DAY;
/// A game-world duration in ticks from its length in game-minutes — scales with
/// the time rescale so it keeps its in-world meaning. At least one tick.
pub const fn ticks_from_minutes(minutes: u32) -> u32 {
    let t = minutes / MINUTES_PER_TICK;
    if t == 0 {
        1
    } else {
        t
    }
}
/// Maximum roster entries in one field army. The campaign marker scales its
/// compressed figures against this capacity.
pub const ARMY_STACK_UNIT_CAP: usize = 20;
/// Fixed administrative cost for changing one faction-wide class doctrine
/// (unit type and/or establishment size). Paid once per applied class change.
pub const CLASS_SWITCH_FEE: u32 = 75;
/// Cooldown before a faction can change the same class doctrine again.
pub const CLASS_SWITCH_COOLDOWN_TICKS: u64 = 7 * TICKS_PER_DAY as u64;
/// One road tile of march, in km (must match mapgen's TILE_KM).
pub const TILE_KM: f32 = 5.0;

/// Baseline infantry march: 30 km/day => one 5 km tile per 4 campaign hours.
pub const BASE_TILES_PER_TICK: f32 = (30.0 / TILE_KM) / TICKS_PER_DAY as f32;

/// March-speed multiplier per class (1.0 = baseline foot).
pub fn march_mult(class: UnitClassId) -> f32 {
    use UnitClassId::*;
    match class {
        HeavySword => 0.9,
        LightSpear => 1.1,
        LongSwords => 1.0,
        HeavyPhalanx => 0.85,
        Archers => 1.0,
        Skirmishers => 1.15,
        ShockCavalry => 2.2,
        HorseArchers => 2.4,
        ArtilleryCrew => 0.7,
        Peasant => 1.05,
        LightSword => 1.1,
        HeavySpear => 0.9,
        MediumInfantry => 1.0,
        MediumSpear => 1.0,
        MediumPhalanx => 0.9, // a pike marches slow, but lighter than the elite phalanx
    }
}

/// Baseline establishment strength for one army slot. ONE army slot IS exactly one
/// battle unit, so this is simply the shared unit size (`contract::unit_size`):
/// 500 close-order foot / 350 loose foot / 200 horse / 80 crew. The class builder's
/// 1x/2x/3x multiplies it, and
/// replenishment fills toward it. (There is no separate "pool that splits into
/// battle units" any more — a campaign unit and a battle unit are the same thing.)
pub fn unit_establishment(class: UnitClassId) -> u32 {
    contract::unit_size(class)
}

/// Sea lanes: fixed fleet speed regardless of composition (km/day / tile).
pub const SEA_TILES_PER_TICK: f32 = (120.0 / TILE_KM) / TICKS_PER_DAY as f32;
/// Embark/disembark at a port — 2 game-hours.
pub const EMBARK_TICKS: u16 = ticks_from_minutes(120) as u16;

/// Tile-feature march multipliers (roads through passes/fords are slow).
pub fn feature_mult(feature: crate::mapdata::TileFeature) -> f32 {
    use crate::mapdata::TileFeature::*;
    match feature {
        Open | Forest => 1.0,
        Hill => 0.85,
        Pass => 0.7,
        Bridge => 0.9,
        Ford => 0.5,
        Sea => 1.0, // sea speed handled separately
    }
}

/// Field-encounter prep — a brief "form up" beat before two field armies
/// clash. Real-time-anchored (raw ticks, not game-minutes): the frontend runs
/// ~60 ticks/s at base speed, so 20 ticks ≈ 0.3 s.
pub const PREP_TICKS: u16 = 20;
/// Ambush victim / surprised attacker prep.
pub const PREP_SURPRISED_TICKS: u16 = 40;
/// A city assault does NOT commit instantly. When a field army contacts a
/// defended city the garrison sorties and the two enter a *siege* — a prep the
/// campaign keeps running through, the window in which relief can still reach
/// the walls. Applies to every faction's cities (one logic for AI and human).
///
/// Pegged to fog of war: a besieging army sees only `VISION_ARMY` tiles, so a
/// relief force hidden beyond that — out in the fog — has to cross the sight
/// radius to intervene. The siege lasts a foot army's march across the city's
/// vision radius (`VISION_CITY` tiles) plus a half-margin for reaction, so an
/// unseen column staged at the edge of the fog can just make it. Besieging is
/// therefore a bet that no army you can't see is poised to relieve — the same
/// gamble for the player and the AI. (~288 ticks ≈ 5 s at base speed.)
///
/// For the city to be takeable it must not replenish under siege (economy
/// `day_tick` freezes garrison regen AND muster completion while threatened);
/// the AI's rollout collapses the siege to ordinary prep so its lookahead stays
/// cheap (sim `encounters`). An undefended city falls via `occupations`.
pub const SIEGE_TICKS: u16 = {
    // foot crosses one tile in 1/BASE_TILES_PER_TICK ticks (24 at base scale).
    let ticks_per_tile = (1.0 / BASE_TILES_PER_TICK) as u32;
    (crate::visibility::VISION_CITY * ticks_per_tile * 3 / 2) as u16
};
/// Armies preparing for battle move at half pace.
pub const PREP_SPEED_MULT: f32 = 0.5;
/// Digging a camp in takes an hour; the payoff is instant readiness when
/// attacked (defender prep 0, attacker surprised) and extra vision.
pub const CAMP_BUILD_TICKS: u16 = ticks_from_minutes(60) as u16; // 1 game-hour
/// A dug-in camp sees further (palisade towers).
pub const CAMP_VISION_BONUS: u32 = 2;

/// March/route multiplier by road level (indexed by level; 0 unused).
pub const ROAD_SPEED_MULT: [f32; 4] = [1.0, 1.0, 1.3, 1.6];
pub const ROAD_MAX_LEVEL: u8 = 3;
pub fn road_mult(level: u8) -> f32 {
    ROAD_SPEED_MULT[level.min(ROAD_MAX_LEVEL) as usize]
}

/// Routed armies: tiles of hostile-free road needed to regroup (or a nearer
/// friendly city); no such path at battle end = captured and wiped.
pub const ROUT_TILES: u16 = 16;
/// After a routed army outruns the force that beat it, this is how long it
/// stays a vulnerable, run-downable rabble before regrouping. Short: a beaten
/// army that isn't pursued is back in play soon, but a pursuer who catches it
/// in this window destroys it — so a won battle can actually clear a front.
pub const ROUT_REGROUP_TICKS: u32 = ticks_from_minutes(120); // 2 game-hours
pub const ROUT_SPEED_MULT: f32 = 1.15;

/// Reinforcements: armies within this road distance (tiles) join a battle.
pub const REINFORCE_RADIUS_TILES: u32 = 12;
/// One campaign hour of approach march = this many battle seconds of delay.
pub const REINFORCE_SECS_PER_HOUR: f32 = 90.0;
pub const REINFORCE_MAX_DELAY_SECS: f32 = 900.0;

/// After a successful escape, the same pair can't re-engage for this long —
/// the time it takes the gap to become physically real (~2.5 tiles of march).
pub const ESCAPE_COOLDOWN_TICKS: u64 = ticks_from_minutes(720) as u64; // 12 game-hours

/// Ambush stance: settle into concealment beside the road (~quarter game-hour).
pub const AMBUSH_SETTLE_TICKS: u16 = ticks_from_minutes(15) as u16;

/// Unopposed occupation of an undefended city — 4 game-hours.
pub const OCCUPY_TICKS: u16 = ticks_from_minutes(240) as u16;

// ---- population, monthly income, development -------------------------------
// The economy is population-driven and settles on the monthly pulse. A city's
// population is the source of both its gold and its recruitment pool; two policy
// dials (focus, throttle) and the development it accumulates decide the split.

/// Population ceiling by city tier (index 0 unused). Logistic growth asymptotes
/// here; a bigger city is a bigger economy and a deeper recruitment pool.
pub const CITY_POP_CAP: [u32; 4] = [0, 6_000, 12_000, 20_000];
pub fn city_pop_cap(tier: u8) -> u32 {
    CITY_POP_CAP[tier.min(3) as usize]
}
/// New cities open at this fraction of their cap — a settled world, not an empty
/// one waiting months to matter.
pub const POP_START_FRACTION: f32 = 0.6;
/// Monthly logistic growth rate (fraction of the room left to the cap), at full
/// Grow throttle and full loyalty. Scaled down by Exploit and by low loyalty.
pub const POP_GROWTH: f32 = 0.12;
/// Monthly population a city loses to full Exploit throttle (men sent to the
/// fields/mines instead of raising families). Exploit can shrink a city.
pub const POP_EXPLOIT_DRAIN: f32 = 0.04;

/// Monthly gold per unit of population, before development and throttle lift it.
/// Calibrated so a mid-development tier-2 city earns on the order of the old
/// daily trickle summed over a month.
pub const INCOME_PER_POP_MILLIGOLD: u32 = 600;
/// Monthly income of one city from its population, economic development, throttle
/// and loyalty. Output = pop × base × (½ + econ_dev) × throttle_yield × loyalty.
pub fn city_monthly_income(pop: u32, econ_dev: f32, throttle: f32, loyalty: f32) -> u32 {
    let econ_mult = 0.5 + econ_dev.clamp(0.0, 1.0); // 0.5 (raw) … 1.5 (developed)
    let throttle_yield = 1.0 + 0.5 * throttle.clamp(0.0, 1.0); // Exploit earns more now
    let drag = output_loyalty_mult(loyalty); // unrest skims the take
    let g = pop as f32 * INCOME_PER_POP_MILLIGOLD as f32 / 1000.0 * econ_mult * throttle_yield * drag;
    g.max(0.0) as u32
}
/// Low loyalty drags economic output and population growth — never to zero, so a
/// restive city still limps along, but a frontier earns a fraction of a heartland.
pub fn output_loyalty_mult(loyalty: f32) -> f32 {
    0.3 + 0.7 * loyalty.clamp(0.0, 1.0)
}

/// How fast development ramps toward (and decays away from) its focus target each
/// month. A city re-tools over a handful of months — "set a direction and walk
/// away" — so the cost of indecision is ramp time, not a build menu.
pub const DEV_RAMP: f32 = 0.18;
/// Development target an axis ramps toward, from the city's focus dial
/// (−1 = full Economy, +1 = full Military). econ_target = (1−focus)/2,
/// mil_target = (1+focus)/2 — Balanced (0) lands both at ½.
pub fn econ_target(focus: f32) -> f32 {
    (1.0 - focus.clamp(-1.0, 1.0)) / 2.0
}
pub fn mil_target(focus: f32) -> f32 {
    (1.0 + focus.clamp(-1.0, 1.0)) / 2.0
}

// ---- upkeep & recruitment --------------------------------------------------
// Army upkeep is heavy and settles monthly: a unit pays HALF its recruitment
// cost every month, so a unit costs its raise-price again every two months it
// stands. This is what makes a doomstack a standing bill, not a one-off buy.

/// Per-class raise cost (gold ×1000 per soldier). The AI's army-value yardstick
/// derives from this (`economy::value_per_soldier_milligold` ≈ cost / 50), kept
/// separate from the heavy upkeep so the upkeep cadence can't rescale it.
pub fn recruit_cost_milligold(class: UnitClassId) -> u32 {
    base_rate(class) * 50
}
/// Monthly upkeep per soldier = half the recruitment cost. The 50%-of-raise rule
/// the whole economy is pegged to (slice 02); unit-type option multipliers keep
/// the ratio because both derive from the same cost.
pub fn upkeep_per_soldier_milligold(class: UnitClassId) -> u32 {
    recruit_cost_milligold(class) / 2
}
/// Per-class cost/value base. Cavalry and crews are dear to raise and to keep.
fn base_rate(class: UnitClassId) -> u32 {
    use UnitClassId::*;
    match class {
        HeavySword => 20,
        LightSpear => 10,
        LongSwords => 25,
        HeavyPhalanx => 20,
        Archers => 18,
        Skirmishers => 12,
        ShockCavalry => 60,
        HorseArchers => 55,
        ArtilleryCrew => 40,
        Peasant => 4, // they feed themselves off the land
        LightSword => 12,
        HeavySpear => 20,
        MediumInfantry => 16,
        MediumSpear => 16,
        MediumPhalanx => 18, // a pike costs a touch more to keep than a medium line
    }
}
pub fn recruit_ticks_per_soldier(class: UnitClassId) -> u32 {
    use UnitClassId::*;
    match class {
        ShockCavalry | HorseArchers => 6,
        ArtilleryCrew => 5,
        HeavySword | HeavyPhalanx | LongSwords | MediumInfantry | MediumSpear | MediumPhalanx => 3,
        _ => 2,
    }
}

// ---- loyalty / overextension -----------------------------------------------
// Loyalty (0..1) drifts each month by the signed balance of friendly vs enemy
// connected territory. No capital: the frontier is disloyal by default because it
// borders the enemy, and the interior fills in as the core stabilises. A fresh
// conquest survives only while a stationed army anchors it.

/// A conquered city flips to its taker with a little loyalty, not zero — enough
/// that an anchoring army can hold and slowly pacify it, too little to survive
/// surrounded and abandoned.
pub const CONQUEST_LOYALTY: f32 = 0.25;
/// Per-month loyalty change per unit of net (friendly − enemy) connected weight.
/// Sized so a surrounded, unanchored conquest (net ≈ −2) loses its starting
/// loyalty inside a single month and revolts.
pub const LOYALTY_DRIFT: f32 = 0.2;
/// A city revolts (flips to independents) when loyalty falls to or below this.
pub const LOYALTY_REVOLT: f32 = 0.0;
/// An army acts like a city for loyalty once it holds this many units; below it,
/// its weight scales down (min(units / this, 1)). A real field force anchors a
/// salient; a handful of stragglers barely registers.
pub const ANCHOR_MIN_UNITS: u32 = 10;
/// Loyalty weight of one connected enemy-owned city (full hostile pressure).
pub const LOYALTY_ENEMY_CITY: f32 = 1.0;
/// Loyalty weight of a full army anchor (friendly raises, enemy drags). Heavier
/// than a city so a stationed army can hold a conquest two enemy cities press on.
pub const LOYALTY_ARMY_WEIGHT: f32 = 3.0;
/// Extra enemy-side drag from over-exploiting a city (Throttle → Exploit): a
/// squeezed populace is a restive one.
pub const LOYALTY_EXPLOIT_DRAG: f32 = 0.5;

// ---- conquest: sack vs hold ------------------------------------------------
/// Sacking a city converts its population to instant plunder at this rate
/// (gold ×1000 per head) and razes the populace.
pub const SACK_GOLD_PER_POP_MILLIGOLD: u32 = 500;
/// Population left in a sacked city (fraction): a gutted town, not an empty map
/// tile — it can recover over many months if held.
pub const SACK_POP_REMAINING: f32 = 0.1;

/// Daily desertion per roster entry while the treasury is empty.
pub const DESERTION_PER_DAY: f32 = 0.02;
/// Passive replenishment per day, as a fraction of missing strength:
/// halted at a friendly city / in friendly territory / elsewhere.
pub const REPLENISH_CITY: f32 = 0.05;
pub const REPLENISH_FRIENDLY: f32 = 0.02;
pub const REPLENISH_HOSTILE: f32 = 0.005;
/// Rally-scar recovery per day while halted at a friendly city.
pub const MORALE_CAP_REGEN: f32 = 0.05;

/// Garrison regeneration: fraction of the city's establishment per day.
/// (0.02 left sacked cities open for fifty days — a razed garrison now
/// stands again in under a month.)
pub const GARRISON_REGEN: f32 = 0.04;
/// A city replenishes its garrison — by regen AND by completing musters (economy
/// `day_tick`) — only while its territory is clear of enemies within this many
/// road tiles. A besieged city (enemy at the gate) is the extreme case: it can't
/// rebuild mid-assault, or the besieger wins every fight yet a freshly-replenished
/// garrison keeps the city un-takeable. But an enemy column merely roaming the
/// near approaches also pins it — a realm rebuilds its walls in peace, not under
/// invasion. ~6 tiles ≈ a day's foot march.
pub const GARRISON_SAFE_TILES: u32 = 6;

// ---- AI fiscal discipline --------------------------------------------------
// The AI keeps a war chest and caps its field army by territory, so force size
// equilibrates to what the realm can sustain.
/// Months of income the AI keeps in reserve before spending on troops. With
/// upkeep settled monthly, the commander must hold back enough to pay the next
/// month's army before raising more — heavy upkeep is what caps a doomstack.
pub const AI_RESERVE_MONTHS: u32 = 1;
/// Field-army ceiling per owned city. A realm only raises as many troops as
/// its territory can supply, so the road to a bigger army is conquest. (The
/// population pool is the harder cap; this keeps the AI from over-committing a
/// single rich city's pool into one doomstack.)
pub const AI_SOLDIERS_PER_CITY: u32 = 2000;
/// How many of the nearest enemy cities the AI weighs (with a defender probe)
/// before falling back to simply advancing on the nearest one.
pub const AI_TARGET_CANDIDATES: usize = 8;
/// How many of its strongest free armies a faction sends on the offensive each
/// cycle. More than one keeps a front pressed and lets a beaten enemy be run
/// down by the next army instead of one lone army winning then wandering off.
pub const AI_ATTACKERS: usize = 3;
/// How close (road tiles) a visible enemy army must be to a target city to
/// count among its defenders when the AI weighs an assault.
pub const AI_THREAT_RADIUS: u32 = 6;

// ---- AI lookahead ----------------------------------------------------------
// The commander imagines a few candidate commitments, rolls each forward this
// many campaign minutes with the cheap battle estimate, and scores the result.
/// Minimum rollout before a candidate is scored — even "hold" rolls this far,
/// so a plan is judged against at least a day of the enemy's moves. Above this
/// floor the rollout runs adaptively (see `AI_ROLLOUT_CAP`).
pub const AI_ROLLOUT_HORIZON: u32 = TICKS_PER_DAY; // one game-day floor
/// Hard ceiling on an adaptive rollout. A committed plan rolls forward only
/// until its armies settle (reach their target, fight, occupy) — a nearby
/// conquest stops in a day or two — but a march toward a distant objective is
/// cut off here. Set above a cross-map foot march so the lookahead can still
/// see the payoff of a long offensive (movement is slow: ~hundreds of ticks per
/// 5 km tile), while bounding the cost of a hopeless or far-off pursuit.
pub const AI_ROLLOUT_CAP: u32 = ticks_from_minutes(6_000); // ~4 game-days
/// How often (ticks) a faction re-runs the expensive offensive lookahead. The
/// hourly commander still defends, recruits, and consolidates every pass; only
/// the search — clone-and-roll-forward over several candidates — is throttled to
/// this cadence. Armies take days to cross the map, so re-deciding the offensive
/// once a day loses nothing while keeping the search (the dominant AI cost) rare;
/// urgent mid-march reactions come from the event-triggered re-think, not here.
/// A multiple of the 60-tick commander cadence. Note: too infrequent and a
/// just-won army is pulled home by the hourly consolidate step before the next
/// search re-commits it — so this stays tight enough to keep an offensive alive.
pub const AI_SEARCH_EVERY: u64 = 360;

// ---- AI nerve: randomness so the commander doesn't play like a solver -------
// Two knobs turn a cold argmax into something that reads human: a drifting mood
// (bravado) that makes a faction run hot or cold in streaks, and a softmax over
// candidate scores so it doesn't always take the textbook-best plan.
/// Floor/ceiling on a faction's drifting combat mood (1.0 = level-headed).
pub const AI_BRAVADO_MIN: f32 = 0.7;
pub const AI_BRAVADO_MAX: f32 = 1.3;
/// Random-walk step applied to bravado each search cadence. Small, so the mood
/// is sticky (a brave streak persists) rather than fresh noise every decision.
pub const AI_BRAVADO_DRIFT: f32 = 0.08;
/// Score bonus an offensive plan gets per unit of bravado above 1.0 (and the
/// penalty below). In score units — enough to tip a close call toward or away
/// from a fight, so a brave faction commits to gambles the cold math would pass
/// on, but not enough to throw a clearly-won city away. "Hold" gets none.
pub const AI_BRAVADO_AGGRO: f64 = 40_000.0;
/// Softmax temperature (score units) for picking among scored plans: larger =
/// more exploratory, near-zero = argmax. Sized so plans within a fraction of a
/// city's worth get genuinely sampled, while a plan a whole city better almost
/// always wins.
pub const AI_SELECT_SCALE: f64 = 15_000.0;

// ---- AI off-thread dispatch ------------------------------------------------
// When the host drives the AI externally (a worker), it computes decisions for
// the snapshot at a dispatch tick and applies them a fixed delay later, so the
// outcome is independent of how long the worker took — only ever forcing a wait,
// never a different result. Both are real-time-bound (ticks at a fixed rate), so
// AI cost per real-second is independent of game speed.
/// How often (ticks) the host dispatches a fresh AI snapshot. 60 = once a real
/// second at base speed, the same rhythm as the inline commander pass.
pub const AI_DISPATCH_EVERY: u64 = 60;
/// Ticks between dispatching a snapshot and applying the decision it yields —
/// the worker's compute budget. The orders are a touch stale on arrival, which
/// is harmless because armies move only a fraction of a tile in this window.
pub const AI_LATENCY: u64 = 60;

// ---- AI rivalry ------------------------------------------------------------
// A nemesis a faction fixates on, beyond cold strategy. Seeded historically or
// formed when attacked, escalating toward the strongest aggressor and
// dissolving once the gap in power grows too wide.
/// A rival must out-power the current one by this percent before the grudge
/// switches to it — hysteresis, so a rivalry doesn't flip every skirmish.
pub const AI_RIVAL_SWITCH_MARGIN: u64 = 130;
/// Dissolve the rivalry once the stronger side is at least this many times the
/// weaker: a giant stops fixating on a crushed minnow, and vice-versa.
pub const AI_RIVAL_DISSOLVE_RATIO: u64 = 3;

// ---- diplomacy -------------------------------------------------------------
// Diplomacy is what breaks the six-power peer standoff: instead of every power
// fighting every neighbour at parity, each focuses war on its weakest reachable
// peer, makes peace elsewhere to mass its army on one front, and allies with
// anyone who shares its victim. The weakest get ganged and eaten, a new weakest
// emerges, and the map resolves instead of freezing.
/// How often (ticks) factions re-evaluate treaties. Weekly: sticky enough not
/// to thrash, responsive enough to follow the shifting balance of power.
pub const DIPLOMACY_EVERY: u32 = 7 * TICKS_PER_DAY;
/// A city's worth in the strength yardstick when ranking powers for diplomacy
/// (so a wide, lightly-garrisoned realm still reads as a real power).
pub const DIPLO_CITY_WEIGHT: u64 = 3000;
