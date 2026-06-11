// The field manual: every mechanic in the simulation, at full detail.
// One principle governs everything: systems read and write PHYSICAL STATE
// (positions, masses, contacts) — never each other's stats.

export const MANUAL_HTML = `
<h1>Field Manual</h1>
<p><em>One law governs this battlefield: every mechanic reads and writes the
physical state — positions, bodies, masses, contacts. There are no hidden
bonuses. If a phalanx stops a cavalry charge, it is because braced mass
physically stops horseflesh.</em></p>

<h2>Controls</h2>
<table>
<tr><td>left-click / left-drag</td><td>select unit / box-select your units</td></tr>
<tr><td>right-click ground</td><td>move (walk); <b>double right-click = run</b></td></tr>
<tr><td>right-click enemy</td><td>attack (latch onto that unit)</td></tr>
<tr><td>right-DRAG ground</td><td>paint a line: units form along it, facing outward, keeping class depth</td></tr>
<tr><td>shift + right-click</td><td>withdraw (no reflexes, no attacks — just go)</td></tr>
<tr><td>R / F / C</td><td>walk-run / othismos-fence / charge setting</td></tr>
<tr><td>G / H / V</td><td>reform / hold-pursue / fire-at-will</td></tr>
<tr><td>P, 1, 3</td><td>pause, 1x, 3x speed</td></tr>
<tr><td>hold Space</td><td>show anchors, paths, latch targets</td></tr>
<tr><td>WASD / arrows</td><td>pan camera; wheel zooms</td></tr>
</table>

<h2>The anchor (your intent, embodied)</h2>
<p>Each unit has an <b>anchor</b> — an ideal formation frame, the "officer at
the head of the column." Orders move the anchor; slots derive from it;
soldiers physically chase their slots. The anchor is smart but honest:
it <b>plans around impassable terrain</b> (rocks, walls, water) with real
pathfinding; it marches straight through merely slow ground (mud, woods) and
lets the men pay; it <b>compresses the formation</b> to fit corridors
(min 4 files) and re-expands after; it <b>queues behind same-flow friends</b>
at chokepoints (opposing flows don't coordinate — they shove through and pay
in disorder); and it is <b>leashed to its men</b> — in contact it tracks the
measured front line, in jams it never outruns the unit's center of mass.</p>

<h2>Cohesion (order) — measured, never faked</h2>
<p>Cohesion = how well the men sit in their intended formation, measured from
slot error, facing deviation, and stragglers, normalized by formation size.
It is never a stat that gets "debuffed" — it is a measurement. Low cohesion
physically slows turning, acceleration, and <b>order response</b> (watch the
white pie timer: a disordered unit's orders take seconds to transmit).
Recovery comes from soldiers physically reseating — faster with training,
faster still under a <b>Reform</b> order (G), which re-seats the frame on the
men and sets the sergeants shouting.</p>

<h2>Stamina (one shared pool: legs and arms)</h2>
<p>Walk is free. Run drains in ~90&nbsp;s. The <b>surge</b> — the automatic
catch-up sprint of out-of-position men — drains hardest; hard maneuvers
(wheels, scrambles, defiles, mud, fighting) all cost stamina because they all
make men hustle. A spent unit "runs" at a walk, re-forms slowly, wheels
slowly, swings slowly, and blocks worse. Rest recovers slowly (~4&nbsp;min).</p>

<h2>Weapons — five numbers each, everything else geometry</h2>
<table>
<tr><th>weapon</th><th>reach</th><th>min</th><th>arc</th><th>cycle</th><th>dmg</th></tr>
<tr><td>pike (phalanx)</td><td>3.2m</td><td>1.1m</td><td>~0&deg; (a line)</td><td>1.0s</td><td>low</td></tr>
<tr><td>spear (light)</td><td>1.6m</td><td>-</td><td>34&deg;</td><td>1.6s</td><td>low</td></tr>
<tr><td>sword (heavy)</td><td>1.1m</td><td>-</td><td>80&deg;</td><td>1.3s</td><td>med</td></tr>
<tr><td>long sword</td><td>1.8m</td><td>0.3m</td><td>137&deg;</td><td>1.9s</td><td>high</td></tr>
<tr><td>lance (cav)</td><td>2.4m</td><td>0.7m</td><td>14&deg;</td><td>2.2s</td><td>high</td></tr>
<tr><td>dagger</td><td>0.8m</td><td>-</td><td>57&deg;</td><td>1.0s</td><td>low</td></tr>
</table>
<p>A swing strikes <b>everything in its envelope</b> (reach &times; arc):
wide arcs cleave several loose enemies. Friendly bodies inside the envelope
obstruct the swing in proportion to its arc — thrusts thread past comrades'
shoulders (why pikes work ten ranks deep), sweeps choke in a press (why long
swords need loose order and die in crowds). Inside its min range a weapon is
useless: a phalanx that lets you reach its bodies is fighting with side
swords.</p>

<h2>Pushes, pressure, othismos</h2>
<p>Every landed <b>or blocked</b> strike shoves the defender — by the
attacker/defender effective-mass ratio (bracing multiplies mass: a planted
phalanx hurls men a meter per thrust). Every strike also <b>staggers</b> its
victim a third of a second: you do not stride forward while a pike slams your
shield. That, plus thrust cadence, is the entire pike wall.</p>
<p><b>Pressure</b> is measured per man from the crowd pushes he receives. It
transmits force (a man driven from behind yields less — deep columns walk
thin lines backward), and it removes <b>evade</b> (no room to dodge). It
never touches morale directly — an advancing column does not rout from its
own deliberate press.</p>
<p>The <b>stance</b> toggle (F): <b>Othismos</b> leans the rear ranks into
the contact line — depth converts to shove, at the cost of your own front
rank's room. <b>Fence</b> fights at weapon's length, keeps evade, no shove.</p>

<h2>Block and evade</h2>
<p>Block (shields) works against melee and arrows but <b>only across the
front arc</b> — turn your shields or eat the volley — and a blocked strike
still pushes. Evade avoids everything including the push, but needs room:
crush pressure removes it entirely. Heavy infantry blocks; light infantry
evades. Both degrade as cohesion fails.</p>

<h2>Cavalry — two health pools, pure geometry</h2>
<p>A horse is a long body; the rider sits at its center. From the front only
a pike's reach finds the rider — swords just hack horseflesh (a big pool).
From the flanks anything reaches him. Charges are momentum: mass &times;
closing speed knocks men down and bowls them back. The <b>charge setting</b>
(C) bursts to charge speed only in the final ~2 seconds of an explicit
attack. Tired horses trot; manage their legs or arrive harmless.</p>

<h2>Missiles — real objects in the air</h2>
<p>Arrows fly ballistic arcs to a point and hit whoever stands there —
friend or foe (captains hold volleys at melees involving OTHER friendly
units; your own fighting retreat is your own affair). Density is the
defense: loose order sheds volleys, dense blocks soak them. Shields block
frontal arrows. Archers lead marching targets and need to stand still;
skirmishers and horse archers shoot on the move and <b>kite</b>
automatically (toggleable) — a fighting retreat that ruins slow pursuers.
Artillery stones land and <b>roll a furrow</b> through whatever is behind
the first man — deep columns are catastrophic targets.</p>

<h2>Terrain</h2>
<p>Mud and slopes slow legs and drain stamina; woods stagger formations into
disorder; rocks, walls, and water stop everything (anchors plan around them).
Squeezing a wide formation through a gap compresses it — and a compressed
unit emerging from a defile is disordered and vulnerable. Defend the gates.</p>

<h2>Morale — the will, fed only by physical facts</h2>
<table>
<tr><th>drains</th><td>casualty rate &middot; being walked back (losing the
push) &middot; attacks from multiple DIRECTIONS (flanked; frontal fights cost
nothing) &middot; incoming charge momentum (terror before contact) &middot;
sustained arrows &middot; nearby friendly routs</td></tr>
<tr><th>amplifiers</th><td>low cohesion &middot; exhaustion &middot;
surrounded with no exit</td></tr>
<tr><th>recovery</th><td>quiet, distance from the enemy, steady friends
nearby &middot; rallied units carry a permanent scar (a lower ceiling)</td></tr>
</table>
<p>A broken unit ignores orders and flees as bodies — through friends if
they're in the way, shaking THEIR will as the panic spreads. Routs cascade
down a line; this is how battles are actually decided. The victor banner
appears when an army is finished. <b>Hold-ground (H)</b> decides whether
your units chase the broken or keep their line.</p>

<h2>The historical arc</h2>
<p>Line fights are grinding shoving matches with modest casualties. The
slaughter happens when a line breaks. Expect battles to be decided by
morale collapse and won by tactics: weight the flank, hold your reserve,
spend your cavalry on their archers, never let your line be caught moving.</p>
`;
