# Battle Sim

A Total War-style mass battle simulator: tens of thousands of soldiers in
formation-based units where maneuvering and unit cohesion matter. Runs in the
browser — simulation core in Rust compiled to WebAssembly, rendering/UI shell
in TypeScript.

## Architecture

- `crates/sim` — pure simulation logic (formations, movement, cohesion).
  No wasm dependencies; unit-tested natively.
- `crates/sim-wasm` — thin wasm-bindgen boundary. JS issues rare small calls
  (orders); bulk state is read zero-copy via pointers into wasm memory.
- `web` — Vite + TypeScript shell: WebGL2 instanced renderer, camera, input,
  HUD. Served cross-origin-isolated so SharedArrayBuffer/threads work later.
- `web/verify.mjs` — Playwright harness that loads the game headless and asserts on
  behavior, performance, and screenshots.

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

## Develop

```sh
# one-time / after Rust changes
npm --prefix web run build:wasm

# dev server (http://localhost:5173)
npm --prefix web run dev

# native sim tests (fast inner loop)
cargo test -p sim

# browser verification (needs dev server running)
npm --prefix web run verify
```
