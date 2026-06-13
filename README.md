# Battle Sim

A Total War-style mass battle simulator: tens of thousands of soldiers in
formation-based units where maneuvering and unit cohesion matter. Runs in the
browser — simulation core in Rust compiled to WebAssembly, rendering/UI shell
in TypeScript.

## Architecture

- `crates/sim` — pure battle logic (formations, movement, cohesion). No wasm
  dependencies; unit-tested natively.
- `crates/campaign` — pure campaign logic (a pausable-real-time strategy layer
  over a road graph: economy, AI, encounters, pathfinding). Depends only on
  `contract`; never on `sim`. Also natively tested.
- `crates/contract` — the only vocabulary shared between the two games
  (`UnitClassId`, `Pcg32`, `BattleSetup`/`BattleResult`). A type lives here
  only if both genuinely need it.
- `crates/game-wasm` — the composition root and the single place the two games
  meet. Thin wasm-bindgen boundary: JS issues rare small calls (orders); bulk
  state is read zero-copy via pointers into wasm memory.
- `crates/mapgen` — offline pipeline that bakes the campaign map (road graph +
  a painted background raster) from source geodata.
- `web` — Vite + TypeScript shell. Battle: WebGL2 instanced renderer. Campaign:
  a Babylon.js 3D terrain under a transparent Canvas2D marker layer.
- `web/verify-battle.mjs`, `web/verify-campaign.mjs` — Playwright harnesses that
  load the game headless and assert on behavior, performance, and screenshots.

Core design: the player issues *intent*; each unit's formation controller
realizes it over time, rate-limited by **cohesion**. Cohesion is *measured*
from physical soldier state (slot error vs. the intended formation), never
stored as a freestanding scalar — so it can't drift from what's on screen.

## Formulas read the physical world — a hard rule

Every formula in the sim takes its inputs in physical units: **men, mass,
measured motion**. Never banners, commanded state, or classifier counts.
Each historical violation of this rule produced the same bug — an effect
wildly out of proportion to what's actually happening on the field:

- A "flanked" morale penalty counted *contact-direction groups* (a
  classifier that flickers in any honest scrum) and flash-routed healthy
  units 19x faster than the blood being spilled justified.
- Intimidation read *per-soldier class mass*, so five surviving horses
  terrified a line like a full wing; and it read the *commanded* frame
  speed, so a unit pinned in a jam "charged" on paper.
- Rout contagion and rally relief counted *units* in a radius, so an
  8-man broken remnant panicked neighbors like a 300-man collapse — and
  reorganizing the same men into more, smaller units changed the morale
  economics of the whole army.

The test for any new term: if you double the men but keep the banners, or
freeze the bodies but keep the orders, does the term respond to the men
and the bodies? If not, it's reading bookkeeping, and its scale is a lie
waiting for a context that exposes it. Discrete classifications (counts,
thresholds, flags) may *gate* or *amplify* a physical quantity, but must
never be a drain or force of their own.

## Units know only what they can see — a hard rule

The sibling rule, about *whose* state a formula may read. A unit's
behavior may read of OTHER units only what a man standing on the field
could observe: positions, measured motion, facing, formation extent,
visible fighting, men running away. Never another unit's orders, mode,
flags, internal clocks, or reserves — that information exists only
inside the other unit's head.

The canonical violation: the skirmisher screen read the enemy's
`charging` flag to widen its flee distance — reacting to a charge
*before the horses moved*. Telepathy. The fix reads the pursuer's
measured speed instead; the anticipation a real screen gets comes from
real signs (the speed developing), not from the enemy's intent.

The test for any cross-unit read: could a soldier standing there know
this? Intent must be inferred from motion, or not at all. The AI
commander counts as a player and obeys the same rule — it reads the
field, not the opposing player's orders.

## The simulation model — measured quantities and the laws that read them

Soldiers are bodies (position, mass, radius); units are formation FRAMES
(anchor + slots) leashed to their men. Everything in between is a measured
quantity and a law that reads it.

**Measured quantities** (never stored opinions — recomputed from bodies):
- `cohesion` — slot error + facing deviation + stragglers, smoothed.
- `pressure` / `press_x,y` — per-soldier received-push EMAs: the scalar is
  "am I compressed", the vector is the direction force flows.
- the **vice** = scalar − |net|: opposing pushes cancel in the net but not
  the scalar — the remainder is being WEDGED, which pins a man's swing
  (obstruction scales with it; a one-sided shove leaves his arms free).
- `mass_advance` — the MEN's center-of-mass forward speed (EMA). The
  frame's `frame_speed` is gross motion and blind to the leash; the mass
  cannot lie. Charges live and die by this number.
- `counter_press` — mean received push opposing the facing: the crowd's
  answer to a unit's drive.

**The laws:**
- ANCHOR LAW — the frame pursues the order but is leashed to the measured
  centroid; stance sets the slack (othismos converts depth into press,
  fence holds at weapon's length).
- RAM DRAG — commanded pace is braked by `press_brake × gated
  counter_press × (mass_advance/base)²`: a slow press into a wall keeps
  its shove, a gallop into the same wall eats its drive. This is what
  stops a trample — the pairwise collision solver alone cannot (each
  horse outmasses the one man it touches; the column's weight acts
  through this measured channel).
- TRAMPLE — class capability × measured speed: `tramples` units whose
  mass still moves above `charge_spent_speed` ride over the men in their
  reach (a Move order through a thin line tramples like a charge); below
  it they plant and it is a melee. Knockdown is a contest of masses:
  felling threshold scales with the victim's full effective mass (brace
  and the press chain hold him up), and violent throws wound
  (`knockback_mult`, energy ∝ throw²).
- CHARGE — an explicit-attack-only speed burst: starts in the final
  approach window from an unengaged approach with fresh legs, survives
  first contact, and ends when the momentum is measurably spent
  (`mass_advance < charge_spent_speed`) or the open-field clock runs out.
  The flag means pace and stamina, nothing else.
- STAMINA — chosen exertion drains (run, melee, charge — gated on
  measured motion), scaled by the kit (`drain_mult`: armor is paid for in
  wind); surging is a correction, not a pace, and is free; rest refills.
- COMBAT — a weapon is five numbers (reach, min_range, arc, interval,
  damage); a swing strikes everything in the envelope, friendly bodies in
  the envelope obstruct it (weighted by the vice), shields and evade are
  front-arc directional, crush kills evade. No class-conditional combat
  logic anywhere.
- AUTO-LATCH — a pursue-move latches onto enemies within a 5s run and
  gives up when measurably losing ground (`latch_slip`), never by clock.
  Explicit attacks never give up.

## Levers

Global feel knobs live in `crates/sim/src/tunables.rs` (JS-settable at
runtime, no recompile):
- **Pace**: `base_speed`, `run_speed`, `surge_speed`, `base_accel`,
  `base_turn_rate`, `wheel_speed_factor`, `arrive_radius`.
- **Charge**: `charge_speed`, `charge_window` (start distance, in seconds
  at charge pace), `charge_spent_speed` (the momentum-spent threshold),
  `charge_min_speed` (what counts as a charge-grade impact), `charge_drain`.
- **Impact**: `stun_momentum` (felling threshold per unit of victim
  effective mass), `stun_time`, `impact_push`, `impact_damage`, `hit_push`.
- **Ram drag**: `press_brake`, `press_brake_floor` (the grip gate — spares
  jitter and the deliberate othismos shove).
- **Pressure**: `press_tau` (EMA window — also the grip's onset lag),
  `press_drive` (backpressure → effective mass: the force chain).
- **Stamina**: `run_drain`, `combat_drain`, `terrain_drain`, `rest_recover`.
- **Order/cohesion feel**: `cohesion_k`, `disorder_*`, `order_delay_*`,
  `min_turn_frac`, `min_accel_frac`, `surge_err_threshold`.
- **Chasing**: `latch_slip` (meters of lost ground before an auto-latch
  gives up).
- `morale_enabled` — master switch for mechanics-isolation tests.

Per-class stats live in `crates/sim/src/class.rs` — the identity of an
arm: `speed_mult`, `mass`, `brace_mult`, `mounted`, `health`/`mount_health`,
`block`, `evade`, `training`, default `stance`, `charge` (can burst),
`tramples` (rides through contact at speed), `knockback_mult` (how much a
violent throw hurts), `drain_mult` (the cost of the kit), spacing/depth,
and the weapon list (each weapon: reach, min_range, arc, attack_interval,
damage — five numbers, nothing else).

File-local physics constants (deliberate, documented in place):
`VICE_PIN`, `OBSTRUCT_FLOOR`, `FRONT_ARC`/`SIDE_ARC` (combat.rs);
`RIDER_HIT_SHARE`, `GRAVITY` (missiles.rs); `DRIFT_TURN_RATE`
(movement.rs).

## The campaign layer — what building it taught

The campaign is a second simulation, and it inherits the battle sim's
discipline (measured state, intent realized over time) plus three rules the
strategy layer forced into the open.

**Determinism is load-bearing — a hard rule.** The campaign runs for thousands
of ticks and must save, load, and replay bit-identically — an autosave
mid-march, an AI turn, a battle handed off and reported back all have to land
on the same state every time. So dynamic state lives in BTree collections
(HashMap iteration order is nondeterministic and would silently desync two
runs), armies are always processed in id order, every random draw goes through
the seeded `state.rng`, and nothing reads the wall clock. New state fields take
`#[serde(default)]` or an old save fails to load. One test —
`save_load_roundtrip_is_deterministic` — guards the whole invariant and is
extended whenever state grows, because the cost of breaking it is invisible
until a replay or a save quietly diverges.

**An order is idempotent intent, not an event.** The player and the AI both
issue *intent* — "march here" — realized over many ticks; the AI re-states its
intent every campaign hour. For a long time that silently froze it: `try_move`
zeroed the step's sub-tile progress on every order, and at ~260 ticks per tile
a fresh order every 60 ticks meant no AI army ever finished crossing a single
tile. No AI faction had ever taken a city. The fix was one line — re-issuing
the same next step keeps its accumulated progress — but the principle is the
sim's own creed applied upward: a command states a destination, not a moment,
so it must be safe to repeat. The bug was invisible to unit tests (each issues
one order) and only surfaced when a scripted run replayed the real AI cadence.
Test the cadence the system actually runs, not one call of it.

**The map obeys the rule the simulation obeys.** Territory coloring is
nearest-city ownership — `economy::territory_of`, the *same* function the sim
uses to decide whose ground an army stands on for replenishment. The picture
cannot draw one border while the sim enforces another, or the player learns a
lie. Every glyph follows suit: the camp tent, the dimmed hidden ambusher, the
road drawn wider by level all read the stance codes and levels the sim sets,
never a parallel guess on the frontend. (Sibling of the battle rule that
cohesion is *measured* from bodies, never stored.)

## The 3D map — a swappable engine behind a fixed seam

The campaign renders a tilting heightfield — straight-down political map when
zoomed out, Total War tilt as you descend — with a transparent Canvas2D layer
of markers on top. Two principles kept it honest through an engine rewrite.

**The camera is the only seam.** `Terrain3D` exposes `project` / `unproject` /
`clampCam` and reveals nothing else about how it draws. The overlay places
every banner and label through `project`; clicks ray-march the ground through
`unproject`; the zoom floor and pan bounds live in `clampCam`. So the renderer
underneath is replaceable, and proving it was the test: swapping a hand-rolled
WebGL renderer for Babylon.js rewrote `terrain3d.ts` alone and touched neither
the scene, the input, nor the harness. Define the boundary as a small
projection contract and the machinery behind it stops being load-bearing.

**A screenshot is a regression test only if the frame is reproducible.**
`web/snapshot.mjs` compares against committed baselines at *zero* pixel
tolerance — sound only because every snapshot is taken at a deterministic
moment: fixed viewport, fixed camera, sim paused, and every wall-clock-driven
pixel pinned (the water shader's animation clock, the HUD's fps line, the
seed-dependent state left untouched before the first tick). The `freeze()` hook
*pins* those pixels but must not *own* the pause state — an unfreeze restores
whatever pause it found, or the hook starts dictating gameplay. Bless the
baseline once, and thereafter any unintended drift fails loudly — including a
whole-engine swap that was supposed to change nothing. Confirm the checker
still bites by mutating a color constant and watching it go red.

**Read the terrain back from the asset you already paint.** The heightmap, land
mask, and biome field (moisture, forest, rock, signed shore distance) are
classified out of the campaign's background PNG by its known palette — no
second data pipeline, no extra mapgen pass, no hand-authored elevation. The
price is a color contract between the painter and the reader: the palette in
`crates/mapgen/src/raster.rs` and the classifier in `web/src/campaign/terrain.ts`
point at each other in comment — recolor one and you must recolor the other.

**A library that runs the frame loop assumes it owns it.** The campaign keeps
its own render loop and calls Babylon's `scene.render()` by hand. That silently
disables anything wired to *Babylon's* loop: its post-process pipeline never
presented to the canvas, so the screen stayed black until the vignette moved
into the terrain shader. When you drive a framework's render yourself, expect
its loop-time conveniences to no-op, and plan to reimplement the ones you want.

## Develop

```sh
# one-time / after Rust changes
npm --prefix web run build:wasm

# dev server (http://localhost:5173)
npm --prefix web run dev

# native tests (fast inner loop) — one crate, or the lot
cargo test -p sim
cargo test -p campaign
cargo test --workspace

# browser verification (needs the dev server running)
node web/verify-battle.mjs           # battle
node web/verify-campaign.mjs         # campaign (real map: behavior + screenshots)
node web/verify-campaign-visual.mjs  # campaign markers (controlled test map)
# re-bless screenshot baselines after an intentional visual change:
UPDATE_SHOTS=1 node web/verify-campaign.mjs
```

See `.claude/skills/screenshot-regression/` for the snapshot workflow.
