# Slice 04 — Facing follows the wielded field + motion

## Contract
A soldier faces so its **currently-wielded weapon's strike field bears on a foe** —
not so it stares at the foe. A holding line faces its commanded frontage; a driving
trample faces its travel direction so foes it rides PAST fall in its flank lobe
("cut who you pass"). Switches with the weapon in hand: lance (front lobe) faces
forward during the charge; sabre (flank lobes) wants the foe at ~90° in the grind.

## Seam
- `sim.rs` `desired_face` (~`2286`–`2320`, today's 4-branch block: front-arc-hold /
  flank-turn-to-centroid / last-hit / velocity / idle). Replace the "turn toward the
  foe" core with "turn to put the foe at the nearest **strike-field edge**"
  (`field.nearest_edge_bearing`, slice 02). For a front-lobe weapon this is
  unchanged (edge ≈ 0 → face the foe). For a sabre it turns the rider broadside.
- Blend with motion by speed: a fast mover weights its **velocity direction** (so
  ride-past presents the flank); a holder weights its **frontage**. One continuous
  rule replacing the branch pile.

## Depends on
Slice 02 (the field + `nearest_edge_bearing`). Do NOT start before 02 exists.

## What the human can run
Re-run the geometry probe from the conversation: cav diving a mortal block, split
kills by cause (`lost_charge_melee` / `lost_grind_melee`). Today: ~2 sabre kills
riding past, 10 bogged. The bet for this slice: ride-past sabre kills go UP (the
rider now faces so passed foes are in its lobe). Print before/after.

## Verify
- A `mechanics_trample` assertion: a trample carrying through a line lands more
  flank (`lost_grind_melee`) kills than today (cuts what it passes, not just
  bogged neighbours).
- Foot facing barely moves (front-lobe edge ≈ foe bearing) → `mechanics_melee` /
  `mechanics_symmetry` pins hold.
- Pikes keep facing their frontage (front lobe) → `pikes_bite_only_to_the_front`.

## Must stay green
Foot/pike facing behavior; symmetric-clash non-bias.

## Feedback that changes this slice
The speed weight (when does velocity beat frontage?) is the knob. If a slow-press
line starts wandering off-frontage, raise the speed threshold so only genuine
movers face their motion.
