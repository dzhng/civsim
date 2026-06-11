# Field Manual

*One law governs this battlefield: every mechanic reads and writes the physical
state — positions, bodies, masses, contacts. There are no hidden bonuses. If a
phalanx stops a cavalry charge, it is because braced mass physically stops
horseflesh.*

(This manual is also available in-game via the **Manual** button.)

## Controls

| input | effect |
|---|---|
| left-click / left-drag | select unit / box-select; **ctrl+A** selects the army; click empty ground deselects |
| left-drag FROM a selected unit | **drag-move**: carry the selection somewhere, facing preserved — ghosts preview while dragging |
| right-click ground | group move: clusters keep formation, selection faces the move direction; **double right-click = run** |
| right-click + DRAG | move to the press point, **end facing the drag direction** — live ghost preview, fades after release |
| right-click enemy | attack; a multi-unit selection approaches IN FORMATION, breaking to individual charges at ~150m |
| shift/alt + right-click | **disengage** move: turn and run at full pace, answering nothing — fast but backs exposed |
| R / F / C | walk-run / othismos-fence / charge setting |
| G / H / V | reform / pursue (latch onto contact) / fire-at-will |
| X / E | draw secondary weapons (~1s order travel, orange pie; auto-swap by judgment is always on) / kite reflex toggle (skirmish classes) |
| P, 1, 3 | pause, 1×, 3× speed |
| hold Space | show all paths and destination ghosts |
| WASD / arrows, edges, wheel | pan (keys or screen edge), zoom; click the minimap to jump |

## Group orders & clustering

A group move preserves formation **within clusters**: units within ~100 m of
each other (chain-linked) move as one body, relative positions intact.
Far-apart clusters each keep their internal formation and **combine at the
destination** as a compressed star — same bearings from the main body, gaps
shrunk to a courtesy margin, the biggest cluster landing on your click.
Every order flashes destination ghosts (the formation frames at the end of
the path); hold **Space** to see them all at any time.

## Fighting withdrawals

Every movement order has one of two postures. **Engage** (the plain
right-click default): inside threat range (~45 m) the unit never shows its
back — it keeps face and shields on the enemy and drifts (strafe ~0.7×,
back-pedal ~0.55×, walking pace only), still fighting whatever stays in
reach. This works from inside a melee: click behind the line and it
extracts backward, still killing — slowly, because every enemy strike
staggers and shoves the men trying to leave. **Disengage** (shift/alt):
turn, run at full pace, answer nothing — fast but exposed. Cavalry cannot
drift: it wheels and breaks off at speed, whichever posture you order.

## The anchor (your intent, embodied)

Each unit has an **anchor** — an ideal formation frame, the "officer at the
head of the column." Orders move the anchor; slots derive from it; soldiers
physically chase their slots. The anchor is smart but honest: it **plans
around impassable terrain** (rocks, walls, water) with real pathfinding; it
marches straight through merely slow ground (mud, woods) and lets the men pay;
it **compresses the formation** to fit corridors (minimum 4 files) and
re-expands after; it **queues behind same-flow friends** at chokepoints
(opposing flows don't coordinate — they shove through and pay in disorder);
and it is **leashed to its men** — in contact it tracks the measured front
line, in jams it never outruns the unit's center of mass.

## Cohesion (order) — measured, never faked

Cohesion is how well the men sit in their intended formation, measured from
slot error, facing deviation, and stragglers, normalized by formation size. It
is never a stat that gets "debuffed" — it is a measurement. Low cohesion
physically slows turning, acceleration, and **order response** (the white pie
timer: a disordered unit's orders take seconds to transmit). Recovery comes
from soldiers physically reseating — faster with training, faster still under
a **Reform** order (G), which re-seats the frame on the men.

## Secondary weapons

Units with a sidearm switch **by judgment automatically**: a soldier whose
primary can't bear (enemy inside pike minimum range) draws his secondary,
with a ~1 s fumble during which he cannot strike. **X** draws secondaries
unit-wide (~1 s order travel shown as an orange pie, then per-man swaps);
archers with swords drawn sling their bows. Pursue-moves auto-charge any
enemy that comes within range of the advance — and the latch is **timed**:
a chase that can't make contact in ~6 s is abandoned and the path resumes
(no chasing cavalry across the map).

## Pace and the run

No two men run alike: each soldier has a personal top speed. Walking sits
under everyone's ceiling — a walking line stays dressed forever. Running
exceeds the slowest men's — they trail and the formation frays the longer
it runs. Run to arrive in time; walk to arrive in order.

## Stamina (one shared pool: legs and arms)

Walk is free. Run drains in ~90 s. The **surge** — the automatic catch-up
sprint of out-of-position men — drains hardest; hard maneuvers (wheels,
scrambles, defiles, mud, fighting) all cost stamina because they all make men
hustle. A spent unit "runs" at a walk, re-forms slowly, wheels slowly, swings
slowly, blocks worse. Rest recovers slowly (~4 min).

## Weapons — five numbers each, everything else geometry

| weapon | reach | min | arc | cycle | damage |
|---|---|---|---|---|---|
| pike (phalanx) | 3.2 m | 1.1 m | ~0° (a line) | 1.0 s | low |
| spear (light) | 1.6 m | – | 34° | 1.6 s | low |
| sword (heavy) | 1.1 m | – | 80° | 1.3 s | medium |
| long sword | 1.8 m | 0.3 m | 137° | 1.9 s | high |
| lance (cavalry) | 2.4 m | 0.7 m | 14° | 2.2 s | high |
| dagger | 0.8 m | – | 57° | 1.0 s | low |

A swing strikes **everything in its envelope** (reach × arc): wide arcs cleave
several loose enemies. Friendly bodies inside the envelope obstruct the swing
in proportion to its arc — thrusts thread past comrades' shoulders (why pikes
work ten ranks deep), sweeps choke in a press (why long swords need loose
order and die in crowds). Inside its minimum range a weapon is useless: a
phalanx that lets you reach its bodies is fighting with side swords.

## Pushes, pressure, othismos

Every landed **or blocked** strike shoves the defender — by the
attacker/defender effective-mass ratio (bracing multiplies mass: a planted
phalanx hurls men a meter per thrust). Every strike also **staggers** its
victim a third of a second: you do not stride forward while a pike slams your
shield. That, plus thrust cadence, is the entire pike wall.

**Pressure** is measured per man from the crowd pushes he receives. It
transmits force (a man driven from behind yields less — deep columns walk thin
lines backward), and it removes **evade** (no room to dodge). It never touches
morale directly — an advancing column does not rout from its own deliberate
press.

The **stance** toggle (F) governs what your weight does whenever your ORDER
presses into a fight — an explicit attack, or a move whose path runs through
the enemy: **Othismos** leans the rear ranks in, converting depth to shove,
at the cost of the front rank's room. **Fence** fights at weapon's length,
keeps evade, no shove — pressing through in Fence stalls against anyone who
holds. Stance is moot while giving ground: there is nothing to lean into.
The **pursue** toggle (H) is a third, separate bit: ON, an advance LATCHES
onto whatever it meets (and resumes its path afterward); OFF, the unit
fights in stride and keeps its destination.

## Block and evade

Block (shields) works against melee and arrows but **only across the front
arc** — turn your shields or eat the volley — and a blocked strike still
pushes. Evade avoids everything including the push, but needs room: crush
pressure removes it entirely. Heavy infantry blocks; light infantry evades.
Both degrade as cohesion fails.

## Cavalry — two health pools, pure geometry

A horse is a long body; the rider sits at its center. From the front only a
pike's reach finds the rider — swords just hack horseflesh (a big pool). From
the flanks anything reaches him. Charges are momentum: mass × closing speed
knocks men down and bowls them back. The **charge setting** (C) bursts to
charge speed only in the final ~2 seconds of an explicit attack. Tired horses
trot; manage their legs or arrive harmless.

## Missiles — real objects in the air

Arrows fly ballistic arcs to a point and hit whoever stands there — friend or
foe (captains hold volleys at melees involving OTHER friendly units; your own
fighting retreat is your own affair). Density is the defense: loose order
sheds volleys, dense blocks soak them. Shields block frontal arrows. Archers
lead marching targets and must stand still; skirmishers and horse archers
shoot on the move and **kite** automatically — a fighting retreat that ruins
slow pursuers. Artillery stones land and **roll a furrow** through whatever is
behind the first man — deep columns are catastrophic targets.

## Terrain

Mud and slopes slow legs and drain stamina; woods stagger formations into
disorder; rocks, walls, and water stop everything (anchors plan around them).
Squeezing a wide formation through a gap compresses it — and a compressed unit
emerging from a defile is disordered and vulnerable. Defend the gates.

## Morale — the will, fed only by physical facts

| | |
|---|---|
| **drains** | casualty rate · being walked back (losing the push) · attacks from multiple DIRECTIONS (flanked; frontal fights cost nothing) · incoming charge momentum (terror before contact) · sustained arrows · nearby friendly routs |
| **amplifiers** | low cohesion · exhaustion · surrounded with no exit |
| **recovery** | quiet, distance from the enemy, steady friends nearby · rallied units carry a permanent scar (a lower ceiling) |

A broken unit ignores orders and flees as bodies — through friends if they're
in the way, shaking THEIR will as the panic spreads. Routs cascade down a
line; this is how battles are actually decided. **Hold-ground (H)** decides
whether your units chase the broken or keep their line.

## The historical arc

Line fights are grinding shoving matches with modest casualties. The slaughter
happens when a line breaks. Expect battles to be decided by morale collapse
and won by tactics: weight the flank, hold your reserve, spend your cavalry on
their archers, never let your line be caught moving.
