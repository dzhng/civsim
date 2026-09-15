# Regional measured-elevation control

Promising, not accepted or adopted. Fresh critique finds meaningful branching
and foothill gains in both regions, but dense teeth, shelves and comb-like
fringes still prevent form acceptance. [Full critique](critique.md).
No production source, masks, biome, renderer, gameplay, battle terrain or saves
were changed. The capture driver temporarily substituted the shared relief
query in the browser; this is not a proposed production fallback architecture.

## Evidence and alignment

The [Alps](alps.png) and [Italy](italy.png) candidates use the same exact camera
world/projection matrices as the accepted controls in
[the source-crest investigation](../source-crest-control/README.md). Both matrix
deltas are zero and both captures report no page or GPU validation errors.
The existing sky fix, 2km geometry, clay material, hidden vegetation, no shadows
and time zero are fixed. Newly created snapCheck shots are diagnostic evidence;
no production baseline or strict repeat is claimed.

The data is sampled by inverting the exact spherical LAEA formula used in
`crates/mapgen/src/geo.rs`: center 18°E/38°N, radius 6371km, east/north axes.
Coordinate roundtrip error is at most 2.51e-12km. Regional centers map to
12.102°E/46.777°N and 13.961°E/43.693°N. That establishes projection math, not
independent city/landmark survey validation. Existing full-resolution land/water
masks remain authoritative. The final rendered surface still owns contact and
coastal conformation. Original source-derived city aprons are bypassed by the
DEM height query; no city-apron appearance invariant is claimed by these clay
views. Any adoption must deliberately retain the existing apron owner in the
new bake, then verify city contact and placement.

Twenty-nine zoom-7 Terrarium tiles total 2,386,103 bytes. The initial 28-tile
footprint needed one extra tile for the aligned sampling halo. Ground pixel
spacing is about 0.865km at 45° latitude. Decode is
`R*256 + G + B/256 - 32768` meters. Source provenance and required credits are
in [ATTRIBUTION.md](ATTRIBUTION.md) and `tiles.json`. The archived grids are
little-endian Float32 meter values, gzip-compressed, with matching grid metadata.
The raw tiles are reproducible from the manifest rather than duplicated here.

An 8km grid loses substantial structure: on land above 100m, Alps absolute
height error is mean112/p95468/max1557m and Italy118/438/1603m against the z7
bilinear source. At 2km these are41/167/902m and52/187/683m. The sampled Alps peak
4172m becomes2638m at8km versus3919m at2km. This justified the single2km visual
pair, without an extra8km visual run. These are sampling errors relative to the
available tiles, not absolute survey accuracy. Uncompressed regional2km inputs
are550,564 and549,080 bytes.

The plain query uses `0.5 + max(0, meters)*0.01`, then the existing shore fade;
there are no procedural folds. Original biome sampling is unchanged. Outside
these padded regional grids the scratch driver uses original relief solely for
offscreen ecology queries; captured geometry lies inside the grid. Removing
that scratch boundary is required before any production adoption.

## Next bounded simplification

One control area-averages a4km square before resampling to2km nodes,
using16 fixed midpoint samples; height exaggeration stays10×. Authoritative
raster-water samples are excluded, remaining land weights normalized, and
no valid land samples produces zero. Negative raw land elevations are treated
as zero before accumulation. This prevents ocean bathymetry entering the land
average. Final wet coverage and shore fade still belong to the original owners.
No source mask is changed. Coastal appearance still requires visual review.

The corrected filter reduces p95 land gradient from227 to161m/km in Alps and
219 to159 in Italy. It reduces high-frequency residual and local peaks while
retaining most broad mass; complete metrics are in `filter-metrics.json`.
The16km-block proxy includes some coastal blocks and is not a topology test.
[Filtered Alps](alps-area.png) and [filtered Italy](italy-area.png) have exact
camera matches and no reported browser/GPU errors. [Fresh review](area-critique.md) prefers filtered Alps with moderate confidence:
longer connected ridges and clearer corridors retain meaningful branching. It
allows a qualified bounded acceptance at this framing, with rounded crests,
angular notches and steep walls remaining. Italy gets only a slight preference
with low confidence and no bounded acceptance: mostly less detail, rounded
bumps and a dense fringe rather than clearer hierarchy. Direct inspection agrees
that the filter helps Alps more than Italy. Therefore no blanket slice04
acceptance or production adoption follows. The data direction remains useful,
but the current two-region target is not satisfied.

## Smallest possible adoption seam

If the filtered view wins, use the existing `loadCampaignData` request group to
load one local, pre-baked presentation-height artifact alongside the background.
Attach one explicit sampled elevation input to the existing render source and
consume it under `campaignRelief`; the existing surface and ecological callers
must share it. Do not add a parallel renderer, runtime terrain-tile requests or
regional fallback cache. This requires an explicit loader/source type addition;
it is a proposal, not a landed schema change.

At the existing world extent, a2km Float32 grid is about18.3MB uncompressed
(roughly4.58million values), versus1.15MB at8km. A single fixed binary raster with
projection/size metadata in its build manifest is sufficient; runtime may keep
one field. A16-bit meter raster would be about9.15MB, with sub-meter quantization smaller
than the measured sampling errors; format choice is deferred until visual
acceptance. A rebuild command should pin tile versions/hashes, inverse-project,
area-filter, apply the existing city apron policy, emit the artifact and credits,
and verify finite heights, alignment and mask independence. The asset content hash
must participate in the existing surface source revision/cache key so rebuilt
height cannot reuse stale derived geometry. Existing8km biome
classification remains separate and unchanged. Full-map input size, apron effects,
query/build cost and loader error handling still need verification. No adoption
is authorized by this evidence alone.

## Reproduction boundary

The checked-in scripts are offline diagnostic utilities, not a new build system.
From the repo root, stage the scripts and manifest in `throwaway/elevation-control/`,
run `fetch.py`, then `bake.mjs` and `filter.mjs` with existing web dependencies.
Fetching verifies the pinned content hashes and never replaces the manifest.
The2km raw/area grids are also retained as compressed Float32 inputs, so review
does not require downloading source tiles. Camera/error telemetry and original
source-control baseline images are linked above. No worker/loader/cache contract
has been implemented by this pass.
