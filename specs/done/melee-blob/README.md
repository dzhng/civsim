# Melee Blob — formation adherence while engaged

Engaged foot units blobbed: both bodies wrapped each other into a rotating
diagonal lens (the pinwheel), rectangles melted, and pike walls bowed apart
mid-line. The shipped fix is one physics correction: **the weave's pivot
spring is now torque-free by construction** — per unit per tick, the
net-rotation mode of its force field is projected out
(`ω = Σ r×F / Σ|r|²` about the living centroid, `F' = F − ω×r`) in
`crates/sim/src/sim.rs::steer_soldiers`. Internal forces must sum to zero
torque; the spring didn't, and everything visible followed from that leak.

## Why This Shape

The pivot spring corrects each bond back toward the unit's frozen facing. In
a deformed press those per-bond corrections carry a coherent curl: the spring
pumped angular momentum into the very unit it stabilizes. The per-soldier
speed cap masked ~95% of the violation (steering in a grind is a saturated
direction-vote; the cap discards ~90% of the ask), and the residue drove a
coherent ~3°/s internal circulation — men cycling through the crowd like a
tank tread while the shape stood still. The slow asymmetry of that loop was
the visible pinwheel; the pike mid-line void and silhouette melt were the
same leak downstream. Casualties made it worse (mortal-only runaway) because
holes inflate spring asks.

The fix is an exact projection, not a tunable: a pure shear/dressing
correction keeps working, the rotation mode is removed at the source. It was
chosen over every restriction-family alternative because those were each
measured to fail (see Dead Ends) — and because it restores a conservation
law rather than adding a rule.

The engaged re-dress (`engaged_deep_reform`) survives unchanged: measurement
showed it was the *arrestor*, not the motor (disabling it spun 4/5 mortal
seeds to ±180°; slowing it doubled rotation).

## Invariants

- **Internal force fields carry zero net torque.** The pivot spring projects
  its rotation mode out per unit per tick; any new internal field (weave
  net, comp push, future springs) must obey the same law — check its
  force-trace channel's angular impulse before shipping it.
- **Nothing moves a soldier untraced.** The `force-trace` cargo feature
  records every channel at its application site with pre/post cap values; a
  conservation test pins recorded steering to applied displacement. Trace
  before theorizing (see `tweak-mechanics/references/force-trace.md`).
- **The pinwheel rail measures SHAPE, not centroids:**
  `a_symmetric_grind_does_not_pinwheel` (active) fits the PCA major axis of
  living positions. Detector lessons that must not be re-learned: a
  centroid-pair bearing conflates casualty geography with motion; a
  long-window rigid fit decorrelates in churn; an integrated short-window
  rigid fit measures circulation, not orientation. Shape orientation is the
  visual truth.
- Active rails from this feature (crates/sim/tests/mechanics_melee.rs):
  `a_long_grind_keeps_the_seam_band_bounded` (≤3 rank-spacings sustained),
  `a_symmetric_grind_does_not_pinwheel` (shape/seam tilt, measured rails),
  `a_pike_seam_holds_a_straight_front` (lens ≤0.35m),
  `grinding_blocks_keep_their_deployed_silhouette` (≥0.90).
- Army-scale outcome pin `ai_battle_resolves_with_pinned_scale_shape` (x4
  median death fraction 0.50–0.66 → 0.65–0.81, provenance proven green at
  the pre-fix commit) re-derived for the same reason as the bands below.
- Survivability reference bands were re-derived under corrected physics
  (equal grind 156–221s, HP2/HP1 1.78–2.42×, HP4/HP1 3.7–6.35×) — the old
  bands were calibrated on the torque leak. Golden:
  `0xc8fad834908e0b0e → 0x1dc6e35d979b486c`, once, deliberate.
- Column-closing's invariants all still hold (no engaged relabels for
  ordinary repair, notches, donor caps, no-crab rails).

## Code Pointers

- `crates/sim/src/sim.rs::steer_soldiers` — the torque-free projection
  (pre-pass computing per-unit ω, then per-soldier subtraction). Known debt:
  the pre-pass duplicates the pivot-bond math; fold on next touch (also
  recorded in the first-principles backlog).
- `crates/sim/src/force_trace.rs` + `crates/sim/tests/force_trace.rs` — the
  harness (feature `force-trace`), conservation + smoke tests, the torque/
  circulation attribution probes, the force-budget HTML probe.
- `crates/sim/tests/mechanics_melee.rs` — the four rails, the shape/seam/
  band/lens/silhouette detectors, the slice probes (`blob_probe_*`), and the
  diagnostic env knobs (SLIDE, DEEPREFORM, TEMPOCAP, …; all default-neutral).
- `crates/sim/tests/mechanics_survivability.rs` — re-derived bands with
  re-derivation comments.

## Dead Ends (all measured, none guessed — do not re-walk)

- **Hypotheses killed by attribution:** seam-band depth (p95 ~2 ranks even
  under full vibe noise — the "deep mixed band" in isometric crops was the
  rotated seam), friendly-slide/tiebreak chirality, pike standoff-owner
  mismatch, relabel-as-motor (slower cadence = MORE rotation), corridor
  width shrink, the offset-couple (corridors never slid; frames never
  moved).
- **Fix families killed by gates:** budgeted composition of the capped
  steering sum (both priority directions — starves wrap/trample/press or
  misses the orbit); total fighting-tempo cap (HP2/HP1 2.59×); tangential
  fighting-tempo cap (HP4/HP1 6.75×). Every restriction of motion near
  enemies stretches the long grind — the survivability executioner from
  column-closing generalizes.
- **The slice-04 "cap-clips-the-spring" verdict was a share artifact** — the
  cap clips proportionally; the real mechanism was the spring's own curl
  underneath the saturated vote. Confirmed only when the ledger measured
  torque by channel.
- The exact projection initially failed the survivability bands — because
  the bands were calibrated on the bug (clean-HEAD provenance proven).
  Re-deriving the bands, not softening the physics, was the correct move.

## Visual Provenance

- `assets/before-*.png` — zoom crops of the blob David judged (2026-07-02,
  heavy-both and pike-v-pike vibe baselines): the diagonal lens, the melt,
  the pike void. These defined the requirement.
- `assets/after-*.png` — the corrected physics on film (2026-07-03,
  post-photoreal renderer): straight seams, coherent bodies, no lens.
  Same-scale zooms; judged "less wrong against the physical target".
- `visualizations/seam-timeline.html`, `visualizations/force-budget-timeline.html`
  — machine-generated metrology and force-budget records (probes named in
  their footers).
- **Open successor (tracked in the first-principles backlog):** the
  photoreal renderer landed concurrently; ALL committed vibe baselines are
  stale for renderer reasons and the new default camera frames duels too
  small. Re-frame the vibe camera, then re-bless every scenario reading all
  frames. Until then the sim physics is gated by the cargo rails (the sim's
  ground truth) plus the spot films above.

## Process Notes (why this took the road it did)

Built under David's instrument-first directive: every force traceable to its
source before hypothesizing. Slices: harness → metrology → attribution →
attribution-round-2 → fix (+3 measured dead-end fix families) → residue
closure. Three detector generations were themselves falsified by
measurement before the shape detector landed — the "metric can encode the
wrong thing" rule fired four times in one feature. The force-trace harness
found what no knob sweep could have: a conservation-law violation masked by
an actuator cap.
