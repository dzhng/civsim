# Forearm pronation candidate — not anatomy acceptance

The existing forearm carries a sword-grip roll more coherently than rotating
only the hand. Retain this bounded fitting recipe, not a claim of finished joints,
weapon contact, gameplay motion or performance acceptance.

## Recipe and decisions

- Keep the existing26-bone rig and automatic weights. Grip-region skin has only
  hand/forearm influences; moving both together removes the previously measured
  millimetre-scale drift without hardening the wrist's skin weights.
- Right forearm local transform is `Rx(elbow flex) × Ry(pronation)`; the existing
  elbow-volume support uses half of each angle. Hand local rotation stays zero.
  A90° straight-arm roll uses forearm `Ry(π/2)` and elbow support `Ry(π/4)`.
  Multiplying in this order rolls along the flexed forearm rather than swinging
  its direction. No extra twist bones are justified by this bounded comparison.
- The original `bend` remains unchanged. `pronation` and `bend-pronation` are
  two-second inspection clips, not locomotion or combat clips. The latter combines
  the original bend envelope with the same roll. Per-frame Euler authoring of the
  composed rotation avoids assuming Euler-axis addition equals local pronation.
- Owned muted NLA tracks associate all three clips with this rig. During export,
  suppress and restore the active action so `ACTIONS` exports each once. Do not
  broadcast every action in an open Blender session to this armature.
- The shared sheet runner accepts additive camera/clip details; anatomy alone
  opts in. Heavy's original coverage and every existing anatomy camera stay intact.
  Added front/rear/three-quarter640px tiles use pitch1.4, zoom950. Straight target
  is(-.48,-.018,1.04); bent target(-.30,-.20,.95). The unavailable occluded side
  view is not used to claim new evidence.

## Evidence and measured limits

[Wrist versus forearm](wrist-vs-forearm.png) compares the original body and weights
at the same camera and90° roll. [Straight](forearm-roll.png) and
[bent](bend-roll.png) sheets then show the retained helper-assisted recipe.
Their first row is the unrolled reference; subsequent rows are phases
0,.25,.5,.75,1. [Straight GIF](forearm-roll.gif) and [bent GIF](bend-roll.gif)
are200ms-per-frame review derivatives, not new renders. Each numbered PNG is a
native front tile; detail crops are320px regions enlarged2× nearest-neighbour.

The build's grip-region assertion evaluates every frame0–60 of all three clips.
[Numerical results](rigid-tracking.json) cover2039 actual reduced-mesh vertices:
maximum rigid hand tracking error is below0.000379mm. This is numerical skinning
agreement, not clearance or credible fingers. The prior nominal34mm-diameter
handle still intersects the thumb-side hand surface; this pass changes no hand
geometry and does not hide that problem by refitting the handle.

The root heavy source was loaded read-only and rebuilt into scratch with this
shared human source/exporter. Its baked bind bones and original bend tracks match
the root heavy candidate exactly, and all three distinct clips roundtrip. Body
positions, normals, UVs, weights, indices and bind bones remain unchanged from
the prior candidate. Three tangent components initially moved by at most0.0001;
clean-build tangent rounding was checked separately from visual identity. The
committed GLB retains the exact captured export. Later clean exports retain all
geometry and clip arrays but can cross rounding boundaries in a few tangent
components; binary GLB reproducibility is not claimed. This clay material has no
normal map. The actual later-export capture still matched both new sheets at zero
pixels; do not extrapolate that to future normal-mapped surfaces.

[Artifact checks](artifact-checks.json) record exact hashes and bind/clip parity.
The masked wrist-versus-forearm comparison changes 23,308 of 102,400 pixels; this
is evidence of a real change, not a quality score. The final capture has 60 posed
tiles with byte-stable repeated captures. Both new sheets match at zero pixels;
the four older, unaccepted baseline mismatches remain explicit failures.
Typecheck, candidate bake `--check`, JS syntax checks and `git diff --check` pass.

## Focused verdict and fresh critique

Direct inspection of every phase finds coherent out-and-back rotation; the hand
no longer reads solely as a wrist swivel. The five sampled phases are a limited
motion study, not proof of complete animation quality. All original static sheets
match the prior grip-preserved candidate byte-for-byte. New captures use the same
production loader, skinning, clay material and daylight environment.

Unprimed review preferred forearm roll only **marginally**, with moderate
confidence. It found a persistent abrupt wrist pinch, an angular proximal forearm
at peak roll, and a flat triangular inner elbow with broad outer-U deformation.
The unrolled bend already contains much of that elbow defect; pronation exposes
it rather than fixing it. Fingers still read as hooks/stacked ribs and the thumb
looks long and straight. No visible detachment or exploding geometry was found;
return/endpoints agree. These remain08 source-form/joint defects, not09 equipment
problems to conceal. No new snapshot baseline is accepted.

## Review and handoff

Shape review kept one human action owner and one shared exporter/runner; rejected
scratch trials are not runtime alternatives. Diff review preserved bind geometry,
original bend and default cameras; added clip coverage is explicit. Docs retain
the rig/pose rationale rather than copying the full source implementation.
The independent Codex CLI review was attempted but the installed CLI rejected
configured `gpt-6-astra` as requiring an upgrade; no model override or upgrade was
made. This is an incomplete CLI review gate, not a passing review. A separate
read-only agent reviewed the source and observed exported arrays: it confirmed
all three distinct clips, identical bind matrices/node declarations/original bend
samplers, correct local-roll composition and unchanged helper defaults. It found
that unrelated actions could occupy a new clip name and silently force a suffix;
the source now rejects collisions for the entire owned inspection-name set before
building. Numerical tracking does not distinguish hand from forearm weights when
their transforms agree; actual equipment clearance remains outside that check.

Next: integrate as a working fitting candidate, re-bake body and armor together,
fit real gear through the named clips, and separately improve wrist/elbow/hand
form. Do not mark08 or09 complete from these numerical or visual results.
