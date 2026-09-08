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
  a painted background raster) from source geodata. The baked map carries a
  test-pinned connectivity contract: every city has a route back to Rome
  except the ledgered islands, and no two roads braid down one corridor.
- `packages` — the TypeScript rendering stack, shared by battle and campaign.
  `renderer-core` owns the one real 3D perspective camera (`camera3d`:
  view/projection matrices, reverse-Z `depth32float` engine-wide, ray-cast
  picking) and the GPU contracts every pass obeys. `photoreal-renderer` is the
  production battle world — three.js WebGPU + TSL behind `BattleRenderer`'s
  unchanged API. `game-renderer` holds the terrain/scenery data pipeline both
  worlds sample, the environment presets (`CIVSIM_ENVIRONMENTS`), and the
  bespoke WGSL passes that still render the campaign (and the renderer lab)
  until the photoreal ladder decides their fate. The conversion rationale and
  the in-flight ladder live in
  [specs/done/3d-perspective-renderer/README.md](specs/done/3d-perspective-renderer/README.md).
- `web` — Vite + TypeScript shell (routes, input, HUD, wasm glue); the
  rendering machinery itself lives in `packages`. How battle terrain becomes a
  place — rolling ground, sealed edges, shared scenery, and the seating
  contract — is documented in
  [docs/battle-terrain.md](docs/battle-terrain.md).
- `web/scene.mjs` and `web/scenes/*.mjs` — Playwright browser scenes for
  addressable battle/campaign checks and screenshots; baselines are committed
  under `web/shots/` (see [Screenshot baselines](#screenshot-baselines)).

Core design: the player issues *intent*; each unit's formation controller
realizes it over time, rate-limited by **cohesion**. Cohesion is *measured*
from physical soldier state (slot error vs. the intended formation), never
stored as a freestanding scalar — so it can't drift from what's on screen.

## Formatting

Two formatters, one per language. Rust uses the standard workspace formatter;
the `web` app uses [oxfmt](https://oxc.rs) (double quotes, 2-space indent),
which leaves generated data under `web/public/**` and the lockfile alone via
`web/.prettierignore`. The `web` app runs on [Bun](https://bun.com) — its
scripts are invoked with `bun run --cwd web <script>`.

```sh
bun run fmt                      # both languages at once (fmt:check to verify)
cargo fmt --all                  # Rust only (repo root)
bun run --cwd web format         # web only: ts/tsx/js/mjs/css/html/config
```

A tracked **pre-commit hook** (`.githooks/pre-commit`) runs both formatters on
just the staged files and restages them, so commits land already-formatted.
Enable it once per clone with `scripts/setup-hooks.sh` (it sets
`core.hooksPath`). The hook formats whole files, so stage complete files.

The `web` app also carries a linter and tests alongside the formatter:

```sh
bun run --cwd web lint           # oxlint (react/import/typescript/unicorn)
bun run --cwd web typecheck      # tsc --noEmit
bun run --cwd web test           # vitest (React overlay component tests)
bun run --cwd web test:ui        # node --test (pure DOM-free .mjs suites)
bun run --cwd web test:unit      # node --test (TypeScript seam suites in web/tests/)
```

Keep broad formatting churn in its own commit, separate from mechanics,
renderer, balance, or campaign behavior changes, so reviews can focus on the
actual logic.

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

## Visual tests are the ground truth for realism — a hard rule

Cargo tests prove the formulas are self-consistent and the contracts hold *as
numbers*. They cannot tell you the result is *realistic* — that a charge looks
like a charge, that an idle line breathes like men and not like a spreadsheet.
This sim is emergent: simple physics produce the behavior, and whether that
behavior matches reality is a question only the eye can answer. So every change
to how bodies move or lay out is verified by **watching** it — the Playwright
snapshots (`web/scene.mjs`) are not decoration; they are the test that the
physics is real, and a change that touches soldier motion or layout is not done
until it has been *seen* and pinned as a reproducible snapshot.

The canonical lesson: a barely-visible idle drift (±6 cm) swung whole cavalry
charges. The numeric contracts flagged that *something* moved, but it was
eyeballing it — a drift you can hardly see, yet combat flipped — that exposed
the cause: `reassign_slots` re-sorts the whole formation every few ticks, so a
centimetre of jitter could teleport-swap two men a full rank apart. The math
was a valid sort; the behavior was men blinking across the field. No unit test
calls that unrealistic. A look does.

That drift is also a permanent **litmus test for non-robust logic**: when a
6 cm sway swings a battle, the logic has a *cliff* — a hard threshold a hair of
input flips — and the fix is to remove the cliff, never to silence the drift or
shrink it until the symptom hides. The reassign cliff was fixed at its source:
the steer pass records each idle man's sway in `fidget_offset`, and the re-form
*subtracts* it before sorting, so jitter never reaches the ranks while a fighting
man (zero offset) sorts byte-for-byte as before — the golden hash, untouched, is
the proof that combat geometry was not disturbed. The tempting wrong fixes —
quantizing the sort, or making formations sticky — pass more tests by quietly
*distorting combat* (stiffer scrums, tipped matchups); a stabilizer that moves
the golden hash is reshaping fights to go green, which is the one thing never
allowed. And a red contract is not automatically a regression: the same drift
revealed trample tests that were only ever passing by seed-luck (their true value
chaotic across seeds), and deep blocks that *should* bog cavalry down rather than
let it ride through. The judge is always the same question — *is this the more
realistic result?* — not the test's colour. See
`.agents/skills/debug`.

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
  centroid; depth compression becomes press while reach-holding weapons
  keep their contact distance.
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
  jitter and the deliberate slow shove).
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
damage — five numbers, nothing else). The `class_stats` tables are the
*default*; the whole surface is also a runtime `BalanceConfig` injected via
`Sim::with_balance`, so a tuning pass sweeps configs without recompiling.
`BalanceConfig::default()` reproduces the tables byte-for-byte — the golden
hash is the proof.

File-local physics constants (deliberate, documented in place):
`VICE_PIN`, `OBSTRUCT_FLOOR`, `FRONT_ARC`/`SIDE_ARC` (combat.rs);
`RIDER_HIT_SHARE`, `GRAVITY` (missiles.rs); `DRIFT_TURN_RATE`
(movement.rs).

## Two test families: balance vs behavior

Sim tests answer two different questions and want opposite things from
their harness:

- **Balance** — *does combat performance match price?* Generated from the
  class registry, measured over a seed set. The harness is
  `crates/sim/src/balance.rs`: build a `Scenario` (N-v-M forces, head-on,
  flat field), `run_over_seeds` it against a `BalanceConfig`, read the
  `Aggregate` (per-side win-rate + survivor mean/median/stdev + duration).
  One duel is RNG-dependent, so a measurement is always the seed-set
  aggregate — a coin-flip matchup shows up as *variance*, not a flapping
  pass. `report(candidate, scenarios, seeds)` pairs a tuned config against
  the default so the deltas are legible: this is the seam for tuning the
  game (today by hand/eye, ultimately by an agent). Beyond 1v1 is just a
  bigger `Scenario` (the slot-efficiency anchor — one heavy solos two lights
  at ~3× the gold but half the army slots — is a balance test, not physics).
- **Behavior / physics** — *does a mechanism work?* (distance lowers morale,
  a charge breaks a line). Hand-authored, one per claim; never generated.
  These are the bulk of `crates/sim/tests/*_scenarios.rs`.

Whichever family, the golden hash (`tests/golden.rs`) is the determinism
floor: a change that moves it is reshaping fights, which a balance tune may
intend but a refactor never may.

## The campaign layer — what building it taught

The campaign is a second simulation, and it inherits the battle sim's
discipline (measured state, intent realized over time) plus three rules the
strategy layer forced into the open. The faction commander that plays the
non-player powers — its doctrine, the four phases of a think cycle, and its
tunables — is documented in [docs/campaign-ai.md](docs/campaign-ai.md).

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
zoomed out, Total War tilt as you descend. Two principles kept it honest
through repeated engine rewrites (hand-rolled WebGL, then Babylon.js, then the
bespoke WebGPU renderer it runs on today).

**The camera is the only seam.** The scene talks to the renderer through a
small projection contract — world↔screen both ways plus the zoom/pan clamp —
and learns nothing else about how it draws. Every banner and label is placed
through the forward projection; clicks and hovers go through the inverse
(picking the *rendered* marker, never a parallel guess); the zoom floor and
pan bounds live in the clamp. Because the boundary is that narrow, each engine
swap replaced the machinery without touching the scene, the input, or the
harness. Today the contract is fulfilled by the one engine-wide perspective
camera — `packages/renderer-core/src/camera3d.ts`, the same view/projection
matrices, reverse-Z depth, and ray-cast picking battle uses (see
[specs/done/3d-perspective-renderer/README.md](specs/done/3d-perspective-renderer/README.md)).
Define the boundary as a small projection contract and the machinery behind it
stops being load-bearing.

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

**A library that runs the frame loop assumes it owns it.** The game keeps its
own render loop and calls the engine's render by hand — true of Babylon then,
true of the three.js battle world now. That silently disables anything wired to
the *library's* loop: Babylon's post-process pipeline never presented to the
canvas, so the screen stayed black until the vignette moved into the terrain
shader. When you drive a framework's render yourself, expect its loop-time
conveniences to no-op, and plan to reimplement the ones you want.

## Screenshot baselines

Every committed PNG under `web/shots/` is at once a picture to review and a
zero-tolerance regression gate — the discipline the "visual tests are ground
truth" rule demands. They come from three independent generators (the browser
scene harness, the melee vibe films, and a headless Rust renderer for the weave
lattice), each owning a different subtree. Rather than repeat the details here,
the durable knowledge — which generator owns which folder, how to regenerate
after an intended change, and the traps (a passing snapshot writes nothing;
swiftshader's sub-percent wobble; free-port hygiene) — lives in:

- [`web/shots/README.md`](web/shots/README.md) — the cross-harness hub: folders,
  regen commands, gotchas. Start here.
- [`web/vibe/README.md`](web/vibe/README.md) — what a melee vibe check is and why
  it films a timeline.
- [`crates/sim/tests/README.md`](crates/sim/tests/README.md) — the Rust test
  taxonomy (the weave picture generator lives beside these tests).
- `.agents/skills/screenshot-regression/` — the re-bless workflow.

## Develop

`bun run <task>` from the repo root is the front door: a thin, dependency-free
`package.json` aliases the common jobs across both languages, forwarding to
`cargo` and to the web app's own scripts. Those two stay the source of truth —
the root only carries the daily verbs and the cross-language combos, not a
mirror of every subcommand. The naming convention: **a bare task runs the whole
job across every submodule; a `:suffix` runs one named part.**

```sh
bun run setup        # one-time per clone: install web deps + enable the hook
bun run dev          # web dev server (http://localhost:5173)
bun run build        # everything: Rust -> wasm, then bundle the web app -> dist/
bun run build:wasm   #   just the Rust -> wasm step (regenerate web/src/wasm/)
bun run build:web    #   just the web bundle (assumes wasm is current)
bun run fmt          # format everything (Rust + web; fmt:rust / fmt:web for one)
bun run lint         # oxlint the web app
bun run typecheck    # tsc --noEmit
bun run test         # everything: Rust workspace + web vitest + node --test
bun run test:rust    #   just the Rust workspace tests (test:web for the web suites)
bun run verify       # browser battle verification
bun run check        # full green gate: fmt:check + lint + typecheck + test
```

Reach past the front door for the focused work it deliberately doesn't mirror:

```sh
# one crate at a time, or a focused sim bucket
cargo test -p sim
cargo test -p campaign
cargo test -p sim --test mechanics_melee
cargo test -p sim --test balance_harness
cargo test -p sim --test ranged_scenarios

# browser verification (needs the dev server running) — scenes are addressable
node web/scene.mjs                   # all quick scenes
node web/scene.mjs battle-ai --full  # one scene by name
node web/scene.mjs campaign-visual campaign-map-alignment campaign-lod  # campaign scenes
# bun run verify / verify:campaign run the packaged battle / campaign subsets.
# re-bless screenshot baselines after an intentional visual change:
UPDATE_SHOTS=1 node web/scene.mjs campaign-visual

# renderer perf gate: 30k soldiers + foliage on the hardware GPU (budget 33 ms)
bun run --cwd web perf:30k
```

The perf gate measures the renderer with the sim paused, so it cannot see the
sim failing to hold real time. Two tools answer the CPU question the gate does
not: `web/scenes/battle/battle-cpu-profile.mjs` samples the live main thread
and prints self-time per function, and `crates/sim/src/bin/profile_tick.rs`
ticks the same generated battle natively for a sampling profiler and ends in
`Sim::state_hash`, the one fingerprint the golden test also pins — its `duels`
mode is how a physics-pass speedup proves itself bit-identical in melee.

The native fighting-tick budget is enforced by `scripts/test-perf`. Stage
timers are opt-in diagnostics behind `sim`'s `perf_timing` feature; the budget
uses the uninstrumented build. The [measurement contract and evidence](specs/sim-perf/README.md)
distinguish army size, actual combat participation, and machine variation.

See `crates/sim/tests/README.md` for the sim test taxonomy and
`.agents/skills/screenshot-regression/` for the snapshot workflow.
