# Column-closing — a fighting line closes FORWARD, never crabs sideways

When a soldier dies, the survivors should close the hole by moving **forward in
their own file** — never by sliding laterally across the rank. A man holds his
column for the whole fight. If a whole column is wiped, its frontage is left as
a notch. If a **large adjacent gap** opens — think two or more dead files making
a lane — the unit may bridge it, but only with a local reserve rule that moves a
small number of rear/deep men into the gap. It must not wake the whole formation
into a lateral re-form. A unit only fully re-evens laterally (closes the notches
into a clean rectangle) when it **stops fighting** or the player issues
**Reform**.

This kills the "back lines shuffling sideways" that David sees today: it is not
physics (a push), it is the **slot-reassignment passes relabelling
`soldier_slot[i]`**, after which the weave faithfully drags each man sideways to
chase his new slot. Stop relabelling laterally while engaged and the crab stops.

## Next Agent Prompt

**Status:** Slice 2 core wiring is in the working tree with a retained
less-wrong contact-width candidate, but shot baselines are **not re-blessed**.
`compact_columns` now closes casualties forward within files while
engaged/advancing, `compact_slots_preserving_order` is deleted, disengage gets a
clear-beat re-even, and focused tests are green. The current `0.10m` pivot-length
slack keeps the column closer to its deployed footprint at contact; David judged
it better than the flawed baseline, whose pinched/harrowed middle looked
unnatural. The golden hash is re-pinned; screenshot baselines are not.
This continuation also pinned the slice-3 rear-line no-crab sentinel:
`rear_ranks_do_not_crab_sideways_while_engaged_casualties_close` holds engaged
rear ranks to `p95 < 0.45m` and peak `< 0.55m`, well below a ~`1.0m` file
relabel. It currently prints `NO-CRAB rear lane excursion n=35 p95=0.296m peak=0.327m`,
and the full mechanics bucket still passes. This pass added the self-contained
slice-3 timeline at
`specs/column-closing/visualizations/no-crab-timeline.html`; it shows same-file
forward casualty closing, a wiped-file notch persisting while engaged, and the
clear-beat lateral re-even. Headless Chromium rendered it at desktop and mobile
widths with 7 frames, 301 cells, visible drift bars, and no horizontal overflow.
Earlier
browser candidates repeatedly looked worse under unprimed `screenshot-critique`:
The latest same-file hard collision queue candidate recreated fresh battle shots
and failed the visual gate under a fresh unprimed critique ("Gauss"); comparison
sheets and crops are under `/private/tmp/civsim-column-closing-shots/`. A later
front-clear / same-file queue experiment was rejected earlier, at the scalar
gate, and removed. The retained working tree was then re-filmed with Chrome
WebGPU; fresh comparison sheets/crops live under
`/private/tmp/civsim-column-closing-current-shots/` and Faraday's unprimed
critique still found high-confidence regressions. That temp folder was then
reused for a rejected near-edge forward-block candidate; Banach's fresh unprimed
critique again found high-confidence loss of blue column order, ambiguous melee
layering, flattened late penetration, dark ambiguous offense bodies, and stringy
offense flanks. A later global post-contact infantry cruise cap was rejected at
the scalar gate because mortal wrap back-fill left sustained casualty tears. A
light-contact running-weave softening candidate was then rejected and removed:
`0.18 * alive` failed `a_column_bulges_a_held_line_it_does_not_part_it`; `0.15`
passed formation/disengage/melee/weave/charge/impact scalar buckets and narrowed
the Rust onset diagnostic, but fresh Chrome WebGPU shots still failed Hubble's
unprimed `screenshot-critique` with high-confidence blue-column breakup,
muddy contact layering, detached stragglers, and offense arc/scatter artifacts.
This pass also rejected two more contact-order/collision paths: a non-fighting
awareness gate on infantry seek was diagnostic-red, and a scoped deep-column
friendly-slide removal was scalar-green but failed Volta's fresh unprimed visual
critique with high-confidence formation-legibility collapse and muddy contact
layering. A later deep-narrow "stay dressed while running" weave candidate was
also diagnostic-red: it made the long approach explode before contact. A
targetless rear-rank lateral cap then looked promising in scalar diagnostics
but was rejected and removed after fresh Chrome WebGPU shots: Mencius
(`fork_context: false`) found high-confidence ragged/hollow blue penetration,
detached offense arcs/threads, straggler strings, and ambiguous melee layering.
A blocked-wider-frontage weave-stiffness candidate was also rejected and
removed: it preserved scalar gates, but Lorentz (`fork_context: false`) found
high-confidence current penetration collapse into a smeared fan/arc, detached
blue trailing singletons, and muddy central contact layering. A same-unit
non-strict friendly hard-projection skip then moved the Rust onset diagnostic in
the right direction, but Curie's fresh unprimed critique (`fork_context: false`)
still found high-confidence current penetration losing formation readability
into ragged strands/holes with muddy contact layering, so that candidate was
also rejected and removed. A narrowed file-local rank reseat candidate, gated to
deep non-strict infantry engaged with much wider foot frontage, passed the scalar
mechanics buckets but failed the mandatory browser shot gate and was removed:
fresh Chrome WebGPU `penetration`/`offense` sheets in
`/private/tmp/civsim-column-closing-current-shots/` showed persistent muddy
contact depth and offense-side loose strands; Laplace, a fresh unprimed
`screenshot-critique` explorer (`fork_context: false`), found high-confidence
central melee depth-order ambiguity and offense formation readability breakdown.
A live-frontage gather candidate is now retained as useful substrate: `set_files`
arms the existing gather/reform window so a unit reshaped from line to column
dresses around its new slots before running off. It passed `scripts/test-mechanics`
and the reshape/reform scenario checks, and the Rust penetration diagnostic showed
much lower approach lateral slot error, but the browser visual gate is still red.
Fresh Chrome WebGPU `penetration`/`offense` sheets in
`/private/tmp/civsim-column-closing-current-shots/` were reviewed by Carver, a
fresh unprimed `screenshot-critique` explorer (`fork_context: false`), who still
found high-confidence ambiguous contact depth/order and central formation
readability collapse. Treat this as a better starting condition, not the final
contact-order fix. A later same-file friendly-slide reduction tried to stop
same-file compression from converting into lateral spray; it improved the Rust
onset diagnostic, but failed acceptance and was removed. Fresh Chrome WebGPU
shots in `/private/tmp/civsim-column-closing-current-shots/` still read as muddy
interpenetration/weak formation order under Leibniz, an unprimed
`screenshot-critique` explorer, and the full mechanics sweep also tripped the
survivability reference (`HP4/HP1 = 6.21x`, above the `6.0x` ceiling). Treat
same-file slide damping as closed unless a sharper version preserves
survivability and passes the visual gate. A later narrow-frontage rest-weave
stiffness candidate tried the measured lever that most improved the Rust onset
probe: doubling only the rest-shape spring for an advancing narrow foot column
inside a much wider foot frontage. It passed the focused scalar buckets
(`mechanics_melee`, `mechanics_formation`, `mechanics_weave`, `mechanics_charge`,
`mechanics_impact`, and `mechanics_disengage`) and improved the Rust `t084`
diagnostic (`width` roughly `25.8m -> 21.7m`, `lat95` roughly `7.8m -> 5.7m`),
but failed the mandatory browser gate and was removed. Fresh Chrome WebGPU
`penetration`/`offense` sheets in
`/private/tmp/civsim-column-closing-current-shots/` were reviewed by Locke, a
fresh unprimed `screenshot-critique` explorer (`fork_context: false`), who found
high-confidence worse `penetration t084` blue-column coherence, high-confidence
late `penetration t192` red/right-side fragmentation, and muddier offense
center/lower color-depth readability. Treat rest-weave stiffness as another
scalar-green/visual-red path unless a new diagnosis makes it more local than the
current wide-frontage gate.
Regenerate fresh sheets before using any temp images as evidence for a new pass.
This pass also ran a temporary native mirror of `vibe/penetration` using the
actual duel bench seed (`0x5eed_c0de`), `setFiles(1, 70)`, `setFiles(0, 8)`,
and the same attack-through-centroid order. It reproduced the browser failure:
the column stayed dressed through `t072` at about `7.4m` wide, touched around
`t078`, then widened to about `16.4m` at `t084` and `32.6m` at `t096`, while
rear ranks with no targets were already widening. A temporary raw old engaged
`reassign_slots` x-ray, without clearing the attack order, narrowed the column
(`t084` about `12.1m`, `t096` about `10.6m`) but did so by exactly the lateral
slot relabeling this spec forbids, and it badly disturbed defender cohesion. Two
non-crab substitutes were tried and removed before scalar/browser gates: a
targetless rear-rank lateral same-rank spring inside a wider foot frontage made
the native spray worse (`t084` about `25.0m`, `t096` about `44.2m`), and a
strong foot lane-cost in target selection also made the native spray worse
(`t084` about `20.6m`, `t096` about `40.8m`). Treat both as closed unless a
later diagnosis explains a materially different version. This continuation
tested two more native-only candidates and removed both: a low-cohesion
near-contact gather for non-trampling foot columns near a much wider enemy
frontage stopped the attack from ever making contact and made the approach
itself too wide (`t048` about `20.4m`), while immediate same-file
`compact_columns` on every casualty left the `t084` failure unchanged and made
`t096` slightly wider. The `t084` tear is therefore not just delayed forward
casualty compaction, and a broad "dress before contact" brake is too blunt. A
targetless deep-rear no-cruise candidate was then tried and removed: once a
non-trampling infantry unit had contact, targetless rear ranks stopped receiving
the frame cruise feed-forward while still moving under slot/weave/body forces.
It preserved contact and improved the native late spray at `rank_id >= 2`
(`t096` about `32.6m -> 24.1m`, `t084` roughly `16.4m -> 16.0m`); `rank_id >= 4`
helped less (`t096` about `26.1m`), and `rank_id >= 1` was worse (`t096` about
`25.6m` with less clean front targeting). The `rank_id >= 2` version failed the
scalar gate before browser shots: `mechanics_survivability` reported
`HP4/HP1 = 6.60x`, above the `6.0x` ceiling. Do not retain this exact no-cruise
candidate; if revisiting it, first explain why survivability will not stretch the
long grind.
This continuation set up Rust on the machine (`brew install rust`, Cargo
1.96.0), then reproduced the failure with a scratch native probe mirroring
`vibe/penetration` (`0x5eed_c0de`, defender 70 files, attacker 8 files,
attack-through-centroid order). Baseline scalar tripwires were clean:
`a_column_bulges_a_held_line_it_does_not_part_it` passed (`1.4m` dimple, no
crossing), `attack_latch_behaves_like_a_move_order` passed, and
`mechanics_survivability` passed (`HP4/HP1 = 5.85x`). The native probe showed the
column is still dressed through `t078` (~`7.5m` wide), then widens after contact
from `t079` onward while only a small minority is fighting: `t084` whole width
~`22.5m`, front ~`19.9m`, mid ~`17.6m`, rear ~`21.9m`, `col_eng=18/240`;
`t096` whole width ~`29.8m`, rear ~`28.5m`. Mass advance has already collapsed
by the widening (`t079` ~`0.31`), so this is not simply the running-weave-off
window. Cohesion is a bad diagnostic for this specific setup: it reads ~`0.08`
even while the column is visually narrow in approach. Three diagnostic paths
were tried and removed. First, a more local rear queued-man enemy-magnet
projection (only non-fighting rear footmen with a live same-file filemate ahead,
inside a much wider frontage) made the probe worse (`t084` width ~`26.2m`);
lateral seek appears not to be the outward carrier, and may help pull bodies back
toward the fight. Second, a scoped hard-layer collision slide removal for
same-unit narrow columns in wide contact also worsened the probe (`t084` ~`23.9m`,
`t096` ~`31.0m`). Third, global `separation_slide = 0.0` improved the native
shape (`t084` ~`19.6m`, `t096` ~`23.6m`) and kept the column-bulge and
attack/move tripwires green, but failed the survivability contract exactly like
earlier slide/no-cruise paths (`HP4/HP1 = 6.35x`, above the `6.0x` ceiling). Do
not promote global slide-off or the two scoped variants without a new reason they
will avoid the long-grind survivability stretch.
The next pivot-spring pass found the strongest current lead and closed one
tempting false positive. X-rays showed the width jump happens inside
`steer_soldiers`, not the hard separation pass; disabling the existing forward
block had no effect; disabling compression worsened the rear; disabling the
pivot spring kept the column narrow, identifying the pivot spring as the lateral
fan-out carrier. Tension-only pivot (`al >= rl`) still fanned out. Global
`pivot_stiffness = 1` narrowed the native probe but starved contact; `2` was
still too wide. Scaling the pivot spring's lateral component confirmed the same
tradeoff: full/near-full lateral damping kept the tail narrow but left too few
men in the fight. A scoped candidate was then promoted briefly: for a
non-trampling narrow/deep advancing foot column already engaged with a much
wider foot wall, remove the lateral component of `pivot_push` only from ranks
`>= 4`. Native evidence looked attractive (`COLUMN-TAIL rear-width=8.5m`,
`max-engaged=29`), and `mechanics_melee` (15 tests), the survivability sentinel
(`HP4/HP1 = 5.85x`), `mechanics_weave` (22 tests), and `mechanics_formation` all
passed. The browser gate rejected it. After installing `wasm-pack`, rustup
stable, and the `wasm32-unknown-unknown` target, fresh Chrome WebGPU
`vibe/penetration` frames differed from baseline starting at `t072` (`t084`
~`2.94%`, `t120` ~`4.75%`). Manual frame inspection found the current column
visually worse: `t084` became stringy/porous with detached blue trails, `t120`
read as a broad smeared wedge rather than a dressed body, and `t192` remained a
muddy flattened mass. The code, regression test, scratch probe, candidate shots,
and regenerated GIF were removed. Do not retry simple pivot lateral damping,
even rear-rank-scoped, unless the browser read explains why it will avoid the
front-wedge/stringy-tail failure.
The latest retained candidate is a smaller pivot fix, not lateral pivot damping:
cap the angular spring's length scale near the bond's rest length
(`pivot_len = min(al, rl + 0.10)`) so axial queue stretch cannot amplify
tangential correction into sideways fan-out. This matches the revised visual
target: the browser baseline is not perfect and should not be chased as ground
truth; it over-stretches/curves the column at contact. The target is the original
deployed 8-file footprint: slot width is `(8 - 1) * 0.9 = 6.3m`, and the moving
approach reads about `7-8m`. The old full-length pivot was much wider in the
native mirror (`t084` front/mid/rear roughly `18.7/17.9/25.3m`, `t095` rear
roughly `30.8m`). The pure rest-length cap was less wrong on width (`t084`
roughly `9.2/11.3/12.0m`, `t095` roughly `10.3/12.2/11.3m`) but still looked
hollow. A `0.15m` slack briefly improved first-contact fill, but it was rejected:
`a_mortal_wrapping_line_backfills_casualty_tears` failed and survivability moved
outside the reference rails (`HP1.5` grind `174s`, `HP2/HP1 = 2.35x`). A scoped
version preserved those contracts but did not improve the width diagnostic, and a
wall-side scope worsened width (`max-band=13.9m`). The retained `0.10m` slack is
the current best scalar tradeoff: `COLUMN-CONTACT deployed=6.3m min-band=7.5m
max-band=13.1m`, native `t084` front/mid/rear roughly `9.5/11.0/12.2m`, and
`t096` roughly `13.1/11.5/11.7m`. Focused gates and the full mechanics sweep are
green: `mechanics_melee` 15/15, `mechanics_survivability` (`HP2/HP1 = 2.07x`,
`HP4/HP1 = 5.86x`), and
`scripts/test-mechanics --no-fail-fast -- --nocapture`. The golden hash was
re-pinned deliberately for this physics change:
`golden_state_hash_stable` now expects `0xf36fab65928f69e4`.

Fresh Chrome WebGPU `vibe/penetration`/`vibe/offense` shots were regenerated
after rebuilding wasm, but baselines were not re-blessed. `penetration` still
diffs from `t072` onward (`t084` ~`2.80%`, `t096` ~`3.77%`, `t120` ~`3.01%`,
`t192` ~`3.39%`). The `compare-screenshots` helper was used from
`.agents/skills/compare-screenshots/scripts/visual-parity-diff.mjs` with matched
baseline/current frame folders and central contact crops. Fresh artifacts and
JSON are under `/private/tmp/civsim-column-closing-refresh.Xy5rPr/`; the
helper's fixed-pair distance is diagnostic, not an acceptance gate. It located
the largest `penetration` movement at `t192` (`parityDistance=0.54330`,
contact-crop `0.50726`) and high contact-crop movement at `t084` (`0.51632`).
Manual inspection under the revised target: current `penetration` is closer to
deployed width than baseline and removes the worst flare. David reviewed the
shown comparison and judged current better than baseline: the baseline's
pinched/harrowed middle is unnatural even though it is more filled in. Current
still has visible looseness and dangling trails, so do not claim the ideal has
landed, but do treat it as the less-wrong visual direction for this target.
`offense` helper output also shows large movement (worst full-frame `t024`,
`parityDistance=0.57014`; contact-crop worst `t048`, `0.56541`). Manual read:
current improves the side formations into cleaner blocks versus the baseline's
big curls, but the central contact trail is still dark/muddy with detached
trails. This continuation did the direct frame/crop inspection and helper
comparison, but did not re-pin shot baselines and did not complete the fresh
unprimed `screenshot-critique` gate.

**Pickup point:** Build on the retained `0.10m` pivot-length slack; do not judge
the next pass by matching the flawed baseline. The width target is "as close as
possible to the original deployed column at enemy contact" -- neither narrower
nor wider -- and current is better than baseline by that ruler because the old
baseline unnaturally pinches/harrows the column middle. The rear-line no-crab
metric is now pinned, and the human-viewable timeline artifact exists at
`specs/column-closing/visualizations/no-crab-timeline.html`. The remaining
slice-3 gate is fresh unprimed visual critique before any shot baseline is
accepted. If continuing, improve the remaining looseness without returning to
lateral `reassign_slots`, without making the defender fragment, and without
suppressing the magnet pressure needed for wrap/back-fill/bulge. Recreate
`vibe/penetration`/`vibe/offense`, run the
`compare-screenshots` helper on baseline/current folders with contact crops, then
attach the helper artifacts and any focused sheets/crops to a fresh unprimed
`screenshot-critique` subagent before re-pinning shot baselines. The critique
prompt must say that the baseline is also flawed and that deployed-width
preservation is the ruler; ask for visible baseline-vs-current formation/order
defects in the supplied sheets and crops.

**Locked decisions (from the grilling):**
- A wiped column leaves a **persistent frontage notch** mid-fight — do NOT slide
  neighbours over to close it. (Only disengage/Reform evens it.)
- A **large adjacent gap** is different from a one-file notch. Start the bridge
  at two or more empty files, but if the local donor rule proves clean enough it
  may be promoted to single-file gaps too. In either case, do not use full
  `reassign_slots`: prefer a local back-rank/reserve donor rule that moves only
  the few men needed to seed the lane, then lets `compact_columns` pull them
  forward in their new files.
- **Deep blocks obey the same rule**: rear men flow forward within their own
  file (this IS the anti-pancake flow) — no lateral re-form while engaged.
- The auto lateral re-even fires **after a short clear beat** out of contact
  (reuse `quiet_ticks`), not the instant melee ends.

**Blockers / warnings:**
- The golden hash (`golden.rs::golden_state_hash_stable`) already moved for the
  retained pivot-length change and is re-pinned to `0xf36fab65928f69e4`. If the
  next pass changes sim behavior again, re-pin it once in that pass after
  confirming the change is the only mover.
- Cargo green is not enough for this spec. Before accepting or re-pinning the
  behavior, recreate and inspect the relevant battle/weave shots, run
  `compare-screenshots`'s `scripts/visual-parity-diff.mjs` helper on
  baseline/current folders with named contact crops, then send the exact helper
  artifacts plus comparison sheets/crops to an unprimed `screenshot-critique`
  subagent (`fork_context: false`). The comparison must judge both images against
  the deployed-width target and formation readability, not against pixel
  closeness to the flawed baseline. The subagent must be used as a comparison
  check, not only as a general screenshot-quality audit.
- Concurrent sessions share the working tree (see `specs/standoff-double-push.md`
  process notes): never `git stash`/`checkout` over the tree; `git add` by path.
- Rebuild wasm before any browser/renderer-lab check.
- Current visual findings to carry until fixed: unprimed screenshot critique
  passes of the slice-2 candidates flagged `vibe/penetration` as visibly worse
  than baseline. The first candidate had blue column spray at `t084/t120/t192`,
  a shallow horizontal smear by `t120/t192`, and ambiguous right-flank clusters.
  The later rear-rank damping candidate reduced some spray but still broke the
  blue column into clumps at `t084` and a rounded blob at `t120/t192`; the same
  pass also flagged heavier contact-zone layer ambiguity and dark clutter in
  `vibe/offense`. A rear-reserve bridge candidate with five frozen contact ranks
  restored a cleaner macro column, but the fresh critique still found high-
  confidence regressions: `penetration` `t084` sheared off-center with a detached
  blue pocket, `t192` pancaked under the red line, and offense still had dark
  trailing figures that read like a third faction/material error. Do not bless or
  commit shot baselines until penetration reads ordered again and the critique no
  longer finds high-confidence regressions.
- A temporary `dbg_column_closing` probe of the browser penetration shape showed
  the rejected core behavior keeps all 8 column slot files occupied; the visible
  explosion is physical/steering-side, not a renewed slot-map crab. The column
  stays slot-file ordered but by contact the bodies can fan from roughly
  8-10m wide to 30-40m wide under contact/magnet/collision pressure. A rejected
  rank-tapered lateral magnet candidate kept the key scalar push tests green
  but failed the shot gate anyway: fresh `screenshot-critique` (fork_context:
  false, no project backstory) flagged current `penetration` as high-confidence
  worse at `t084/t120/t192`: fragmented blue mass, dark gray ghost columns near
  contact, a disconnected right-side red clump by `t192`, and confusing central
  layering. Treat that as evidence that the next fix should be a more principled
  contact-order mechanism, not a cosmetic taper or screenshot re-pin.
- A Rust-side penetration diagnostic reproduced the same onset without changing
  the slot map: in the 8-file column vs 70-file held-line setup, the column stayed
  about 7.5m wide through `t=72s`, then jumped to roughly 20m by `t=78s` and
  roughly 37m by `t=84s` while only 4-10 column men were actually fighting. This
  implicates the contact/seek transition, not casualty compaction. A front-clear
  queue experiment was tried and removed: first, direct friendly obstruction no
  longer required the friend to be fighting; then a narrow-vs-wide same-file rank
  gate let only front slot ranks seek. It reduced the `t084` diagnostic width
  somewhat, but it starved real magnet pressure and failed scalar mechanics:
  `a_column_bulges_a_held_line_it_does_not_part_it`, `attack_latch_behaves_like_a_move_order`,
  `a_braced_block_holds_its_grid_under_a_press`, `a_deep_column_walks_a_thin_line_back_equal_depths_hold`,
  `an_attacking_stem_drapes_along_the_bar`, and
  `an_attacking_line_wraps_a_deep_column_a_holding_one_does_not`. Do not return
  to a simple front-clear queue gate; it suppresses the depth/wrap/bulge behavior
  the magnet is supposed to carry.
- The retained substrate was re-shot after that revert using the actual browser
  gate (`VERIFY_BROWSER_CHANNEL=chrome`, because bundled Chromium had no WebGPU
  adapter in this environment). Faraday, a fresh unprimed `screenshot-critique`
  explorer, confirmed the visual gate is still red: current `penetration` `t084`
  breaks the blue column into a scattered right-leaning spray with detached
  stragglers; `t120/t192` have muddy red/blue depth layering and isolated blue
  figures away from the main formation; `t192` also degrades the red line's scan
  readability. Current `offense` still shows high-confidence dark brown/maroon
  lower-center figures that read ambiguously against the terrain, blob-like
  contact, and severe label/icon occlusion in the top-center stack. Do not bless
  these shots.
- A blind-rear queue candidate was tried and removed. The diagnosis found the
  `t072`→`t084` fan-out starts in deep rear ranks before most of those men have
  targets: the frame stays steady, while blind rear file-compression and weak
  lateral file dressing let axial pressure buckle sideways. The candidate changed
  only blind rear ranks: same-file axial compression transmitted along the
  slot-file axis while a targetless deep rear man in a stalled advancing foot
  queue got extra lateral pull toward his existing slot. Focused scalar buckets
  stayed green and the diagnostic improved (`t084` outliers roughly 130 -> 91 at
  1x; stronger 2x and applying the pull to targeted rear ranks both failed the
  column-bulge scalar), but fresh browser shots still failed. Einstein, a fresh
  unprimed critique, found high-confidence blue "drips" and detached trails at
  `t084/t120`, muddy center layering, unreadable formation order by `t192`, and
  ragged red arcs/clumps. This is another scalar-green/diagnostic-better path
  that does not satisfy the visual gate.
- A near-edge infantry forward-block candidate was tried and removed. It moved
  the existing foot `formation_blocks_forward` gate from the enemy centre line to
  the defender's near edge along the attacker's approach, hoping to stop rear
  ranks feeding into the jam earlier without suppressing the magnet outright.
  The scalar tripwires stayed green (`mechanics_formation`, `mechanics_weave`,
  `mechanics_charge`, `mechanics_impact`, `mechanics_disengage`, and the full
  `mechanics_melee` file, including symmetry), but fresh Chrome WebGPU shots
  were visually worse: current `penetration` `t084` scattered the blue column
  into a wide spray with detached side/rear figures, and `t120` became a broad
  triangular/fanned mass under the red line instead of an ordered column. The
  comparison sheets/crops for this rejected pass were generated under
  `/private/tmp/civsim-column-closing-current-shots/` and sent to a fresh
  unprimed screenshot critic ("Banach", `fork_context: false`). Treat this as a
  closed scalar-green/visual-red forward-block timing path unless a later
  diagnosis explains why the visual failure would not recur.
- A global post-contact infantry cruise cap was tried and removed before
  screenshots. It capped the frame feed-forward `u.cruise` at base speed for
  non-engaged foot soldiers once any unit contact existed, hoping to stop rear
  ranks overfeeding the penetration jam while leaving slot/weave/magnet forces
  intact. It passed focused tripwires (`column_bulge`, attack/move latch, deep
  push, attacking-stem drape, weave, charge, impact, formation, disengage), but
  failed the full melee scalar gate:
  `a_mortal_wrapping_line_backfills_casualty_tears` left sustained casualty
  gaps (`final-gap=3.8m`, `final-file-span=29.0m`). The rear cruise is part of
  how mortal wrapping lines back-fill tears, so a global contact cap is too blunt.
- A light-contact running-weave softening candidate was tried and removed. The
  idea was to keep the loose locomotion weave alive for a moving foot unit while
  only a small fraction of its men were engaged, avoiding the stiff-weave snap
  that the Rust diagnostic showed buckling deep rear ranks sideways. A `0.18 *
  alive` engaged threshold helped the onset diagnostic but failed the scalar
  bulge contract (`centre dimpled only 0.6m`). A narrower `0.15 * alive`
  threshold passed `mechanics_formation`, `mechanics_disengage`, full
  `mechanics_melee`, full `mechanics_weave`, `mechanics_charge`, and
  `mechanics_impact`; the diagnostic stayed compact through `t084` and only
  widened later. The mandatory visual gate still failed: fresh Chrome WebGPU
  `vibe/penetration`/`vibe/offense` shots were sheeted under
  `/private/tmp/civsim-column-closing-current-shots/` and sent to Hubble, a
  fresh unprimed screenshot critic (`fork_context: false`). Hubble found high-
  confidence current regressions: blue formation order still breaks into ragged
  sprays at `penetration` `t084/t192`, contact depth/layering is muddy, detached
  stragglers distract from the main engagement, and offense reads as loose arcs
  or scatter rather than battle lines. This confirms a scalar-green onset fix is
  not enough if it still leaves the battle-vibe read worse than baseline.
- A non-fighting awareness gate on infantry enemy seek was tried and removed
  before scalar tests. The diagnosis had shown the `t080/t084` penetration fanout
  with only a handful of actual fighters but many deep ranks already carrying
  targets and `front_clear`. The candidate allowed enemy seek only for fighting,
  sufficiently-aware, or non-advancing foot soldiers. It did not move the right
  mechanism: the Rust penetration diagnostic stayed same-or-worse (`t084` around
  29m wide, `t096` around 32m), so it was rejected as diagnostic-red. Do not
  return to a simple awareness threshold; the target/clear bookkeeping can be
  noisy without being the main visible-order lever.
- A same-unit friendly-collision slide candidate was tried and removed. The
  broad version disabled the normal friendly slide lubricant for same-unit
  soldiers near enemies, and it immediately proved too rigid: `mechanics_melee`
  failed `a_wide_line_wraps_a_narrow_block` (`rear=3`) and `mechanics_weave`
  failed `an_attacking_stem_drapes_along_the_bar` (`width 2.2->4.5`). A narrowed
  version applied only to 6-12 file, 16+ rank foot columns near enemies. That
  version was scalar-green (`mechanics_formation`, full `mechanics_melee`, full
  `mechanics_weave`, `mechanics_charge`, `mechanics_impact`, and
  `mechanics_disengage`) and improved the later Rust diagnostic width
  (`t096` roughly 23m vs 29m), but it widened the early onset and failed the
  mandatory browser gate. Fresh Chrome WebGPU `vibe/penetration`/`vibe/offense`
  shots were sent to Volta, a fresh unprimed screenshot critic (`fork_context:
  false`), which found high-confidence current defects: formation readability
  collapses at contact, depth ordering/interpenetration reads muddy, stragglers
  form visible drips, the red line becomes jagged/wavy, and offense faction
  readability worsens. Friendly slide is needed for wrap/drape; removing it,
  even narrowly, does not solve the visual order problem.
- A deep-narrow running-weave stiffness candidate was tried and removed before
  scalar tests. The hypothesis was that the 8-file column arrived with very low
  cohesion after a long soft run, then buckled when the stiff weave snapped back
  on at contact. The candidate kept the weave active while 6-12 file, 16+ rank
  foot columns were running. It was immediately diagnostic-red: in the Rust
  penetration probe the approach itself exploded (`t072` width roughly 107m,
  max slot lateral error roughly 52m) before meaningful contact. Do not keep
  deep columns fully stiff on a long run; the existing running carve-out is
  preventing catastrophic approach fray even though the later contact order is
  still unsolved.
- File-local depth rerank was also tried and rejected, then removed. Variants at
  60, 30, and 15 ticks kept every soldier in their slot file, and a casualty-only
  variant reranked only after losses. None passed the combined gate. The 60-tick
  version still had high-confidence blue fragmentation/blob and right-red
  breakage. The 15-tick version improved some late frames but produced curved
  lanes, dangling ropes, and layering issues. The 30-tick version failed
  `mechanics_melee::attack_latch_behaves_like_a_move_order` in
  `scripts/test-mechanics` (`ATTACK coh=0.65` vs `MOVE coh=0.78`) and the fresh
  unprimed critique still saw high-confidence `t084` strand tearing plus dark,
  unreadable offense silhouettes. The casualty-only version looked broadly
  scattered/pancaked and cluttered. A later narrowed version that only reranked
  deep non-strict infantry when engaged with a much wider foot unit fixed the
  broad scalar failure (`mechanics_melee`, `mechanics_formation`,
  `mechanics_weave`, `mechanics_charge`, `mechanics_impact`, and
  `mechanics_disengage` all passed) but still failed the shot gate. Laplace
  (`fork_context: false`) found high-confidence muddy red/blue contact depth at
  `penetration` `t120/t192` and `offense` `t084/t144`, plus high-confidence
  offense blue wings breaking into loose curved strands with gaps and isolated
  singletons. Do not resurrect this helper without a new
  reason and a fresh visual critique pass.
- A contact-only deeper-weave candidate was tried and rejected, then removed. It
  restored `WEAVE_NEIGHBOR_SKIP` after contact for advancing non-strict units
  while keeping the loose one-neighbour net on approach. Focused mechanics stayed
  green, but fresh shots still failed: the unbiased critique found high-
  confidence loss of blue column shape at `penetration` `t084/t120`, severe
  lateral blobbing at `t120/t192`, red formation fragmentation into a wavy ribbon
  by `t192`, and the same dark ambiguous offense bodies. It is not enough to
  stiffen the existing cloth after contact.
- A broad-frontage magnet clamp was tried and rejected, then removed. It zeroed
  the enemy seek for soldiers already inside an opposing foot frontage while
  leaving true overhangs free. Focused mechanics stayed green, including the
  wide-wrap sentinel, but fresh shots still failed: unprimed critique saw high-
  confidence scattered/clumped blue penetration at `t084`, lateral over-spread at
  `t120/t192`, uneven red deformation, and offense lost its readable wing
  structure into diagonal snakes/blobs. The next attempt should not simply remove
  more seek from the contact band.
- A lateral slot-rail candidate was tried and rejected, then removed. It kept the
  existing forward-blocking rule but raised only the sideways slot pull to
  `slot_pull_hold` for foot soldiers inside an opposing frontage. Focused and
  broad mechanics were green through the checked buckets, but fresh critique
  still found high-confidence loss of blue column shape, ragged clumps/holes,
  lateral over-spread, and dark offense streak artifacts. Stronger lateral slot
  rails improve neither the screenshot gate nor the offense read enough.
- A narrower version of that slot rail was also tried and rejected, then removed:
  it applied only to advancing units with at most two thirds of the blocking
  enemy's files, so offense would keep its normal wrap path. It did spare the
  offense numbers, but fresh critique still found penetration losing column order
  into lateral blobs/islands, stray single units, muddy contact layering, and the
  same dark offense silhouettes. The next useful attempt likely needs a different
  contact-order primitive, not more slot-rail strength.
- A lane-aware foot targeting cost was tried and rejected, then removed. It made
  narrow advancing foot prefer targets near each soldier's slot lane when
  fighting a much broader enemy, while leaving open fights and mounted targeting
  alone. Focused mechanics stayed green and late penetration looked somewhat more
  centered to the main pass, but the fresh unprimed critique still found high-
  confidence blue column loss at `t084/t120/t192`, horizontal smearing, muddy
  contact layering, and unchanged dark offense silhouettes. Lane-biased target
  preference is not sufficient by itself.
- A bounded large-gap bridge candidate was added and mechanically pinned, but it
  is **not visually accepted yet**. It detects adjacent runs of 2+ empty slot
  files after `compact_columns` and seeds the lane with at most two rear/deep
  edge donors, leaving single-file notches alone. Focused formation tests,
  `compact_columns`/bridge unit tests, `mechanics_melee::attack_latch_behaves_like_a_move_order`,
  `mechanics_disengage`, and `scripts/test-mechanics` were green. Fresh
  `vibe/penetration`, `vibe/offense`, and weave shots were captured and compared
  against `HEAD`; an unprimed `screenshot-critique` explorer ("Sagan",
  `fork_context: false`) still found high-confidence visual regressions:
  current `penetration` at `t084/t120/t192` loses the ordered blue column into a
  scattered spray/blob, red sags into a dense mixed contact arc, `t084` has
  isolated blue stragglers/side clusters, `t120/t192` have ambiguous
  blue/gray/red layering, and current offense still shows high-confidence dark
  detached trailing figures plus more broken blue wing fragments. Do not bless
  the bridge as the final spec behavior until the battle-vibe gate no longer
  finds those high-confidence regressions. The generated `web/shots` from this
  pass were reverted; comparison evidence lives under
  `/private/tmp/civsim-column-closing-shots/`.
- A narrow-front lateral damping candidate was tried on top of the bridge and
  rejected, then removed. It only damped lateral velocity that carried a narrow
  advancing foot soldier farther from his current slot lane while blocked inside
  a wider enemy frontage. Focused tests stayed green
  (`mechanics_formation`, `attack_latch_behaves_like_a_move_order`, wide-wrap,
  column-bulge, attacking-line-wrap, and `mechanics_disengage`), but fresh
  browser shots were visually unchanged enough to fail the same gate. An
  unprimed `screenshot-critique` explorer ("Zeno", `fork_context: false`) found
  high-confidence regressions: current `penetration` still loses column
  readability into a ragged scatter/blob at `t084/t120`, becomes a wide
  blue-red smear at `t192`, and current `offense` reads as arcs/blobs with dark
  confusing casualty/debris trails. Do not return to lateral velocity damping
  without a more specific mechanism and a fresh visual comparison.
- A target-consistent frontage candidate was tried and rejected, then removed.
  The first version made every downstream contact decision follow the sticky
  selected target and broke `mechanics_charge::bracing_is_what_stops_the_charge`
  by making braced and unbraced horse mass penetration equal. A narrowed version
  used the sticky target only for `front_clear`/awareness when a narrow foot unit
  was inside a much wider foot frontage; `scripts/test-mechanics` then passed,
  but fresh browser shots still failed. An unprimed `screenshot-critique`
  explorer ("Meitner", `fork_context: false`) found high-confidence current
  regressions: `penetration` `t084/t120/t192` still collapses the blue column
  into blobs/fan shapes, `t192` severely breaks the red right flank into
  detached strips, blue depth looks overly thinned, and current offense still
  has dark detached figures and crescent/blob formation reads. Target/frontage
  consistency alone is not the missing contact-order primitive.
- A scaled large-gap bridge candidate was tried on top of the local bridge and
  is also **not visually accepted**. It raised the per-gap donor cap to one rear
  donor per empty file (up to six donors) so a four-file lane is seeded from both
  edges without moving a whole rank. Focused bridge/formation tests and the full
  `scripts/test-mechanics` sweep passed, and fresh `vibe/penetration`,
  `vibe/offense`, and weave shots were recreated. A fresh unprimed
  `screenshot-critique` explorer ("Descartes", `fork_context: false`) still
  found high-confidence current regressions: `penetration` `t084` breaks the
  blue column into scattered islands with holes, `t120/t192` smears the contact
  band into blue-gray ambiguity, `t192` fragments the red right flank into
  detached clumps, and current `offense` shows dark brown trailing figures that
  read like a third faction or missing-color state. The same critique noted that
  HEAD is too rigid/barcode-like, so the target is not to restore that exact
  grid; the target is an ordered living column that does not scatter or detach.
  Comparison evidence for this rejected pass is under
  `/private/tmp/civsim-column-closing-shots/`.
- A same-file front gate on enemy magnet was tried and immediately removed. The
  idea was to let only the foremost live soldier in each slot file hunt laterally
  while rear ranks pressed through the weave. It failed the scalar contract
  before screenshots: `mechanics_melee::attack_latch_behaves_like_a_move_order`
  diverged (`ATTACK coh=0.65` vs `MOVE coh=0.85`). Do not special-case attack
  latch this way.
- Awareness-scaled enemy seek was tried and immediately removed. The idea was
  to scale the non-trample magnet by `awareness` so buried men with obscured
  sight pressed through the weave instead of hunting diagonally. It was too
  broad: `mechanics_melee` failed before screenshots because mortal wrap tears
  stopped back-filling, column-vs-line no longer bulged the held line, and
  `attack_latch_behaves_like_a_move_order` diverged again (`ATTACK coh=0.65` vs
  `MOVE coh=0.84`). The magnet is carrying real wrap/bulge pressure; do not
  simply damp it by awareness.
- A narrow-vs-wide frontage magnet projection candidate was tried and removed.
  It kept forward pressure for a narrow column blocked inside a wider foot
  frontage, while stripping lateral magnet so the column would press instead of
  hunting sideways. This was scalar-green (`scripts/test-mechanics` passed,
  including wrap back-fill, column bulge, attack/move latch, and weave), but the
  fresh browser gate still failed. An unprimed `screenshot-critique` explorer
  ("Euler", `fork_context: false`) found high-confidence current regressions:
  `penetration` `t084` still loses the readable blue column into lateral scatter
  and detached clusters, `t120` becomes a wide blob with a thin dangling tail and
  a detached blue unit, `t192` severely fragments the red line into detached
  islands, and current `offense` keeps the dark brown trailing-body ambiguity.
  The generated `web/shots` were reverted; comparison evidence remains under
  `/private/tmp/civsim-column-closing-shots/`.
- A deep-column file-bond stiffness candidate was tried and removed. The idea
  was to stiffen only front/back file bonds for 6-12 file, 8+ rank columns inside
  an opposing frontage at least twice as wide. This moved a useful mechanics
  proxy (`a_column_bulges_a_held_line_it_does_not_part_it` saw same-file lateral
  span drop from ~6.0m to ~4.4m) and the full `scripts/test-mechanics` sweep
  passed, but fresh battle shots still failed the visual gate. A new unprimed
  `screenshot-critique` explorer ("Huygens", `fork_context: false`) found high-
  confidence current regressions: `penetration` `t084/t120/t192` still loses
  blue-column scan readability into ragged lateral patches and detached
  clusters, `t120/t192` become red/blue mush with unclear layering, `t192` still
  has detached red side fragments, and `offense` still has dark ambiguous body/
  shadow trails. Huygens did note the current weave diagnostics were cleaner and
  straighter in `col-bulge` and deep-push cases, so this force is a real lever,
  but it is not sufficient for the battle-vibe acceptance bar. The generated
  `web/shots` were reverted. Also note: the old
  `/private/tmp/civsim-column-closing-shots/penetration-zoom-baseline-vs-current.png`
  was stale during this pass; use the timestamped per-frame crop pairs
  (`penetration-zoom-t084.png`, etc.) or regenerate before sending critique.
- A narrow deep file-lane press spring was tried and removed. The idea was a
  lateral-only same-file alignment force for 6-12 file, 8+ rank attacking foot
  columns blocked inside a frontage at least twice as wide: follow the lateral
  positions of the live file-mates ahead/behind, without changing any slots.
  The full `scripts/test-mechanics` sweep passed and the browser/weave shots
  were freshly recreated, but a fresh unprimed `screenshot-critique` explorer
  ("Noether", `fork_context: false`) rejected it with high confidence. Current
  `penetration` still lost blue-column readability into scattered blobs/lone
  units at `t084/t120/t192`; `t120/t192` had flat, muddy red/blue contact
  layering; `t192` fragmented the red defender into broken clumps; and current
  `offense` still had dark brown trailing figures that read as shadows/corpses
  or an unlabeled third state. The generated `web/shots` and rebuilt wasm were
  reverted. Do not return to same-file lateral springing alone as the missing
  primitive.
- A same-file friendly collision queue candidate was tried and removed. The idea
  was to make overlapping friends in the same slot file of a narrow deep
  advancing foot column separate front/back along their file instead of escaping
  sideways, but only near a much wider foot blocker. This targeted the physical
  side-island spray without changing slots or dampening enemy magnet pressure.
  Focused gates and the full `scripts/test-mechanics` sweep passed; `t120`
  penetration looked more column-like to the main pass. Fresh browser/weave
  shots still failed the mandatory visual gate: an unprimed `screenshot-critique`
  explorer ("Socrates", `fork_context: false`) found high-confidence current
  regressions at `penetration` `t084` (blue column broken into scattered singles
  and holes), `t120` (hollow/ragged blue center and noisy contact), and `t192`
  (red right wing bent into a snake-like strip with outliers), plus the recurring
  muddy layering and dark ambiguous `offense` figures. Generated `web/shots` and
  wasm were reverted. This is closer than the same-file spring, but still below
  the corrected formation-order bar.
- A narrow blocked-contact weave-gate candidate was tried and removed. The idea
  was to stop a narrow, deep, already-engaged foot column from switching into the
  loose running weave while it was pressed into a much wider foot frontage. A
  broad version broke
  `mechanics_melee::a_wide_line_wraps_a_narrow_block`; the narrowed version
  passed the full `scripts/test-mechanics` sweep and fresh shots were recreated,
  but it failed the mandatory visual gate. A fresh unprimed
  `screenshot-critique` explorer ("Planck", `fork_context: false`) found
  high-confidence current regressions: `penetration` `t084/t120` became less
  scan-readable, with blue soldiers scattered into islands and singles;
  `t192` had a vertical drip/string artifact below the melee; contact depth
  ordering was muddy; red side formations looked partially broken; and offense
  still had dark brown/gray figures that confused faction/state readability. The
  generated `web/shots` and rebuilt wasm were reverted. Do not treat a
  scalar-green weave stiffness gate as acceptable without this shot critique
  improving too.
- A hard-layer friendly collision queue was tried and removed. The first version
  made same-unit foot collisions near contact resolve along the formation-rest
  axis between each pair's slots, so a narrow column pressed into a wide frontage
  would queue through its grid instead of radially squirting sideways. It was too
  broad: `mechanics_melee::a_wide_line_wraps_a_narrow_block` lost rear wrap
  (`rear=0`) and `attack_latch_behaves_like_a_move_order` diverged (`ATTACK
  coh=0.69` vs `MOVE coh=0.82`). A narrowed version only applied to 6-12 file,
  8+ rank foot columns pressed into a frontage at least twice as wide; the full
  `scripts/test-mechanics` sweep passed, and fresh browser/weave shots were
  recreated, but an unprimed `screenshot-critique` explorer ("Epicurus",
  `fork_context: false`) still found medium-confidence `penetration` `t084`
  side-loop/spiral breakage plus muddy `t120/t192` contact ordering and dark
  offense artifact bodies. A same-file-only version then restricted the hard
  collision axis to soldiers in the same slot file; focused mechanics stayed
  green, but fresh shots looked worse at `penetration` `t084` and `t192`.
  Another fresh unprimed critique ("Gauss", `fork_context: false`) found
  high-confidence muddy melee depth ordering, high-confidence dark offense bodies
  reading as rendering debris, and medium-confidence `penetration` `t084` broken
  into scattered arcs/isolated sprites. Generated `web/shots`, rebuilt wasm, and
  the collision changes were reverted. Do not revisit hard collision axis
  projection without a more specific physical diagnosis; it preserved scalar
  contracts only after narrowing, but did not pass the less-wrong shot gate.
- A targetless rear-rank lateral velocity cap was tried and removed. It capped
  lateral speed only for non-fighting, targetless, rear ranks (`rank_id >= 8`) of
  6-12 file advancing foot columns already engaged. Rust diagnostics improved
  the measured spread near onset (roughly `t84` body width 28.5m -> 19.6m), and
  focused scalar gates stayed green (`mechanics_formation`, `mechanics_melee`,
  `mechanics_weave`, `mechanics_charge`, `mechanics_impact`,
  `mechanics_disengage`), but the mandatory shot gate failed. Fresh Chrome
  WebGPU `vibe/penetration` and `vibe/offense` sheets under
  `/private/tmp/civsim-column-closing-current-shots/` showed the current
  penetration still breaking into a lopsided porous mass with side islands and
  stringy stragglers. A fresh unprimed `screenshot-critique` explorer
  ("Mencius", `fork_context: false`) found high-confidence ragged/hollow current
  blue formation, ambiguous red/blue contact layering, detached offense arcs and
  threads, and stragglers that looked too evenly spaced/disconnected. Do not
  treat a better width scalar as acceptance unless the current shots also read
  less wrong against the visual target.
- A blocked-wider-frontage weave-stiffness candidate was tried and removed. It
  kept the narrow/deep attacking foot column's weave stiff once a soldier was
  already inside a much wider opposing foot frontage, while still preserving
  forward cruise/feed pressure. The first version also suppressed cruise inside
  the wider frontage and immediately failed
  `a_column_bulges_a_held_line_it_does_not_part_it` (`centre dimpled only
  0.0m`), so that part was removed. The narrowed version was scalar-green:
  `mechanics_melee`, `mechanics_weave`, `mechanics_formation`,
  `mechanics_charge`, `mechanics_impact`, and `mechanics_disengage` passed, and
  the column-bulge dimple improved to `2.2m` without losing wrap/depth tests.
  Fresh Chrome WebGPU `vibe/penetration` and `vibe/offense` shots were visually
  worse, however: `penetration` `t084` scattered into a broad blue spray and
  `t120` became a wide umbrella/fan with detached side figures. A fresh unprimed
  `screenshot-critique` explorer ("Lorentz", `fork_context: false`) found high-
  confidence current collapse into a smeared fan/arc, detached trailing blue
  singletons, and muddy central contact layering. This is another scalar-
  green/visual-red path: stiffening the running lattice inside the frontage is
  not the missing contact-order primitive.
- A same-unit non-strict friendly hard-projection skip was tried and removed.
  The diagnosis narrowed the `t072`→`t084` fan-out: rear rank bands had zero
  targets and zero fighters but high lateral velocities, pointing away from
  enemy magnet/slot relabeling and toward friendly compression/projection near
  contact. Disabling the normal friendly slide lubricant did not explain the
  failure. Skipping the later iterative hard projection for same-unit non-strict
  friendly pairs did move the Rust onset diagnostic in the right direction
  (`t084` width roughly 17m -> 14m; slot lateral error roughly 5.4m -> 4.0m),
  while full scalar buckets stayed green after keeping strict formations on the
  old path (`mechanics_formation`, full `mechanics_weave`, full
  `mechanics_melee`, `mechanics_charge`, `mechanics_impact`, and
  `mechanics_disengage`). A broad version that skipped all friendly hard
  projection failed `holding_phalanx_backline_does_not_lateral_buzz`
  (`p95 step 0.209m/tick`), proving strict packed formations still need that
  projection damping. Browser shots were still not acceptable: fresh Chrome
  WebGPU `vibe/penetration` showed `t084` still as a ragged scatter with side
  clusters, `t120` as hanging blue strings under a wide red canopy, and `t192`
  with muddy contact plus red side fragmentation. A fresh unprimed
  `screenshot-critique` explorer ("Curie", `fork_context: false`) found high-
  confidence current penetration losing formation readability into ragged
  strands/holes, dense red/blue overdraw and muddy depth ordering, detached
  stragglers, and hard-to-parse offense spirals. This is a useful diagnostic
  clue, not an accepted fix: the late friendly hard projection contributes to
  onset spread, but removing it for non-strict same-unit pairs is not enough for
  the corrected visual bar.
- A same-unit non-fighting queue blocker was tried and removed. It counted
  same-unit bodies directly between a soldier and his target as `front_clear`
  blockers even before those bodies were fighting. The Rust onset probe moved in
  the right direction, but the scalar gate failed exactly where expected:
  `mechanics_melee::a_column_bulges_a_held_line_it_does_not_part_it` dimpled only
  `0.5m`, and `attack_latch_behaves_like_a_move_order` diverged (`ATTACK coh=0.65`
  vs `MOVE coh=0.85`). Do not return to a broad "non-fighting friend blocks
  seek" rule; it starves the magnet pressure that makes bulge/wrap work.
- A low-awareness lateral magnet projection was tried and removed. It stripped
  only the lateral component of the enemy magnet for non-fighting, low-awareness,
  advancing non-strict infantry against a much wider foot frontage, leaving
  forward pressure intact. The Rust penetration diagnostic was worse: cohesion
  dropped at contact and the column widened later, so it was rejected before a
  full scalar or browser pass. Do not chase lateral magnet projection by
  awareness without a new diagnosis.
- A live-frontage gather candidate is retained but not accepted as the visual
  solution. The diagnosis found that `set_files(8)` in the penetration vibe
  re-seated the slot map from a wide default line to a deep column while the
  bodies remained physically wide, then immediately let the unit run. Arming the
  existing `reform_timer` gather on `set_files` made the column dress around its
  new slots before moving: a new `mechanics_formation` test pins lateral slot
  error after live reshape, `scripts/test-mechanics` passed, and
  `scenario_ai::{width_orders_reshape_the_formation,reform_recovers_order_faster}`,
  `scenario_class`, `mechanics_morale`, and `balance_charge` stayed green. Fresh
  browser `vibe/penetration` and `vibe/offense` shots still failed the mandatory
  visual gate. Carver (`fork_context: false`) found high-confidence ambiguous
  red/blue contact depth/order and central formation readability collapse, plus
  the recurring dark/ambiguous offense trails and label/flag readability issues.
  Keep this as a principled setup fix, but continue the pickup at contact
  ordering; do not bless shot baselines from this pass.
- A follow-up Rust onset probe on the retained substrate found the browser-style
  `penetration` fan-out starts after first contact: around `t=84`, the 8-file
  column is roughly 26m wide while only about 5-7 men are fighting, and almost
  every non-fighting rear man still reads `front_clear=1` with high awareness.
  A rear-rank-only lateral magnet projection for narrow columns inside a much
  wider foot frontage was tried and removed; it left the same ~26m width in the
  probe, so lateral target magnet is not the whole root cause by itself.
- A narrow-frontage rest-weave stiffness candidate was tried and removed. A
  quick force sweep showed that magnet removal barely moved the Rust onset
  diagnostic, compression/separation changes were worse, and raising the
  rest-shape weave stiffness was the one scalar lever that tightened the
  `t=84` column. A broad `10/3x` boost failed
  `mechanics_weave::an_attacking_stem_drapes_along_the_bar` by choking the
  attacking stem's drape; a scoped `2x` boost, only for advancing non-strict foot
  inside a much wider foot frontage, passed the focused scalar gates
  (`mechanics_melee`, `mechanics_formation`, full `mechanics_weave`,
  `mechanics_charge`, `mechanics_impact`, and `mechanics_disengage`) and improved
  the Rust probe (`t084` width roughly `25.8m -> 21.7m`, `lat95` roughly
  `7.8m -> 5.7m`). It still failed the required browser comparison: Locke, a
  fresh unprimed `screenshot-critique` explorer (`fork_context: false`), found
  high-confidence worse `penetration t084` blue-column coherence/lateral scatter
  and high-confidence late `penetration t192` red/right-side formation
  breakdown. This closes simple contextual rest-weave stiffening as an accepted
  fix; better scalar onset is not enough.

**Global TODO** (each item owned by a slice):
- [x] `compact_columns` written + unit-tested, pure, unwired — slice 1
- [ ] Drumbeat rewired: column-close while engaged/advancing; remove the engaged
      `reassign_slots` path; delete `compact_slots_preserving_order` — slice 2
- [ ] Disengage one-shot re-even via `quiet_ticks` clear-beat — slice 2
- [ ] `reassign_slots` confirmed reachable ONLY by pivot / files-change /
      reform / rally / at-ease recovery / disengage — slice 2
- [ ] Golden re-pinned once; weave/charge/impact/disengage buckets green — slice 2
- [x] Relevant battle/weave shots recreated and inspected against the corrected
      formation-order target, not just nonblank/green tests — slice 2/3 gate
      (latest retained `0.10m` pivot-length slack is closer to the deployed
      column footprint than the flawed baseline, whose middle pinches inward;
      screenshot baselines are still not re-blessed)
- [ ] Current retained visual pass reviewed by a fresh unprimed
      `screenshot-critique` subagent before any visual baseline is accepted —
      slice 2/3 gate (older rejected candidates were critiqued; the retained
      `0.10m` pass still needs a critique prompt that names the deployed-width
      target and says the baseline is imperfect too)
- [x] Rear-line lateral-travel-while-engaged metric test pinned — slice 3
      (`rear_ranks_do_not_crab_sideways_while_engaged_casualties_close`;
      current `p95=0.296m`, peak `0.327m`, rail is `<0.45m/<0.55m` vs a
      ~`1.0m` file relabel)
- [x] Human-viewable proof artifact — slice 3
      (`specs/column-closing/visualizations/no-crab-timeline.html`; renderer-lab
      moving-picture scene remains optional/not built)
- [ ] Gap bridge designed and pinned: adjacent 2+ dead-file lanes fill locally
      from rear/deep reserves without whole-unit lateral crab; optionally lower
      to one-file gaps if shots/tests show it is cleaner — slice 4

**Before you end your pass, update this section** (status, pickup point, checked
boxes) so the next agent can resume cold.

## How the formation actually moves (measured facts, do not re-derive)

All formation state is in the `sim` crate.

- A soldier owns ONE integer slot, `soldier_slot[i]` (`sim.rs:196`). The grid is
  **rank-major**: `file = slot % files_eff`, `rank = slot / files_eff`
  (`unit.rs:234-240`). `slot_world` (`unit.rs:279-284`) turns that into a world
  target; the **weave** (the spring net, `sim.rs:~1765` slot pull + file/rank
  neighbour bonds `sim.rs:~1896-1934`) physically pulls each man toward it. The
  weave is faithful — **lateral motion only happens when the slot MAP changes.**
- A death (`combat.rs:1045 kill_with`) only marks the corpse and bumps
  `deaths_since_reform`. It does NOT reshuffle slots itself.
- The reshuffle is the per-tick drumbeat in `Sim::tick` (`sim.rs:892-948`). It
  picks between two routines in `unit.rs`:
  - `reassign_slots` (`unit.rs:362`) — full geometric re-sort: re-ranks by depth,
    re-sorts each rank laterally. **Relabels files → lateral crab.**
  - `compact_slots_preserving_order` (`unit.rs:405`) — repacks survivors into
    slots `0..n` in **reading order**. Because the grid is rank-major, closing a
    hole pulls the next man *across the rank* into it. **This is ALSO lateral.**
- The "engaging" signal already exists: per-unit `engaged: usize` (men in melee
  last tick, `unit.rs:120`), rebuilt each tick by `refresh_contact_engagement`
  (`sim.rs:970`). `quiet_ticks` (`unit.rs:127`) counts ticks with no contact.
- The explicit Reform command is `set_reform` → `reseat` → `reassign_slots`
  (`sim.rs:758-792`); a rally forces a full re-form via
  `deaths_since_reform = alive_count` (`morale.rs:430`). `files_eff` corridor
  narrowing and `set_files` also call `reassign_slots` (`sim.rs:1162, 748`).

**The gap:** there is no column-major closer. The fix is one — `compact_columns`
— plus gating so it is the ONLY thing that runs while a unit fights.

## The shape of the change

```
on a soldier's death:           deaths_since_reform++          (unchanged)

reform drumbeat (sim.rs ~892):
  if casualties to close AND (engaged OR advancing):
        compact_columns(...)        ← NEW: forward-only, file-fixed, gaps kept
  reassign_slots(...) reached ONLY by:
        pivot · set_files · corridor files_eff · set_reform/reseat · rally
        · at-ease recovery drumbeat · NEW disengage one-shot (clear-beat)
```

`compact_columns` is the base behavioural idea: per file, take the living men
and pack them into ranks `0,1,2,…` of that **same file**. A man never leaves his
column; vacancies close toward the front; an emptied single file stays empty.

The later gap bridge is deliberately separate: when two or more adjacent files
are empty, the engine may choose a tiny number of deep/rear donors near the gap
edge, move only those donors laterally into the vacant file slots, and then let
ordinary column compaction carry them forward. If that rule is visually and
mechanically clean enough, slice 4 may lower the threshold to one empty file.
That is a local reserve commitment, not a geometric re-sort of the whole unit.

## Slice graph

| # | Slice | Unlocks | Verify | Type |
|---|-------|---------|--------|------|
| 1 | [compact-columns](slices/01-compact-columns.md) | `unit::compact_columns` — pure column-major closer, file-fixed, gap-leaving, deterministic, unwired | `mechanics_*` unit tests on `block(files,ranks)`: front-death pulls the file up, mid-death moves only men behind in-file, wiped file stays empty, no man changes file, idempotent | substrate |
| 2 | [wire-and-gate](slices/02-wire-and-gate.md) | drumbeat uses `compact_columns` while engaged/advancing (deep blocks too); `reassign_slots` only on pivot/files/reform/rally/at-ease/disengage; `compact_slots_preserving_order` deleted; disengage one-shot via `quiet_ticks` | weave/charge/impact/disengage/posture buckets green; golden re-pinned once; a deep engaged block taking front losses shows rear-rank lateral travel ≈ 0 | behavior |
| 3 | [prove-no-crab](slices/03-prove-no-crab.md) | rear-line lateral travel metric is pinned; remaining work is a human-viewable slot-occupancy timeline + renderer-lab scene showing notch-persists-then-evens-on-disengage | the metric test; the artifact David can open and judge by eye | behavior + visible |
| 4 | [large-gap-bridge](slices/04-large-gap-bridge.md) | local reserve rule for adjacent dead-file lanes: start at 2+ files, optionally promote to one-file gaps if the bounded donor rule looks better than a notch | gap-bridge tests, lateral-mover cap, battle/weave shots showing less lane/blob without global crab | behavior + visible |

Slice 1 is pure substrate (no behavior change). Slice 2 is the first behaviour
change and the golden re-pin. Slice 3 is the proof David's eye signs off on and
the anti-regression watch. Slice 4 adds the smarter exception for battlefield
lanes that are too wide to leave alone, and may reuse the same local reserve
logic for single-file gaps if it proves cleaner than persistent notches.

## Sacred contracts (must stay green)

- **Determinism.** Same seed → byte-identical. `golden_state_hash_stable`
  re-pinned ONCE in slice 2; `compact_columns` sorts on a deterministic key
  (rank then soldier index — never `Math.random`/position noise).
- **Physics is untouched.** No change to the weave forces, `slot_pull`,
  separation, `weapon_repel`, the braced standoff/weld, or `slot_local`/
  `slot_world` geometry. We change only *which slot a man is assigned*, never the
  forces that carry him there or where a slot sits.
- **Lateral motion from a PUSH stays.** Being shoved sideways by bodies/charge is
  physics and is explicitly allowed — only *reassignment-driven* lateral motion
  is removed.
- **Braced standoff.** `mechanics_weave::two_braced_walls_*`,
  `the_fronts_stay_welded_*`, `a_braced_block_holds_its_grid_under_a_press` green.
- **The wrap/bent-sheet identity.** `compact_columns` is strictly lateral-free,
  so it preserves a wrapped sheet's neighbour identity at least as well as the
  old order-preserving compaction it replaces. The `mechanics_weave` wrap probes
  stay green.
- **Charge absorption is the watched risk.** While engaged we no longer
  relabel-to-absorb a shoving charge (men hold their file slots). `mechanics_charge`
  and `mechanics_impact` must stay green; if a line now feels too rigid under
  impact, that is the knob to revisit (a known unknown, not a silent regression).
- **Visual order is a required gate.** Numeric mechanics gates are necessary but
  not sufficient. Recreate and inspect the relevant battle/weave shots before
  accepting this behavior. Compare baseline/current, but judge both against the
  target, not against pixel closeness to the baseline: the column should keep as
  close as possible to its deployed footprint at enemy contact, neither pinching
  narrower nor spreading wider, while the formation stays readable. The current
  penetration baseline is flawed evidence because its middle pinches/harrows
  inward; do not regress toward that shape just to reduce a diff. Do not re-pin
  cargo or screenshot baselines on a formation that looks worse just because the
  scalar invariants pass. Before accepting the shots, run the
  `screenshot-critique` skill with a fresh explorer (`fork_context: false`),
  attaching the full comparison sheet plus tight crops around the contested
  formations. The prompt must establish the deployed-width target and state that
  the baseline can be wrong too, then ask for visible formation/order defects in
  both images. Record any high-confidence critique finding in this spec or the
  next task before claiming the visual gate passed.
- **Gap bridge is local, never a reform.** The conservative default is that a
  one-file wipe remains a notch and a two-or-more-file lane may be narrowed while
  fighting. Slice 4 may lower the threshold to one file if the bounded donor rule
  looks better. In all cases, only a bounded set of rear/deep donors near the gap
  may move laterally. Do not use `reassign_slots`, left-pack the unit, shrink
  `files_eff`, or slide every rank laterally to heal the lane.
- **Reform/pivot/corridor unchanged.** The explicit Reform, pivot, `set_files`,
  and corridor `files_eff` narrowing still do a full lateral `reassign_slots`.

## Firewalls / non-goals

- **Change the slot MAP, not the substrate.** No edits to the weave, separation,
  slot geometry, or any force magnitude beyond reading them.
- **No new order types.** Reform's public API is unchanged.
- **No balance/economy.** This is a `mechanics_*` engine-geometry change on
  immortal fakes; no real class stats involved (see `tests/README.md` creed).
- **Corridor narrowing keeps its lateral re-form.** Squeezing `files_eff` to fit
  a defile is a deliberate maneuver, not casualty-closing — it stays on
  `reassign_slots`.

## Known unknowns (the slices resolve these)

- **Does forward-only-while-engaged feel too rigid under a charge?** Removing the
  absorb-relabel may make lines springy/stiff on impact. Slice 3's eye check and
  `mechanics_charge` answer it; the fix, if needed, is in HOW the charge displaces
  bodies, not in re-adding lateral relabelling.
- **Cadence.** `compact_columns` is cheap and lateral-free, so it could run on
  every death instead of the 2% `deaths_since_reform` drumbeat. Start on the
  existing trigger; relax in slice 2 only if a grind visibly lags its closing.
- **The clear-beat length.** How many `quiet_ticks` before the disengage re-even
  fires — long enough to ignore a momentary lull, short enough to look prompt.
  Tune in slice 2.
- **Deep-grind pancaking and large lanes.** Forward in-file flow should refill
  front losses and prevent the pancake the old engaged reflow guarded against;
  slice 3 watches a deep block to confirm. If adjacent empty files make a lane
  that reads too artificial, slice 4 owns the local rear-reserve bridge — not a
  rollback to full lateral reassign.

## How to start cold

Read "How the formation actually moves" above, then begin at
`slices/01-compact-columns.md`. Each slice names its seam, the test that pins it,
and what a human can run to judge it. Update the Next Agent Prompt before you stop.
