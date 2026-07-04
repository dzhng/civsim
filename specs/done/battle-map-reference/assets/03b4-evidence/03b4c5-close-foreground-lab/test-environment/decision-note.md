# B4B1A0 close grass test environment decision

Date: 2026-07-01

## Verdict

Accepted for B4B1A0 as a **fair-with-caveats close grass review surface**. This
is not an acceptance of grass body, density, strand scale, colour, LOD collapse,
or the final `battle-map-reference` shot.

The useful outcome is a fixed close-lab surface with labeled target/absence/full
context sheets and frozen inputs. Future body candidates can now be compared
against the same camera, terrain patch, meadow/root base, generated atlas seed,
review windows, and B4B1/B4B1R absence baselines.

## Evidence

- Full lab shot: `selected-full.png`
- Target and absence baselines: `target-absence-baselines.png`
- Labeled crop sheet: `selected-crops.png`
- Raw selected lab shot: `selected-raw.png`
- Target crop: `compare-target/close-hero.png`
- Candidate crop: `compare-lab/close-hero.png`
- Side-by-side report: `compare-report/close-hero-side-by-side.png`
- Metrics: `compare-report/visual-parity-diff.json`
- Route stats: `route-stats.json`

## Metrics

`compare-screenshots` reported `parityDistance=0.24936` on the normalized
close-hero crop, with `avgLuminanceDelta=-1.57723` and
`edgeEnergyRatio=0.11698`.

Interpretation: the crop scale and luminance are close enough to keep using the
surface, but the candidate has far less edge/body structure than the target.
That edge failure is expected for B4B1A0 because body technique is out of scope.
It becomes a failure condition for B4B1A1 and later close-body slices.

## Neutral Critique

The unprimed screenshot critique verdict was **fair-with-caveats**:

- the target crop, B4B1/B4B1R absence baselines, close crops, transition crop,
  and mid-mass crop are usable as a fixed comparison surface;
- the side-by-side is not a grass-body match because the candidate remains mostly
  empty flat green where the target has dense foreground occupancy;
- perspective remains a caveat because the target reads as lower and closer,
  while the lab still has a flatter/top-down read;
- the old colored outlines needed labels, so the active sheets now label each
  crop and baseline explicitly.

## Decision

Continue to
`slices/03b4c5b4b1a1-close-body-architecture-matrix.md`.

B4B1A1 must keep this B4B1A0 lab fixed and compare only body primitive families.
Any accepted candidate must fill the same lower foreground band as the target
without changing camera, terrain, fog, palette, or full-scene composition. A
candidate that still reads as flat exposed meadow, sparse flecks, repeated
stamps, straw wires, card walls, or curtains should be rejected or resliced
before coverage tuning.

## Gates

- `SNAP=foreground-close-lab-test-environment ... node scene.mjs battle-grass-field`
  passed with `0 px differ` for all B4B1A0 shots.
- `node scene.mjs renderer-lab-routes` passed.
- `npx tsc --noEmit` passed.
- `node --check web/scenes/battle/battle-grass-field.mjs` passed.
- `node --check web/scenes/system/renderer-lab-routes.mjs` passed.
