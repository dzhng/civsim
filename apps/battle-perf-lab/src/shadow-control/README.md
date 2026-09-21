# Whole-map shadow control

The measurement protocol prices shadows across three builds: **A** the original
renderer at its original default shadows, **B** the optimized renderer at
_equivalent original_ shadow quality and coverage, and **C** the optimized
renderer at the new fitted default. B exists on no branch. This directory is the
lab-owned build-time control that produces it.

## The baseline, as verified rather than remembered

At `c924e5ce` the shipped default really was the whole-map fit, on both paths
that could have chosen otherwise: the adapter probe returned `single` for every
device, and the stored graphics default was `single`. That tier fitted one 1024²
orthographic map to the terrain rect — half the rect's diagonal plus 40 units of
margin, the light backed off a further 200, near 1 and far twice that reach, a
0.6-world-unit normal offset, `-0.00003` depth bias and a turbidity-derived PCF
radius. On the 2400×1600 field: a 2964.441-unit extent at 2.894962 world units
per texel, about six soldiers to a texel, which is why the fitted default
replaced it.

The shared policy still keeps that same fit as its unposed fallback, so B needs
no second shadow owner and no copy of the algorithm.

## The control contract

Two anchored substitutions in `shadowPolicy.ts`, and nothing else:

- `SingleShadowPolicy#viewFit` returns the policy's own `wholeMapFit()`. Map
  size, both biases, PCF softness, sun pose, near/far and caster views stay
  whatever the shared policy computes, because they are still the shared policy
  computing them. Only the _choice_ between the two fits changes.
- the constructor registers its policy with [the
  report](shadowFitControlReport.ts), weakly, so evidence is read from the
  policy the build is running instead of accumulated per frame.

Every anchor — the map resolution, both biases, the original rect fit, the
whole-map fallback, the constructor and the replaced fit — must match exactly
once. A shared policy that has moved fails the build naming what moved, and a
build whose graph never reached the policy fails at `buildEnd` rather than
shipping the fitted default under B's name.

There is no production compatibility flag: B is a measurement artifact, and a
user-facing switch would outlive the measurement.

## Requesting it

`BATTLE_SHADOW_FIT=whole-map` installs the control; unset or `fitted` adds no
plugin at all, so the default production build, the default lab build and both
existing lab wrappers are configured exactly as before. _(No two full bundles
have been diffed; "unchanged" means the plugin list is, not that an output
comparison was run.)_ The production measurement build reads the variable; recorded replay does not
alter its archived shadow inputs. A caller needing the control unconditionally passes the
request to the plugin factory, as this directory's test configuration does.

```
# B, and the same command without BATTLE_SHADOW_FIT for C:
BATTLE_SHADOW_FIT=whole-map web/node_modules/.bin/vite build \
  --config apps/battle-perf-lab/benchmark.vite.config.mts --outDir <out>/live-whole-map
# source arm only in pinned revision16ad724514eeb840f241917c8fedb437a52ac1e3 checkout:
# --config apps/battle-perf-lab/src/source/vite.config.mts
# needs web/src/wasm present: bun run --cwd web build:wasm
```

## Reading the result

`globalThis.__battleShadowFitControl` is a getter; each read snapshots the
registered policy's public `fit` and `refits`. Provenance and evidence stay
separate so nobody has to take the requested name for the delivered map: the
`control` field names what the build asked for, the fit bounds and `refits` say
what the policy chose. Both are CPU-side. Neither observes rasterisation,
texture upload or draw submission, and `observed: false` means no live policy —
not a fitted one.

## What this does not establish

Not a renderer decision, not a performance claim, and not an equivalence claim
beyond the shadow fit. Two differences from `c924e5ce` are deliberate, because B
is defined as _today's_ renderer at the original shadow quality, and the first
of them is an open obligation rather than a settled one:

- today's `single` tier installs a reversed-depth guard on the shadow filter
  that the original had no need of. Inside a whole-map volume it has nothing to
  act on, but a receiver outside that volume reads lit here and undefined there.
  **Visual parity for receivers outside the original volume has to be shown
  before B is accepted; matching the fit does not imply it.**
- the crowd's shadow audience now derives from the fit's own crowd near plane.
  On the whole-map fit that plane _is_ the map's near plane, so the audience
  reproduces the original's by a different route.

Scene content, DPR, camera, crowd LOD, grass and post are untouched here and
must be held equal by the protocol instead. The A/B/C run, its hardware and its
acceptance belong to [the measurement protocol](../../../../specs/battle-performance/measurement.md)
and [the shadow slice](../../../../specs/battle-performance/slices/08-shadow-coverage.md).
