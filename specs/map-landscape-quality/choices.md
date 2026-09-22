# Implementation choices

## Accepted

- **World-aligned sample windows.** A requested window snaps outward at its lower edge to the existing sample lattice. This may shift the Italian sample origin by 1 km, but keeps shared terrain and tree placement identical when another window visits the same place. The camera does not move. Slice 01.
- **Finite coast influence.** The surface uses a halo wider than the existing coast response plus the normal stencil, and caps reported shore distance at that response's range. This bounds regional work without treating a tile edge as a shore. A later water profile must extend this same owner if it needs greater influence. Slice 01.
- **Indexed grid traversal for picking.** Pointer rays walk crossed grid cells and intersect their actual triangles, rather than scan the entire terrain or guess a flat plane. Source physics stays separate. Slice 01.
- **Runtime revision identity.** Each generated surface receives a new presentation revision. Revision identity cannot be reused merely because two builds cover the same coordinates; spatial cache keys are a separate concern. Slice 01.

- **Campaign composition inputs stay renderer data.** The new world receives mesh geometry, world anchors, existing road vertices and a visibility sampler. The application retains commands and DOM cards. The small proof uses the actual city mesh and shared standards plus a deliberately simple army fixture; full entity/crowd adoption remains in 12. Slice 02.
- **Fog and territory follow the ground material.** Their color response uses the terrain's own geometry rather than separate raised translucent terrain copies. This removes visible ridge-edge seams and also lets roads consume the same visibility signal. Slice 02; production territory and vision inputs arrive in 11.
- **Cards anchor above the actual standard.** Placement derives from the shared standard tier's pole height and object scale; terrain occlusion still tests the body, so a flag tip behind a ridge does not make its hidden army label visible. A selected card may overlay map scenery, as other screen UI does. Slice 02.
- **Authored model normals are authoritative.** The city/fixture model material transforms the shared models' authored normals into view space explicitly. This handles their mixed legacy winding without reversing exterior lighting or changing the source models for every consumer. Slice 02.
- **Shutdown waits for outstanding timing readbacks.** The shared world releases its canvas immediately but destroys the renderer only after pending query reads settle. Original per-frame timing sampling is preserved; failures still disable further allocation and cannot be overwritten by older successful reads. Slice 02.

## Crown representation decisions

- **Sound, medium confidence:** Replace the recursive branch tree generator
  with a shared crown surface and attached close leaf detail. Independent
  near/far generators produced incompatible shapes; the same coverage floor
  is simpler and fits the reference's broad canopy volumes. The unused
  generator is deleted rather than retained as another appearance mode.
- **Sound, high confidence:** Keep the dense crown at close range and add leaf
  detail over it. Minification can remove small cutouts without hollowing out
  the entire tree; shadows and visible geometry retain the same coverage.
- **Sound, high confidence:** Normalize sampled atlas RGB by sampled alpha in
  both renderer consumers. Black transparent texels otherwise produce a dark
  line through filtering; this is the existing atlas's color contract.
- **Sound, medium confidence:** Project normalized model height through the
  active camera and use CSS pixels for tree detail selection. DPR changes do
  not change an object's perceived size, and per-instance selection avoids
  flipping a whole forest together.

Variant count, thresholds, crown proportions and constructor details were
explicitly delegated by the slice and are not additional architecture choices.

- **Sound, high confidence:** Pack equal-topology variants into one instanced
  geometry per family/detail. Separate variant meshes exceeded the existing
  production draw budget; shape attributes preserve variety at the same draw
  count as before.
- **Sound, high confidence:** Use one cutout mask for visible and shadow passes.
  The renderer's shadow override does not inherit opacity nodes, so opacity-only
  fading left hidden cards casting shadows. The common mask follows the actual
  shared renderer contract.


## Tile scheduling and source decisions

- **Sound, medium confidence; total accounting still open:** Reserve 32 MiB for resident CPU tile payloads inside the feature's 128 MiB total limit. Transfer peaks, worker scratch and GPU buffers are reported separately; the CPU allowance alone does not prove the total budget.
- **Sound, high confidence:** Keep useful work alive across camera changes and admit it only before a frame. A single scheduler owns prioritization and residency; the worker has no second queue.
- **Sound, high confidence:** Retain unwanted cached tiles until their space is needed. A return can reuse them without introducing another cache. Oversized working sets retain coarse coverage instead of continuously evicting each other.
- **Sound, high confidence:** Remember actual failures for the source lifetime, but clear temporary space-related admission blocks when the requested region changes. An unchanged view neither retries errors nor repeats work it cannot fit.
- **Sound, high confidence:** Transfer a copy of the full classified geographic source once. Image decoding stays in the application, and application buffers remain intact. Both threads use the same classified-mask sampler rather than approximate the coastline independently.
- **Sound, high confidence:** The generator owns its allocation estimate and the worker checks it before generation. This bounds typed-array output and halo scratch without copying the sizing formulas into a second owner.
- **Sound, high confidence:** One newly admitted tile and the changed boundaries of its neighbors switch together. Updating only the newcomer would leave previous boundary morphs as artificial internal valleys; the transaction includes all changed buffer ranges and reports their bytes.

## Joined presentation decisions

- **Sound, medium confidence — fixed coast sampling:** When zoom selects a coarser mesh, the shore should stay in the same place. Coast distance therefore uses a fixed 2 km world grid while terrain geometry can change spacing. A per-mesh distance transform changed beach and water signals at the same location. This adds bounded coast scratch independent of mesh spacing; the allocation estimate includes it. The plan required stable coast signals but did not choose their sampling owner.
- **Sound, high confidence — interpolate the parent triangle:** When a fine tile meets coarse ground, its boundary follows the actual coarse triangle and vertex attributes, rather than independently resampling an analytic height. This makes shading and picking agree with the visible parent. Only the union's outer band blends; treating every tile edge independently would leave internal valleys. This settles the plan's delegated join implementation without adding a second surface owner.
- **Sound, high confidence — exact means RGBA equality:** An edge pixel changing by one channel value must fail a zero-tolerance capture. The existing perceptual comparator could ignore it. Exact comparison now uses decoded pixel equality, while explicitly tolerant checks retain their existing behavior. This makes the test oracle match its stated contract; no product format or dependency changes.

## Battle forest decisions

- **Sound, high confidence (07 battle subpass):** Retain source-cell footprints
  on extracted forest features. Centroid and equivalent-area radius discard
  concavity and holes; re-reading the exact footprint preserves physical
  clearings without a second gameplay reservation map. Authored features that
  lack a footprint retain their explicit disc semantics.
- **Sound, high confidence (07 battle subpass):** Keep the finite world lattice
  in the CPU terrain owner while battle owns eligibility and cap policy.
  Window origins and feature order cannot reseed a tree; random-priority
  thinning avoids making the cap empty the last rows of a forest.

## Crown silhouette finish candidate

- **Sound, medium confidence — preserve the narrow species' fuller crown.** When the broad tree families expose fewer main lobes, the slender aspen loses too much visible foliage. Aspen therefore keeps its previous lobe distribution, while sharing the same connected surface construction and leaf seating. The plan delegated crown construction but did not specify a universal lobe count. This keeps species identity without another generator; future shape changes must still satisfy each family's existing coverage gate.
- **Sound, medium confidence — seat leaves into their shared volume.** At close zoom, a leaf cluster that sits outside the crown can look like loose scraps floating beside a tree. Leaf surfaces now intersect the crown and wander less sideways, so their exposed edges describe the volume. This deliberately trades some busy leaf texture for the reference's coherent main masses; no material, silhouette threshold, density or draw-budget change conceals the result. Final visual acceptance remains a separate review of the rendered candidate.

## Campaign ecology and shared material ownership

- **Provisional, medium confidence — coherent woodland selection.** A fixed world lattice supplies candidates, while a broad spatial priority keeps overlapping cores when the global cap is applied. Uniform random thinning made isolated trees dominate. Existing regional allocation and city/road reservations remain authoritative. The resulting compact patches still need whole-landscape composition review.
- **Sound, high confidence — candidate policy and seating have separate owners.** Campaign chooses stable species and positions once; the displayed terrain supplies height when its revision changes. Geometry workers no longer generate or transfer a second tree population.
- **Sound, high confidence — shared slope response.** Regional and tiled campaign terrain use the same material profile. Previously tiled ground omitted the slope response, so the same steep face could appear grassy in one consumer and rocky in the other.
- **Sound, high confidence — preserve strategic river semantics.** Water classification is a separate query from territory-worthy land. Rivers can remain strategic land while rejecting vegetation and supplying continuous water-body identity.

- **Provisional, medium confidence — face-oriented procedural rock.** Shared rock detail follows projected surface faces instead of horizontal height contours. This removes drawn crack networks and gives vertical faces a consistent scale; its soft close appearance remains a material refinement rather than a reason to restore the contour artifacts.

- **Sound, high confidence — scale normals with the same transform as props.** Tall and wide tree/rock instances use inverse-transpose normal scaling before yaw; an unscaled normal gives the wrong illumination. The independent CPU-baked comparison permits only measured quantization while the production snapshot repeat remains exact.

- **Sound, high confidence — retain adaptive edge vertices.** Neighbouring shoreline polygons must agree along shared edges even over nonlinear relief. Existing source edge points are inserted into larger neighbours; only affected polygons add a center fan. This prevents geometric cracks without refining the whole map interior.
- **Sound, high confidence — total allocation governs the overview.** The full overview receives a larger individual mesh-build allowance than a small tile, while the unchanged total128MiB reservation covers all retained and transient resources. Per-build allowance is not a second total budget.

- **Sound, high confidence — one terrain material for each tiled world.** When a tile arrives, its geometry changes but its lighting and surface response do not. The world therefore keeps one configured material until disposal; eviction releases only tile geometry. The plan required bounded admissions but did not prescribe shader graph lifetime. This avoids rebuilding Three node graphs on every admission and leaves fog as a per-geometry attribute.

- **Sound, high confidence — omit redundant campaign attribute arrays.** Campaign vertex records already carry their color, and campaign has no physical battle-tint IDs. Separate overrides are optional; battle retains them where they carry different information. This removes duplicated storage without reducing geometry.
- **Sound, high confidence — update only affected tile edges.** Adding or removing a tile changes the surrounding blend band, not distant geometry. Distant presented arrays remain owned and unchanged; adjacent tiles still update atomically.
- **Provisional, medium confidence — sixteen nearby detail tiles with a source-conforming overview.** Full24-tile traversal exceeds the fixed terrain budget after coastline topology is retained. The measured16-tile working set fits, and remaining land/water stays visible through the overview. Whole-frame review must still judge the peripheral coarseness before final acceptance.


- **Sound, high confidence — geographic z means surface clearance.** Existing CPU road and border builders provide their shapes without an absolute height; the physical world seats them on the displayed surface. This avoids subtracting an old terrain query from rounded vertex heights, and keeps geometry policy out of the GPU owner.
- **Sound, high confidence — terrain admission reports its changed domains.** Consumers use the tile owner's actual affected regions instead of guessing which neighbour edges morphed. Geographic lines outside those regions keep their uploaded positions.
- **Provisional, medium confidence — short border cells and point-truth coast clipping.** Long, wide border triangles passed under Alpine ridges. Subdividing along and across the existing strip preserves its centerline while following relief; the existing water classifier trims wet tips. The source mask remains authoritative, and smaller-than-cell enclosed water is not a new inferred coastline. Full-region culling and hardware cost still need the remaining11 pass.


- **Sound, high confidence — regional geographic batches use actual triangle bounds.** Grouping by a128km world cell gives the existing renderer useful culling units. Bounds include the whole triangle even when it crosses a region edge, so culling cannot erase long sea lanes. Regions outside a terrain change are skipped before visiting individual vertices.
- **Sound, medium confidence — explicit geographic crossing order.** Borders draw below roads and sea lanes instead of relying on transparent batch centers. Grouping otherwise changes crossing order accidentally. The retained order changes only66/33pixels in the regional controls, with no perceptible difference in fresh visual review; it keeps the travel network legible as batches change.

- **Sound, medium confidence — enlarge mature canopy footprints within the existing budget.** The reference reads as woodland masses where the previous regional trees read as small separate tokens. Mature tree dimensions increase by half, while the same placement owner rejects footprints that cross protected clearances. This gives overlapping crowns without a second distribution algorithm or a higher instance cap. Fresh comparison accepts coverage, while oversized conifers and missing ground detail remain separate work.

- **Sound, medium confidence — keep building roofs level and bury their foundations.** Cities keep their authored horizontal arrangement and geographic anchor. Each building sits above its sampled footprint, with walls extending into the terrain so troughs cannot expose open edges. This avoids the circular terrain pads rejected in the form pass. Very steep sites can expose tall retaining walls; city positions and the exaggerated footprint are preserved.
- **Sound, high confidence — share live entity identity outside the raw renderer.** City selection, ownership and allegiance use the existing campaign frame contract, now owned independently of either rendering backend. Only contact geometry rebuilds on relevant terrain or position changes; ownership updates reuse it.

- **Sound, high confidence — one crowd scale reaches every representation.** Campaign figures use the same physical soldier renderer as battle, with one layer-owned presentation scale. That scale also reaches visibility bounds and distant billboards, so zooming cannot make the representation change size or disappear early. Battle keeps its existing unit scale; campaign chooses representative figure positions through its existing frame builder. The shared crowd modules now have a neutral owner instead of living under battle.

- **Sound, high confidence — shared label measurement, renderer-specific projection.** Both renderers consume the same measured atlas, hierarchy and collision result. The physical world supplies raised screen anchors, while the still-active raw pass retains its existing world-anchor projection. This preserves current labels during migration and gives terrain, glyphs and cards a consistent anchor after cutover. Same-sized physical atlas textures are reused as labels move.
### Occupied-city representative figures

A garrison is represented by its existing city, army standard, selection and
card. Representative soldiers are omitted at an occupied city because their
strategic figure scale embeds them in the city's roofs. This decision belongs in
`buildEntityFrame`, where occupation and representative composition already live;
a renderer-only offset would duplicate placement policy and separate figures
from their shared label/marker anchor. Field-army figures and troop state stay
unchanged. The army/cart checkpoint carries the differential frame test and
before/after visual evidence.


## Campaign sun fitting

- **Sound, high confidence:** Share battle's existing sun-rectangle fit and retain its battle behavior. Campaign supplies its visible ground footprint, improving nearby contact without another light, larger shadow texture or new quality setting.
- **Sound, high confidence:** Keep the full view extent across map boundaries and snap the sun/target together to shadow texels. Trimming the rectangle to the map changed shadow resolution during panning and defeated stabilization.

## Battle landscape integration

- **Sound, medium confidence — retain the existing tree lattice and raise its component cap.** Large forests lost most candidates to the same cap used for small groves. The larger bounded cap restores woodland presence without a new placement algorithm. Physical clearings remain authoritative; under-canopy troop visibility still needs full composition review.
- **Sound, high confidence — carry continuous shoreline distance to the material.** The existing vista float buffer now carries signed world metres instead of binary water. This preserves interpolation across coarse triangles without adding a buffer, changing terrain heights or adding a compatibility getter.
- **Sound, high confidence — interpolate material coverage, never category numbers.** Grass and forest IDs numerically bracket rock, so blending IDs invented a rock border. The battle geometry boundary decodes independent coverage before seam or fragment interpolation. Two extra floats per terrain vertex replace the categorical GPU input; simulation tint IDs remain untouched.
- **Provisional, medium confidence — evaluate a pre-baked elevation asset before another procedural form algorithm.** Repeated local noise variants lost readable mountains. Actual elevation provides branching, but its raw sampled detail is too fragmented at the current mesh scale. This remains a reversible asset experiment, not an adopted runtime dependency or source contract.

- **Sound, high confidence — submit the initial battle frame once while it settles.** The existing preparation state now prevents repeated draws from adding work behind the first GPU wait. Its paused clock continues to consume wall time, so loading cannot spend simulation time. No per-frame queue system or timeout increase is needed.

- **Sound, high confidence — patch disposal in the dependency that owns the listeners.** Shared Three texture and quad objects retained callbacks to retired renderers. A reproducible patch detaches each manager's listeners without destroying resources another world uses. It follows the dependency's existing geometry-manager pattern, avoids an application cleanup layer, and is removed once an upstream version passes the same regression and lifetime checks.
### Controlled natural-ground color acceptance (slice 14)

- **Choice:** Judge the visible ground as yellow-to-olive vegetation rather than
  requiring green to lead red in almost every pixel. A sunlit yellow grass patch
  in the user's reference fails the former test as almost entirely brown. The
  replacement admits that patch and neighboring olive grass while rejecting blue
  water, gray rock and red-brown soil. Its fixed world-space patch follows the
  rendered ground, so lowering an incorrectly mountainous fixture cannot put a
  road into the measurement.
- **Gap:** The renderer migration retained a color test derived from directly
  painted fixture artwork, while the supplied target includes yellow grass.
- **Reach:** Future material changes must retain natural-ground color coverage,
  but this color gate does not certify texture richness or complete visual quality.
- **Verdict:** Sound: the oracle is grounded in independent reference pixels and
  negative controls rather than the shader's current constants. Keep full-frame
  critique and material acceptance separate.
- **Confidence:** Medium. The exact lighting allowance is a judgment call; the
  reference crops and unchanged coverage floor make that choice reviewable.

- **Sound, high confidence — let terrain carry campaign mountain mass.** Remove
  the disconnected cool rock props from real geography. Their shape and color
  competed with the mountain surface; deletion keeps woodland unchanged and
  removes an obsolete placement loop. Battle and authored-stage rock assets
  remain. The resulting bare slopes still need coherent surface detail.

- **Sound, medium confidence — interpret the existing mountain band before using
  it as rock exposure.** A source-resolution byte texture adds no terrain-tile
  buffers and gives every tile the same world lookup. Limiting unconditional
  exposure to the band’s upper part preserves lower green ground better than
  treating the whole range as bare stone. Frozen production comparisons favor
  it, while high gullies and face detail still need work.


## Screen output adoption

- **Sound, medium confidence — one resolved display attachment for world and UI.**
  When a map renders, the normal world grade first writes display-colored pixels
  to a texture. Labels then blend their authored colors onto those pixels, and
  one final copy presents the result. Drawing UI directly to the canvas selected
  a different multisample attachment in the pinned engine and erased the world.
  The spec required ungraded ink but did not choose the attachment layout. This
  adds one drawing-buffer-sized texture and one copy draw; the engine also keeps
  its canvas multisample attachment. The choice preserves world pixels without
  inverse-color hacks, but its added memory and timing still require acceptance.
- **Sound, high confidence — screen membership owns composition, visibility does not.**
  Hiding labels at a different zoom leaves their composition attachment in place;
  it does not switch targets and accumulate separate engine caches. Worlds with
  no screen members keep the original draw path. The existing physical camera
  serves both scenes, so this creates no second projection or frame clock.
- **Sound, high confidence — restore both engine target selectors before copying.**
  After drawing the graded world, Three leaves the display texture selected as
  its active target. Restoring only the output target would make the next draw
  sample its own destination. The phase restores both the active and output
  targets, including on a thrown draw, before presenting. This follows the
  pinned renderer's actual state contract and keeps callers from inheriting it.


## Painted label occupancy

- **Sound, medium confidence — reserve the halo within the existing rectangular claim.**
  When two names fit by their letter fills but their dark outlines touch, their
  labels previously both survived. The shared collision rectangle now includes
  half the stroke width on each side, so the existing importance rule chooses
  which name remains. Rectangles are conservative around the individual letters:
  the tested OVILAVA/LAURIACUM pair loses a distinguishable name too. The plan did
  not choose per-glyph collision geometry. Keeping the established rectangle
  policy is simpler and consistent with other map labels, at a known cost in name
  density; both city models and all-own-card visibility remain unchanged.

## Rock image adoption and normal control

- **Sound, medium confidence — keep image detail in color and roughness, with landform normals.**
  At close campaign zoom, deriving a tiny surface tilt from neighboring image
  samples made the stone look dotted. Lighting directly from the terrain's
  slope removes that interference while the same image still colors cracks and
  varies roughness. The plan did not require bump mapping. This trades some
  apparent roughness for coherent slopes and a smaller shared shader; rounded
  mountain geometry remains a separate unfinished concern.
- **Sound, high confidence — one decoded rock image per terrain world.**
  Opening a campaign or battle decodes the checked-in image once. Every tile
  and battle terrain rebuild reads that world's texture; retiring the world
  disposes the texture and closes its decoded image. A generic world without
  terrain does not load it. This avoids a global cache whose lifetime would
  differ from the renderers, while making the material's resource requirement
  explicit for each consumer.
- **Sound, high confidence — lab setup and teardown share one release list.**
  If a terrain demonstration fails after acquiring a map, or the page leaves
  while it awaits a world, the same owner releases each acquired resource.
  Resources arriving after teardown are released immediately and stop setup.
  Ownership can move to a containing resource without keeping a second disposal
  path. This replaces duplicated route cleanup as the asynchronous image load
  creates a real failure interval; it adds no product lifecycle manager.


## Toolbar stability

- **Sound, high confidence — keep fixed icon markup stable while command state changes.**
  A toolbar refresh needs to change button state, not rebuild the same SVG. One
  immutable markup object per command lets React retain the icon nodes; classes,
  disabled state and click handlers still update. This removes redundant work
  and observed snapshot drift without adding a renderer cache or changing art.

### Readable label separation — sound, medium confidence

Label ink that barely clears another name can read as one joined string. Reserve
two CSS pixels between label claims in the existing importance-ordered occupancy
owner. Keep measured ink bounds truthful and card precedence unchanged. This may
hide an additional low-importance name at a crowded zoom; its city marker remains.
This replaces the earlier assumption that any non-overlapping halo was readable.

### Main renderer integration — sound, high confidence

Keep main's TypeGPU battle renderer and the campaign's Three renderer. Sharing
appearance means both consume the same terrain coverage, asset identities,
material policy and environment inputs; it does not require putting battle back
onto the retired backend. When main removes a consumer of an accepted feature,
that consumer's acceptance reopens until its replacement implements and verifies
the feature. Campaign evidence remains valid within its original scope. This
retains main's shipped architecture without pretending shared asset files prove
shared visible behavior.

### Road width on slopes — sound, medium confidence

Keep the existing route and width settings, but measure each road's width across
its local terrain surface. A fixed horizontal strip becomes a wide ribbon when
its edges climb a steep slope; seating a perpendicular strip of the intended
surface width removes that swelling. Junction caps follow the same distance rule.
This is a local-plane approximation, so sharp bends and changing slopes can still
vary in the image. It does not move the gameplay route or make roads flat benches.

Preserve each rendered road vertex's original center and lateral offset on the
CPU. A replacement terrain tile always seats those original inputs, so repeated
updates cannot progressively narrow the road. The production map pays about
13.86 MB for this layer data plus 6.93 MB for source anchors, with no additional
GPU attributes. The explicit copy keeps reseating independent of caller mutations;
a borrowed source/index representation could reduce memory but would change that
ownership contract. Fog refreshes upload whole affected region buffers so a local
road update cannot truncate a full visibility refresh in the same frame.


## Battle coverage and leaf-mask checkpoint

### Sound — medium confidence: carry three material weights through CPU meshes

When a grass vertex touches forest, the render mesh now carries separate rock,
forest and scree amounts instead of interpolating category numbers. This uses
eight more bytes per classified vertex, but it also makes intermediate vertices
honest and lets both renderers share the same result. The plan required correct
classification but left the storage shape open. A packed representation could
save memory at the cost of conversion and precision rules at every join. Keep
three floats for the existing mesh pipeline; campaign meshes without these
categories allocate nothing. This constrains future join/worker code to preserve
three independent amounts, not reconstruct category IDs.

### Sound — high confidence: share the visible leaf sampling in the caster

When sunlight passes through a tree crown, the shadow pass now samples the same
leaf atlas and applies the same cutoff as the visible tree. It borrows the existing
texture/sampler group, so there is no second mask asset or GPU allocation to keep
in sync. The plan required silhouette consistency but did not prescribe whether
to duplicate the sampling code; sharing the existing function makes future leaf
mask edits apply to both passes. Solid geometry keeps its negative-UV exemption.

### Sound — high confidence: isolate the generated boundary, retain authored props

The new generated terrain control draws ground and horizon without trees, so
crowns cannot hide the material boundary being tested. Existing authored A/C
views retain their scenery coverage, using the current TypeGPU visibility name.
All cases verify actual camera and renderer identity. The old scene had retired
readiness/stats hooks after main's renderer migration. The gap was how to maintain
that gate without losing what it previously showed; isolated diagnostic captures
supplement the authored views, and never replace composed battle acceptance.


## Battle bitmap rock adoption

### Sound — medium confidence: reuse the campaign rock image in battle

A steep battle slope now samples the same rock-height image as campaign terrain,
using the same fracture, filtering and roughness policy. This adds three filtered
texture samples per fragment and one approximately 1.33 MiB mipmapped GPU image to
a battle scene. The plan called for matching material character but did not pick
an upload strategy. Reusing the existing image/mipmap uploader avoids a new asset
pipeline; keeping the image at scene scope avoids repeated decoding for each
terrain ring. Hardware acceptance must still measure the rendering cost.

### Sound — high confidence: neutral bytes, backend-owned GPU images

The PNG and raw-data decoder belong to game-renderer, so battle does not import
campaign GPU types. Each backend creates its own texture using those bytes. In
battle, ground and replacement vista layers borrow one scene-owned image; they
release before that image is destroyed. This is the minimal sharing boundary:
sharing native textures between independent renderer owners would couple their
lifetimes. The plan left the precise loader split open.

### Sound — high confidence: authored slope defaults remain visual only

An authored rock marker describes a placed prop's footprint, whereas a generated
rock category also describes exposed terrain. The shader therefore uses geometric
slope defaults for authored terrain without turning those prop footprints into
full rock faces or adding gameplay slope metadata. Authored scree still excludes
turf. This carries the accepted Three interpretation across the backend boundary
and leaves physical height, passability and recipe identity with their existing
owners.


## Projected tree detail adoption

### Sound — medium confidence: different detail profiles, one selection rule

A tree that occupies a modest part of a battle view still needs leaf edges to
read as a tree. Reusing campaign's larger activation threshold made nearby battle
conifers look like smooth cones, so that candidate was rejected. Both worlds now
use the same projected-size calculation and hysteresis (a separate enter/leave
threshold that prevents toggling near a boundary), with battle retaining leaves
at smaller sizes. Campaign's accepted profile stays unchanged. The spec delegated
mode-specific thresholds; this record preserves the rejected shared-threshold
assumption and the reason for the correction. Hardware cost remains to be measured.

### Sound — medium confidence: permanent canopies and preallocated leaf buckets

Each species keeps its closed canopy drawn while a second bucket adds only leaf
triangles nearby. Three shape variants share each draw through instance selection,
rather than multiplying species draws. This spends more static geometry and
instance capacity but avoids rebuilding or allocating while the camera moves.
The plan left batching and capacity ownership open. The existing atlas and leaf
cutout remain shared by visible and shadow passes; no new texture pool is needed.

### Sound — high confidence: derive verification from committed owners

The terrain report exposes existing earth-distance metadata and actual scenery
counts from the installed generation. It does not recreate those values in a
preview cache. Camera checks read the completed frame's camera and the actual
clamped camera separately, so a requested URL position cannot masquerade as the
rendered view. These are verification boundaries required by the migrated renderer,
not new game state.
