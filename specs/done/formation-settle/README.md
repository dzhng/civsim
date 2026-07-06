# Formation settle — why halted formations now come to rest

Closed 2026-07-06. Shipped across eight passes on main (grep the commit
log for `formation-settle`). David's two reports drove it: "after a move
order the unit's lines shift left and right for 1–2 minutes before
settling" and "armies that run at each other arrive scattered and
completely drained." Both are fixed, gated, and browser-verified on the
curated gen map at 350-man scale.

## The one idea

Every never-settling formation was a **driving force that could not
reach zero**: some pull (a slot, a bond, a reform beat, a catch-up
sprint) kept targeting something physically unattainable, and the sim's
kinematic re-assertion re-armed it every tick. Damping alone never fixes
that — the fixes below either make the target attainable or make the
pull terminate when it isn't. The tweak-mechanics skill's "equilibrium
failures" section describes the family; this spec is its case law.

## What must stay true (the invariants, and the tests that pin them)

All in `crates/sim/tests/mechanics_settle.rs`, telemetry owned by
`crates/sim/tests/common/settle.rs` (`window_motion`, `assert_settles`,
`SETTLE_SPEED = 0.06` ≈ 3× the 0.018 m/s idle-fidget floor; the
slot/ASCII ground audit `audit_slots` lives there for future diagnosis):

- **Arrival settles.** Straight, angled (20–60°), pivoting, frayed,
  rough-ground, and adjacent-group arrivals reach baseline within one
  10s window (`settle_after_*`, `settle_adjacent_group_move`).
- **Terrain never traps a pull.** Weave/pivot bonds stop acting across
  impassable ground once meaningfully stretched; a HALTED unit's far
  slot behind a wall stops pulling (`Terrain::segment_passable`,
  `slot_anchor_blocked` in `Sim::steer_soldiers`; gates
  `settle_near_impassable_pocket`, `settle_with_frame_slots_in_wall`).
  The halted-frame achievability slide checks EVERY slot (a strided
  sample once hid two in-wall slots forever) and also slides frames
  apart when slots sit under another unit's bodies — David's law,
  "resting anchors never overlap another soldier"
  (`settle_deeply_overlapping_friendly`, 120- and 350-man scales).
- **The idle damp watches the true trajectory.** Oscillation = the steer
  resists the last TOTAL step (separation solver included) while the
  ~0.5s drift EMA carries no sustained motion (`last_disp_*`,
  `ema_disp_*` in `Sim`); a steadily PUSHED block is exempt because it
  drifts. Pinned by `settle_overlapping_friendly` (the cycle the
  steer-frame damp could not see) together with the weave press test
  (`an_advancing_block_compresses_both_itself_and_the_one_it_presses`).
- **Reform beats must earn their churn.** The engaged-deep beat skips
  when zero deaths accrued since its own watermark
  (`Unit::deep_beat_dead_mark` — `deaths_since_reform` is consumed by
  the casualty column-close and cannot serve); with casualties it runs
  untouched, because in a mortal press the relabeling IS rank relief.
  The at-ease beat keeps a relabel only if it improves total man-slot
  fit ≥10% (post-combat file repair is not starved by this: dead files
  re-knit through the casualty column-close plus the drift-exempt
  catch-up, pinned by `a_mortal_wrapping_line_backfills_casualty_tears`
  in mechanics_melee.rs). Pinned by `grind_lateral_slosh_bounded`
  (sustained ≤ 0.5, actual ~0.36) and the storm's absence in the
  browser (below).
- **The grind's rear stands.** Packed-contact lateral friction applies
  to all stalled foot (measured advance below `charge_spent_speed`, not
  an OrderMode gate; men trading blows exempt via `fighting[i]`;
  reversal judged on `last_disp`). The rank profile is monotone
  front-to-rear (~0.8 fighting vs ~0.05 standing; was 1.11 at the REAR).
  Trace channel: `PackedLateralFriction`.
- **Runs arrive formed and fresh.** The catch-up surge escapes the
  per-man top-speed ceiling only when stretched + running + enemy beyond
  two strides (`nearest_enemy_d`) + actually gaining ground (drift above
  a TENTH of a base stride — pressed-dead is ~0, gap-squeezing ~0.3 m/s
  must stay exempt). 550m: tail 10.1m (was 94m), 15s dress to 1.000
  (`run_to_contact_arrives_formed`). `run_drain = 1/340` (derived
  0.5/170s trip): foot lands at 0.507, cav 0.819, combat out-drains the
  road ~7:1 (`run_to_contact_stamina`).

## Dead ends (measured; do not re-walk)

- **Pull-gating the overlap buzz** (occupancy-zeroing the slot pull, 3m
  floor / body-width floor / floorless): 0.082 / 0.373 / 0.59 m/s — any
  distance floor is a flapping gate, and the weave net re-feeds the
  solver regardless. The damp-frame fix + frame deconfliction was the
  answer.
- **Body radius inside the corridor width formula**: re-arms the
  centering shift every beat — the frame crawls sideways at 1.8 m/s
  forever. **Slide-level clearance sampling**: fights the corridor width
  machinery (files_eff flaps 19↔20 with reform storms). Both dead; see
  Known limitation.
- **Unconditional / rest-active / walk-active surge exemptions**: each
  destabilized a different combat family (wall-settle churn; braced
  walk-in annihilated; spear columns out-shoving cavalry). The shipped
  four-condition form is the surviving shape.
- **Fixed-instant outcome sampling on cyclic behavior**: the trample
  dive pin read cy at t=16s of an in-gut-withdraw-recharge cycle and
  flipped on a 1s phase shift; peak-over-run is the durable metric
  (`trample_attack_dives_in_and_breaks_enemy_cohesion`). Same disease,
  same fix, for the cavalry shove pin: 50s peak-carry counted chaperone
  distance and crowd churn; peak per-tick displacement (impulse) is
  what horse mass actually buys (`cavalry_mass_shoves_through_infantry`).
- **The old phalanx pin was certified cheese**: `heavy >= 40 alive`
  passed only because the wall's own zero-casualty reform churn opened
  it every 2s. An intact sarissa wall is now frontally near-impenetrable
  and the counterplay is emergent — draw blood and its next beat
  accepts (`heavy_shields_make_phalanx_a_grind_not_a_deletion`).

## Known limitation (deliberate, David-authorized)

A unit resting in a gap narrower than frontage + body clearance buzzes
at ~0.10 m/s / 4cm amplitude (`settle_inside_marginal_corridor`,
`#[ignore]` with the full note). The root is the quantized,
hysteresis-free corridor machinery — Tier-1 in the tweak-mechanics
first-principles backlog; fix it there, not with another patch here.

## Balance debts recorded

- Walked-in cav vs heavy foot drifted 0.85 → 0.77 exchange (ladder still
  monotone; rail re-pinned 0.75). If cav reads too strong in play, the
  remedy is a balance-unit pass on the sabre grind, never physics.
- The column contact fan widened (deployed+8 → +12,
  `column_contact_width_stays_near_its_deployed_footprint`) — the least
  comfortable re-pin of the campaign; revisit if charge-contact shapes
  look wrong.

## Visual provenance

- `assets/feelcheck3-u0.png` — the original report's scenario settled
  (gen map, 350 men, angled move; banner centered on a dressed block).
- `assets/feelcheck3-u1.png` — the deep-overlap interleaving as it
  looked before the deconfliction slide shipped; the standard that work
  was built against.
- `assets/slice04-friction-widening.diff` — the friction candidate as
  parked mid-campaign; historical, superseded by the shipped form.
- The re-blessed vibe baselines (`web/shots/vibe/*`) carry the
  before/after of the grind look — the old `heavy-both` dissolved into a
  C-shaped amoeba by t=120s; the shipped one holds two lattices on one
  seam to 380s.

## Where the story continues

The engaged-deep/at-ease beats, the corridor machinery, and `gang_cap`
remain on the tweak-mechanics first-principles backlog. The settle
telemetry in `tests/common/settle.rs` is the instrument for any future
"never settles" report: film windows first, convict a force, then fix
the force.
