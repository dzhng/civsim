# Battle map — highland-valley reference match

Make the battle map read like the reference vista in
`assets/target-battle-map.png` **as closely as possible while staying inside the
`aesthetics` skill's Bronze-Age Aegean register.** Build the look bottom-up from
isolated visual variables — grass density, relief shape, cliff silhouette, cliff
texture, sky, distance fog, water placement, and water material — to a composed
master shot judged against the reference.

## Next Agent Prompt

**⚠️ THE RENDERER CHANGED UNDERNEATH THIS SPEC (2026-07-02) — read this block
before trusting anything below it.** The `3d-perspective-renderer` spec landed on
main: the engine now runs a **real 3D perspective camera** (`camera3d`, reverse-Z
`depth32float`, the 2.5D tilted-ortho projection is DELETED) and **battle
production renders through three.js WebGPU + TSL** (`packages/photoreal-renderer`,
`PhotorealBattleWorld` behind `BattleRenderer`'s unchanged API — the bespoke WGSL
battle passes are orphaned from production and slated for deletion). David's call
(2026-07-02): this spec RESTARTS in a parallel session with the division of labor
below — it no longer pauses for the photoreal ladder.

**Division of labor (who owns which surface — do not double-build):**
- **This spec OWNS:** terrain relief/grade + cliff silhouette/texture +
  grass/foliage LOOK + scenery composition + the composed master-shot gate (the
  photoreal ladder's slice `13` hands terrain/foliage look and the compose gate
  BACK here — recorded in that slice file).
- **The photoreal ladder OWNS (consume, never rebuild):** lighting core (`09`,
  IN FLIGHT — sun/IBL/ACES via `CIVSIM_ENVIRONMENTS`, four presets incl. the new
  `noon`), physical sky + THE ONE aerial-perspective owner (`10`), CSM shadows
  (`11`), the sea (`12`), soldier materials + crowd LOD/impostors + per-instance
  frustum culling (`14`), post chain (`15`). If a look here needs a
  sky/haze/light/sea knob, the knob goes on the owner via the ladder, never
  inline.

**Contracts every new slice here must obey (from the ladder's invariants):**
- New render work lands as **TSL layers/materials in the photoreal package** —
  NOT in `packages/game-renderer/src/battle/*` (dead for production). The grass
  render architecture re-homes to the photoreal foliage layer; the `03b1`
  grass-field DATA contract survives as the data owner; the 03B4* rejection
  ledger remains required reading (its failure modes are substrate-independent).
- Extend `CIVSIM_ENVIRONMENTS` (one owner), never fork; consume the `10b` aerial
  hook once it lands, never inline haze; TSL `time` node banned (animation via
  the owned time uniform + seeded RNG); `three` version pinned — never upgrade as
  a ride-along.
- Standing gates stay green: `perf:30k` (30k soldiers + foliage ≤ 33 ms hardware
  — dense foliage is exactly what stresses it), the `battle-terrain-elevation`
  seating tripwire, deliberate re-bless only. Invoke the `renderer` skill and
  read the TSL hazard lists in the ladder's `06`/`07`/`08` slice files before
  writing TSL.
- **Parallel-session coordination:** work in your own worktree; rebase on main
  often (the ladder lands `09`–`11` there, re-blessing battle baselines as
  lighting/sky/shadows change). Until `10`/`11` land, prefer
  geometry/data/fixture/workbench slices over final look-judgment — grass judged
  under parity lighting will be re-judged under real sun/shadows. Reserve
  `packages/photoreal-renderer/src/battle/{terrain,foliage}Layer*` for this spec
  after the ladder's `09` lands; the ladder reserves environment/sky/shadow/
  sea/crowd files.
- **Stale-slice audit (from the substrate change):** slice `01` zoom-coupled
  camera — SUPERSEDED (the real rig landed in the ladder; `zoomT` is still
  exported from `battleCameraRig`). `06`/`06b` sky/fog — now owned by ladder
  `10`. `07`/`07b` water — ladder `12`. `03b*` grass RENDER slices — re-home to
  TSL (data contract + rejection ledger survive). Camera-relative field-domain
  recon notes predate the real camera — re-derive against `camera3d` before
  reuse.

**Status (pre-substrate-change, kept for history):** Slices 00, 01, 02, and 06C landed. Slice 06C now uses
`CIVSIM_ENVIRONMENTS` as the shared weather owner: `WATER_ENVIRONMENTS` remains
the water-facing alias, battle uses `golden-hour`/`overcast-foggy` aliases, and
ground, grass, horizon, water, and skinned soldiers all consume the same sun,
key/fill, haze, and exposure fields while keeping neutral material albedos.
Route stats and scene checks prove `golden-hour` in the live battle default and
`overcast-foggy` in the reference route. Slice 03's renderer
infrastructure landed in `codex/battle-map-reference` (2026-06-30), and the
earlier repair pass added a real reference-comparison shot plus a dense `zoomT=1`
vista grass mode. The latest pass moved that comparison off the old catalog
plateau and onto a deterministic render-lab `highland-valley` relief fixture
using the same `BattleTerrainGrid`/`TerrainHeightField` seam as the production
terrain route. Slice 03 and Slice 04 are still **not visually accepted**: the
fixture is closer to the right family of scene, but the target relationship still
fails. The grass work has been split into an architecture ladder: brute-force card
density was rejected as noisy and expensive, a ground-integrated meadow carpet
needs a real field/clump data owner, and foreground geometry is a separate
accent/perf problem. Slice 03B is a recorded spike, not an accepted visual slice.
Slice 03B1 landed the grass field data contract. Slice 03B2 landed the
packed-attribute renderer-lab workbench and is verified. Slice 03B3 is **not
visually accepted**, but it now has an evidence-backed handoff. 03B3A landed the
separate field-space softened coverage channel, which reduces the hard midground
band while preserving zero-blade field ownership. 03B3B material-only volume was
rejected by crop comparison and neutral critique: the zero-blade result remains a
flat painted/combed plane. Remaining foreground volume is now explicitly owned by
03B4. Slice 03B4A landed the named accent-style workbench, but visual 03B4 is
still **not accepted**. The old `tuft` mesh is rejected as sparse yellow speckle;
first-pass `fiber-ribbon` and `hybrid-root-fiber` also speckle before adding
useful volume. 03B4B landed clump aggregation/stats, but hard root geometry is
rejected as decal/glyph stains. 03B4B2 landed a named `soft-root-mass` material
layer and explicit root-mass telemetry, but visual 03B4 is still **not
accepted**: the current crop reads as a smooth painted/combed carpet without
blade silhouettes, clumps, or height variation. 03B4C then landed
`soft-root-fiber` clump-ribbon plumbing and telemetry, but that visual is also
rejected: it remains a smooth carpet with sparse flecks. 03B4C2 then landed
`field-fiber-shell` / `field-near` telemetry and proved the near shell can be
field-owned, but the visual is still rejected: even `5200` one-strip shell
records read as a smooth green sheet with faint streaks. 03B4C3 now has a
shell-off/normal/debug-visible/width/lift/view-thickness capture harness and
explicit `fiberShellVariant` telemetry. That harness is accepted as
infrastructure, but the one-strip primitive family is visually rejected:
normal shell is effectively invisible, debug-visible reads as dark
stipple/scratches, and bounded width/lift/view-thickness variants are nearly
unchanged from normal. 03B4C4 then landed the primitive-family workbench and
rejected the mesh-only alternate families: mesh alpha stand-ins, billboard
clusters, and volume cards remain sparse marks on a painted meadow plane. The
least-wrong shot is still `field-fiber-shell`, but only because it avoids the
loudest artifacts; it still lacks clumped upright grass volume. 03B4C5 now has a
WIP texture-backed route with a real generated atlas and `field-cell`
aggregation, but it is **not visually accepted**. The 03B4C5A
density/soft-coverage pass and 03B4C5B distribution/scale pass are both recorded
as rejected evidence: they can move foreground edge energy, but the visible
structure still reads as sparse repeated flecks/stamps over exposed flat meadow,
not continuous soft grass body, and the midground remains almost unchanged from
the field-shell baseline. 03B4C5B2 proved that fewer large field-cell carrier
sheets create hard straw/wire islands, exposed ground, and abrupt depth
transition. 03B4C5B3 then proved that many smaller field-owned micro-primitives
are not enough either: `texture-micro-carrier` emits `7000` records,
`28000` micro cards, and `56000` triangles, but it is mostly invisible or pixel
grit at the reference camera. David then correctly called out that the current
full shot is too zoomed out to solve close foreground grass: the target has a
near lower foreground where grass body and some strand direction are visible,
while mid/background should collapse into meadow mass. 03B4C5B4 is now a reslice
memo, not the next implementation task. B4A is accepted as a **crop-scale
diagnosis**, not as a full transition/mid acceptance contract: the red close-hero
crop is strong and current-side crops are labeled absence probes, while orange
transition and blue mid-mass remain weak target-derived context cues. B4B1 has
now landed the `foreground-close-lab` route and evidence pack, but the
camera/review surface is **not accepted**. The lab shot is useful infrastructure
and an honest absence probe; it is not yet a fair close grass comparison
surface. `compare-screenshots` on the normalized close crop records
`edgeEnergyRatio=0.13997` versus the target, and the unprimed
`screenshot-critique` verdict was **unfair scale**: the lab still reads as flat
green ground with too little close blade/body structure, weak perspective cues,
uniform lighting, and transition/mid crops that do not yet help judge close
foreground grass. B4B1R then tried a camera/proxy-only scale repair and is also
**not accepted**. The selected `scale-repair-low` profile moved the camera closer
and added neutral calibration rods, but `compare-screenshots` still recorded
`parityDistance=0.25268` and `edgeEnergyRatio=0.13216`, and the unprimed
critique verdict was **unfair scale**: the crop still reads as smooth ground with
missing foreground blade/body mass, weak depth progression, and inconsistent crop
surfaces. Treat that as the learning: the close lab cannot be made fair by camera
and crop overlays while the grass body is visually absent. B4B1A0 has now landed
and is accepted **only as a fair-with-caveats review surface**: the labeled
close-lab target/absence/candidate sheets, fixed crop windows, and decision note
live under
`assets/03b4-evidence/03b4c5-close-foreground-lab/test-environment/`. It is not
an accepted grass-body result; `compare-screenshots` still records
`edgeEnergyRatio=0.11698`, and that body absence is exactly what B4B1A1 attacked.
B4B1A1 has now recorded and rejected the body architecture matrix under
`assets/03b4-evidence/03b4c5-close-foreground-lab/body-architecture-matrix/`:
`texture-volume` is least wrong, but still reads as hanging curtain / hay-mat
islands over exposed flat ground. B4B1A1R then tried continuity/primitive-shape
repair profiles under
`assets/03b4-evidence/03b4c5-close-foreground-lab/body-continuity-repair/`;
that pass is also **rejected**. `current` keeps the hay-mat islands,
`seated-soft` / `broken-lattice` lose too much body, and `overlap-stagger`
becomes giant starburst cards. B4B1A1S then isolated the `texture-volume`
alpha/cutout/dither render model under
`assets/03b4-evidence/03b4c5-close-foreground-lab/body-alpha-render-model/`;
that pass is also **rejected** because the variants either keep card/chunk
silhouettes or erase the close body. B4B1A1T then tried non-card
`field-fiber-body` / `field-fiber-bundle` primitives under
`assets/03b4-evidence/03b4c5-close-foreground-lab/field-fiber-body-architecture/`;
that pass is also **rejected**. The candidates remove the worst card artifacts,
but they do it by deleting the visible close body: the crop reads as sparse
regular pins on smooth green ground, with only `0.13320x`-`0.15347x` of target
edge energy and `0.09140x`-`0.10662x` of the rejected card crop's edge energy.
B4B1A1U then changed source topology to dense field-cell/subcell micro-sources
under
`assets/03b4-evidence/03b4c5-close-foreground-lab/field-fiber-source-topology/`;
that pass is also **rejected**. The implementation is useful plumbing
(`field-subcell`, source-cell counts, micro-sources-per-cell telemetry), but the
visual still reads as isolated clumps and ruler/marker posts over smooth ground.
The source variants emit `7200`-`7600` records and `1036800`-`1094400`
triangles, but retain only `0.16591x`-`0.21339x` of target edge energy. The
unprimed critique verdict was reject/another pass needed: no candidate preserves
continuous close grass body without card/marker artifacts. B4B1A1V then changed
the continuous body representation under
`assets/03b4-evidence/03b4c5-close-foreground-lab/continuous-strand-body-representation/`;
that pass is also **rejected**. `field-strand-mat` and `field-woven-mat`
replace marker posts with strand-mat structure, but the structure is still
source-attached: empty center, perimeter fan/card patches, wrong scale, and
repeated comb grouping. They record `0.58440x` and `0.40593x` target edge energy,
and their neutral critique verdict was reject/another pass needed. B4B1A1W then
tested a field-owned material domain under
`assets/03b4-evidence/03b4c5-close-foreground-lab/field-owned-strand-material-domain/`;
that pass is also **rejected**. It proves domain ownership and zero-geometry
telemetry are useful, but the visual collapses into flat painted terrain with
marker posts exposed and only `0.04921x`-`0.05199x` target edge energy. B4B1A1X
then tested field-owned shell geometry under
`assets/03b4-evidence/03b4c5-close-foreground-lab/field-owned-body-silhouette-layer/`;
that pass is also **rejected**. It proves the field-owned domain/telemetry seam
can own geometry (`1292`-`1550` domain cells, `~62k` submitted triangles,
`sourceAttached=false`), but the visual remains flat paint plus a few oversized
shell/card strokes with only `0.15848x`-`0.16780x` target edge energy. Continue
at `03b4c5b4b1a1y-field-owned-micro-strand-silhouette.md`. B4B1A1Y then tested
field-owned micro-strand geometry under
`assets/03b4-evidence/03b4c5-close-foreground-lab/field-owned-micro-strand-silhouette/`;
that pass is also **rejected**. It proves the field-owned domain can emit target-scale
micro geometry (`1450` domain cells, `52200` micro-strands, `417600` submitted
triangles, `sourceAttached=false`), but the visual remains flat paint plus isolated
yellow fleck clusters with only `0.19531x` target edge energy and near-parity
with rejected X shell (`parityDistance=0.04874`). B4B1A1Z then tested
continuous field-owned strand/nap texture under
`assets/03b4-evidence/03b4c5-close-foreground-lab/field-owned-continuous-strand-texture/`;
that pass is also **rejected**. It proves a zero-geometry field-owned texture
domain can publish explicit frequency/material telemetry, but the visual remains
flat green terrain with faint diagonal scratches: `continuous-nap-field` records
only `0.23408x` target edge energy and is near-parity with rejected Y micro
(`parityDistance=0.05460`). Continue at
`03b4c5b4b1a1aa-false-earth-close-material-replication.md`. B4B1A is now a
parent/reslice memo, not one implementation slice: B4B1A0 built the fair close
grass test environment, B4B1A1 compared body architecture candidates inside that
fixed lab, B4B1A1R proved shape-only repair is insufficient, B4B1A1S isolated
and rejected the `texture-volume` alpha/render-model problem, B4B1A1T proved
one non-card fiber primitive per existing field record still collapses into
body absence, B4B1A1U proved dense source topology still creates markers/clumps
instead of body, B4B1A1V proved per-source continuous-body representations still
create fan/card artifacts instead of body, B4B1A1W proved material-only field
domains become flat paint, B4B1A1X proved large field-domain shell geometry
becomes sparse card/stamp swipes, B4B1A1Y proved per-cell micro-strand geometry
still clusters into flecks instead of continuous body, B4B1A1Z proved
continuous field-owned strand/nap texture still reads as flat scratched paint,
B4B1A1AA must now reproduce the false-earth close material in its native
Three.js/WebGPU/TSL architecture, B4B1A1AB keeps the field-owned
lower-foreground occlusion idea as a fallback/porting slot, and B4B1A2 records
the accepted architecture's perf envelope only after a representation succeeds.
Only after those child slices should B4B2 tune
coverage, B4B3 tune strand scale, B4B4 tune clump softness, B4B5 lock close palette/atlas
integration, B4C0 prove the camera-relative backend seam, B4C1 add
camera-relative cells/rings, B4C2 add slope/normal eligibility, B4C3 add surface
tilt/tip blend, B4D1-D4 solve LOD collapse, and B4E return to grass-only
reference compose.

**Reslice correction (2026-07-01):** the previous plan was still too coarse. It
kept asking grass, terrain, cliff, fog, and water slices to compare against the
final reference image all at once, which encouraged broad "make the painting match"
passes. From here, each open slice owns one visual variable and one comparison crop.
Do not close or reject a grass-density slice because the cliffs are wrong; do not
ship a cliff-shape slice by also tuning texture, haze, water, or grass. The final
whole-frame comparison belongs only to the compose slice after each isolated visual
relationship has its own evidence. If implementation of any slice hits a snag and
starts requiring unrelated visual variables, stop the implementation pass and use
`feature-slicing` to split the slice again before editing more renderer code.

**Grass architecture correction (2026-07-01):** the reference foreground grass is
not a million uniformly scattered readable tufts. Treat it as a field system:
stable grass records first, packed-attribute slope/normal behavior second,
field-driven meadow mass third, foreground blade accents fourth, then
colour/softness/wind texture. Card count alone is not an acceptance metric. Each
03B follow-on slice now has an explicit `Approach` section; if implementation
reveals another hidden variable, stop and reslice with `feature-slicing` before
continuing renderer work.

**Atmosphere reuse correction (2026-07-01):** when this plan reaches distance
fog, do not design a new battle-only haze. Reuse the water S6/S7 horizon-fog
contract visible in `web/shots/misc/water/haze-gerstner.png` and
`web/shots/misc/water/albedo-overcast.png`: distance computes a shared
`haze01`, high-frequency detail and glint fade by `(1.0 - haze01)`, the final
lit surface colour blends toward the active environment haze colour, and the
horizon seam dissolves instead of drawing a separate fog wall. The archived
review copies live in `assets/water-fog-reference/`. Slice 06B owns threading
that same effect through far grass/meadow mass, ridges, terrain, and distant
water. This is an architectural reuse requirement: use or extract the same
environment/fog seam instead of copying new per-pass constants. Until 06B, keep
fog frozen and do not use haze to disguise grass, cliff, or water shortcomings.

**False-earth / X-post correction (2026-07-01):** David pointed at
`momentchan/false-earth` and the X post describing packed terrain-normal instance
attributes, slope filtering, and vertex-shader tilt. This does make sense and is
the same family as false-earth, but the earlier CPU-first path skipped the most
important diagnostic question: can we reproduce the false-earth close material
itself when the camera is low and near? The next spike therefore uses the source
architecture first: Three.js/WebGPU/TSL, camera-snapped grid, GPU-computed
packed 4-vec4 blade data, Voronoi clumps, Bezier blades, terrain-normal
alignment, view-dependent thickness, procedural shading, and LOD/indirect draw
where needed. That spike is an isolated lab reproduction, not production
adoption. Do not port Leva, character push/waves, flowers, post-processing, or
story content into civsim; only copy enough grass architecture to explain the
close material.

**Camera-procedural correction (2026-07-01):** the current grass route is not yet
procedurally generated from camera position like false-earth. Civsim has a
snapped-focus CPU grass sampler and camera-aware selection/fading from stable
world-space records. That is useful plumbing, but it does not create a
camera-relative near/transition/mid grass domain with explicit snapped origin,
cell/ring ids, churn/recycle telemetry, backend id, terrain-normal eligibility,
and LOD buckets around the viewer. The false-earth repo uses the fuller form:
grid snapping around the camera, GPU-computed blade placement/terrain/wind,
packed 4-vec4 blade data, distance LOD draw buffers, and terrain-normal sampling.
Civsim should borrow that architecture in stages, not port the app: prove close
foreground grass first, run a backend/perf spike that treats camera-position
procedural generation as the domain contract, add a CPU-first camera-relative
domain, prove slope/normal eligibility and surface tilt, then solve LOD collapse.
GPU-native generation is a backend behind that same record/domain seam, not a
separate grass technique. Escalate to GPU compute/indirect only when the
CPU/packed backend is visually right enough for the active gate and the perf
evidence says CPU rebuild/upload is the blocker.

**Fourth architecture reslice (2026-07-01):** answer the false-earth question
this way: **first reproduce the source close material exactly enough to learn
the architecture; then translate the winning variables into civsim.** Grass
should still become procedurally generated from camera position in world space,
but GPU-native is no longer deferred only as a perf backend: it is allowed in the
isolated false-earth reproduction because that is the source technique being
judged. The later `03B4C5B4C0` backend spike still decides production CPU/GPU
policy after the close look is known.

1. B4B1/B4B1R record that route/camera/proxy work alone is not a fair comparison
   while the foreground body is missing.
2. B4B1A0 builds the close grass test environment. It may use fixed CPU field
   records because it is a lab, not the final camera-relative domain.
3. B4B1A1 records the first close body primitive-family matrix; it rejected all
   families, with `texture-volume` least wrong but not accepted.
4. B4B1A1R records that shape-only `texture-volume` continuity repair fails.
5. B4B1A1S isolates and rejects the `texture-volume` alpha/render-model problem.
6. B4B1A1T tries a non-card field-fiber body architecture inside the fixed lab.
7. B4B1A1U changes the close-body source topology to dense field-cell/subcell
   micro-sources after B4B1A1T proves one-per-record fiber primitives are empty.
8. B4B1A1V changes the continuous body representation after B4B1A1U proves
   source density alone still creates clumps/markers instead of body.
9. B4B1A1W changes the body ownership domain after B4B1A1V proves
   source-attached strand mats still create fan/card patches instead of body.
10. B4B1A1X records that large field-owned shell silhouette becomes card/stamp
   swipes after B4B1A1W proves material-only domains become flat paint.
11. B4B1A1Y records that target-scale field-owned micro-strands still become
   isolated fleck clusters.
12. B4B1A1Z records that continuous field-owned strand/nap texture remains flat
   scratched paint.
13. B4B1A1AA reproduces the false-earth close material in its native
   Three.js/WebGPU/TSL stack using the supplied close-up reference screenshot.
14. B4B1A1AB translates, replaces, or falls back to the field-owned foreground
   occlusion idea depending on what the reproduction proves.
15. B4B1A2 records the accepted family's density/perf envelope.
16. B4B2-B4B4 tune coverage, strand scale, and clump rhythm in that fixed close
   test surface.
17. B4B5 locks close-lab palette, atlas opacity, and repeated-tile visibility
   without changing density or body shape.
18. B4C0 proves the camera-relative backend seam and perf gates without changing
   the accepted look.
19. B4C1-B4C3 implement snapped cells/rings, terrain eligibility, and tilt/tip
   behavior behind the chosen seam.
20. B4D1-B4D4 solve near/transition/mid LOD collapse in lab crops.
21. B4E returns to the reference route and judges grass crops/masks only.
22. 03B5 adopts the result only if gameplay readability and perf gates pass;
    03B6 is pulled in only as a backend swap when B4C0 or 03B5 proves CPU/upload
    cost is the blocker.

**Close-grass workflow correction (2026-07-01):** do not keep tuning the wide
`battle-map-reference` vista to discover foreground grass. That camera is too far
out: the target's bottom foreground shows a close soft grass body with some
strand direction, while the mid/background collapses into meadow mass where
individual strands disappear. The next grass work therefore happens in a fixed
close lab first:

1. B4B1 creates the route/evidence surface and attempts to lock the
   close/transition/mid review windows.
2. B4B1R attempts camera scale/perspective repair with frozen grass inputs; the
   latest evidence rejects it as still unfair because the body layer is absent.
3. B4B1A0 creates the true close grass test environment; no body technique is
   accepted here.
4. B4B1A1 compares body techniques inside that fixed test environment and
   records the first matrix; the current result is rejected.
5. B4B1A1R records that shape-only `texture-volume` continuity repair fails.
6. B4B1A1S tests whether a stricter alpha/cutout/render model can preserve
   close body without opaque card or curtain artifacts; the answer is no.
7. B4B1A1T tries a non-card field-fiber body representation.
8. B4B1A1U changes the source topology after B4B1A1T proves one-per-record
   non-card fibers are empty and marker-like; this is now rejected too because
   dense source topology still creates isolated clumps/markers.
9. B4B1A1V changes the continuous body representation itself; this is now
   rejected too because source-attached strand mats become perimeter fan/card
   patches with an empty center.
10. B4B1A1W tests a continuous field-owned body/material domain before any perf
   or coverage tuning; this is now rejected because it becomes flat paint.
11. B4B1A1X tested field-owned body silhouette/height and is rejected because
    large shell geometry becomes sparse card/stamp swipes.
12. B4B1A1Y tested field-owned micro-strand silhouette and is rejected because
    target-scale micro geometry still becomes isolated fleck clusters.
13. B4B1A1Z tested continuous field-owned strand/nap texture and rejected it as
    flat scratched paint.
14. B4B1A1AA reproduces the false-earth close material in its native
    Three.js/WebGPU/TSL stack against the supplied close-up screenshot.
15. B4B1A1AB translates, replaces, or falls back to the field-owned foreground
    occlusion test after AA records what the source architecture requires.
16. B4B1A2 records the accepted architecture's perf budget and high-water mark.
17. B4B2-B4B4 tune the chosen close body, strand scale, and clump rhythm.
18. B4B5 locks the close-lab grass palette/atlas integration so colour is not
   hidden inside density, camera, or fog work.
19. B4C0 proves the camera-relative backend seam and perf envelope; it must not be
   used as a shortcut to solve grass art.
16. B4C then makes that accepted grass camera-relative; it must not be used as a
    shortcut to solve grass art.
17. B4D makes visible close strands collapse into mid/background meadow mass.
18. B4E is the first return to the full reference route, and it judges grass masks
    only.

**B4C/B4D ordering decision (2026-07-01):** keep B4C before B4D for now because
the near/transition/mid/far collapse bands should ride the accepted
camera-relative domain seam. B4D is still a lab-crop visual gate, not a return to
the wide reference scene. If B4B5 proves the fixed lab can solve the collapse
cleanly without camera-relative records, stop and reslice before moving B4D ahead
of B4C.

**Distance-fog reuse correction (2026-07-01):** the latest water work already
solved the right family of aerial perspective. The water shots under
`web/shots/misc/water/` show the desired distant dissolve, especially
`haze-gerstner.png` and `albedo-overcast.png`; archived copies live in
`assets/water-fog-reference/`. The reusable idea is architectural, not
water-only: clear the far sky toward the active environment preset's haze colour,
compute a distance/projection `haze01`, fade glint/high-frequency detail as
`haze01` rises, then mix the final surface toward `WATER_HAZE` so far geometry
dissolves into the sky instead of leaving a hard horizon. Slice 06B must reuse
that same contract for the battlemap's far ridges, far grass/meadow mass, and
distant water: `packages/game-renderer/src/environment/environment.ts` owns the
shared `hazeColor`, `waterEnvironmentWgsl` exposes it as `WATER_HAZE`, and
`packages/game-renderer/src/water/waterMaterialWgsl.ts` demonstrates the final
`mix(surface, WATER_HAZE, haze01)` plus detail fade. The overcast battlemap fog
starts from `CIVSIM_ENVIRONMENTS.overcast.hazeColor`, with
`WATER_ENVIRONMENTS.overcast` only as the water-facing alias; do not invent a
private battlemap fog palette. Do not use fog to hide unfinished grass, cliff
shape, or water placement; grass-lab slices must keep fog frozen until the
dedicated 06B pass.

**Slice 03B2 approach/state (2026-07-01):** the current packed-field workbench
uses the 03B1 records directly instead of another scatter path. `BattleGrassPass`
now has a `packed-field` prep mode with a 4-vec4 instance layout: pose/terrain
blend, blade width-height-bend-wind, orientation/seeds/shade, and terrain
normal/slope mask. The WGSL consumes the terrain normal in the vertex shader:
bases sit on the local tangent plane, growth blends from terrain normal toward
world-up at the tip, and steep slopes collapse through a mask. The proof surface
is `/renderer/battle-grass-field?mode=packed-tilt` plus the `battle-grass-field`
scene and `web/shots/battle/grass/field-packed-tilt.png`. This workbench is a
hostile slope/attribute fixture, not a reference-art fixture: it proves packing,
stats, frame-graph placement, and slope rejection before 03B3 starts the meadow
material.

**Slice 03B3 approach/state (2026-07-01):** the recorded field-meadow path
connects the 03B1 field records to `BattleGroundPass.setMeadowFromGrassField(...)`.
The pass builds an
`rgba8unorm` meadow texture where R is raw field density/mass, G is softened
coverage/falloff, B carries clump/material weight, and A carries clump phase. The
ground shader samples that texture through explicit meadow uniforms and publishes
`ground.stats().meadow` telemetry (`source`, texture size/cell, field records,
raw and soft coverage, average density/coverage, directional coverage, texture
bytes). The focused proof route is
`/renderer/battle-grass-field?mode=field-meadow`; the reference fixture now defaults
to `grassTechnique=field-accent`, while `grassTechnique=field-meadow` remains the
zero-blade material proof. For this meadow-material slice, `BattleGrassPass`
allows `bladesPerTuft=0` only on the packed-field snapshot path, so the field can
own meadow mass while `bladeInstances` and grass draw calls stay zero. Do not
re-enable foreground blades to make the 03B3 crop look denser; that is 03B4.

**Slice 03B3 visual learning (2026-07-01):** the field texture path is the
right owner for broad meadow mass, but the visible pass is still wrong. The
recorded path added a strict zero-blade field-meadow route, an RGBA field texture,
meadow telemetry, a reference-only `fieldFloor`, damped directional ridges, and a
screen-scale material thatch term. The focused scenes now pass, but
`compare-screenshots` still reports weak foreground edge structure
(`edgeEnergyRatio` about `0.208` for the foreground crop, `0.490` for midground),
and a neutral critique said the candidate was **not ready**: it read as a smooth
painted/combed terrain layer with a hard horizontal density band, not continuous
meadow volume. 03B3A reduced the band; 03B3B then proved the remaining flatness is
not solved well by material-only shader terms. Treat that as the handoff to 03B4,
not as acceptance.

**Slice 03B3 approach ledger (2026-07-01):** preserve the field-owned architecture,
but stop broad shader knob-twiddling. 03B3 now has an accepted base-coverage
approach and a rejected material-volume approach.

- Keep: 03B1 field records, the 03B2 packed-field route, `BattleGroundPass`'s
  field meadow texture, explicit meadow telemetry, and `grassBlades=0` while
  judging the material.
- Rejected as primary solutions: card-count density, terrain-only procedural
  grass colour, a localized foreground oval, high `fieldFloor` alone, wider field
  records alone, long directional ridge/streak detail, and screen-space speckle
  that turns into combing or rows.
- Accepted in 03B3A: separate **coverage ownership** from **visual material**.
  The raw field channel proves ownership while a softened coverage channel drives
  lower-third/midground falloff and reduces the hard band without adding blades.
- Rejected in 03B3B: broad tonal volume from clump-local root pockets, lifted
  centers, non-directional mottle, and restrained short thatch still reads as a
  painted/combed plane. That evidence hands apparent volume to 03B4 geometry.
- Future 03B work should only reopen these decisions if a new approach changes
  the data contract; otherwise continue in 03B4.

**Slice 03B3A/03B3B outcome (2026-07-01):** 03B3A landed the softened coverage
channel. In the reference fixture, raw field coverage stays sparse
(`fieldCoverage ~= 0.076`) while soft coverage rises to about `0.170`; `fieldFloor`
was reduced to `0.07`, and the hard bright horizontal band is visibly reduced.
Crop metrics improved from the prior zero-blade result (foreground parity distance
about `0.396`, foreground edge ratio about `0.400`, midground edge ratio about
`0.625`; artifacts in `/private/tmp/civsim-03b3-current/out/`). 03B3B is rejected
as a material-only solution: Dalton's neutral critique says the zero-blade crop
has continuous coverage but reads as a flat painted/combed plane, not soft meadow
volume. Treat 03B3 as a field-owned base coverage layer and move foreground
volume into 03B4 geometry.

**Slice 03B4 WIP/learning (2026-07-01):** the reference fixture now supports
`grassTechnique=field-accent`, and `/renderer/battle-grass-field?mode=field-accent`
is the isolated proof route. `BattleGrassPass.setGrassFieldSnapshot(...)` can
select a bounded near-depth subset of the 03B1 field records when blades are
enabled, keeping `ground.stats().meadow.source === 'field'` as the mass owner.
Slice 03B4A added `accentStyle` plumbing and route stats for `tuft`,
`root-shadow`, `fiber-ribbon`, and `hybrid-root-fiber`; the default WIP is now
`root-shadow`, which submits about `41600` reference-route triangles, roughly half
the rejected old tuft path. This is useful infrastructure, **not visual
acceptance**. Target-vs-candidate crop comparison still reports weak grass edge
structure: foreground `edgeEnergyRatio ~= 0.44`, midground `~= 0.60`. The neutral
review says the candidate is still too smooth and sparse, with almost no
fuzzy/clumped volume, weak density falloff, and tiny speckles that read as noise
or flowers rather than grass.

**Slice 03B4 reslice (2026-07-01):** the first primitive matrix is recorded under
`assets/03b4-evidence/`. Continue with smaller contracts:

- `03b4a-accent-candidate-workbench.md` — landed candidate plumbing and recorded
  the first rejected primitive matrix.
- `03b4b-clump-root-shadow-volume.md` — clump aggregation/stats landed; hard
  root-mark visuals rejected.
- `03b4b2-soft-root-mass-impostor.md` — soft root material/stats landed; visual
  rejected as smooth painted/combed carpet.
- `03b4c-near-fiber-ribbon-silhouette.md` — clump-emitted `soft-root-fiber`
  plumbing and ribbon stats landed; visual rejected as sparse flecks over smooth
  carpet.
- `03b4c2-near-field-fiber-shell.md` — field-shell telemetry landed; visual
  rejected as smooth sheet with faint streaks despite 5200 shell records.
- `03b4c3-fiber-visibility-and-shading.md` — shell harness/telemetry landed;
  one-strip primitive rejected after material, width, lift, and view-thickness
  tests.
- `03b4c4-near-grass-volume-primitive-workbench.md` — primitive-family workbench
  landed; mesh-only alternate families rejected as sparse marks/stamps.
- `03b4c5-texture-backed-grass-volume.md` — parked parent/ledger; real atlas telemetry and
  field-cell aggregation landed; atlas/distribution and density/soft-coverage
  passes are recorded, but the crop still reads as sparse repeated flecks/stamps
  over exposed smooth meadow.
- `03b4c5a-density-and-soft-coverage-record.md` — density and soft shader
  coverage pass landed/rejected; useful data, not an accepted visual.
- `03b4c5b-card-cell-distribution-and-scale.md` — verified/rejected; placement,
  layering, orientation, footprint, and primitive scale still read as sparse
  flecks.
- `03b4c5b2-continuous-coverage-carrier-spike.md` — verified/rejected; large
  carrier sheets read as hard straw/wire islands.
- `03b4c5b3-micro-blade-density-carrier-spike.md` — verified/rejected; many
  smaller field-owned carrier primitives are mostly invisible or pixel grit at
  the reference camera.
- `03b4c5b4-minimum-visible-grass-body-carrier.md` — reslice memo; do not
  implement as one wide-reference-camera body-carrier pass.
- `03b4c5b4a-foreground-grass-scale-and-crop-contract.md` — accepted as
  crop-scale diagnosis; red close crop is the strong target, orange/blue are
  context only.
- `03b4c5b4b-close-foreground-grass-hero-lab.md` — parent memo only; resliced
  into B4B1, B4B1R, B4B1A, and B4B2-B4B5.
- `03b4c5b4b1-close-foreground-grass-lab-route.md` — route/evidence landed, but
  review scale rejected by neutral critique; keep as reproducible absence
  evidence.
- `03b4c5b4b1r-close-lab-scale-and-perspective-repair.md` — camera/proxy repair
  attempted and rejected; the crop still cannot be fairly compared without a real
  foreground body layer.
- `03b4c5b4b1a-close-body-technique-spike.md` — parent/reslice memo only;
  do not implement as one combined test-env/technique/perf pass.
- `03b4c5b4b1a0-close-grass-test-environment.md` — accepted as a labeled,
  fair-with-caveats close-lab review surface; not an accepted body visual.
- `03b4c5b4b1a1-close-body-architecture-matrix.md` — recorded/rejected;
  `texture-volume` least wrong but curtain/island artifacts disqualify it.
- `03b4c5b4b1a1r-texture-volume-continuity-repair.md` — recorded/rejected;
  shape-only repair keeps islands, erases body, or creates starburst cards.
- `03b4c5b4b1a1s-texture-volume-alpha-render-model.md` — recorded/rejected;
  alpha/cutout/dither semantics still leave cards or erase body.
- `03b4c5b4b1a1t-field-fiber-body-architecture.md` — recorded/rejected;
  non-card per-record fibers remove cards by deleting visible body.
- `03b4c5b4b1a1u-field-fiber-source-topology.md` — recorded/rejected;
  dense field-cell/subcell sources still read as markers/clumps.
- `03b4c5b4b1a1v-continuous-strand-body-representation.md` — recorded/rejected;
  source-attached strand mats add fan/card patches, not body.
- `03b4c5b4b1a1w-field-owned-strand-material-domain.md` — recorded/rejected;
  material-only field domains are continuous but read as flat paint.
- `03b4c5b4b1a1x-field-owned-body-silhouette-layer.md` — recorded/rejected;
  field-owned shell geometry becomes oversized card/stamp swipes.
- `03b4c5b4b1a1y-field-owned-micro-strand-silhouette.md` — recorded/rejected;
  target-scale field-owned micro-strands become isolated fleck clusters.
- `03b4c5b4b1a1z-field-owned-continuous-strand-texture.md` — recorded/rejected;
  continuous field-owned strand/nap texture reads as flat scratched paint.
- `03b4c5b4b1a1aa-false-earth-close-material-replication.md` — next pickup;
  reproduce the false-earth close material in a standalone Three.js/WebGPU/TSL
  lab before more civsim-native approximation.
- `03b4c5b4b1a1ab-field-owned-foreground-occlusion-blade-layer.md` — deferred
  fallback/porting slot; only implement after the false-earth reproduction says
  this is still the right next variable.
- `03b4c5b4b1a2-close-body-perf-envelope.md` — future density/perf envelope for
  the selected body architecture before tuning coverage.
- `03b4c5b4b2-close-body-coverage.md` — future dense soft body / exposed-ground
  pass.
- `03b4c5b4b3-close-strand-scale.md` — future close strand size and direction
  pass.
- `03b4c5b4b4-clump-softness-height-variation.md` — future clump envelope and
  height rhythm pass.
- `03b4c5b4b5-close-palette-and-atlas-lock.md` — future close-lab colour/atlas
  lock after density, strand scale, and clump rhythm are accepted.
- `03b4c5b4c-camera-relative-procedural-field-generation.md` — parent memo only;
  resliced into B4C0-B4C3.
- `03b4c5b4c0-camera-relative-backend-spike.md` — future backend/perf spike;
  camera-position procedural is the domain, CPU is the first backend, and
  GPU-native is only an optional backend behind the same seam.
- `03b4c5b4c1-camera-relative-field-domain.md` — future CPU-first snapped
  cells/rings, origin stability, and churn telemetry.
- `03b4c5b4c2-terrain-normal-slope-eligibility.md` — future terrain-normal
  attributes and slope/water/tint rejection.
- `03b4c5b4c3-surface-tilt-tip-blend.md` — future base seating and tip-upward
  recovery.
- `03b4c5b4d-depth-lod-mass-collapse.md` — parent memo only; resliced into
  B4D1-B4D4.
- `03b4c5b4d1-lod-band-contract.md` — future near/transition/mid/far ownership
  bands and telemetry.
- `03b4c5b4d2-near-to-transition-collapse.md` — future readable-strand to soft-body
  transition pass.
- `03b4c5b4d3-mid-mass-continuity.md` — future continuous meadow mass pass.
- `03b4c5b4d4-depth-falloff-sequence.md` — future close/transition/mid sequence
  pass.
- `03b4c5b4e-grass-only-reference-crop-compose.md` — future grass-only return to
  `battle-map-reference`.
- `03b4c5c-atlas-tile-content-and-color-integration.md` — future pass only after
  B4A, B4B1/B4B1R evidence, B4B1A0-B4B1A2, B4B2-B4B5, B4C0-B4C3, B4D1-B4D4, and
  B4E prove close body, close palette, camera-relative generation, LOD, and
  reference grass crops.
- `03b4c5d-midground-continuity-and-depth-falloff.md` — future pass only inside
  the accepted camera-relative LOD architecture.
- `03b4d-depth-lod-compose.md` — compose near/mid/far ownership before 03B5.

**Slice 03B4B result/reslice memo (2026-07-01):** the data architecture moved in
the right direction, but the visual did not. `BattleGrassPass.setGrassFieldSnapshot`
now supports `accentAggregation='clump'`, `accentMaxClumps`,
`accentClumpFootprint`, and stats for `accentSourceRecords`, `accentClumps`, and
submitted `accentTufts`. The reference route currently reports `7000` field
records, `157` clump groups, `452` submitted root-shadow instances, and about
`25312` submitted triangles; the old rejected tuft path was about `83200`
triangles. This proves clump-bounded ownership and should stay. However the hard
geometry primitive is still wrong. Wide diamond marks, broad oval marks, and a
short root-fiber mat all read as separated olive stains/glyphs on a smooth plane.
`compare-screenshots` on `assets/03b4-evidence/03b4b-root-fiber-mat/` reports
foreground `edgeEnergyRatio=0.287` and midground `0.448`; a neutral crop review
says Image B has flat decal blobs, sparse/uniform density, smooth painted-plane
areas, and glyph/stipple artifacts. 03B4B2 kept the clump reducer and moved root
mass into an explicit material layer; that removed hard glyphs but still failed
the density target.

**Slice 03B4B2 result/reslice memo (2026-07-01):** `GrassAccentStyle` now includes
`soft-root-mass`, and `BattleGroundPass.setMeadowFromGrassField(...)` owns a
stats-visible root material channel (`rootMassStrength`, `rootMassContrast`,
`rootMassSpread`, `rootMassEnabled`, `rootMassCoverage`, `rootMassAvg`). The
reference route currently reports `7000` field records, `157` clump groups,
`452` submitted soft-root accents, `18080` submitted accent triangles,
`rootMassCoverage=0.061`, and `rootMassAvg=0.055`. This proves a cheaper
soft-root architecture and removes the hard decal/glyph marks, but the visual is
still rejected. Compare artifacts under
`assets/03b4-evidence/03b4b2-soft-root-mass/` report foreground
`edgeEnergyRatio=0.433` and midground `0.760`; the neutral critique says Image B
is a smooth painted carpet with no blade silhouettes, clumps, or height
variation, and the texture streaks make the ground plane feel stretched. 03B4C
kept meadow/root/camera/fog/terrain fixed and added `soft-root-fiber`
clump-ribbon geometry from the clump emitters, but that also failed: the
reference route reports `7000` field records, `157` clumps, `452` accents,
`2260` accent ribbons, `64` mesh triangles, `28928` submitted accent triangles,
and `rootMassStrength=1.24`, yet foreground edge ratio stays about `0.435` and
midground about `0.761`. The learning is that 157 clump emitters are too sparse at
the reference camera; adding more geometry per clump becomes flecks/stipple before
it becomes dense grass. The neutral review called the candidate a flat green
surface with occasional yellow/brown scratches or speckles, inconsistent fiber
scale, radial/streaming ground streaks, and collapsed scan readability; the target
has the stronger grass-density read even though its grass is blurred/soft. Resume
at
`slices/03b4c2-near-field-fiber-shell.md`: keep meadow/root/camera/fog/terrain
fixed and test a separate near-field fiber ownership layer fed by field records,
with strict near-depth, ribbon, selected-record, and triangle telemetry.

**Slice 03B4C2 result/reslice memo (2026-07-01):** `GrassAccentStyle` now
includes `field-fiber-shell`, `GrassAccentAggregation` includes `field-near`, and
`BattleGrassStats` reports field-shell source records, selected records, ribbons,
depth band, selected ratio, and submitted triangles. The workbench and reference
route now prove the default accent path is field-owned rather than clump-owned.
The current reference route reports `7000` field records, `5200` shell records,
`5200` shell ribbons, `fiberShellSelectedRatio=0.743`, `meshTriangles=8`, and
`submittedTriangles=41600`. This is useful architecture but still visually
rejected. Compare artifacts under
`assets/03b4-evidence/03b4c2-field-fiber-shell/` report foreground
`edgeEnergyRatio=0.301` and midground `0.476`; neutral critique says the
candidate is missing near-field grass silhouette, has uniform density falloff,
scratch/streak artifacts, artificial ground-plane perspective, low edge detail,
weak terrain readability, too-even lighting, tiny stipple noise, and scale
mismatch. The next missing variable was primitive visibility/material shading, not
more field-shell count; 03B4C3 then proved the one-strip primitive still fails.

**Slice 03B4C4 result/reslice memo (2026-07-01):** the primitive-family workbench
landed and is useful evidence, but it did not find an accepted mesh-only path.
The reference scene now captures `field-fiber-shell`, `alpha-impostor`,
`billboard-cluster`, and `volume-card` from the same camera and crop. The three
new families use the clump reducer (`157` clumps, `452` submitted accents) and
stay below the old rejected all-card tuft cost (`25312..28928` triangles versus
`83200`), but they still read as sparse marks over a painted meadow. The
`alpha-impostor` route is only a mesh-stroke stand-in, not a real alpha texture
yet, and texture telemetry correctly reports zero bytes. Compare artifacts under
`assets/03b4-evidence/03b4c4-near-grass-volume-primitive-workbench/` show
foreground edge ratios of about `0.302` for the shell baseline, `0.338` for the
mesh alpha stand-in, `0.322` for billboard clusters, and `0.321` for volume
cards; midground stays around `0.475..0.490` for all families. Neutral review
says `field-fiber-shell` is least wrong only because it has the smoothest falloff
and avoids loud card artifacts; it still reads as flat brushed terrain with weak
clumping and almost no upright blade silhouette. Resume at
`slices/03b4c5-texture-backed-grass-volume.md`.

**Slice 03B4C5 WIP/approach memo (2026-07-01):** the texture-backed route now
exists, publishes real atlas telemetry, and is green in the primitive-family
harness, but it is still a rejected visual. `texture-volume` keeps the same
field records, camera, crop windows, softened meadow, and root material. The
first attempt reused clump aggregation and failed as large sparse texture stamps.
The route then switched to `field-cell` aggregation, proving denser field-owned
texture ownership under the old rejected card cost. A follow-up atlas and
distribution pass muted/shortened generated strokes, darkened rooted bases,
clamped tile strokes, added deterministic sub-cell jitter, widened yaw jitter,
and narrowed cards. The 03B4C5A density/soft-coverage pass then layered up to two
records per selected field cell, capped the texture card mesh at 20 triangles,
used lower-alpha meadow-coloured shader coverage, and raised current stats to
`accentClumps=1900`, `accentTufts=2064`, `bladeInstances=8256`,
`submittedTriangles=41280`, and `textureBytes=65536`. This moved target-crop
foreground `edgeEnergyRatio` to `0.73170`, but midground stayed weak at
`0.48966`; against the field-fiber-shell baseline, foreground edge energy became
`2.42334x` while midground was only `1.02795x`. Neutral review still rejected
the result: the candidate is too sparse, reads as repeated stamps/cards/flecks
with wrong scale, lacks fuzzy continuous grass volume, leaves too much flat
ground plane exposed, and has poor depth falloff.

**Slice 03B4C5B verified result (2026-07-01):** the placement/scale-only pass is
also **visually rejected**. It kept atlas content, shader coverage, meadow/root
material, camera, terrain, fog, and the 1900-cell budget fixed while changing
field-cell placement: `aggregateFieldCellAccentRecords(...)` distributes selected
cells across view-depth/lateral buckets instead of taking only the highest-scored
patch islands; field-cell yaw mixes camera-facing and source-record yaw; cells
with at least two source records can emit two layers; texture records use more
off-center jitter plus adjusted footprint/width/height/copy offset; and the
texture card mesh remains 20 triangles per record with more local yaw variation.
The current browser evidence reports `accentClumps=1900`, `accentTufts=2064`,
`bladeInstances=8256`, `submittedTriangles=41280`, and `textureBytes=65536`.
Against target crops, foreground `edgeEnergyRatio=0.55962` and midground
`0.48684`; against the field-shell baseline, foreground edge energy is
`1.85248x` while midground is only `1.02238x`. The full shot and crops still read
as sparse clumps/flecks over a smooth painted meadow. The unprimed visual critique
agreed: sparse clustering breaks continuity, individual primitives are too
legible, depth falloff is abrupt, ground-plane exposure dominates, rows/arcs are
visible, integration is weak, and the midground adds almost no vegetation read.
Treat 03B4C5B as evidence that placement/scale alone is not enough; do not move
to 03B4C5C as if distribution were accepted.

**Slice 03B4C5B2 verified result (2026-07-01):** the continuous carrier spike is
browser-verified and **visually rejected**. It added `texture-carrier` as a
separate primitive family, extended the primitive-family capture, and added a
`battle-grass-field` route contract. The reference route reports `2400`
field-cell carrier records, `9600` blade instances, `16` mesh triangles per
record, `38400` submitted triangles, `65536` texture bytes, and a `35..460`
depth band versus texture-volume's `35..360`. This proves a cheaper same-atlas
carrier path under the old rejected card budget, but the visible result fails
the slice target. Against target crops, foreground edge energy overshoots to
`2.80502x` with `parityDistance=0.61239` and
`avgLuminanceDelta=-27.67254`; midground remains under target at `0.71075x`
edge energy with `parityDistance=0.57717` and `avgLuminanceDelta=-46.24101`.
Against the field-shell baseline, foreground edge energy jumps `9.22257x` while
midground reaches only `1.47418x`; the movement is hard stick/card structure, not
soft grass body. The unprimed critique rejected it with high confidence: patchy
coverage islands, exposed ground plane, stick/wire primitives, too-large
foreground scale, weak terrain integration, collapsed midground vegetation, and
an abrupt depth transition. Keep the telemetry route and evidence, but reject
large overlapping field-cell sheets as the coverage carrier.

**Slice 03B4C5B3 verified result (2026-07-01):** the micro-blade density carrier
spike is browser-verified and **visually rejected**. It added
`texture-micro-carrier` as a separate same-atlas primitive family and published
micro-card telemetry. The reference route reports `4600` selected field cells,
`7000` emitted micro carrier records, `28000` micro cards, `8` mesh triangles per
record, `56000` submitted triangles, `448000` instance bytes, `65536` texture
bytes, and the same `35..460` depth band as B2. This proves a fixed-density,
fine-carrier path below the old all-card warning line, but the visible result
fails the slice target. Against target crops, foreground edge energy is only
`0.27844x` with `parityDistance=0.47629` and
`avgLuminanceDelta=-21.85549`; midground is `0.37539x` with
`parityDistance=0.64696` and `avgLuminanceDelta=-45.88860`. Against the
field-shell baseline, the micro path barely moves the image
(`parityDistance=0.02108` foreground, `0.05422` midground). Direct inspection and
unprimed critique agree: the full shot still reads as flat green terrain with
scattered dark/brown specks, weak midground vegetation, abrupt depth falloff, and
pixel-grit primitives rather than grass body. Density/count is not the missing
variable.

**Slice 03B4C5B4 reslice (2026-07-01):** the old fixed-density body-carrier pass
is now parked as too coarse. The current reference shot is not a valid close
foreground grass discovery surface because it is too zoomed out relative to the
target's lower foreground. B4A produced a labeled absence-probe crop board and is
accepted as crop-scale diagnosis only: red close-hero is the strong handoff crop;
orange transition and blue mid-mass are weak target-derived context cues, not
acceptance gates. B4B1 must create clean lab-owned transition and mid-mass
review windows before later LOD slices rely on those variables. B4B1R attempted
that failed scale/perspective gate with neutral calibration proxies and is now
recorded as rejected: the missing variable is foreground body, not more camera
overlay tuning. Split the remaining work into B4B1 lab route/review windows, B4B1R
rejected scale/perspective repair evidence, B4B1A0 close grass test environment,
B4B1A1 body-architecture matrix, B4B1A1R rejected texture-volume continuity
repair, B4B1A1S rejected texture-volume alpha render model, B4B1A1T non-card
field-fiber body architecture, B4B1A1U field-fiber source topology, B4B1A1V
continuous strand body representation, B4B1A1W field-owned body/material domain,
B4B1A1X field-owned body silhouette layer, B4B1A1Y field-owned micro-strand
B4B1A1Z field-owned continuous strand texture, B4B1A2 body perf envelope,
B4B2 close body coverage, B4B3 close strand scale, B4B4
clump softness/height rhythm, B4C0
backend/perf spike, B4C1
camera-relative cells/rings, B4C2 terrain-normal eligibility, B4C3
surface-tilt/tip blend, B4D1 band contract, B4D2 transition collapse, B4D3
mid-mass continuity, B4D4 depth sequence, and B4E grass-only reference compose.
Do not move to atlas colour, midground polish, fog, camera, terrain, water,
cliffs, or sky until that ladder proves close foreground grass and depth collapse
on their own evidence.

**Slice 03B4C5B4B1 WIP/rejection memo (2026-07-01):** the focused route now
exists at `/renderer/battle-grass-field?mode=foreground-close-lab`, with matching
`battle-grass-field` and `renderer-lab-routes` coverage. Evidence is archived in
`assets/03b4-evidence/03b4c5-close-foreground-lab/lab-route/`: full shot,
crop board, target/lab close crops, 2x/4x crops, transition/mid crops, rejected
family contact sheet, comparison artifacts, and `route-stats.json`. The default
lab uses the same field-owned meadow/root material and packed-field plumbing as
the existing grass route (`camera={x:0,y:-36,zoom:104,pitch:0.78,yaw:-0.08}`,
`1554` accepted field records, `1343` field-fiber-shell tufts, `10744` submitted
triangles). That is good infrastructure, but it fails the slice acceptance. The
target close crop is `760x180`; the lab close crop is `815x182` and was
center-cropped only for metric comparability. The normalized comparison reports
`parityDistance=0.25805`, `edgeEnergyRatio=0.13997`, and much weaker edge detail
in the lab. The unprimed critique verdict was **unfair scale**, citing flat
green ground, missing close blade/body depth, weak ground-plane perspective,
uniform low-contrast lighting, smear/blur, artifact-like isolated strokes, and
transition/mid crops that do not yet support judging close grass quality. Treat
B4B1 as a route/evidence landing and failed scale attempt. The B4B1R repair,
B4B1A0 test environment, B4B1A1 body matrix, and B4B1A1R continuity repair have
now been attempted; B4B1A0 is accepted as the fixed review surface, B4B1A1
rejected every current family, and B4B1A1R rejected shape-only texture-volume
repair. B4B1A1S has now rejected texture-volume alpha/cutout/dither render
semantics. B4B1A1T has since rejected non-card per-record field-fiber body
primitives, B4B1A1U rejected dense field-cell/subcell source topology, and
B4B1A1V rejected per-source continuous strand mats, and B4B1A1W rejected
material-only field domains as flat paint, and B4B1A1X rejected field-owned
shell geometry as oversized card/stamp swipes, B4B1A1Y rejected field-owned
micro-strand geometry as isolated fleck clusters, and B4B1A1Z rejected
continuous field-owned strand/nap texture as flat scratched paint. Resume at
B4B1A1AA for a standalone false-earth close material replication before perf,
coverage, palette, LOD, production camera-relative generation, or full-vista
comparison.

**Slice 03B4C5B4B1R rejection memo (2026-07-01):** the scale-repair route added
named camera profiles and selected `scale-repair-low`
(`camera={x:0,y:-47,zoom:155,pitch:0.92,yaw:-0.06,perspective:0.030}`) with
neutral calibration guides and evidence under
`assets/03b4-evidence/03b4c5-close-foreground-lab/scale-repair/`. The inputs were
kept frozen: same field records, seed, meadow/root base, and
`field-fiber-shell` primitive family. The repair improved the review surface as
infrastructure but failed visual acceptance. The selected close crop still does
not match the target body read (`parityDistance=0.25268`,
`edgeEnergyRatio=0.13216`), and the unprimed critique verdict was **unfair
scale**: the crop is smooth green ground with faint smears/scratches, weak
close/transition/mid progression, inconsistent crop dimensions, and no dense
vertical grass body. Do not spend another pass on camera/crop/proxy calibration
alone. B4B1A0 has since built the fair close foreground grass test environment;
B4B1A1 through B4B1A1W have since rejected the first body technique, render
model, source topology, source-attached strand-mat, and material-only field
domain passes. Resume at
`slices/03b4c5b4b1a1x-field-owned-body-silhouette-layer.md` before full vista or
camera-relative domain work is touched.

Slice 00 now has a real side-by-side workbench:
`visualizations/target-vs-current.html` points at the committed
`web/shots/battle/terrain-3d/coastal-scrub.png` baseline instead of a placeholder,
and records the two-preset decision path: neutral albedos, `overcast-foggy` as
`highland-valley`'s default, and `golden-hour` for Aegean parity.

Slice 01 now wires the production battle camera through a pure
`web/src/battle/cameraRig.ts` curve. Zoom drives pitch, target offset, perspective,
and exported `zoomT`; the shared `Camera` projection now matches the existing
`cameraUniform.ts` perspective math so WebGPU rendering, picking, and DOM overlays
agree. The focused `battle-camera-zoom` scene publishes top/mid/vista camera stats,
keeps visible formations in every stop, and snaps the contact sheet at
`web/shots/battle/battle-camera-zoom.png`. The final vista endpoint is deliberately
more oblique than the old fixed camera (`pitch=1.02`, `perspective=0.006`), while
the mid zoom remains in the playable RTS pitch band.

Final verification:

- `node --experimental-strip-types --test tests/cameraRig.test.ts`
- `./node_modules/.bin/tsc --noEmit`
- `npm run build`
- `VERIFY_URL=http://localhost:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-camera-zoom battle-renderer-visual battle-input`

Local verification notes: the default SwiftShader WebGPU path reported
`requestAdapter returned no WebGPU adapter`; the hardware Chrome path passed.
`npm run build:wasm` could not regenerate `web/src/wasm` because this machine's
Homebrew Rust install lacks `wasm32-unknown-unknown`, so verification used an
ignored wasm build copied from the sibling checkout.

Slice 02 now owns the reusable grass primitive and a flat-field workbench. The pure
mesh builder lives in `packages/game-renderer/src/models/shared/grassModels.ts`;
`BattleGrassPass` lives in `packages/game-renderer/src/battle/grassPass.ts` and
draws instanced tuft meshes as `world-opaque` depth-writing geometry with a
fixed-phase wind uniform. The model-sheet gate is
`web/scenes/models/shared-grass-models.mjs`, producing
`web/shots/models/shared/grass/tuft.png` and `patch.png`. The battle workbench is
`web/scenes/battle/battle-grass.mjs`, producing
`web/shots/battle/grass/flat-field.png` and `wind-phase.png`; it also compares the
two fixed phases to prove the shader sway moves pixels deterministically. The
review-only wind GIF is
`web/shots/models/shared/grass/anim/flat-field.gif`.

Final Slice 02 verification:

- `node --experimental-strip-types --import ./tests/register-ts-extension-loader.mjs --test tests/cameraRig.test.ts tests/grassModels.test.ts`
- `npx tsc --noEmit`
- `npm run build`
- `VERIFY_URL=http://127.0.0.1:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs shared-grass-models battle-grass`
- `VERIFY_URL=http://127.0.0.1:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs renderer-lab-routes`
- `VERIFY_URL=http://127.0.0.1:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-camera-zoom battle-renderer-visual battle-input`
- `VERIFY_URL=http://127.0.0.1:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node shots/models/scripts/grass-wind.mjs`

Screenshot critique accepted Slice 02 with no blockers. Non-blocking polish debt:
the tuft model-sheet ground slab clips hard on the left/bottom and leaves black
void; close/model-sheet scale has square ground mottling and thin blade aliasing;
the flat-field workbench is visibly a test slab in blue void. The grass itself
reads as dry yellow-olive Aegean scrub at game camera, and the patch/GIF are useful
review artifacts.

Slice 03 now wires grass onto the real battle maps. `BattleGrassPass` gained a
terrain-aware `setTerrain(...)` path that samples `BattleTerrainGrid` +
`TerrainHeightField`, rejects water/rock/wall/mud tints, seats every tuft through
`terrainHeightAt`, and reports mask/LOD stats (`eligibleCells`,
`blockedTintCells`, `invalidTintTufts`, `focusRadius`, `zoomT`). Production
`web/src/battle/renderer.ts` now creates the grass pass in `applyTerrain()`,
rebuilds it by quantized camera focus + `zoomT`, drives wind from the frozen/live
frame time, and draws `battle-grass` as `world-opaque` before
`battle-skinned-crowd`. The terrain route
`/renderer/battle-terrain-3d?gate=<map>` now includes grass on all three catalog
maps, and the gate asserts masked grass, world-depth ordering, blocked-tint
clearing, and a soldier seating sanity view.

The terrain grass deliberately remains sparse at playable map zoom so formations
and selection glow stay readable. The green grass palette is now anchored to the
Slice 00 neutral albedo chips (`#c0c178` near grass, `#99a05c` shadow/mid hummock),
and the terrain pass has a nonlinear dense vista mode keyed to the highest `zoomT`
range. Updated terrain baselines are
`web/shots/battle/terrain-3d/{river-and-crags,walled-plain,coastal-scrub}.png`.
The map-scale wind review artifact is
`web/shots/models/shared/grass/anim/terrain-field.gif`, generated by the same
`grass-wind.mjs` script that still writes `flat-field.gif`.

The reference-facing artifact now exists. `web/scenes/battle/battle-map-reference.mjs`
captures the current zoomed-in reference camera and writes
`web/shots/battle/map-reference/candidate-vista.png`,
`reference-comparison.png`, and `grass-crops.png`. It now requests
`/renderer/battle-terrain-3d?gate=highland-valley&view=reference`, a deterministic
render-lab highland fixture with cliff/water edge roles, `heightSpan` in the
Slice 04 readable band, terrain-masked dense grass, a reference-only overcast sky,
and fixture-only distant valley/ridge/water backdrop. The shot is intentionally a
diagnostic comparison against the target, not an acceptance baseline for the final
playable map.

**Current reference visual state — not accepted:** the candidate is much denser
than the old sparse-stubble shot and no longer hides behind unrelated
`terrain-3d/*` snapshots. The old flat catalog-map plateau blocker is reduced, but
the current candidate still reads as a close procedural field, not the reference's
misty valley panorama. The latest cleaned whole-frame metrics are retained as
diagnostic evidence only: full-frame distance `0.46663`; foreground/midground
world-crop distance `0.58006`; candidate world-crop edge energy is `3.25764x` the
target. Under the new slice plan, those whole-frame numbers do **not** accept or
reject any individual slice; each slice records its own crop/mask metric.

The grass-density spike adds one more finding: the lower third should not be
matched by pushing the instanced grass layer toward card-only density. That path
fills pixels but produces sparkly stipple and high geometry cost. The current
experimental hybrid route is cheaper and closer architecturally, but still not
accepted because the meadow carpet is too procedural and the accent geometry is
too readable as separate sharp tufts.

Slice 03B1 landed the pure field contract in
`packages/game-renderer/src/battle/grassField.ts`, plus shared
`terrainNormalAt(...)` beside the existing height sampler. The field emits stable
4-vec4 packed records (`position/type`, `width/height/bend/wind`,
`yaw/clumpSeed/bladeSeed/clumpWeight`, `terrainNormal/reserved`) and explicit
budget counters: snap cell, field cell, record capacity, accepted records,
capped records, tint/slope/density rejects, and LOD counts. It is intentionally
not wired into the renderer yet, so the current `BattleGrassPass` defaults and
reference spike visuals remain unchanged until Slice 03B2 consumes the data.

Slice 03B2 consumes those records through `BattleGrassPass.setGrassFieldSnapshot`
and the new `battle-grass-field` route. The route intentionally uses a synthetic
rolling field with a hostile steep ramp so the slope filter has a visible place
to fail. The accepted contract is telemetry and scoped visual behavior: packed
stride is 16 floats, field record stride is 16 floats, instance bytes equal record
count times the packed stride, records draw as one world-depth opaque pass, and
slope rejects are nonzero. The neutral critique confirms no discrete blade
geometry appears on the steep ramp. It also calls out workbench artifacts that
belong to later slices or fixture polish: the ramp has strong stripe-like ground
shading, the ramp boundary is too hard/straight, some clumps look weakly seated,
and some blades lean too far. Do not treat those artifacts as 03B2 blockers
unless they break the packed slope/normal contract; carry them into 03B3/03B4 as
meadow material and blade silhouette evidence.

Neutral subagent review on the current reference/candidate pair says the images do
not show the same viewport/state/content. The candidate now preserves only the
rough subject relationship: grassy mountain-and-water vista. It is still a lower,
flatter, low-poly/game-rendered blockout with pyramidal mountains, broad flat grass
plane, hard-edged water/shore, flatter lighting, noisier grass, and much weaker
terrain structure, atmospheric perspective, and depth layering. Do not close the
slice until the neutral reviewer says the camera/content relationship is
comparable.

Repair path for the next pass:

- Keep iterating from the `highland-valley` fixture path; it is the current honest
  comparison surface until Slice 08 turns the composition into a real playable map.
- Continue at **Slice 03B4C5B4B1A1AA false-earth close material replication**.
  03B3A
  already accepted the softened field-coverage layer, 03B3B records why
  material-only meadow volume is insufficient, 03B4B records why hard root
  geometry fails, 03B4B2 records why soft material root mass alone still reads
  flat, 03B4C records why clump-emitted `soft-root-fiber` ribbons are too sparse
  at this camera, 03B4C2 records why field-owned shell counts alone are
  insufficient, and 03B4C3 records why one-strip shell primitive visibility still
  fails. 03B4C4 records why mesh-only alternate families still become sparse
  marks before they become grass. 03B4C5 now proves a real texture-backed route,
  and 03B4C5A records that increasing data density plus softer shader coverage
  improves foreground edge energy but still produces sparse repeated stamps over
  flat exposed meadow. 03B4C5B then records that placement/scale-only tuning still
  reads as isolated flecks and barely moves the midground. 03B4C5B2 then records
  that fewer large overlapping carrier sheets move foreground edge energy but read
  as hard straw/wire islands with exposed gaps. 03B4C5B3 then records that
  shrinking/increasing carriers to `7000` records / `28000` micro cards barely
  moves the field-shell crop and reads as specks/grit. The next issue is now
  close grass body inside B4B1A0's accepted fair-with-caveats lab: B4B1A1 body
  architecture matrix has now failed with `texture-volume` least wrong but still
  visibly curtain/island-bound. B4B1A1R then proved shallow
  continuity/primitive-shape repair is also insufficient: variants either keep
  hay-mat islands, lose close body, or become giant starburst cards. B4B1A1S then
  proved alpha/cutout/dither render semantics still leave card-like sheets or
  erase body. B4B1A1T then left texture-volume cards behind and tested non-card
  field-fiber primitive families, but rejected them because they remove body and
  become sparse marker-post pins. B4B1A1U then tested dense field-cell/subcell
  source topology and rejected it because the crop still reads as isolated
  clumps/markers. B4B1A1V then tested continuous strand-mat body representations
  and rejected them because source-attached geometry still creates empty centers
  and perimeter fan/card patches. B4B1A1W then tested a continuous field-owned
  material domain and rejected it because it becomes flat paint with marker posts
  exposed. B4B1A1X then tested field-owned shell geometry and rejected it because
  the crop gains oversized card/stamp swipes over flat paint rather than
  continuous body. B4B1A1Y then tested target-scale field-owned micro-strand
  geometry and rejected it because the crop gains isolated yellow fleck clusters
  over flat paint rather than continuous body. B4B1A1Z then tested continuous
  field-owned strand/nap texture and rejected it because the crop remains flat
  green terrain with faint diagonal scratches. B4B1A1AA now reproduces the
  false-earth close material in a standalone Three.js/WebGPU/TSL lab using the
  source architecture and supplied close-up screenshot. B4B1A1AB is the deferred
  field-owned occlusion fallback/porting slot; do not implement it until AA says
  that is still the right next variable. After AA/AB accepts a plausible body,
  B4B1A2 records the local perf envelope, then B4B2 coverage, B4B3 strand scale,
  B4B4 clump rhythm, and B4B5 close palette/atlas lock. Only after an accepted
  domain/body silhouette should B4C0 define the camera-relative backend seam,
  B4C1-B4C3 add procedural cells/rings and terrain response, and B4D1-D4 prove
  near/transition/mid LOD collapse in lab crops before B4E returns to the
  reference route. Keep meadow mass, root material, atlas content, shader
  coverage, density budget, carrier ownership, camera-relative domain, and
  foreground silhouette as separate review variables. Do not compensate for the
  current zoomed-out shot by changing grass constants in the full vista.
- Use **Slice 03B5 readability/perf** before adopting the architecture broadly.
  Implement **Slice 03B6 GPU compute/indirect** only if B4C0 or 03B5 proves the
  accepted CPU/packed field path is too expensive.
- Then continue through the isolated open slices: grass color/texture, valley
  relief silhouette, cliff silhouette, cliff texture, sky plate, distance fog,
  water placement, water material, and only then final composition.
- Use `compare-screenshots` on the slice crop/mask and its neutral subagent review
  before accepting each visual variable. The subagent prompt must say which variable
  it is allowed to judge and which visible wrongness belongs to later slices.

Previous broad Slice 03 repair verification:

- `node --experimental-strip-types --import ./tests/register-ts-extension-loader.mjs --test tests/cameraRig.test.ts tests/grassModels.test.ts`
- `npx tsc --noEmit`
- `npm run build`
- `VERIFY_URL=http://127.0.0.1:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-map-reference battle-grass shared-grass-models battle-terrain-3d battle-terrain-features battle-terrain-elevation battle-renderer-visual battle-input full-game-rendering-performance`

Latest focused verification for the overcast fixture/backdrop pass:

- `node --experimental-strip-types --import ./web/tests/register-ts-extension-loader.mjs --test web/tests/cameraRig.test.ts web/tests/grassModels.test.ts`
- `npx tsc --noEmit`
- `npm run build`
- `UPDATE_SHOTS=1 VERIFY_URL=http://localhost:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-map-reference battle-grass battle-terrain-3d battle-terrain-blockers battle-terrain-elevation`
- `VERIFY_URL=http://localhost:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-map-reference battle-grass battle-terrain-3d battle-terrain-blockers battle-terrain-elevation`

Latest Slice 03B1 verification:

- `node --experimental-strip-types --import ./web/tests/register-ts-extension-loader.mjs --test web/tests/grassField.test.ts`
- `./node_modules/.bin/tsc --noEmit`

Latest Slice 03B2 verification:

- `node --experimental-strip-types --import ./web/tests/register-ts-extension-loader.mjs --test web/tests/grassField.test.ts`
- `./node_modules/.bin/tsc --noEmit`
- `npm run build`
- `VERIFY_URL=http://127.0.0.1:5177 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-grass-field`
- `VERIFY_URL=http://127.0.0.1:5177 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs renderer-lab-routes`
- `VERIFY_URL=http://127.0.0.1:5177 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-grass battle-terrain-3d battle-terrain-elevation full-game-rendering-performance`

Screenshot critique initially blocked on terrain grass reading as random black
speckle in open fields. After the terrain-only stubble softening, the follow-up
critique cleared the blocker: grass reads as sparse terrain stubble, does not bury
trees/props, and the close soldier sanity shot keeps units and blue team/selection
pixels legible. That critique clearance applies only to the Slice 03 infrastructure
shots, not to reference-match acceptance. Non-blocking note for the infrastructure
shots: `coastal-scrub` still has the most visible isolated flecks on yellow-green
ground, but they are subdued enough for the gameplay-stubble layer.

Slice 01 screenshot critique completed on the final camera contact sheet. It did
not find a Slice 01 blocker after the endpoint retune: the remaining
camera-specific complaint is that dense formations can still feel somewhat flat
inside their blocks. Record the rest as downstream visual debt, not camera wiring
debt:

- contact-sheet seams and the current map boundary read as review artifacts;
- units near trees have ambiguous tree/crowd depth ordering;
- unit contact shadows are weak relative to tree shadows;
- dense formations produce moire/barcode striping at the vista;
- small selection/marker pixels are low contrast;
- the current brown terrain feature is a blurry decal-like patch;
- grass/ground detail is soft and scale-blurry;
- roads, water, labels, and icon styling are not covered by this camera sheet.

**Next pickup:** implement
`slices/03b4c5b4b1a1x-field-owned-body-silhouette-layer.md`. Preserve the
03B4C3 shell harness, 03B4C4 primitive-family workbench, 03B4C5A
density/soft-coverage record, 03B4C5B placement/scale rejection, 03B4C5B2
carrier-sheet rejection, 03B4C5B3 micro-density rejection, B4A target crop
contract, B4B1 lab-route evidence, B4B1R scale-repair rejection, B4B1A0
test-environment acceptance, and B4B1A1 through B4B1A1W body-technique
rejections as evidence surfaces, not as visuals to keep polishing. B4A's
artifacts live under
`assets/03b4-evidence/03b4c5-close-foreground-lab/target-crop-contract/`; B4B1's
failed lab evidence lives under
`assets/03b4-evidence/03b4c5-close-foreground-lab/lab-route/`; B4B1R's failed
scale-repair evidence lives under
`assets/03b4-evidence/03b4c5-close-foreground-lab/scale-repair/`; B4B1A0's
accepted fair-with-caveats lab lives under
`assets/03b4-evidence/03b4c5-close-foreground-lab/test-environment/`; B4B1A1V's
latest rejected strand-mat evidence lives under
`assets/03b4-evidence/03b4c5-close-foreground-lab/continuous-strand-body-representation/`;
B4B1A1W's rejected material-domain evidence lives under
`assets/03b4-evidence/03b4c5-close-foreground-lab/field-owned-strand-material-domain/`.
B4B1A1X's rejected field-domain shell evidence lives under
`assets/03b4-evidence/03b4c5-close-foreground-lab/field-owned-body-silhouette-layer/`.
Use the red close-hero crop and labeled B4B1A0 sheets as the strong
target/review surface, but do not compare the final wide `battle-map-reference`
vista while repairing close body architecture. B4B1A1V proved that changing the
mesh representation per source is still the wrong owner: `field-strand-mat` and
`field-woven-mat` add structure, but as empty-center, perimeter fan/card patches
over smooth ground. B4B1A1W proved a continuous material domain can fill coverage
but still reads as flat painted ground with marker posts exposed. B4B1A1X proved
that large field-owned shell geometry adds real triangles but becomes sparse
oversized card/stamp swipes rather than continuous body. B4B1A1Y proved that
target-scale field-owned micro-strand geometry remains clustered and source-like
instead of continuous body. B4B1A1Z proved that continuous field-owned
strand/nap texture removes cell clumps but still reads as flat scratched paint.
B4B1A1AA must therefore step back and reproduce the false-earth close material
itself in its native Three.js/WebGPU/TSL stack before another civsim-native
approximation. Keep civsim's battle route, camera, palette, fog, terrain, atlas,
source context, and crop windows frozen. B4B1A1AB is the deferred field-owned
occlusion fallback/porting slot. B4B1A2 records the accepted body's density/perf
envelope only after AA/AB or a later slice accepts a visually plausible body.
Then continue with B4B2 body coverage, B4B3 strand scale, B4B4 clump
softness, B4B5 close palette/atlas lock, B4C0 backend/perf spike, B4C1
camera-relative domain, B4C2 slope/normal eligibility, B4C3 surface tilt/tip
blend, B4D1-D4 LOD collapse, and B4E grass-only reference compose. Do not move
to 03B4C5C reference-route atlas polish until that ladder proves close body,
camera-relative generation, LOD collapse, and reference grass crops.

Every visual slice (01–08) ends with three distinct gates:
`screenshot-regression` for baseline stability, `compare-screenshots` against the
owning target crop/mask for that slice's visual variable, and an unprimed
`screenshot-critique` or neutral subagent review that is told which variable is in
scope. A green snapshot proves _unchanged_, never _good_.

`compare-screenshots` is the reference-facing gate. It must establish the target
from first principles, confirm the candidate/reference captures are comparable for
the slice's variable, generate side-by-side/crop/heatmap/edge artifacts as needed,
and ask the skill's neutral subagent reviewer to inspect the images without
implementation history. If the reviewer calls out a wrongness outside the slice
scope, record it as later-slice debt, not as a reason to keep mutating the current
slice. If the current variable cannot yet be fairly compared, record that as "both
wrong / another pass needed" rather than accepting on snapshot stability.

**Update this section before you end your pass** — move the status, record what
landed, point at the next pickup slice, and include the implementation approach,
rejected approaches, and visual learnings that a future goal pass would otherwise
have to rediscover.

### Global TODO

- [x] **Slice 00** — reference workbench + palette target lock (`slices/00-reference-workbench.md`)
- [x] **Slice 01** — zoom-coupled camera (`slices/01-zoom-coupled-camera.md`)
- [x] **Slice 02** — grass-blade primitive (`slices/02-grass-blade-primitive.md`)
- [x] **Slice 03A** — grass over terrain infrastructure (`slices/03-grass-over-terrain.md`) — seating/masking/perf landed
- [x] **Slice 03B** — foreground grass density architecture spike (`slices/03b-foreground-grass-density.md`) — evidence recorded, visual target not accepted
- [x] **Slice 03B1** — grass field baseline and data contract (`slices/03b1-field-baseline-and-data-contract.md`)
- [x] **Slice 03B2** — packed-attribute slope tilt spike (`slices/03b2-packed-attribute-slope-tilt.md`)
- [x] **Slice 03B3A** — field meadow coverage and transition floor (`slices/03b3a-field-meadow-coverage-floor.md`) — softened coverage channel landed; visual base still not final
- [x] **Slice 03B3B** — material-only meadow volume proxy / handoff decision (`slices/03b3b-material-volume-proxy.md`) — material-only volume rejected; handed to 03B4 geometry
- [x] **Slice 03B4A** — accent candidate workbench (`slices/03b4a-accent-candidate-workbench.md`) — named primitive plumbing landed; visual candidates rejected/recorded
- [x] **Slice 03B4B** — clump root-shadow aggregation (`slices/03b4b-clump-root-shadow-volume.md`) — clump stats landed; visible root marks rejected
- [x] **Slice 03B4B2** — soft root-mass impostor (`slices/03b4b2-soft-root-mass-impostor.md`) — soft material/stats landed; visual rejected as smooth painted/combed carpet
- [x] **Slice 03B4C** — near fiber ribbon silhouette (`slices/03b4c-near-fiber-ribbon-silhouette.md`) — `soft-root-fiber` telemetry landed; visual rejected as sparse flecks over smooth carpet
- [x] **Slice 03B4C2** — near field fiber shell (`slices/03b4c2-near-field-fiber-shell.md`) — field-shell telemetry landed; visual rejected as smooth sheet with faint streaks
- [x] **Slice 03B4C3** — fiber visibility and shading (`slices/03b4c3-fiber-visibility-and-shading.md`) — harness/telemetry landed; one-strip primitive rejected after material and bounded-primitive tests
- [x] **Slice 03B4C4** — near grass volume primitive workbench (`slices/03b4c4-near-grass-volume-primitive-workbench.md`) — workbench/telemetry landed; mesh-only families rejected as sparse marks
- [x] **Slice 03B4C5** — texture-backed grass volume (`slices/03b4c5-texture-backed-grass-volume.md`) — parked parent/ledger; texture route/telemetry exists, visual remains rejected, and follow-up work is resliced below
- [x] **Slice 03B4C5A** — density and soft coverage record (`slices/03b4c5a-density-and-soft-coverage-record.md`) — landed/rejected; higher foreground edge energy still reads as sparse stamps/flecks
- [x] **Slice 03B4C5B** — card/cell distribution and primitive scale (`slices/03b4c5b-card-cell-distribution-and-scale.md`) — verified/rejected; placement/scale alone still reads as sparse flecks
- [x] **Slice 03B4C5B2** — continuous coverage carrier spike (`slices/03b4c5b2-continuous-coverage-carrier-spike.md`) — landed/rejected; large carrier sheets read as hard straw/wire islands
- [x] **Slice 03B4C5B3** — micro-blade density carrier spike (`slices/03b4c5b3-micro-blade-density-carrier-spike.md`) — landed/rejected; many micro carriers read as invisible specks/pixel grit
- [x] **Slice 03B4C5B4** — minimum visible grass-body carrier (`slices/03b4c5b4-minimum-visible-grass-body-carrier.md`) — resliced into finer child slices; no renderer pass
- [x] **Slice 03B4C5B4A** — foreground grass scale and crop contract (`slices/03b4c5b4a-foreground-grass-scale-and-crop-contract.md`) — accepted as crop-scale diagnosis; red close crop is strong, orange/blue context only
- [x] **Slice 03B4C5B4B** — close foreground grass hero lab parent (`slices/03b4c5b4b-close-foreground-grass-hero-lab.md`) — resliced into B4B1, B4B1R, B4B1A, and B4B2-B4B5; no renderer pass
- [x] **Slice 03B4C5B4B1** — close foreground grass lab route (`slices/03b4c5b4b1-close-foreground-grass-lab-route.md`) — route/evidence landed; camera scale rejected
- [x] **Slice 03B4C5B4B1R** — close lab scale and perspective repair (`slices/03b4c5b4b1r-close-lab-scale-and-perspective-repair.md`) — attempted/rejected; camera/proxy-only repair cannot make the crop fair while body is missing
- [x] **Slice 03B4C5B4B1A** — close body technique spike parent (`slices/03b4c5b4b1a-close-body-technique-spike.md`) — resliced into B4B1A0-B4B1A2; no renderer pass
- [x] **Slice 03B4C5B4B1A0** — close grass test environment (`slices/03b4c5b4b1a0-close-grass-test-environment.md`) — accepted fair-with-caveats as labeled fixed close lab; body still absent
- [x] **Slice 03B4C5B4B1A1** — close body architecture matrix (`slices/03b4c5b4b1a1-close-body-architecture-matrix.md`) — matrix recorded/rejected; `texture-volume` least wrong but curtain/island artifact disqualifies it
- [x] **Slice 03B4C5B4B1A1R** — texture-volume continuity repair (`slices/03b4c5b4b1a1r-texture-volume-continuity-repair.md`) — landed/rejected; shape-only repairs keep islands, lose body, or become starburst cards
- [x] **Slice 03B4C5B4B1A1S** — texture-volume alpha render model (`slices/03b4c5b4b1a1s-texture-volume-alpha-render-model.md`) — rejected; alpha/cutout/dither still leaves card artifacts or erases body
- [x] **Slice 03B4C5B4B1A1T** — field-fiber body architecture (`slices/03b4c5b4b1a1t-field-fiber-body-architecture.md`) — landed/rejected; non-card per-record fibers remove cards by deleting body and read as sparse marker pins
- [x] **Slice 03B4C5B4B1A1U** — field-fiber source topology (`slices/03b4c5b4b1a1u-field-fiber-source-topology.md`) — landed/rejected; dense field-cell/subcell sources still read as isolated clumps/markers
- [x] **Slice 03B4C5B4B1A1V** — continuous strand body representation (`slices/03b4c5b4b1a1v-continuous-strand-body-representation.md`) — landed/rejected; source-attached strand mats add perimeter fan/card patches, not continuous body
- [x] **Slice 03B4C5B4B1A1W** — field-owned strand material domain (`slices/03b4c5b4b1a1w-field-owned-strand-material-domain.md`) — landed/rejected; material-only field domain is continuous but flat paint with marker posts
- [x] **Slice 03B4C5B4B1A1X** — field-owned body silhouette layer (`slices/03b4c5b4b1a1x-field-owned-body-silhouette-layer.md`) — landed/rejected; field-owned shell geometry creates oversized card/stamp swipes over flat paint
- [x] **Slice 03B4C5B4B1A1Y** — field-owned micro-strand silhouette (`slices/03b4c5b4b1a1y-field-owned-micro-strand-silhouette.md`) — landed/rejected; target-scale field-owned micro-strands become isolated fleck clusters
- [x] **Slice 03B4C5B4B1A1Z** — field-owned continuous strand texture (`slices/03b4c5b4b1a1z-field-owned-continuous-strand-texture.md`) — landed/rejected; continuous field-owned strand/nap texture reads as flat scratched paint
- [ ] **Slice 03B4C5B4B1A1AA** — false-earth close material replication (`slices/03b4c5b4b1a1aa-false-earth-close-material-replication.md`) — next pickup; use a standalone Three.js/WebGPU/TSL spike to reproduce the supplied false-earth close-up grass material before more civsim-native approximation
- [ ] **Slice 03B4C5B4B1A1AB** — field-owned foreground occlusion blade layer (`slices/03b4c5b4b1a1ab-field-owned-foreground-occlusion-blade-layer.md`) — deferred fallback/porting slot after AA decides what the source architecture requires
- [ ] **Slice 03B4C5B4B1A2** — close body perf envelope (`slices/03b4c5b4b1a2-close-body-perf-envelope.md`) — record density/perf budget only after AA/AB or a later ownership/silhouette slice accepts a body representation
- [ ] **Slice 03B4C5B4B2** — close body coverage (`slices/03b4c5b4b2-close-body-coverage.md`)
- [ ] **Slice 03B4C5B4B3** — close strand scale (`slices/03b4c5b4b3-close-strand-scale.md`)
- [ ] **Slice 03B4C5B4B4** — clump softness and height variation (`slices/03b4c5b4b4-clump-softness-height-variation.md`)
- [ ] **Slice 03B4C5B4B5** — close palette and atlas lock (`slices/03b4c5b4b5-close-palette-and-atlas-lock.md`)
- [x] **Slice 03B4C5B4C** — camera-relative procedural field generation parent (`slices/03b4c5b4c-camera-relative-procedural-field-generation.md`) — resliced into B4C0-B4C3; no renderer pass
- [ ] **Slice 03B4C5B4C0** — camera-relative backend spike (`slices/03b4c5b4c0-camera-relative-backend-spike.md`)
- [ ] **Slice 03B4C5B4C1** — camera-relative field domain (`slices/03b4c5b4c1-camera-relative-field-domain.md`)
- [ ] **Slice 03B4C5B4C2** — terrain normal and slope eligibility (`slices/03b4c5b4c2-terrain-normal-slope-eligibility.md`)
- [ ] **Slice 03B4C5B4C3** — surface tilt and tip blend (`slices/03b4c5b4c3-surface-tilt-tip-blend.md`)
- [x] **Slice 03B4C5B4D** — depth LOD mass collapse parent (`slices/03b4c5b4d-depth-lod-mass-collapse.md`) — resliced into B4D1-B4D4; no renderer pass
- [ ] **Slice 03B4C5B4D1** — LOD band contract (`slices/03b4c5b4d1-lod-band-contract.md`)
- [ ] **Slice 03B4C5B4D2** — near-to-transition collapse (`slices/03b4c5b4d2-near-to-transition-collapse.md`)
- [ ] **Slice 03B4C5B4D3** — mid-mass continuity (`slices/03b4c5b4d3-mid-mass-continuity.md`)
- [ ] **Slice 03B4C5B4D4** — depth falloff sequence (`slices/03b4c5b4d4-depth-falloff-sequence.md`)
- [ ] **Slice 03B4C5B4E** — grass-only reference crop compose (`slices/03b4c5b4e-grass-only-reference-crop-compose.md`)
- [ ] **Slice 03B4C5C** — atlas tile content and color integration (`slices/03b4c5c-atlas-tile-content-and-color-integration.md`)
- [ ] **Slice 03B4C5D** — midground continuity and depth falloff (`slices/03b4c5d-midground-continuity-and-depth-falloff.md`)
- [ ] **Slice 03B4D** — depth LOD compose (`slices/03b4d-depth-lod-compose.md`)
- [ ] **Slice 03B5** — readability and perf gate (`slices/03b5-readability-and-perf-gate.md`)
- [ ] **Slice 03B6** — optional GPU compute and indirect escalation (`slices/03b6-gpu-compute-and-indirect.md`)
- [ ] **Slice 03C** — grass color, softness, and wind texture (`slices/03c-grass-color-texture.md`)
- [ ] **Slice 04A** — valley relief and foreground hummock silhouette (`slices/04-terrain-relief-grade.md`)
- [ ] **Slice 04B** — ground grade and terrain texture (`slices/04b-ground-grade-texture.md`)
- [ ] **Slice 05A** — cliff/ridge silhouette and depth rows (`slices/05-ridge-backdrop.md`)
- [ ] **Slice 05B** — cliff face texture and pale streaks (`slices/05b-cliff-texture.md`)
- [ ] **Slice 06A** — overcast sky plate (`slices/06-sky-and-haze.md`)
- [ ] **Slice 06B** — distance fog / aerial perspective via the water haze contract (`slices/06b-distance-fog.md`)
- [x] **Slice 06C** — swappable weather presets (`slices/06c-weather-presets.md`) — shared `CIVSIM_ENVIRONMENTS` owner with water and battle aliases
- [ ] **Slice 07A** — distant water placement and silhouette (`slices/07-distant-water.md`)
- [ ] **Slice 07B** — water material, shore softness, and haze integration (`slices/07b-water-material.md`)
- [ ] **Slice 08** — reference-map compose + integration (`slices/08-reference-map-compose.md`)

## Goal & the central tension

The reference is a **cool, foggy Icelandic/Hebridean highland valley**: a dense,
waving, _cool meadow-green_ grass field filling the lower third; smooth rolling
green hummocks in the midground; tall layered grey rock ridge-walls with pale
light/snow streaks receding into heavy white-grey haze; a cold water inlet on the
right mid-distance; a flat overcast pale grey-white sky. High-key, very low
contrast, strong aerial perspective.

At first glance this **collides** with the `aesthetics` skill — the warm golden-hour
Mediterranean north star (gold-to-blue sky, warm key, sun-bleached olive grass). But
the conflict is not real once you separate **material** from **light**:

**The cold reference and the warm aesthetics shots are the same world under two
different lighting/weather conditions, not two art styles.** (This is now written
into `aesthetics` itself — see `references/battle-overcast-highland.png` and the
"Lighting & weather is an environment" section.) So the reconciliation is:

- **Materials are neutral albedo.** Grass, rock, sand, water carry a base color tuned
  for neutral daylight; nobody bakes golden-hour amber _or_ overcast grey into a
  material. (Measured proof: the aesthetics grass samples warm-dark `#858255` only
  because a low amber sun is on it — see Slice 00's compare board.)
- **The mood is a swappable environment preset** — sun color/elevation + sky gradient
  - fill + fog density. The reference look is the **overcast-foggy preset**; the
    classic Aegean look is the **golden-hour preset**. Same map, same assets, both
    in-register.
- **Composition/form still comes from the reference:** volumetric foreground grass,
  deep valley relief, layered receding ridge-walls, distant water, one continuous
  aerial-haze fade from blade to sky.

So "match the screenshot but still follow aesthetics" = **build the reference's
composition out of neutral assets, and light it with an overcast preset** that
`aesthetics` now explicitly blesses — while the _same_ map under the golden-hour
preset reads as a sun-drenched Aegean field. Judge **albedo** against neutral light
and **mood** against the matching preset's reference (overcast-highland for this map;
the golden-hour `battle-*.jpg` for parity).

## Camera decision (David, 2026-06-30) — DECIDED

The battle camera's **pitch is coupled to zoom**: fully zoomed out is a top-down
tactical view; zooming in tilts the camera to look further out over the horizon;
fully zoomed in lands on the **reference's low oblique vista framing**. There is **no
separate static "vista camera"** — the reference comparison shot is the map captured
at full zoom-in. This is built in **Slice 01** and supersedes the original plan's
"don't change the gameplay camera" stance. The normalized zoom factor (`zoomT`) it
exports is the shared lever the grass (Slice 03) and haze (Slice 06) use to get lush

- misty at the vista and clear at top-down.

## Grilling (resolve before/at Slice 00)

Ask one at a time; recommended answer in brackets.

1. **Lighting presets — how many, and which is `highland-valley`'s default?**
   The palette "conflict" is resolved by environment lighting (see central tension):
   neutral albedos lit by a swappable preset. _[Recommend: ship **two** presets in
   Slice 06 — `overcast-foggy` (this map's default, matches the reference) and
   `golden-hour` (parity with the aesthetics `battle-_.jpg`); lock the neutral
   albedos in Slice 00 against the compare board, judged under neutral light.]\*
   **Blocking** — the albedo/preset split everything downstream inherits.
2. **New map, or restyle the existing three catalog maps?** _[Recommend: add one
   new catalog map `highland-valley` that composes the look, and let the reusable
   primitives (grass, ridge backdrop, sky) lift all maps. Don't break the three
   existing maps' identities.]_
3. **Grass: true blade geometry or camera-facing billboards?** _[Recommend: decide
   empirically in the Slice 02 workbench under a GPU-instance budget; lean
   instanced blade quads with vertex-shader wind.]_
4. **Deep valley relief — sim height, or render-only exaggeration?** _[Recommend:
   render-only — keep one height source (`terrainHeightAt`); raise only
   `verticalScale`/profile so soldiers, props, shadows, and cues stay seated; sim
   passability untouched.]_
5. **Legibility across the zoom-coupled camera.** Dense grass + heavy haze fight unit
   readability, and the camera now spans top-down → vista (see Camera decision).
   _[Recommend: grass density/height and fog depth key off `zoomT` — full at the
   zoom-in vista, suppressed toward top-down; at the **playable mid zoom** where
   units are actually micro-managed, units, the gold selection footprint, and
   trampled ground must stay legible. The vista is to admire, the mid zoom is to
   fight.]_
6. **Perf ceiling for added grass across the zoom range?** _[Recommend: hold the
   existing `full-game-rendering-performance` budget; grass gets a fixed instance
   cap + distance LOD, probed in Slices 02/03.]_

## Recon — measured facts (greppable seams)

WebGPU/WGSL renderer; every visual surface is a pass-per-file under
`packages/game-renderer/src/battle/`, wired in `web/src/battle/renderer.ts`, driven
by sim terrain read from wasm in `web/src/battle/scene.ts`.

- **Battle assembly seam:** `web/src/battle/renderer.ts` instantiates passes
  (`BattleGroundPass`, `BattleHorizonPass`, `CampaignSceneryPass` reused for
  battle) and `applyTerrain()` builds the height field + features + scenery and
  pushes to each pass. New passes (grass, sky) wire in here and into the ordered
  draw list with the correct render-graph role/phase/depth.
- **Ground:** `packages/game-renderer/src/battle/groundPass.ts` — `BattleGroundPass`:
  a height-displaced grid mesh, per-cover base color `GROUND_COVER_COLOR`, a
  fragment shader that fakes blades with multi-scale `fbm` noise + churn. **There
  is no grass geometry today — "grass" is a procedural color field.** This is the
  primitive Slice 02 builds. A warm grade (`warmKey`/`coolFill`) is baked in today —
  **Slice 06 moves it into the swappable environment preset** so it stops being
  hardcoded.
- **Backdrop / mountains:** `packages/game-renderer/src/battle/horizonPass.ts` —
  `BattleHorizonPass`: edge blockers. Mountains = three procedural `peak()` rows
  with a fog haze-mix toward `HAZE` and `STONE`/`STONE_TOP` constants; ocean = one
  graded apron quad; wall = rampart. Edge-bound and shallow — far from the
  reference's deep overlapping ranges.
- **Shared height contract (SACRED):** `packages/game-renderer/src/terrain/heightField.ts`
  — `TerrainHeightField` + `terrainHeightAt` bilinear sampler; `verticalScale` is
  the render exaggeration knob. Comment: _"Matches `sim::Terrain::height_at` so the
  renderer and the sim agree."_ Soldiers, shadows, props, and cues **all seat
  through this one field.**
- **Feature / scenery streams (deterministic):** `terrainFeatures.ts`
  (`extractBattleTerrainFeatures`, `BattleEdgeRoles`, `BattleGroundCover`,
  `edgeSealMismatches`) and `terrainScenery.ts` (`featuresToBattleScenery`). Same
  grid + seed → same instances. Scenery meshes come from
  `models/shared/sceneryPropRegistry.ts`, built via `models/shared/meshBuilder.ts`
  (`box`/`peak`/`gradQuad`), instanced by `CampaignSceneryPass` — the existing
  instanced-mesh pattern a grass pass mirrors.
- **Map presentation:** `packages/game-renderer/src/battle/mapCatalog.ts` —
  `BATTLE_MAP_CATALOG` (3 maps today), per-map `edges` + `groundCover`,
  `buildBattleTerrainPresentation`. The new `highland-valley` map registers here.
- **Camera:** `web/src/battle/scene.ts` + `web/src/battle/cameraRig.ts` — an
  RTS-style `Camera` with zoom-coupled pitch, target offset, perspective, and
  exported `zoomT`. The gameplay camera is presentation/input only; it has no
  effect on the sim.
- **Sky:** **no sky pass.** The background wash is the ground-plane terrain shader
  in `frameShell.ts` (warm-olive + an `aerialStrength` haze); above the horizon
  line the flat clear color shows. `cameraWgsl.ts` has **no** fog / aerial-
  perspective term — ground/grass/scenery don't fade with distance; only
  `horizonPass` does its own per-vertex haze. The reference is _dominated_ by
  aerial perspective, so a real graded sky + a shared fog term are genuine gaps.
- **Render-graph rules (must stay `ok`):** `renderGraph.ts` — frame phases
  `background → world-depth → overlay`; each pass declares `role` + `depth`; phase
  order can't go backward. Grass = `world-opaque` (writes depth, before crowd);
  sky = `background-underpaint`; haze = `overlay-effect`. Camera contract:
  `shared-world-camera-wgsl`.
- **Legacy, off the production path:** `packages/game-renderer/src/battle/terrainPass.ts`
  (2D painted-quad `BattleTerrainFixture`) is **not** wired into `renderer.ts`
  (ground + horizon + scenery are). Don't build the vista there; it would be
  invisible.
- **Verification harness:** scenes in `web/scenes/battle/*.mjs` (model:
  `battle-terrain-3d.mjs`) — route `renderer/battle-terrain-3d?gate=<map>`, read
  `window.__rendererLabStats.stats`, pixel metrics (`groundMetrics`), `ctx.snap`.
  Routes asserted in `web/scenes/system/renderer-lab-routes.mjs`; handlers in
  `web/src/battle/scene.ts`; snapshots under `web/shots`. Gated behind
  `VERIFY_GPU=1`. Sim correctness stays in `cargo`. `screenshot-regression` owns
  snap mechanics, `compare-screenshots` owns the reference-facing "less wrong"
  comparison and neutral subagent review, and `screenshot-critique` remains the
  mandatory unprimed qualitative gate on every visual slice.

## Firewalls / sacred contracts (every slice obeys)

- **One height source.** Never fork `terrainHeightAt`; relief changes go through
  `verticalScale`/profile so everything that seats on the ground stays seated.
- **Edge-seal honesty.** `edgeSealMismatches` stays empty; presentation never
  invents or removes passability.
- **Render-graph + camera contracts.** New passes keep `compileRenderGraph` green
  and use the shared camera WGSL with the correct phase/role/depth.
- **Determinism.** Grass / feature / scenery scatter is seed-stable so snapshots
  are deterministic.
- **Perf.** Hold the `full-game-rendering-performance` budget; grass is capped +
  LOD'd.
- **Palette discipline.** The battle's seven `aesthetics` rules are the grade
  authority. (Campaign two-color rule is out of scope.)
- **Lighting is an environment, not a material.** Every material (grass, rock, sand,
  water, soldiers) stores a **neutral albedo**; the warm/cool mood comes from a
  swappable sun+sky+fill+fog **environment preset** (Slice 06). Never hardcode
  golden-hour _or_ overcast into a base color — if a render looks wrong, fix the
  preset, not the albedo. (Mirrors the new `aesthetics` "Lighting & weather is an
  environment" section.)
- **Camera is presentation only.** The zoom-coupled camera (Slice 01) is a pure
  function of zoom — deterministic so snapshots reproduce — and never touches the
  sim, pathing, ranges, or `terrainHeightAt`. It must keep gameplay legible across
  the playable mid-zoom band, not only at the extremes.

## Slice graph

```
00 reference-workbench ─ target lock, no render change
        │
01 zoom-coupled-camera ─ top-down (out) → reference vista (in); exports zoomT
        │                  (independent of the grass ladder — build early; sets the
        │                   framing every later slice is judged in)
        ▼
02 grass-blade-primitive ─ pure mesh builder + flat-field workbench
        │
03A grass-over-terrain ─ instanced on real maps + LOD/perf; density keyed to zoomT
        │
03B foreground-grass-density-architecture ─ spike record + approach ladder
        │
03B1 field-data-contract ─ stable records, terrain normals, masks, budgets
        │
03B2 packed-attribute-slope-tilt ─ X-post path before compute
        │
03B3A field-meadow-coverage-floor ─ field-owned coverage + soft transitions
        │
03B3B material-volume-proxy ─ zero-blade volume or handoff decision
        │
03B4A accent-candidate-workbench ─ named primitive routes + rejected matrix
        │
03B4B clump-root-shadow-volume ─ dark clump/root mass before blades
        │
03B4B2 soft-root-mass-impostor ─ soft material root layer, visual still flat
        │
03B4C near-fiber-ribbon-silhouette ─ clump ribbon telemetry, visual rejected
        │
03B4C2 near-field-fiber-shell ─ field shell telemetry, visual rejected
        │
03B4C3 fiber-visibility-and-shading ─ shell harness, one-strip primitive rejected
        │
03B4C4 near-grass-volume-primitive-workbench ─ mesh-only families rejected
        │
03B4C5 texture-backed-grass-volume ─ parent ledger for texture route
        │
03B4C5A density-and-soft-coverage-record ─ landed/rejected; metrics recorded
        │
03B4C5B card-cell-distribution-and-scale ─ verified/rejected; still sparse flecks
        │
03B4C5B2 continuous-coverage-carrier-spike ─ landed/rejected; large straw sheets
        │
03B4C5B3 micro-blade-density-carrier-spike ─ landed/rejected; specks/pixel grit
        │
03B4C5B4 minimum-visible-grass-body-carrier ─ resliced; old full-vista B4 parked
        │
03B4C5B4A foreground-grass-scale-and-crop-contract ─ accepted diagnosis; red strong
        │
03B4C5B4B close-foreground-grass-hero-lab ─ parent memo; resliced
        │
03B4C5B4B1 close-foreground-grass-lab-route ─ route landed; scale rejected
        │
03B4C5B4B1R close-lab-scale-and-perspective-repair ─ attempted/rejected; body missing
        │
03B4C5B4B1A close-body-technique-spike ─ parent memo; resliced
        │
03B4C5B4B1A0 close-grass-test-environment ─ accepted fair lab, absence baselines
        │
03B4C5B4B1A1 close-body-architecture-matrix ─ matrix rejected; texture-volume least wrong
        │
03B4C5B4B1A1R texture-volume-continuity-repair ─ rejected; shape repair trapped
        │
03B4C5B4B1A1S texture-volume-alpha-render-model ─ rejected alpha/cutout card fix
        │
03B4C5B4B1A1T field-fiber-body-architecture ─ rejected; non-card per-record pins
        │
03B4C5B4B1A1U field-fiber-source-topology ─ rejected; dense sources still markers
        │
03B4C5B4B1A1V continuous-strand-body-representation ─ rejected; source fan patches
        │
03B4C5B4B1A1W field-owned-strand-material-domain ─ rejected; flat material domain
        │
03B4C5B4B1A1X field-owned-body-silhouette-layer ─ rejected; shell/card swipes
        │
03B4C5B4B1A1Y field-owned-micro-strand-silhouette ─ rejected; fleck clusters
        │
03B4C5B4B1A1Z field-owned-continuous-strand-texture ─ rejected; flat scratched nap
        │
03B4C5B4B1A1AA false-earth-close-material-replication ─ native TSL/WebGPU close grass proof
        │
03B4C5B4B1A1AB field-owned-foreground-occlusion-blade-layer ─ deferred fallback/porting slot
        │
03B4C5B4B1A2 close-body-perf-envelope ─ density/perf budget
        │
03B4C5B4B2 close-body-coverage ─ dense soft body, exposed-ground ratio
        │
03B4C5B4B3 close-strand-scale ─ strand size and direction
        │
03B4C5B4B4 clump-softness-height-variation ─ clump envelope and height rhythm
        │
03B4C5B4B5 close-palette-and-atlas-lock ─ close colour/atlas without density changes
        │
03B4C5B4C camera-relative-procedural-field-generation ─ parent memo; resliced
        │
03B4C5B4C0 camera-relative-backend-spike ─ CPU-first domain + GPU backend gate
        │
03B4C5B4C1 camera-relative-field-domain ─ CPU-first snapped cells/rings
        │
03B4C5B4C2 terrain-normal-slope-eligibility ─ normals + slope/water/tint rejects
        │
03B4C5B4C3 surface-tilt-tip-blend ─ base seating + upward tip recovery
        │
03B4C5B4D depth-lod-mass-collapse ─ parent memo; resliced
        │
03B4C5B4D1 lod-band-contract ─ near/transition/mid/far ownership
        │
03B4C5B4D2 near-to-transition-collapse ─ strands fade into soft body
        │
03B4C5B4D3 mid-mass-continuity ─ mid/far meadow mass without primitives
        │
03B4C5B4D4 depth-falloff-sequence ─ close/transition/mid sequence check
        │
03B4C5B4E grass-only-reference-crop-compose ─ return to reference via grass crops
        │
03B4C5C atlas-tile-content-and-color-integration ─ reference-route atlas regression after B4E
        │
03B4C5D midground-continuity-and-depth-falloff ─ future pass inside accepted LOD
        │
03B4D depth-lod-compose ─ near/mid/far accent ownership
        │
03B5 readability-and-perf-gate ─ gameplay cues + perf adoption
        │
03B6 gpu-compute-and-indirect ─ side-branch backend swap after B4C0/03B5 proof
        │
03C grass-color-texture ─ colour, softness, wind/noise texture crop only
        │
04A terrain-relief-grade ─ valley drop + hummock silhouette via one height source
        │
04B ground-grade-texture ─ smooth hummock ground material, no new relief
        │
05A ridge-backdrop ─ left cliff silhouette + receding ridge rows, no texture tuning
        │
05B cliff-texture ─ vertical pale streaks / face breakup, shape frozen
        │
06A sky-plate ─ overcast sky gradient/cloud mass only
        │
06B distance-fog ─ water-proven haze01 + WATER_HAZE, near/mid/far falloff only
        │
06C weather-presets ─ overcast-foggy ↔ golden-hour over neutral albedos
        │
07A distant-water ─ right mid-distance water placement/silhouette
        │
07B water-material ─ neutral turquoise + shore softness + fog integration
        │
08 reference-map-compose ─ new catalog map + full battle + master compare @ zoom-in
```

`01` (camera) is independent and already landed. `02 → 03A → 03B1..03B5 → 03C`
is the grass ladder. `B4C0` decides backend policy inside that ladder; `03B6` is
a side-branch backend swap and is skipped unless B4C0 or 03B5 proves accepted
CPU/packed grass is too expensive.
`04A/04B`, `05A/05B`, `06A/06B/06C`, and `07A/07B` each freeze the
previous variable before tuning the next one. Each slice leaves a runnable
artifact and its own crop/mask gate before the next depends on it; only `08`
judges the full frame.

## Materialize / out-of-band

This is a multi-slice, asset-heavy visual feature → folder form (this directory),
not a single `.md`. Once all slices ship, `close-spec` archives this plan to
`specs/done/` and rewrites it from a build ladder into a durable rationale record.
