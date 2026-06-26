//! Morale: the will to fight. A hidden state, but it obeys the same law as
//! everything else — its INPUTS are physical facts (casualty rate, contact
//! bearings, anchor drift vs intent, incoming charge momentum, arrows,
//! nearby routs) and its OUTPUTS are physical behaviors (flee as bodies).
//! Crowd pressure is deliberately NOT an input: an advancing column must
//! never rout from its own deliberate press.

use crate::math::{dir, Vec2};
use crate::sim::Sim;
use crate::unit::OrderMode;

/// Morale below this breaks the unit.
const BREAK_AT: f32 = 0.18;
/// Panic saturates: the casualty-rate that feeds the blood drain is capped here,
/// so a burst (a charge dropping a swath in seconds) reels a unit instead of
/// instantly shattering it. A steady grind sits well under this; only a shock hits
/// it. Tuned so a charged line HOLDS through the impact into a grind.
const MAX_CASUALTY_RATE: f32 = 0.35;
/// Blood is the primary breaker. Coefficient on the casualty-rate drain. With
/// the enemy-press / friend-support factors at their even-fight baseline, tuned
/// so two equal lines grind to ~80% casualties before the loser's will breaks.
const CAS_DRAIN: f32 = 0.026;
/// Nearby standing ENEMY strength (size × aura, summed) multiplies the blood
/// drain — being pressed by a big, bold mass makes each loss bite. Mirror of
/// SUPPORT_LIFT.
const THREAT_DRAIN: f32 = 0.05;
/// Nearby steady FRIEND strength (size × aura, summed) divides the blood drain —
/// a well-backed line endures far more before breaking.
const SUPPORT_LIFT: f32 = 0.16;
/// Rallied units carry scars: ceiling multiplier per rout.
const RALLY_SCAR: f32 = 0.78;
/// Morale has a standing EQUILIBRIUM set by the local power balance: the blood
/// drain is the transient shock, but where morale settles BETWEEN shocks is the
/// odds. The local fighting-power SHARE (mine + nearby friends vs nearby enemy,
/// 0.5 = even) maps linearly to a target morale: at an even share the target is
/// ODDS_EVEN (high — even fights are unchanged and grind down on blood to ~10%
/// men as before), and below even it falls off at a slope set per-class by NERVE
/// so the unit's target crosses the break line at the disadvantage it can stand.
/// The per-man power is weighted by quality (dps × health), so being outnumbered
/// by frailer troops counts for less than by better ones — and reading a SHARE
/// (not my own raw count) keeps an even fight from death-spiralling: both lines
/// shrink together, the share stays ~0.5, only being out-powered sinks the target.
const ODDS_EVEN: f32 = 0.9;
/// Slope of target-vs-share per unit of FRAGILITY (= discipline / bravery). A
/// steadfast heavy (fragility ~0.8) gets slope ~3 and only targets the break
/// line near a 3:1 power disadvantage (share 0.25); a brittle levy (fragility
/// ~2.4) gets a slope ~3x steeper and wavers at a slight disadvantage.
const ODDS_SLOPE_K: f32 = 3.75;
/// How fast morale relaxes toward the odds target (per second): a loss of heart
/// from hopeless odds builds over ~10s, not in an instant of bad geometry.
const ODDS_PULL: f32 = 0.1;
/// A mount counts toward its rider's morale WEIGHT at this fraction of its combat
/// HP. A horse's full body pool (~8 HP) is how much killing it takes, not its
/// presence on the field: a horseman reads as roughly TWICE a footman in the
/// power balance, not ten times. Tuned so 1 shock-cav ≈ 2 heavy infantry, and an
/// enemy cav presses a line about twice as hard per man — both sides use this
/// same weight, so it cuts symmetrically.
const MOUNT_WEIGHT: f32 = 0.35;

impl Sim {
    pub(crate) fn run_morale(&mut self, dt: f32) {
        if !self.tun.morale_enabled {
            return;
        }
        // The verdict must be SUSTAINED: a momentary rout (which may yet
        // rally) is not a decision — a 1v1 duel used to end the instant a
        // unit broke. Once the field has stayed decided for a few seconds,
        // the verdict is FINAL: morale freezes — the routed stay routed,
        // the standing never break — and the sim keeps running so the
        // pursuit plays out as bodies.
        if self.raw_victor().is_some() {
            self.verdict_hold += dt;
        } else {
            self.verdict_hold = 0.0;
        }
        if self.victor().is_some() {
            return;
        }
        // Enemy unit summaries for geometry checks (cheap; 40 units).
        // (center, team, alive, routing, speed, mass)
        // (center, team, alive, routing, measured advance of the MASS,
        // total living mass, offense = men x damage-per-second, pool =
        // men x health, morale). Formulas read men, mass, and measured
        // motion — never banners or commanded state (see README).
        let summaries: Vec<(Vec2, u32, usize, bool, f32, f32, f32, f32, f32)> = self
            .units
            .iter()
            .map(|u| {
                let stats = u.stats;
                // SUSTAINED dps for the standing power-share. A CHARGE weapon (the
                // lance) fires ONCE per charge, then the rider draws his sabre — so
                // `lance.damage / interval` is NOT a sustained rate; counting it
                // makes a walking horseman read as 3x as deadly as the sabre he
                // actually grinds with, and panics a line he would lose to. The
                // charge's real threat is its MOMENTUM, read by the intimidation
                // term below; the power-share reads the GRIND weapons only. (A
                // charge-only body would read 0 here — correct: with the lance spent
                // it has no sustained attack, only the one-off shock.)
                let dps = stats
                    .weapons
                    .iter()
                    .filter(|w| !w.is_charge())
                    .map(|w| w.damage / w.attack_interval)
                    .fold(0.0f32, f32::max);
                let n = u.alive_count as f32;
                (
                    u.center(),
                    u.team,
                    u.alive_count,
                    u.routing,
                    u.mass_advance.max(0.0),
                    n * stats.mass,
                    n * dps,
                    n * stats.health,
                    u.morale,
                )
            })
            .collect();

        for ui in 0..self.units.len() {
            let u = &self.units[ui];
            if u.alive_count == 0 {
                continue;
            }
            let my_team = u.team;
            let my_center = u.center();
            // Morale geometry is EDGE-to-EDGE: a 300-man block's near face, not its
            // distant centre, is what a neighbour feels (a friend pressed against
            // your flank steadies you even if its centroid is 30 m off). Half the
            // larger span is a cheap circular bound on each unit's reach.
            let my_half = 0.5 * u.width().max(u.depth());
            let alive_n = u.alive_count.max(1) as f32;

            // --- physical inputs ------------------------------------------
            // Panic saturates: a unit can only break so fast. A charge that drops
            // 50 men in two seconds spikes this rate enormously and would shatter
            // the unit before it ever fights back — but real troops reel from a
            // shock, they don't evaporate. Capping the rate lets a charged line
            // HOLD through the impact into a grind (where it can answer), while a
            // steady grind (rate well under the cap) is untouched.
            let casualty_rate = (u.recent_casualties / alive_n).min(MAX_CASUALTY_RATE); // per ~8s window
            let missile_rate = u.recent_missiles / alive_n;
            let losing_push = u.losing_push;

            // Attack DIRECTIONS from the contact histogram: contiguous active
            // sectors merge into one direction. A frontal fight (1-3 adjacent
            // sectors) is one direction and costs nothing; flanked = 2;
            // surrounded = 3+. Raw sector counts would panic every line fight.
            let active: Vec<bool> = (0..12).map(|k| u.contact_hist[k] > 1.5).collect();
            let mut groups = 0;
            for k in 0..12 {
                if active[k] && !active[(k + 11) % 12] {
                    groups += 1;
                }
            }
            if groups == 0 && active.iter().any(|&a| a) {
                groups = 1; // fully encircled: every sector active
            }
            let spread = groups as f32;
            let active_count = active.iter().filter(|&&a| a).count();
            let surrounded = groups >= 3 || active_count >= 8;

            // Charge intimidation: incoming kinetic energy, pre-contact.
            let mut intimidation = 0.0f32;
            // Nearby friendly routs: panic is contagious in sight range.
            let mut rout_contagion = 0.0f32;
            // Steady friends nearby brace the will.
            let mut steady_friends = 0.0f32;
            // Standing enemies nearby press the will — the mirror of steady
            // friends. Their size×aura summed; folded against my own backing as
            // ODDS, so an even matchup is neutral and only being OUT-massed
            // (outnumbered, or facing a high-aura shock arm) accelerates the break.
            let mut enemy_threat = 0.0f32;
            // The sight of enemy BACKS: a routing enemy emits nothing to
            // fear — it emits relief. This is what breaks the mutual-rout
            // race: the side that holds one beat longer gets paid for it.
            let mut enemy_backs = 0.0f32;
            // Local fighting power, proximity-weighted, for the odds baseline:
            // the standing combat WEIGHT of nearby friends (plus my own) versus
            // nearby enemies, as a SHARE (even fight ~0.5). Per-man weight is
            // dps × durability — kill-rate times the body that must be dropped to
            // fell the man, so one armoured heavy is worth ~3 peasants. Durability
            // for a horseman is rider + MOUNT (a lancer is a ~10-HP target on a
            // half-tonne animal); counting only the rider would make cavalry read
            // as fragile foot and rout it against lines it should ride over.
            let my_durab =
                self.units[ui].stats.health + MOUNT_WEIGHT * self.units[ui].stats.mount_health;
            let my_weight = summaries[ui].6 * my_durab; // offense × per-man durability
            let mut friend_power = my_weight;
            let mut enemy_power = 0.0f32;
            let my_mass = alive_n * u.stats.mass;
            let my_morale = u.morale;
            let my_pool = summaries[ui].7;
            for (vi, &(c, team, alive_v, v_routing, advance, mass_total, v_offense, _, v_morale)) in
                summaries.iter().enumerate()
            {
                if vi == ui || alive_v == 0 {
                    continue;
                }
                // EDGE-to-edge is the default for steadiness/relief geometry.
                // CHARGE intimidation is the one exception that keeps CENTRE
                // distance: it is the momentum of an approaching MASS (its whole
                // body bears down, not just the near rank), and it is finely
                // calibrated against the morale_scenarios — edge distance double-
                // counts the wall's depth and breaks a line before contact.
                let their_half = 0.5 * self.units[vi].width().max(self.units[vi].depth());
                let d_center = (c - my_center).len();
                let d = (d_center - my_half - their_half).max(0.0);
                if team != my_team {
                    if v_routing {
                        if d < 90.0 {
                            // Relief scales with the SIZE of the rout you
                            // watch: a broken main line pays more than a
                            // fleeing handful of skirmishers.
                            let _ = v_offense;
                            let weight = (mass_total / my_mass).min(2.0);
                            enemy_backs += weight * (1.0 - d / 90.0);
                        }
                        continue; // a broken enemy frightens nobody
                    }
                    // Standing-enemy pressure: the same size×aura×proximity the
                    // friendly branch reads, summed for the foes in steadiness
                    // range. This is the SLOW will-drain of being pressed by a
                    // big bold enemy, distinct from the pre-contact charge fear
                    // below (which is momentum, centre-distance, and habituates).
                    if d < 80.0 {
                        let aura = self.units[vi].stats.morale_aura;
                        enemy_threat += (alive_v as f32 / 100.0) * aura * (1.0 - d / 80.0);
                        // Power that bears on ME: proximity, but also whether the
                        // foe FACES me (a unit fighting the other way, or fleeing,
                        // presses little) and whether it is actually ENGAGED (a
                        // line locked in melee is bringing its weight to bear; one
                        // standing off is a lesser, if looming, presence). A
                        // back-turned or idle foe keeps a small floor — it is still
                        // a body on the field — but a facing, fighting mass counts full.
                        let facing_me = dir(self.units[vi].facing)
                            .dot((my_center - c) * (1.0 / d_center.max(0.1)));
                        let oriented = 0.35 + 0.65 * facing_me.max(0.0);
                        let engaged = if self.units[vi].engaged > 0 { 1.0 } else { 0.6 };
                        let durab = self.units[vi].stats.health
                            + MOUNT_WEIGHT * self.units[vi].stats.mount_health;
                        enemy_power += v_offense * durab * (1.0 - d / 80.0) * oriented * engaged;
                    }
                    if d_center < 70.0 {
                        // Approaching MOMENTUM, relative to the mass it's
                        // aimed at: a wall of horse at the gallop is
                        // terrifying; five survivors of that wall are not.
                        // Measured advance, not commanded pace — a unit
                        // pinned in a jam frightens nobody.
                        let closing = ((my_center - c) * (1.0 / d_center.max(0.1)))
                            .dot(dir(self.units[vi].facing))
                            * advance;
                        if closing > 3.5 {
                            // Fear is ANTICIPATED HARM, both ledgers: the
                            // blood their weapons will draw (men x dps)
                            // PLUS the trample (mass x closing — the same
                            // momentum the collision system will cash on
                            // impact as knockdowns and displacement). The
                            // kinetic term is why horse out-frightens
                            // foot of equal dps: it arrives as a wall.
                            // 20 lancers on 100 heavies project ~nothing;
                            // 400 project a massacre. Confidence SHOWS:
                            // a wavering mass doesn't thunder — you fear
                            // units bolder than you, never shakier ones.
                            // The cap sits HIGH: a 10:1 mass closing in is
                            // hopeless, and hopelessness reads as exactly
                            // that — a token line breaks before the wall
                            // arrives, at full courage.
                            let arriving = v_offense + 0.01 * mass_total * closing;
                            // Cap sits HIGH so a TRULY hopeless projection (a
                            // 10:1 wall) overwhelms habituation and breaks a
                            // token line before contact; moderate odds sit well
                            // under it and are unchanged.
                            let projected = (arriving / my_pool.max(1.0)).min(4.0);
                            let edge = ((v_morale - my_morale) / 0.25 + 1.0).clamp(0.0, 1.0);
                            intimidation += projected
                                * (closing / 6.0).min(1.5)
                                * (1.0 - d / 70.0)
                                * 3.0
                                * v_morale
                                * edge;
                        }
                    }
                } else if d < 80.0 {
                    if v_routing {
                        // Panic spreads from fleeing BODIES, not banners:
                        // an 8-man remnant streaming past is a sad sight,
                        // a 300-man collapse is a catastrophe.
                        let weight = (mass_total / my_mass).min(2.0);
                        rout_contagion += weight * (1.0 - d / 80.0);
                    } else if alive_v > 0 {
                        // Steady friends brace the will — weighted by how MANY
                        // they are and how much their CLASS inspires (heavy horse
                        // and a general's retinue carry a high aura; a wavering
                        // skirmisher screen, low). A line ringed by big, bold
                        // friends holds far past where it would break alone.
                        let aura = self.units[vi].stats.morale_aura;
                        steady_friends += (alive_v as f32 / 100.0) * aura * (1.0 - d / 80.0);
                        let durab = self.units[vi].stats.health
                            + MOUNT_WEIGHT * self.units[vi].stats.mount_health;
                        friend_power += v_offense * durab * (1.0 - d / 80.0);
                    }
                }
            }

            // --- amplifiers -------------------------------------------------
            let u = &self.units[ui];
            // Discipline is the endurance of the will: a drilled line eats
            // casualties that send a levy running (the tier knob).
            let discipline = 1.85 - 1.4 * u.training;
            let amp = (1.0 + (1.0 - u.combat_cohesion()))
                * (1.0 + 0.5 * (1.0 - u.stamina))
                * if surrounded { 1.6 } else { 1.0 }
                * discipline;

            // BLOOD is the primary breaker — a mirror grind runs minutes and
            // ends deep in the casualty list. Attack DIRECTIONS amplify the
            // blood (dying to blows from two sides breaks faster than the
            // same losses frontally) but flanking alone, with nobody dying,
            // flash-breaks nobody. The shove only registers as a real
            // drive-back; fear terms (charge, contagion) stay small.
            let directions = 1.0 + 0.5 * (spread - 1.0).max(0.0);
            // Fear HABITUATES: the stimulus drains by what exceeds the
            // adapted level (plus a quarter that always leaks through —
            // men never fully ignore cavalry at their backs). Blood does
            // not habituate.
            let fear = 0.05 * intimidation + 0.025 * rout_contagion;
            let fear_adapt = self.units[ui].fear_adapt;
            let fear_eff = (fear - fear_adapt).max(0.0) + 0.35 * fear;
            // Missiles break a unit through the BODIES they drop, not the noise
            // they make: the dead are already in `casualty_rate`, so the direct
            // missile term is small on purpose — just the dread of a fire you
            // can't answer, not a second copy of the casualties it causes. A
            // line that's being shot but not bled (shields shedding the volley)
            // holds; a line losing men breaks on the men, from any source.
            let missile_drain = 0.012 * missile_rate;
            // The transient will-drain is the BLOOD, pressed between two crowds:
            // nearby standing ENEMIES (size×aura) multiply it — being pressed by a
            // big, bold mass makes each loss feel like losing — and nearby steady
            // FRIENDS divide it. The baseline (one equal enemy, no friends) is
            // calibrated so an even fight grinds to ~90% casualties before the
            // loser breaks. This term reads a casualty RATE, not a standing count,
            // so it is the shock of the moment; where morale rests between shocks
            // is the ODDS baseline computed just below. Bravery (per class)
            // divides the whole drain; the ≤9-man guaranteed break still overrides.
            let enemy_press = 1.0 + THREAT_DRAIN * enemy_threat;
            let friend_support = 1.0 + SUPPORT_LIFT * steady_friends;
            let blood_drain = (CAS_DRAIN * casualty_rate * directions * enemy_press
                + missile_drain
                + 0.002 * (losing_push - 1.2).max(0.0)
                + fear_eff)
                * amp
                / (u.stats.bravery * friend_support).max(0.1);

            // The ODDS baseline: where morale settles between blood shocks. The
            // local power SHARE (mine + friends vs enemy) sets a target morale and
            // morale is pulled toward it (downward only — winning is a relief the
            // recover path already pays, not free courage here). With no enemy in
            // range the share is 1 → target high → no pull. The slope is set by
            // FRAGILITY (discipline / bravery): a steadfast line only loses heart
            // near a 3:1 disadvantage, a brittle levy at a slight one — so the
            // same odds break a mob that a veteran shrugs off. An even fight sits
            // at the high ODDS_EVEN target and still grinds out on blood alone.
            let fragility = discipline / u.stats.bravery.max(0.1);
            let odds = friend_power / (friend_power + enemy_power).max(1e-3);
            let target = (ODDS_EVEN + ODDS_SLOPE_K * fragility * (odds - 0.5)).clamp(0.0, 1.0);
            // The odds baseline is the will to hold the melee you are IN — it only
            // applies once engaged. Before contact the approach belongs to the
            // charge-fear term, which reads the enemy's NERVE (a wavering mass must
            // not thunder); the raw power balance, blind to their morale, would
            // otherwise make even a shaken charge sap a line on numbers alone.
            let odds_drain = if u.engaged > 0 {
                ODDS_PULL * (u.morale - target).max(0.0)
            } else {
                0.0
            };
            let drain = blood_drain + odds_drain;

            // Recovery: at ease (no living, non-routing enemy within
            // at_ease_range — the one shared flag that also relaxes rendered
            // weapon posture), not in melee, no fresh casualties, among steady
            // friends.
            let quiet = u.at_ease && u.engaged == 0 && u.recent_casualties < 0.5;
            let recover = if quiet {
                (0.012 + 0.004 * steady_friends) * (0.5 + 0.5 * u.training)
            } else {
                0.0
            }
            // Watching the enemy break is worth more than any rest: it
            // counters the casualty tail of the fight just won.
            + 0.05 * enemy_backs;

            let u = &mut self.units[ui];
            u.fear_adapt += (fear - u.fear_adapt) * (1.0 - (-dt / 15.0f32).exp());
            u.morale = (u.morale - drain * dt + recover * dt).clamp(0.0, u.morale_ceiling);
            u.recent_missiles *= 1.0 - (dt / 8.0);
            u.losing_push *= 1.0 - (dt / 4.0);

            // --- break / rally ----------------------------------------------
            // A unit ground down to a 3x3 knot (9 men) is finished — no square,
            // no line, no fight left in it. Guaranteed break, whatever its
            // nominal morale.
            if !u.routing && u.alive_count > 0 && u.alive_count <= 9 {
                u.morale = 0.0;
            }
            if !u.routing && u.morale < BREAK_AT {
                u.routing = true;
                u.morale_ceiling *= RALLY_SCAR;
                u.move_target = None;
                u.pending_target = None;
                u.resume_target = None;
                u.path.clear();
                u.waiting = false;
                u.mode = OrderMode::Move;
            } else if u.routing && quiet && u.morale > 0.45 * u.morale_ceiling {
                // Rallied: halt where they stand, scarred but a unit again.
                u.routing = false;
                u.anchor = u.centroid + dir(u.facing) * (0.5 * u.depth());
                u.deaths_since_reform = u.alive_count; // force a full re-form
            }
        }
    }

    /// 0 or 1 once one army has been finished (>60% of its units routing or
    /// dead) for a SUSTAINED beat — transient routs may still rally.
    pub fn victor(&self) -> Option<u32> {
        if self.verdict_hold < 8.0 {
            return None;
        }
        self.raw_victor()
    }

    /// The instantaneous read of the same condition.
    fn raw_victor(&self) -> Option<u32> {
        for team in [0u32, 1] {
            let mine: Vec<&crate::unit::Unit> =
                self.units.iter().filter(|u| u.team == team).collect();
            if mine.is_empty() {
                continue;
            }
            // Only VISIBLE reality counts: dead, currently fleeing, or ground
            // down to a 3x3 knot. (A rally-scarred ceiling used to count
            // standing, fighting units as finished — the player saw one rout
            // flip an apparently healthy battle to game over.)
            let finished = mine
                .iter()
                .filter(|u| u.alive_count == 0 || u.routing || u.alive_count <= 9)
                .count();
            if finished * 10 > mine.len() * 6 {
                return Some(1 - team);
            }
        }
        None
    }
}
