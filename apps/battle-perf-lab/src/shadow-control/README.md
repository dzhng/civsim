# Whole-map shadow control

The measurement protocol prices shadows across three builds: **A** the original
renderer with its original default shadows, **B** the optimized renderer at
_equivalent original_ shadow quality and coverage, and **C** the optimized
renderer with the new fitted default. B is the only one of the three that does
not exist on any branch — it is today's renderer wearing yesterday's shadows.
This directory is that wearing, and nothing else.

## The baseline, as verified rather than remembered

At `c924e5ce` the shipped default really was the whole-map fit, on both of the
paths that could have chosen otherwise: the adapter probe returned `single`
for every device, and the stored graphics default was `single` too. The
`single` tier fit one 1024² orthographic map to the terrain rect — half the
rect's diagonal plus 40 units of margin, the light backed off by a further 200,
near 1 and far twice that reach, a 0.6-world-unit normal offset and a turbidity-
derived PCF radius. On the production 2400×1600 field that is a 2964.441-unit
light-space extent and 2.894962 world units per texel: about six soldiers to a
texel, which is why the fitted default replaced it.

Those constants were read out of the original rig, not inferred from the
comments that survive around today's policy. The shared policy still keeps the
same fit as its unposed fallback, so B does not need a second shadow owner.

## Why a build-time substitution

The shared policy already contains both fits. Only the _choice_ between them is
what separates B from C, so the control replaces that choice and nothing else:
one anchored source substitution redirects the camera-driven fit into the
policy's own whole-map fallback. Map size, depth and normal bias, PCF softness,
sun pose, near/far planes and the caster views all continue to be whatever the
shared policy computes, because they are still the shared policy computing them.

Three consequences are deliberate:

- **No production compatibility flag.** Build B is a measurement artifact, not
  a product mode, and a user-facing switch would outlive the measurement.
- **No copy of the shadow algorithm.** A copied fit drifts away from the thing
  it is supposed to be equivalent to, silently, and takes the comparison with it.
- **Fail closed, never approximate.** Every anchor — the map resolution, both
  biases, the original rect fit, the whole-map fallback, and the camera-driven
  fit being replaced — must match exactly once. A shared policy that has moved
  fails the build with the name of what moved, and a build whose graph never
  reached the policy fails at the end of the build rather than shipping the
  fitted default under B's name.

## Requesting it

`BATTLE_SHADOW_FIT=whole-map` installs the control; unset or `fitted` installs
nothing at all, so the default production build, the default lab build and both
existing lab wrappers are byte-identical to what they were. The
[live](../live/README.md) and [source](../source/README.md) configurations read
the variable; a caller that needs the control unconditionally passes the request
to the plugin factory directly, as this directory's own test configuration does.

The control composes with, and is independent of, the timing-query and
held-authority controls. It says nothing about which of those is in force.

Only the two measured entries read the variable. The capture lab configuration
does not, deliberately: it exists to record and replay presentations, not to be
timed, and a capture that silently answered to this variable would be a second
place for build B to come from.

## Reading the result

Provenance and evidence are separated on purpose, because the point of the
exercise is that nobody has to take the requested name for the delivered map:

- the report's `control` field is **compiled provenance** — it exists in a
  bundle only because the substitution was compiled into it;
- the counters and bounds beside it are **runtime evidence** — the extent, the
  world units per texel, the normal offset, and how many _different_ maps the
  fits actually rasterised. One map across a whole pan/zoom/orbit trace is the
  control's entire claim, and it is measured rather than asserted.

The report is published on `globalThis` so page-side capture and trial harnesses
can read it without this control reaching into them.

## What this is not

It is not a renderer decision, a performance claim, or an equivalence claim
about anything except the shadow fit. Two known differences from `c924e5ce`
remain and are correct to leave alone, because B is defined as _today's
renderer_ at the original shadow quality:

- today's `single` tier installs a reversed-depth guard on the shadow filter
  that the original had no need of. Inside a whole-map volume it has nothing to
  act on; a receiver outside that volume would read lit here and undefined there;
- the crowd's shadow audience is now derived from the fit's own crowd near
  plane. On the whole-map fit that plane _is_ the map's near plane, so the
  audience reproduces the original's, but it is reached by a different route.

Everything beyond the shadow fit — scene content, DPR, camera, crowd LOD, grass,
post — is untouched by the control and must be held equal by the measurement
protocol instead. The actual A/B/C run, its hardware and its acceptance belong
to [the measurement protocol](../../../../specs/battle-performance/measurement.md)
and [the shadow slice](../../../../specs/battle-performance/slices/08-shadow-coverage.md),
not here.
