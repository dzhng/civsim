# Landscape decisions

These are the retained implementation choices. Confidence describes the
architectural judgment, not an assertion that every visual target passed.
Current acceptance and limitations live in [closeout status](assets/closeout-status.md).

## Medium confidence

- **Sound · medium confidence — finite detail over a source-conforming overview.**
  Preserving coastal topology increases mesh cost. A smaller detailed working
  set keeps the resource budget finite while overview terrain remains visible.
  Coarse/detail joins interpolate the actual parent triangles and attributes.
  Tiny raster pinholes remain a documented limitation, not evidence of a second
  surface owner being needed.

- **Sound · medium confidence — relief carries mountain mass.**
  Detached props cannot make a connected range. Retain the geographic envelope,
  simplified secondary folds and accepted saddle articulation in terrain.
  Gentle shelves retain grass; source altitude strengthens exposure on sloped
  faces. The resulting simplified ridges remain an explicit visual tradeoff.

- **Sound · medium confidence — one neutral rock image, two shader adapters.**
  Face-oriented filtered detail gives both maps compatible stone character.
  Each backend owns its GPU texture; a battle scene shares one image across
  ground and vista generations. Physical geometry supplies lighting normals.
  Authored visual slope defaults never populate missing gameplay descriptors.

- **Sound · medium confidence — irregular edges within the existing budget.**
  Coherent campaign selection preserves woodland interiors; small deterministic
  priority variation softens their boundaries. Existing small fringe bushes,
  battle bushes and rough-ground stones provide intermediate detail. Sparse
  appearance is a retained limitation; another scatter pool is unnecessary.

- **Sound · medium confidence — sampled shore knots connect animated water.**
  Ocean boundaries retain every presented field-edge knot rather than covering
  gaps with an overlapping strip. The existing offshore depth band controls
  displacement transition. This trades bounded geometry cost for continuity.

- **Sound · medium confidence — unresolved water motion loses contrast.**
  Distant procedural drift becomes flicker. Attenuate it by screen footprint
  while retaining near motion and phase return. Standalone lake detail follows
  actual eye distance, including altitude, rather than distance to ground focus.

- **Sound · medium confidence — seat buildings without reshaping geography.**
  Keep roofs level and extend foundations into the sampled footprint. Circular
  terrain pads damage ranges. Tall exposed retaining walls at steep sites remain
  a tradeoff of preserving geographic anchors and model scale.

- **Sound · medium confidence — labels reserve painted space.**
  Raised anchors and actual ink bounds feed the existing importance arbitration.
  A small CSS gap avoids names reading as one string; lower-priority labels may
  yield while markers remain. Card precedence and legitimate viewport clipping
  remain explicit rather than being hidden by brightness-only checks.

## High confidence

- **Sound · high confidence — shared character, backend-local composition.**
  Campaign and battle need consistent land, water, trees and light while retaining
  different units, geography and gameplay. Share neutral policy and assets;
  Three campaign and TypeGPU battle each own their GPU expression. Natural
  previews consume production worlds. Keep diagnostic clay fixtures explicit.

- **Sound · high confidence — visible ground owns presentation.**
  On raised terrain, a flat-plane pointer or independently sampled road can
  disagree with what the player sees. Geometry, draping, grounding and picking
  use the presented surface and revision. Geographic sampling and physical
  battle terrain remain independent authorities for their existing purposes.

- **Sound · high confidence — world identity survives window changes.**
  A tile boundary must not become a coastline or reseed a forest. Align sampling
  and scatter to world coordinates; bound coast influence with shared halo
  sampling. Keep cache keys distinct from fresh presentation revisions.

- **Sound · high confidence — bounded residency retains useful work.**
  Rapid camera travel should preserve overview coverage and reuse cached tiles.
  One scheduler owns demand, admission and eviction; generation owns allocation
  estimates. Switch affected boundaries together. Remember real source failures
  while allowing temporary space blocks to clear when demand changes.

- **Sound · high confidence — clipping boundaries are exact.**
  Interpolating onto a tile plane can round just outside the source domain and
  fail a legitimate geographic sample. Pin the clipped coordinate to that plane
  instead of widening the terrain query's domain or suppressing its failure.

- **Sound · high confidence — interpolate coverage rather than category IDs.**
  Numeric grass and forest IDs bracket rock and create false stone borders when
  interpolated. Decode independent material weights before mesh joins and
  shading. Simulation categories and passability do not change.

- **Sound · high confidence — geography controls planting eligibility.**
  Concave forest footprints must keep their holes and clearings. Battle retains
  exact source cells; explicitly authored discs retain their stated footprint.
  The shared finite lattice determines identity, while each map owns climate,
  reservations and density. Seating follows the presented terrain revision.

- **Sound · high confidence — one crown silhouette across detail levels.**
  Close leaf detail must not replace a tree with an unrelated shape. Permanent
  crowns, attached leaves and packed shape variants preserve mass within the
  draw budget. CSS projected size selects detail. Visible and shadow passes use
  the same leaf mask and filtered-atlas color contract.

- **Sound · high confidence — water semantics belong to their sources.**
  Campaign signed shore distance and battle physical water coverage have
  different meanings. Preserve those inputs while sharing palette and response
  policy. Convert authored colors once before linear blending; never infer
  physical water from the resulting pixel color.

- **Sound · high confidence — one lighting and output boundary.**
  Fit and stabilize the shared sun footprint for campaign scale. Atmosphere rays
  use one normalized direction throughout integration. UI output must preserve
  its authored display colors without grading the world twice; chart atmosphere
  can reduce optical depth without changing exploration visibility.

- **Sound · high confidence — existing campaign policy owns live presentation.**
  Ownership, fog, city/army identity, cards and commands retain their application
  owners. Ground and roads consume coherent visibility. Garrison figures are
  omitted where strategic scale embeds them in roofs; standards/cards still
  represent the army. Shared figure scale reaches every representation.

- **Sound · high confidence — display density changes resolution.**
  Keep backing-pixel projection, but normalize framing, detail policy, label
  sizing and input speed through CSS units. The same visible camera must select
  the same content and target the same raised entity on either display.

- **Sound · high confidence — completed frames are verification evidence.**
  Camera writes and CPU grass completion can precede the frame that consumes
  them. Observe submitted poses and a later completed publication, using the
  current lens for intended framing. Preserve content floors, physical seeds
  and exact-pixel contracts; fault injection must not contaminate normal shots.

- **Sound · high confidence — ownership ends with its last consumer.**
  Retire unconsumed whole-map raw owners and private helpers. Keep live raw
  model/UI tools. Release borrowed images after their consumers, settle pending
  timing reads before renderer destruction, and remove disposal attachments
  without disrupting other renderers sharing the resource.

- **Sound · high confidence — measure the actual owner without invented parity.**
  Compare identified completed submissions and current diagnostic layouts.
  Native workload measurements stand on their own, but absent comparable
  pre-change reports cannot support paired release-performance acceptance.
  Missing measurements remain missing rather than becoming zeroes.

- **Sound · high confidence — finish matching character without endless tuning.**
  The user's later direction freezes accepted art and limits work to finite
  integration coverage and clear regressions. Retain sparse foliage, simplified
  forms and tiny seam limitations honestly. This does not retroactively prove
  the original reference-quality floor.
