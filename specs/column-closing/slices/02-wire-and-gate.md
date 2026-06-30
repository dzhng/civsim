# Slice 2 — wire `compact_columns` in and gate lateral re-even

## Contract this unlocks

While a unit is **engaged or advancing**, casualty holes close via
`compact_columns` (forward-only) — including deep blocks. The full lateral
re-sort `reassign_slots` is now reachable ONLY by deliberate, not-fighting
events: pivot, `set_files`, corridor `files_eff` narrowing, explicit
`set_reform`/`reseat`, rally, the at-ease recovery drumbeat, and a **new
disengage one-shot** that fires after a short clear beat. This is the slice that
makes the back-line crab stop in the actual game.

## API seam

`crates/sim/src/sim.rs`, the reform drumbeat in `Sim::tick` (`sim.rs:892-948`),
plus the disengage trigger (near `quiet_ticks` upkeep, see `refresh_contact_engagement`
`sim.rs:970` and `quiet_ticks` `unit.rs:127`).

Rework the branch so casualty-closing and lateral-re-even are separate concerns:

```text
casualties_to_close = deaths_since_reform crosses its trigger   (keep today's threshold to start)
engaging_or_forward = engaged > 0 || move_target.is_some() || mode == Attack(_)

if casualties_to_close && engaging_or_forward && !pivoting && files_eff stable:
        compact_columns(...)                 ← forward-only; deep blocks included
        deaths_since_reform = 0

reassign_slots(...) stays the path for, and ONLY for:
   • pivoting (continuous, as today)
   • set_files / corridor files_eff change (sim.rs:748, 1162 — unchanged)
   • set_reform / reseat / rally (sim.rs:780, morale.rs:430 — unchanged)
   • at-ease recovery drumbeat (sim.rs:921-924 — unchanged; a standing,
     unengaged line still evens out)
   • NEW: disengage one-shot — a unit that was fighting, now clear for a
     short beat (quiet_ticks ≥ CLEAR_BEAT), re-evens ONCE, then a guard
     stops it re-firing every tick.
```

- **Remove** the `engaged > 0 && ranks >= 5 && tick%60` `reassign_slots`
  drumbeat (`sim.rs:913-915`) — `compact_columns` is now the anti-pancake flow
  for deep engaged blocks (rear men step forward in-file to refill front losses,
  with no lateral motion).
- **Delete** `compact_slots_preserving_order` (`unit.rs:405`) and its call site
  (`sim.rs:932`). `compact_columns` strictly supersedes it (more lateral-
  preserving). No back-compat shim — pre-release, per the repo rule.
- **Disengage one-shot:** reuse `quiet_ticks`. Fire when it crosses `CLEAR_BEAT`
  (a const to tune — see known unknowns); guard with a one-shot flag (or fire
  exactly on the crossing tick) so it doesn't re-sort every tick a unit idles.
  The existing at-ease drumbeat then owns any further slow recovery.

## What the human can run

- `scripts/test-mechanics` — the physics inner loop (the bucket this change
  lives in).
- Recreate the relevant battle/weave shots and inspect them by eye before
  accepting or re-pinning anything. The expected visual result is same-or-better
  formation order, preferably less blobbing; this behavior exists because
  lateral casualty relabeling visibly blobs formations.
- Run `screenshot-critique` with a fresh explorer (`fork_context: false`) on the
  exact comparison sheet and tight crops before accepting the shots. The prompt
  must be neutral: ask what visible formation/order defects exist, not whether
  the new behavior is better. It must still be a baseline/current comparison;
  a general visual audit can inform follow-up work, but does not satisfy the
  gate.
- A throwaway `tests/dbgN.rs` (per the debug-probe convention) printing, over a
  deep engaged block taking front-rank casualties, the **max lateral displacement
  of rear-rank men** before vs after — expect it to collapse toward the
  push-only floor.
- `scripts/test-infra` for the golden re-pin.

## Tests that pin it

- **Rear-line lateral travel ≈ 0 while engaged** (the headline behaviour;
  promote the dbg probe into a real `mechanics_formation` assertion in slice 3):
  a deep block in a grind, front rank dying, rear men move forward in-file; their
  lateral travel stays at the push-only floor (no relabel crab).
- **Notch persists, then evens on disengage.** Wipe a file mid-fight → the
  frontage gap survives while engaged; after contact ends and `quiet_ticks ≥
  CLEAR_BEAT`, one `reassign_slots` evens the line. (`mechanics_disengage.rs` is
  the right neighbourhood.)
- **Deep block does not pancake.** Front losses are refilled forward; frontage
  width holds (no flank bulge) without any lateral re-form.
- **Golden re-pin.** `golden_state_hash_stable` moves — re-pin ONCE in this
  commit after confirming (diff vs a clean baseline) your change is the sole
  mover. The branch may already have it red for unrelated reasons.
- **Shot evidence.** Cargo tests alone do not prove this slice. Recreated shots
  must show the changed formation order is not visually worse; do not bless a
  numeric-only pass if the battle looks blobbed or less ordered. The visual
  evidence must include an unprimed `screenshot-critique` pass; high-confidence
  findings from the subagent are blockers until inspected or recorded as follow-up
  work. This check is mandatory even when `scripts/test-mechanics` is green.

## What must stay green

- `mechanics_weave::{two_braced_walls_*, the_fronts_stay_welded_*,
  a_braced_block_holds_its_grid_under_a_press}` and its wrap/bend probes.
- `mechanics_charge`, `mechanics_impact` — the charge-absorption watch (we no
  longer relabel-to-absorb while engaged; if these go red, the line became too
  rigid under impact — fix the body displacement, not by re-adding lateral
  relabel).
- `mechanics_disengage`, `scenario_posture`, `scenario_ai::reform_recovers_order_faster`,
  `scenario_general` reform/stamina pins.
- Pivot, `set_files`, corridor narrowing still re-even (unchanged call sites).

## Feedback that would change this slice

- Fresh screenshot-critique passes on the slice-2 candidates found the browser
  `penetration` vibe visually worse. The first had blue formation spray at
  `t084/t120/t192`, a shallow horizontal smear by `t120/t192`, and ambiguous
  right-flank clusters. A later rear-rank damping candidate reduced the spray but
  still read as clumps at `t084` and a rounded blue blob at `t120/t192`; it also
  introduced heavier contact-zone layer ambiguity and dark clutter in
  `vibe/offense`. A rear-reserve bridge candidate with five frozen contact ranks
  restored a cleaner macro column, but a fresh unprimed critique still found
  high-confidence regressions: `penetration` `t084` sheared off-center with a
  detached blue pocket, `t192` pancaked under the red line, and offense still had
  dark trailing figures that read like a third faction/material error. Treat this
  as an active blocker; scalar tests being green is not enough.
- A file-local `rerank_columns_by_depth` helper was tried as a bounded substitute
  for the old engaged reassign, then removed. The helper preserved `slot % files`
  but still failed the gate: 60 ticks gave fragmentation/blob/right-red breakage;
  15 ticks gave ropes, curved lanes, and layering; casualty-only looked scattered
  and cluttered; 30 ticks failed
  `mechanics_melee::attack_latch_behaves_like_a_move_order` in the broad
  mechanics run (`ATTACK coh=0.65`, `MOVE coh=0.78`) and the fresh unprimed
  critique still flagged t084 blue strands plus unreadable dark offense bodies.
  A later narrowed form gated only to deep non-strict infantry already engaged
  with a much wider foot frontage passed the scalar mechanics buckets
  (`mechanics_melee`, `mechanics_formation`, `mechanics_weave`,
  `mechanics_charge`, `mechanics_impact`, and `mechanics_disengage`) but still
  failed fresh Chrome WebGPU shots. Laplace, a fresh unprimed critique explorer
  (`fork_context: false`), found high-confidence muddy central red/blue depth
  ordering and offense wings breaking into loose strands with gaps and isolated
  singletons. This is evidence that simply reordering ranks inside files
  perturbs contact order too much even when the scalar contracts stay green.
- A contact-only deeper-weave variant was also tried and removed. It kept
  advancing formations loose on approach but restored the wider neighbour net
  once contact was live. Focused mechanics stayed green, yet fresh browser shots
  still failed unprimed critique: blue column shape was lost by `t084/t120`, the
  contact spread sideways by `t120/t192`, the red line fragmented into a wavy
  ribbon by `t192`, and offense retained dark ambiguous bodies. Treat this as a
  sign that post-contact stiffness alone does not solve the physical fan-out.
- A broad-frontage magnet clamp was also tried and removed. It zeroed enemy seek
  for soldiers inside an opposing foot frontage, while preserving true overhang
  curl. The scalar sentinels stayed green, but shots regressed: penetration still
  scattered and over-spread, the red line deformed unevenly, and offense lost its
  readable wing shape into diagonal snakes/blobs. Treat this as evidence that
  removing lateral seek in the contact band is not enough and can harm wrapping
  readability.
- A same-unit non-fighting queue blocker was tried and removed. It treated
  non-fighting same-unit bodies directly between a soldier and his target as
  `front_clear` blockers. The Rust onset probe improved, but scalar mechanics
  failed: `a_column_bulges_a_held_line_it_does_not_part_it` dimpled only `0.5m`,
  and `attack_latch_behaves_like_a_move_order` diverged (`ATTACK coh=0.65` vs
  `MOVE coh=0.85`). A broad same-unit queue block starves the magnet pressure
  that makes bulge/wrap work.
- A low-awareness lateral magnet projection was tried and removed before scalar
  tests. It stripped lateral magnet only for non-fighting, low-awareness,
  advancing non-strict infantry against much wider foot frontage. The Rust
  penetration diagnostic worsened later width/cohesion, so it is not the missing
  contact-order primitive.
- A live-frontage gather fix is retained as setup substrate, not accepted as the
  visual solution. `set_files` now arms the existing gather/reform timer so a
  unit reshaped from line to column dresses around its new slots before running
  off; a `mechanics_formation` test pins low lateral slot error after a live
  reshape. This passed `scripts/test-mechanics` and the reshape/reform scenario
  checks, and the Rust penetration diagnostic showed lower approach slot error,
  but fresh Chrome WebGPU `penetration`/`offense` shots still failed Carver's
  unprimed critique (`fork_context: false`) with high-confidence ambiguous
  red/blue contact depth/order and central formation readability collapse.
  Continue at the contact-order failure; do not bless shots from this pass.
- A rear-rank lane-only magnet candidate was tried and removed after a Rust onset
  probe. The probe mirrored the browser `penetration` distance/shape and showed
  the current substrate jumping from a dressed ~9m column at `t=78` to ~26m at
  `t=84`, with only a handful of fighters and rear ranks still mostly
  `front_clear=1`/high-awareness. Stripping only lateral magnet from non-fighting
  rear ranks in a narrow-column-vs-wide-foot-frontage contact left the same
  ~26m width, so the next fix must look at the contact/locomotion equilibrium,
  not just lateral target choice.
- A lateral slot-rail variant was also tried and removed. It kept forward
  blocking unchanged and strengthened only the sideways slot pull inside opposing
  frontage. The mechanics bucket stayed green through the checked tests, but the
  screenshot critique still flagged lost column shape, clumps/holes, lateral
  over-spread, and dark offense streak artifacts. Treat this as evidence that the
  fan-out is not solved by stronger local lateral slot grip alone.
- A narrow-column-only slot rail was also tried and removed. It limited the rail
  to advancing units at most two thirds as wide as the blocking enemy frontage.
  That avoided the previous offense-side metric shift, but the shot gate still
  failed: penetration lost column order into blobs/islands with stray single
  units and muddy contact layering. This closes the "maybe just gate the rail
  narrower" path for now.
- A lane-aware target preference was also tried and removed. Narrow advancing
  foot paid a soft cost for targets far from its slot lane when fighting a much
  broader enemy. It was mechanically contained and improved some late penetration
  structure to the main pass, but unprimed critique still found column loss,
  horizontal smearing, muddy contact layering, and the same offense readability
  defects. Target lane preference alone does not pass the visual gate.
- A narrow blocked-contact weave-gate candidate was also tried and removed. It
  prevented a narrow, deep, already-engaged foot column from using the loose
  running weave when pressed into a much wider foot frontage. The broad version
  broke wide-line wrap; the narrowed version passed the full mechanics sweep, but
  fresh shots failed the mandatory unprimed critique. Planck found high-
  confidence `penetration` regressions at `t084/t120` (blue soldiers scattered
  into islands/singles), a vertical drip/string artifact at `t192`, muddy contact
  depth ordering, partially broken red side formations, and the recurring dark
  ambiguous offense bodies. This is the current warning label on scalar-green
  stiffness gates: they still have to make the battle shots read same-or-better.
- A hard-layer friendly collision queue was also tried and removed. The broad
  version resolved same-unit foot collisions near contact along formation-rest
  axes and failed scalar gates: wide-line wrap lost rear envelopment and
  attack-latch cohesion diverged from move. Narrowing to deep narrow columns
  inside much wider foot frontage made the mechanics sweep pass, but Epicurus
  still found `penetration` `t084` side-loop/spiral breakage, muddy `t120/t192`
  contact ordering, and dark offense artifact bodies. Restricting further to
  same-file pairs also passed focused mechanics, but Gauss still found current
  `penetration` `t084` broken into scattered arcs/isolated sprites, high-
  confidence muddy melee layering, and high-confidence dark offense bodies that
  read as rendering debris. Hard collision axis projection is closed for now
  unless a sharper physical diagnosis explains how to avoid those visual defects.
- A front-clear / same-file queue candidate was also tried and removed before
  screenshots. A diagnostic of the `penetration` setup showed the visible fan-out
  starts between `t072` and `t084`: the blue column is still about 7.5m wide at
  `t072`, then jumps to roughly 20m at `t078` and roughly 37m at `t084` while
  only a handful of men are fighting. Blocking seek behind non-fighting friends,
  then gating narrow-vs-wide columns so only front slot ranks seek, reduced the
  debug width somewhat but broke the physics that must stay live: column bulge,
  attack/move parity, braced contact closure, depth push, attacking-stem drape,
  and attacking-line wrap all failed. This closes simple queue-gating of
  `front_clear`; the next contact-order fix must preserve magnet-driven
  depth/wrap/bulge instead of suppressing it.
- The retained substrate was re-shot after reverting that scalar-red queue gate.
  Chrome WebGPU was required (`VERIFY_BROWSER_CHANNEL=chrome`) because bundled
  Chromium reported no WebGPU adapter. Fresh sheets/crops are in
  `/private/tmp/civsim-column-closing-current-shots/`. Faraday, a fresh unprimed
  screenshot critic, still found high-confidence current regressions:
  `penetration` `t084` blue-column breakup into right-leaning spray and detached
  stragglers, `t120/t192` muddy contact depth/layering and isolated blue figures,
  plus recurring ambiguous dark offense bodies and blob-like contact. Keep the
  visual gate red.
- A native browser-duel probe reproduced the current failure without relying on
  screenshots: after `setFiles(1, 70)`, `setFiles(0, 8)`, and the same
  attack-through-centroid order as `vibe/penetration`, the column stayed about
  `7.4m` wide through `t072`, then widened to about `16.4m` at `t084` and
  `32.6m` at `t096`. Rear ranks with no targets widened too, so the failure is a
  contact/locomotion equilibrium, not merely target choice. A temporary old raw
  engaged `reassign_slots` toggle narrowed that native probe but only by
  relabeling slots laterally and disturbing defender cohesion. Two local
  replacements were tried and removed before acceptance gates: targetless
  rear-rank lateral same-rank springs inside wider foot frontage made the native
  spray worse, and a strong lane cost in foot target selection also made it
  worse. Do not return to those exact shapes.
- Two more native-only probes were tried and removed. First, a low-cohesion
  near-contact gather for non-trampling foot columns approaching a much wider
  enemy frontage kept the lattice on and suppressed cruise feed-forward, but it
  prevented contact and made the approach itself too wide (`t048` roughly
  `20.4m`). Second, immediate `compact_columns` on any casualty while
  engaged/advancing left `t084` unchanged and widened `t096` slightly, so the
  browser-visible islands are physical spread rather than delayed forward
  casualty compaction. Keep both paths closed unless a later version is much more
  local.
- A narrower no-cruise candidate was tried and removed before browser shots. Once
  a non-trampling infantry unit had contact, targetless rear ranks stopped
  receiving the frame cruise feed-forward while still moving through
  slot/weave/collision. In the native browser-duel mirror the `rank_id >= 2`
  version preserved contact and improved late width (`t096` roughly
  `32.6m -> 24.1m`) while leaving `t084` roughly flat (`16.4m -> 16.0m`). A
  deeper `rank_id >= 4` gate helped less (`t096` roughly `26.1m`), and a
  shallower `rank_id >= 1` gate was worse (`t096` roughly `25.6m` and less clean
  front targeting). The `rank_id >= 2` version failed the scalar gate:
  `mechanics_survivability` reported `HP4/HP1 = 6.60x`, above the `6.0x` ceiling.
  Do not retain this exact no-cruise candidate unless a new version preserves the
  survivability curve.
- This continuation set up the local Rust toolchain via Homebrew (`cargo
  1.96.0`) and re-ran the core scalar checks before probing. Baseline
  `a_column_bulges_a_held_line_it_does_not_part_it`, `attack_latch_behaves_like_a_move_order`,
  and `mechanics_survivability` were green (`HP4/HP1 = 5.85x`). A scratch native
  probe mirroring `vibe/penetration` showed the contact transition: dressed
  through `t078` (~`7.5m` wide), then `t084` whole width ~`22.5m` with only
  `18/240` column men engaged and rear width ~`21.9m`; `t096` whole width
  ~`29.8m`. `mass_advance` had already collapsed by the spike, and cohesion read
  ~`0.08` even during the visually dressed approach, so neither running-window
  nor cohesion alone is the right lens. Three paths were rejected and removed:
  rear queued-man enemy-magnet projection worsened `t084` to ~`26.2m`; scoped
  same-unit collision-slide removal for narrow columns in wide contact worsened
  `t084` to ~`23.9m` and `t096` to ~`31.0m`; global `separation_slide = 0.0`
  improved the probe (`t084` ~`19.6m`, `t096` ~`23.6m`) but failed
  `mechanics_survivability` (`HP4/HP1 = 6.35x`). Treat global slide-off and those
  scoped variants as closed unless a new mechanism explains how to preserve the
  survivability curve.
- A pivot-spring diagnosis found that the contact fan-out is carried by
  `steer_soldiers` and specifically by the lateral component of the pivot
  spring, not by hard separation, forward-blocking, compression, or target
  magnet seek. Disabling pivot lateral motion globally or in the rear kept the
  native tail narrow but starved contact; global `pivot_stiffness = 1` had the
  same shape, while `2` was still too wide. The best native false positive was a
  scoped rank-tail rule: for a non-trampling narrow/deep advancing foot column
  already engaged with a much wider foot wall, remove lateral `pivot_push` from
  ranks `>= 4`. It passed the native gates (`mechanics_melee` 15 tests,
  survivability `HP4/HP1 = 5.85x`, `mechanics_weave` 22 tests,
  `mechanics_formation`) and its focused native probe reported `rear-width=8.5m`
  with `max-engaged=29`. Fresh Chrome WebGPU `vibe/penetration` rejected it
  after rebuilding wasm (`wasm-pack`, rustup stable, and the wasm target were
  installed on this machine): `t084` became stringy/porous with detached blue
  trails, `t120` read as a broad smeared wedge, and `t192` stayed muddy. The code,
  regression test, scratch probe, generated candidate frames, and regenerated GIF
  were removed. Do not retry simple pivot-lateral damping, even rear-rank scoped,
  unless the browser read has a new reason to avoid this front-wedge/stringy-tail
  failure.
- The retained pivot change is narrower: keep the pivot spring, but cap the
  angular correction's length scale near the bond's rest length
  (`pivot_len = min(al, rl + 0.10)`). The old rule used the live stretched bond
  length, so axial queue stretch amplified tangential correction into sideways
  fan-out. This is not a full visual acceptance yet, but it is less wrong against
  the corrected ruler. The baseline screenshot itself over-stretches/curves the
  column and is not the target; the target is the original deployed 8-file
  footprint at enemy contact. Deployed slot width is `6.3m` and the moving
  approach reads roughly `7-8m`; old full pivot read roughly `18.7/17.9/25.3m`
  front/mid/rear at `t084` and `30.8m` rear at `t095`. The pure rest-length cap
  was less wrong on width but still hollow (`t084` roughly `9.2/11.3/12.0m`,
  `t095` roughly `10.3/12.2/11.3m`). A `0.15m` slack was rejected because it
  broke mortal-wrap back-fill and survivability (`HP1.5` grind `174s`,
  `HP2/HP1 = 2.35x`); a scoped version preserved those contracts but did not
  improve width, and a wall-side scope worsened the width rail (`max-band=13.9m`).
  The retained `0.10m` slack is the current best scalar tradeoff:
  `COLUMN-CONTACT deployed=6.3m min-band=7.5m max-band=13.1m`, native `t084`
  front/mid/rear roughly `9.5/11.0/12.2m`, and `t096` roughly `13.1/11.5/11.7m`.
  `mechanics_melee`, the survivability sentinel (`HP2/HP1 = 2.07x`,
  `HP4/HP1 = 5.86x`), and the full
  `scripts/test-mechanics --no-fail-fast -- --nocapture` sweep are green. The
  golden hash was re-pinned deliberately for this physics change:
  `golden_state_hash_stable` now expects `0xf36fab65928f69e4`.
- Fresh Chrome WebGPU browser shots were rebuilt from the updated wasm and
  inspected, but not re-blessed. `penetration` diffs from `t072` onward (`t084`
  ~`2.80%`, `t096` ~`3.77%`, `t120` ~`3.02%`, `t192` ~`3.39%`). The
  `compare-screenshots` helper was used from
  `.agents/skills/compare-screenshots/scripts/visual-parity-diff.mjs` with
  matched baseline/current frame folders and central contact crops. Artifacts and
  JSON are under `/private/tmp/civsim-column-closing-compare-helper/`; the helper
  distance is diagnostic, not an acceptance gate. It located the largest
  `penetration` movement at `t192` (`parityDistance=0.54331`, contact-crop
  `0.50724`) and high contact-crop movement at `t084` (`0.51632`). Manual read:
  current is closer to deployed width than baseline and removes the big flare.
  David reviewed the shown comparison and judged current better than baseline:
  the baseline's pinched/harrowed middle is unnatural even though it is more
  filled in. Current still has visible looseness and dangling trails, so do not
  call it perfect; do carry it forward as the less-wrong visual direction for
  this target. `offense` helper output also shows large movement (worst
  full-frame `t024`, `parityDistance=0.57014`; contact-crop worst `t048`,
  `0.56530`), and manual read says side blocks are cleaner while the central
  contact trail remains dark/muddy with detached trails. Run a fresh unprimed
  `screenshot-critique` before blessing any visual baseline; tell the critic the
  baseline is imperfect and the deployed-width target is the ruler.
- A narrower blind-rear queue candidate was also tried and removed. It projected
  same-file compression along the file axis only for targetless soldiers and gave
  targetless deep rear ranks in a stalled advancing foot queue extra lateral pull
  toward their existing slot. This preserved focused scalar mechanics and
  improved the diagnostic onset (`t084` rear outliers roughly 130 -> 91), while
  two stronger variants were rejected at the scalar gate: applying the rear pull
  to targeted ranks and doubling its strength both failed
  `a_column_bulges_a_held_line_it_does_not_part_it`. Fresh browser shots still
  failed the visual gate. Einstein, a fresh unprimed screenshot critic, found
  high-confidence blue "drips" and detached trails at `t084/t120`, muddy center
  layering, unreadable formation order by `t192`, and ragged red arcs/clumps.
  Better diagnostics are not enough; keep this path closed unless the underlying
  visual failure mode is addressed.
- A near-edge infantry forward-block candidate was tried and removed. It moved
  the existing foot `formation_blocks_forward` gate from the enemy centre line to
  the defender's near edge along the attacker's approach. The scalar buckets
  stayed green, including the full `mechanics_melee` file and symmetry, but
  fresh Chrome WebGPU shots were visually worse. Banach, a fresh unprimed
  screenshot critic, found high-confidence loss of blue column order at
  `penetration` `t084/t120`, ambiguous melee depth/layering, a flattened late
  penetration smear at `t192`, dark ambiguous offense bodies, and stringy
  offense flanks. This is closed as another scalar-green/visual-red path.
- A same-file friendly-slide damping candidate was tried and removed. It halved
  same-unit friendly collision slide only for same-file pairs in deep files or
  held units, aiming to stop axial queue pressure from leaking sideways while
  preserving wrap/drape elsewhere. The focused Rust onset probe improved
  (`t084` width roughly `19.9m`, `lat95` roughly `5.6m`) and the full
  `mechanics_melee` file passed, but acceptance still failed: fresh Chrome WebGPU
  `penetration`/`offense` shots in
  `/private/tmp/civsim-column-closing-current-shots/` retained muddy central
  interpenetration and poor formation readability under Leibniz, an unprimed
  `screenshot-critique` explorer, and the wider mechanics sweep tripped
  `mechanics_survivability::survivability_scales_with_the_reference_stats`
  (`HP4/HP1 = 6.21x`, above the `6.0x` ceiling). Do not reintroduce this as a
  numeric-only fix.
- A narrow-frontage rest-weave stiffness candidate was tried and removed. A
  force sweep of the browser-style penetration onset showed rest-shape stiffness
  was the only tested scalar lever that materially tightened `t084` without
  immediately worsening the probe; magnet removal barely helped, while
  compression/separation changes were worse. A `10/3x` boost failed
  `mechanics_weave::an_attacking_stem_drapes_along_the_bar`; a scoped `2x` boost
  for advancing non-strict foot inside a much wider foot frontage passed
  `mechanics_melee`, `mechanics_formation`, full `mechanics_weave`,
  `mechanics_charge`, `mechanics_impact`, and `mechanics_disengage`, and improved
  the Rust onset (`t084` width roughly `25.8m -> 21.7m`, `lat95` roughly
  `7.8m -> 5.7m`). It still failed the browser visual gate: Locke, a fresh
  unprimed screenshot critic (`fork_context: false`), found high-confidence
  worse `penetration t084` blue-column coherence/lateral scatter, high-
  confidence `penetration t192` red/right-side fragmentation, and muddier offense
  center/lower color-depth readability. Do not accept simple rest-weave
  stiffening as a visual fix without a sharper diagnosis.
- A global post-contact infantry cruise cap was tried and removed before
  screenshots. It capped rear non-engaged foot cruise at base speed once any
  contact existed. Focused tripwires passed, but the full melee file failed
  `a_mortal_wrapping_line_backfills_casualty_tears`: the mortal wrapping line
  left sustained casualty gaps instead of back-filling them. The rear cruise is
  part of healthy wrap repair, so a global contact cap is too blunt.
- If a deep grind visibly lags closing on the 2%-casualty trigger, relax the
  cadence (column closing is cheap and lateral-free — could run per-death).
- If `CLEAR_BEAT` looks too eager/sluggish on screen, retune it; record the
  chosen value and why in the README.
- If charge feel regresses, this is where David decides between accepting a
  stiffer line and reshaping how impact displaces bodies — do NOT silently
  re-introduce lateral relabel while engaged.
