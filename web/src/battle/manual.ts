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
<tr><td>left-click / left-drag</td><td>select unit / box-select; <b>ctrl+A</b> selects the army; click empty ground to deselect</td></tr>
<tr><td>left-drag FROM a selected unit</td><td><b>drag-move</b>: carry the whole selection somewhere, facing preserved — destination ghosts preview while you drag</td></tr>
<tr><td>right-click ground</td><td>group move: each cluster keeps formation, the selection turns to face the move direction; <b>double right-click = run</b></td></tr>
<tr><td>right-click enemy</td><td>attack. A multi-unit selection approaches IN FORMATION and breaks to individual charges at ~150m</td></tr>
<tr><td>right-click + DRAG</td><td>move to the press point and <b>end facing the drag direction</b> — destination ghosts preview live while held, then fade after release</td></tr>
<tr><td>shift + any order</td><td><b>QUEUE</b> it: runs after everything already underway completes — chain waypoints, then an attack, then a withdrawal</td></tr>
<tr><td>alt + right-click</td><td><b>DISENGAGE</b> move: turn and run at full pace, answering nothing — fast but backs exposed</td></tr>
<tr><td>R</td><td>walk-run</td></tr>
<tr><td>G / H / V</td><td>reform / pursue (latch onto contact) / fire-at-will</td></tr>
<tr><td>X / K</td><td>draw secondary weapons (pikes ground, bows sling — ~1s down the line, ORANGE pie) / kite reflex on-off (skirmish classes)</td></tr>
<tr><td>P, 1, 3</td><td>pause, 1x, 3x speed</td></tr>
<tr><td>hold Space</td><td>show anchors, paths, latch targets</td></tr>
<tr><td>WASD / arrows / screen edge</td><td>pan the camera (always relative to the way you're facing); wheel zooms</td></tr>
<tr><td>Q / E / middle-drag</td><td><b>rotate &amp; tilt</b> the camera (Total War): Q/E spin around the field, middle-drag spins (left/right) and tilts to a low side-on angle (up/down); <b>Backspace</b> re-levels</td></tr>
<tr><td>hover a unit</td><td>its stat card shows (yours or the enemy's) when nothing is selected; a selection pins its own card</td></tr>
</table>

<h2>Group orders & clustering</h2>
<p>A group move preserves your formation — but only within <b>clusters</b>.
Units within ~100m of each other (chain-linked) move as one body with their
relative positions intact. Clusters that are far apart (a detached cavalry
wing, a reserve line) each keep their own internal formation and are
<b>combined at the destination</b> as a compressed star: same bearings from
the main body, gaps shrunk to a courtesy margin. The biggest cluster lands
on your click.</p>
<p>Every order flashes its <b>destination ghosts</b> — the formation frames
where the units will stand, plus the path to them. Hold <b>Space</b> to see
all paths and ghosts at any time. Group attacks hold the line until ~150m
out, then release every unit to hunt the target itself.</p>

<h2>Reading the field</h2>
<p>Every soldier's sprite points his true facing (bright chevron at his
front, shield on his left). A soldier mid-swing flashes his weapon's
<b>actual arc and reach</b> as a translucent wedge — pikes show needle
thrusts, long swords show great fans. What you see is what the combat
geometry computes. The minimap (bottom right) shows the whole field;
click it to jump the camera.</p>

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

<h2>Secondary weapons</h2>
<p>Units with a sidearm (phalanx side swords, archers' blades, cavalry
swords) <b>switch by judgment automatically</b>: a soldier whose primary
can't bear (enemy inside a pike's minimum range) draws his secondary — with
a ~1 second fumble during which he cannot strike (watch the raised-weapon
animation; this beat of helplessness is the pike line's nightmare when
closed on). The <b>X</b> order draws secondaries unit-wide: ~1s for the
order to travel (orange pie), then each man swaps. Archers with swords
drawn sling their bows — no shooting until ordered back.</p>

<h2>Pace and the run</h2>
<p>No two men run alike. Each soldier has a personal top speed; a walking
pace sits under everyone's ceiling, so a walking line stays dressed
forever. A running pace is above the slowest men's — they trail, and the
formation frays the longer it runs (and burns stamina all the while). Run
to arrive in time; walk to arrive in ORDER.</p>

<h2>Reading a unit at a glance</h2>
<p>Every unit carries an <b>HP bar</b> (team-colored: living men / full
strength) and a <b>cohesion bar</b> (gold). Effect chips and exactly when
they appear:</p>
<table>
<tr><th>chip</th><th>shown when</th></tr>
<tr><td><b>ROUT</b></td><td>morale broke: the unit ignores orders and flees as bodies (replaces ATK/DIS)</td></tr>
<tr><td><b>ATK</b></td><td>an attack latch is live — explicit order or a pursue auto-charge</td></tr>
<tr><td><b>DIS</b></td><td>a disengage order is live: running, answering nothing</td></tr>
<tr><td><b>CHG!</b></td><td>this instant: bursting at charge speed in the final approach</td></tr>
<tr><td><b>PUR</b></td><td>pursue toggle on: the advance will latch onto whatever strays within reach</td></tr>
<tr><td><b>KITE</b></td><td>skirmish reflex armed (skirmishers / horse archers)</td></tr>
<tr><td><b>2nd</b></td><td>secondary weapons drawn unit-wide (pikes grounded, bows slung)</td></tr>
<tr><td><b>BRC</b></td><td>braced: halted (&lt;0.3 m/s) with men trading blows — planted mass multiplies push resistance</td></tr>
<tr><td><b>TIRED</b></td><td>stamina below 35%: pace, swings, and recovery all sag</td></tr>
<tr><td><b>SQZ</b></td><td>the formation FRAME is compressed below its ordered frontage — terrain corridors (gates, defiles). Crowd crush is a different thing:</td></tr>
<tr><td><b>CRUSH</b></td><td>mean crowd pressure is high — packed or surrounded, no room to dodge; evade is dying. This is the physical squeeze, wherever it comes from</td></tr>
<tr><td><b>WAIT</b></td><td>queued behind same-flow friendly traffic at a chokepoint</td></tr>
<tr><td><b>AMMO!</b></td><td>a missile unit's quivers are empty</td></tr>
<tr><td><b>⚔n</b></td><td>n men currently within weapon reach of an enemy, trading blows</td></tr>
</table>
<p>White pie over a unit = an order transmitting through low cohesion;
orange pie = a weapon order traveling down the line. The pale border drawn
around the field is the true battlefield bound.</p>

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

<h2>Pushes and pressure</h2>
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
<p>The <b>pursue</b> toggle (H): with it ON, an advance LATCHES onto
whatever it meets and resumes its path afterward; with it OFF the unit
fights in stride and keeps its destination.</p>

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
closing speed knocks men down and bowls them back. An explicit attack
bursts to charge speed by itself in the final ~2 seconds of the approach
— no setting to arm. Tired horses trot; manage their legs or arrive
harmless.</p>

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
