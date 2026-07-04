# 14 — Vista backdrop: what lives beyond the playable rect

The reference's huge receding ridge layers live mostly *beyond* fighting
range. Decide — on clay evidence — how much real geometry the backdrop needs,
then build exactly that.

## Contract unlocked

The horizon silhouette reads as the reference family from the locked camera;
generated maps stop depending on the legacy horizon-blocker quads.

## API seam — an explicit decision point, then one owner

Two candidate architectures (independent drafts split on this; the clay
evidence decides):

- **A. Vista apron:** the generator emits a second, coarse (≈16 m cell),
  **render-only** `VistaGrid` covering ~2–3× the playable rect, continuous
  with playable heights at the boundary. Wasm exposes ptr/dims; `terrainLayer`
  builds a low-res vista mesh sharing the slice-13 material. The sim never
  reads it. Real parallax, real silhouette; the fuller build.
- **B. Styled blockers:** keep `buildBattleHorizonLayout`'s geometry, restyle
  it with the slice-13 material family and taller profiles. Cheaper; risks the
  "detached backdrop" style debt the old spec recorded.

Decision procedure: render the fixed seed clay-only with in-grid walls alone.
If the silhouette band fails the family verdict (compare-screenshots + fresh
critique), build A; if it passes with taller in-grid walls only, B is enough.
**Record the decision and evidence here.** Whichever wins becomes the ONE
backdrop owner for generated maps; the legacy blockers survive only for hand
maps until slice 20.

## Human can run

The vista route: horizon band with backdrop on/off toggle for comparison.

## Verification

- Judged crop: the `sky-haze`/upper `flank-cliff` silhouette band from slice
  00 — silhouette, layering, and scale only.
- Elevation tripwire + perf:30k green (vista mesh is real geometry).
- N/S must stay OPEN: the backdrop never walls the deployment horizons —
  certificate-adjacent scene stat (no backdrop pixels in the N/S arrival
  sightlines below the horizon line).
- screenshot-critique unprimed; compare-screenshots vs reference silhouette.
- **Out of scope wrongness:** rock texture detail (13), haze depth (16),
  grass, water.

## Stays green

All prior verdicts; hand-map look untouched.

## Feedback that would change it

David preferring bigger/smaller background presence — apron extent and ridge
amplitude are recipe/vista parameters once the owner exists.
