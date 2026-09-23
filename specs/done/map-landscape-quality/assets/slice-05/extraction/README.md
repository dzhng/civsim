# Shared terrain response extraction

Battle and campaign now consume the same geometry attributes, macro ground
modulation, slope response, rock/scree palette and final linear-color composition.
Battle retains physical tint decoding, RG8 mud/road distance fields, turf, and
playable/vista orchestration. Campaign uses one material profile across its
regional and tiled consumers. Geometry and source coverage are unchanged.

The shared response lives under `landscape/terrainMaterial`; neutral material
values live under the terrain profile. World draw ordering moved to `renderOrder`
so the shared standard/scenery layers need not import battle orchestration.
The existing water producer remains in `battle/seaLayer` until the water slice;
its already-linear color is still converted exactly once at its own boundary.

This pass retains the old rock formula. Face-oriented detail remains the next
material pass. The new fixed ramp proves that equivalent source inputs through
both consumers produce identical RGBA, rather than merely matching approximate
lighting. The campaign tiled owner now receives the same slope profile as the
regional owner; this deliberately replaces its previously absent slope response.

## Evidence

The five SwiftShader snapshots—both ramps, Alps, Italy and terrain-water—repeat
with zero differing pixels. Both ramps also match one another exactly. Water
samples match at `[76,134,151]`, preserving the linear-color contract.

The full turf and seam fixtures were additionally run on matched parent
`22588fa7` and candidate sources with identical WASM/assets. On Apple M5 Pro,
headless Chrome 153.0.8010.36 with the hardware adapter, all 24 turf behavior
checks pass in both versions and all ten turf captures have zero RGBA differences.
[Comparison data](hardware-comparison.json) records each frame. No hardware image
was used to bless a canonical baseline.

The seam captures vary by a handful of pixels even when repeating the same
candidate: 4 pixels east and 7 west. Parent/candidate differences of 3/12 pixels
are comparable to that measured hardware repeat variability. This is not a
claim of byte-stable seam captures.

Full SwiftShader turf readiness is not accepted here. Both parent and candidate
have the same 992,334 base records and hash `21a8af4b`, but GPU-bound frames let
the incremental focus ring complete only 5–6 slices in about a minute. The
unchanged 30-second readiness guard therefore times out. A later edge-only
capture also sampled the pending ring and differed from its existing baseline;
that baseline was not changed. Hardware equivalence and the small canonical
probes establish this extraction's scope; the full canonical progress contract
remains an integration verification issue.

WASM SHA-256 for both sides:
`ffd7a918715590608f2bfbbc9281c3da8d0d9e2842d76f520818940616a9de95`.

Typecheck and all 464 tests pass. Independent Codex review found no actionable
regression; its attempted test run was blocked by its sandbox's write access to
the local dependency symlink, so the normal test run supplied that evidence.
The shape review retained direct shared functions and removed the old response
bodies rather than preserving compatibility exports.

The palette validation now follows the rock palette into its shared owner;
its previous finite/normalized-color behavior remains covered. No physics,
water, geometry, turf or passability tests were re-pinned. The two material
snapshots are new probes, not replacements for existing controls.
