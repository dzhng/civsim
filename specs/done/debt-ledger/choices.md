# debt-ledger — choices ledger (consolidated at close)

Every decision the run made where the spec was silent, re-audited against the
shipped code at close (2026-09-03). This replaces the per-pass append: entries
a later pass superseded or reverted are gone, provisional verdicts are
resolved to their end state, and duplicates are merged. Choices only — gate
results and review narration live in the README evidence ledger and the
commit messages.

Each entry: **when** it landed · the choice as a headline, then the walked
scenario (what triggers it, what the code does today, what the unbuilt
alternative would have done) · **the gap** the spec left · **the reach** (what
this now constrains) · **verdict** · **confidence** that David would have made
the same call. Groups are ordered by the action they ask of the reader —
decide, then acknowledge — and within a group the least-confident entry comes
first.

## Review these first

1. **The campaign sun is the camera-uniform vector, not the old per-pass
   literal** (needs-user, low) — a look decision that passed a silent
   checkpoint; every campaign and standards baseline was re-blessed under it.
2. **HeavySword vs LongSwords is pinned over forty seeds, at a five-minute
   test cost that was already there** (sound, medium) — the run replaced a
   one-seed coin flip with a real measurement, but the balance suite stays
   slow.
3. **Disposal code was written because production really does throw the
   renderer away** (sound, medium) — the spec said "no dispose unless
   measured growth"; the measurement found 926 MB over ten cycles, and the
   trigger turned out to be a production path, not just the probe.

## Needs-user — decide (each carries the provisional call already in effect)

### The campaign chart is lit by the camera-uniform sun (slice 06, low confidence)

Before this run the campaign had two suns: the three mesh passes that draw
settlements, scenery and standards each carried their own literal direction in
shader code, while the skinned soldiers (and every shared effect) took the sun
from the camera uniform — the small block of per-frame numbers every shader
reads. The two disagreed slightly, so a city roof and the soldier standing
beside it were lit from different angles. Today there is one owner:
`CAMPAIGN_ENVIRONMENT` in `packages/game-renderer/src/campaign/environment.ts`
holds azimuth and elevation derived from the camera-uniform vector
(-0.40, -0.28, 0.87), the frame shell takes that as its required `sun` option
(there is no setter), and the two lit passes call `sunDirection()` from the
camera WGSL while the map pass lights from its baked light texture. The alternative was
to make the mesh-pass literal canonical and move the skinned crowd to it.

- **The gap:** the spec named both candidates and delegated the pick to a
  non-blocking human checkpoint, which passed silently.
- **The reach:** 29 campaign-side baselines (campaign-visual, campaign-models,
  shared standards, UI shots) were re-blessed under the new light; reverting
  is a one-constant change plus the same re-bless.
- **Verdict:** needs-user — this is taste. Provisional call in effect: keep the
  camera-uniform sun (the chart reads more coherent: terrain, settlements and
  crowds agree). Reverse by editing the vector in `environment.ts` and
  re-blessing with `UPDATE_SHOTS` one scene at a time.
- **Confidence:** low that this is exactly the light David would pick; high
  that one owner is right.

## Sound — acknowledge (the architecture you now own)

### Balance pin: armour beats the frontal cleaver, measured over forty seeds (slice 27, medium)

The counter web is a balance test that pins design intent such as "HeavySword
beats LongSwords head-on" by running a duel over the nine shared seeds and
asking who won more. Slice 27 gave every threat and engagement consumer one
circumscribing radius (the half-diagonal of the formation frame) instead of
four inline formulas; the wider radius changed where contact starts, and this
one pair flipped from 5–4 to 4–5 over those nine seeds. Codex first re-pinned
it as "both sides win at least a third" — a band that would also pass a
reversed counter. The run measured the pair over forty seeds instead: 65/35
before the change, 80/20 after. So the shipped pin asserts HeavySword wins at
least 60 % over forty seeds, run in eight threads of five seeds each, and the
old nine-seed tuple is gone. The whole counter-web test already took about
five and a half minutes on main; the forty-seed duel adds nothing measurable.

- **The gap:** the spec allowed pins to move for bound-radius but did not say
  how to re-pin a margin that is noise at nine seeds.
- **The reach:** balance pins for grind matchups now have a pattern (wider
  seed set, directional threshold) and the test stays slow; a future "make
  the balance suite fast" pass has to shorten duels, not seed counts.
- **Verdict:** sound. **Confidence:** medium (the seed count is a judgment).

### Placement keeps its own extent; threat gets the circumscribing radius (slice 27, high)

Two formulas looked like "the unit's radius": half the width-plus-depth, used
when a halted unit searches for a free spot, and half the diagonal, used when
asking how close an enemy is. The spec asked whether they are one concept.
They are not: the placement scan wants a deliberately generous extent so a
coarse search never misses a blocker, while threat wants the exact
circumscribing circle. Shipped: `Unit::bound_radius()` (half-diagonal) for
every threat/engagement/missile/morale/separation/combat/wheel consumer, and
`Unit::frame_extent()` (half-sum) for the two placement sites, each with a
doc sentence. The alternative — folding both into one — would have widened
placement scans for no reason.

- **The gap:** delegated ("27c's verdict").
- **The reach:** two named owners; anyone adding a radius consumer picks by
  intent. The walk-in survivor floor moved from `> 70` to `>= 70` of 480
  because the shared radius moved the low side from 74 to 70 — a one-value
  move with a mechanism, not a re-tune.
- **Verdict:** sound. **Confidence:** high.

### Battle layers dispose what they create; the trigger is a production path (slice 14, medium)

The spec's rule was "measure first; write dispose code only on measured
growth." The probe (`renderer-lifecycle`, hardware Chrome, ten battle →
campaign → battle cycles with an explicit renderer dispose) found the
three.js counters flat but process memory climbing 926 MB, monotonic. That
activated the second half: each of the fifteen battle layers now has a
`dispose()` that frees its own geometry, materials, textures, post targets and
blade-field storage buffers; the world disposes them before the backend and
unconfigures the canvas context. After: 46 MB over ten cycles, attributed to
Chrome/three internals and campaign re-entry (a heap snapshot holds zero
world instances). The important fact for the owner: production already
disposes and recreates the shared battle renderer whenever the next battle's
environment or graphics settings differ — so every such switch leaked ~90 MB
before this slice. The scene stays as the lifetime gate; `__game.disposeRenderer()`
and `memoryInfo()` are its debug seam.

- **The gap:** the spec did not say which counters exist on the WebGPU
  backend (`renderer.info.programs` is absent → reported as `null`) nor
  whether to chase the residual rise (not chased: it is not a battle-layer
  owner).
- **The reach:** every new battle layer must implement `dispose()`; the
  lifecycle scene will catch one that does not.
- **Verdict:** sound. **Confidence:** medium (the residual 46 MB is accepted,
  not explained to the byte).

### The renderer-lab shell is built per environment, and the "apply" helpers are gone (slice 06b merge fix, high)

Merging slice 06b into main after the lab router had been split put the
campaign sun call before the builder's battle-environment call, so every
campaign lab mesh rendered under the golden-hour battle sun (road 48254 px,
stone relief 92797 px, three occlusion gates red). The cause was two setters
for one value whose order decided the picture. Shipped: `createConfiguredShell`
lights with a battle environment, the four campaign routes call
`createCampaignShell`, which lights with `CAMPAIGN_ENVIRONMENT`, and both
`applyBattleEnvironment` and `applyCampaignEnvironment` are deleted because
`createFrameShell`'s required `sun` option already sets the sun. The
alternative — one builder taking an environment of either kind — invites the
same silent override.

- **The gap:** the spec did not anticipate the lab split landing before 06b.
- **The reach:** a lab route picks its light by which builder it calls.
- **Verdict:** sound. **Confidence:** high.

### The world-material source gate checks the pipeline owner, not the raw contract names (slice 08, high)

`renderer-lab-routes` has a source scan: depth-writing world geometry must go
through the opaque colour target and world depth-stencil contracts. It used to
grep four pass files for the raw function names. Slice 08 moved pipeline
construction into one owner, `cameraOnlyPipeline`, so those names left the
pass files — and Codex kept the gate green by adding a comment in each file
naming the functions. A grep satisfied by prose guards nothing. Shipped: the
comments are deleted, the gate requires `cameraOnlyPipeline(` with an explicit
`'read-write'` depth mode and forbids a raw `createRenderPipeline(` in those
files, and the one listed file slice 08 had not migrated (`fixtures/nested3d.ts`)
now builds through the owner too.

- **The gap:** the spec did not name the gate as a consumer of the moved
  names.
- **The reach:** future depth-writing passes must use the owner or the gate
  fails; the raw contracts remain available only through it.
- **Verdict:** sound. **Confidence:** high.

### GrowableBuffer reports reallocation; consumers rebuild bind groups (slice 08, high)

A growable GPU buffer doubles when a write exceeds its capacity; anything
holding the old buffer in a bind group must rebuild. Shipped: `write()`
returns `true` on reallocation and each consumer decides what to do — today
none of the migrated buffers is captured by a bind group (all are bound as
vertex buffers at draw), so nobody acts on it. The alternative, a rebuild
callback owned by the buffer, would have been machinery for a case that does
not exist.

- **The gap:** delegated in spirit; the spec did not mention bind groups.
- **The reach:** a future storage-buffer consumer must check the return value.
- **Verdict:** sound. **Confidence:** high.

### The battle renderer wrapper keeps policy only; the world publishes its own stats (slice 13, high)

`BattleRenderer` mirrored soldier arrays, the last camera, audio terrain and
water rectangles, and remapped twenty stats fields by hand. Shipped: the
wrapper keeps frozen-frame caching, the `?debug=blocks` builder and CPU
timing; `stats()` spreads the world's own stats (the world already publishes
`ready`, `camera`, `markerLayer`); `setTerrain` takes a `BattleTerrainGrid`
plus a `BattleTerrainOptions` context (map id, slope bands, vista, lake
surfaces); `battleTerrain.ts` feeds renderer and ambient audio from the same
grid. The production `?sea=` read went with it because the sea source type had
one value.

- **The gap:** the grid/options split and where audio inputs are built were
  the implementer's.
- **The reach:** anything that used to read audio terrain back from the
  renderer now takes it from terrain setup; the debug-block triangles are a
  world method.
- **Verdict:** sound. **Confidence:** high.

### Campaign map pass split by owner; the pass classes stay put (slice 09, high)

`mapPass.ts` (2,500 lines) now keeps the five campaign pass classes and their
WGSL (911 lines); road geometry, sea-label data, the label layout engine and
the surface mesh/texture uploads each have a file. The lab-routes scan greps
the pass class names in that path, which is why they did not move. Net +294
lines is formatter reflow of moved code. `CampaignLineGeometry` stays private
beside its single consumer; the surface owner is `mapSurface.ts` because it
owns both the fallback mesh and the texture uploads.

- **The gap:** file names and the line-geometry home were delegated.
- **The reach:** four import paths for campaign consumers; draw buffers were
  compared byte-for-byte before and after.
- **Verdict:** sound. **Confidence:** high.

### One scalar-math owner for the renderer packages (whole-spec review, high)

After the slices landed, `clamp01`/`smoothstep` lived in
`renderer-core/scalar.ts` (slice 07) and `hash2`/`roundMs` in
`game-renderer/math.ts` (slice 18), with a further eleven private copies of
the same three helpers across game-renderer files. Shipped:
`packages/renderer-core/src/math.ts` owns all four; the two files and the
game-renderer copies are gone. Two copies were deliberately not folded:
`sceneryPass.ts` keeps a position-keyed `shadeHash` because it truncates each
axis before mixing (the shared hash mixes first) and the blessed scenery
baselines depend on that; `soldier-assets` keeps its own two-line clamp and
smoothstep because that package imports nothing from the renderers.
`ambient-audio` had five copies of `clamp01` and four of `clamp`; it now has
one `scalar.ts` of its own rather than a dependency on renderer-core.

- **The gap:** the audit listed the duplicates; the slices only fixed a few.
- **The reach:** two owners remain by package boundary (renderer-core for the
  renderers, ambient-audio for audio); anyone adding a helper searches
  `math.ts` first.
- **Verdict:** sound. **Confidence:** high.

### The sea displacement "source" knob is deleted (whole-spec review, high)

`SeaDisplacementSourceId` had exactly one value, so a parser that mapped URL
params onto it, the world's `sea` option, two lab route reads, the
`requested`/`fallback` stats fields and three scenes' `sea=gerstner` params
selected nothing. Shipped: `createSeaDisplacementSource()` takes no argument;
stats keep `source` and `tier` as the identity the sea scenes assert. The
alternative — keeping the parser as a future extension point — is the model
wider than what production writes.

- **The gap:** not in the audit; found reviewing slice 13.
- **The reach:** a second sea source, if ever built, re-adds the option with
  a real second value.
- **Verdict:** sound. **Confidence:** high.

### Narrative sweep rules (slices 34a–34c, high)

The sweep turns comments that told history ("slice 08b moved this", dates,
old shapes, past bugs) into present-tense invariants or deletes them. Three
rules were decided during the pass: scene descriptions, check labels and
unconsumed route-stat strings are report documentation and follow the same
rule (the generated reports are git-ignored); a word is swept only where it
narrates — `bridge` stays wherever roads bridge water dips or ops paint
bridges over rivers, and the photoreal `cameraBridge` module keeps its name in
prose (Codex's first pass reworded those and was reverted); identifiers such
as `slices`/`sliced` are not matches. One code hunk rode along in 34c: the sim
test harness had two helpers named `block`; the stock 120-man probe is now
`stock_block`.

- **The gap:** the slice said "comments" and left executable strings open.
- **The reach:** the grep is the invariant; a comment naming a slice number
  is a review finding from now on.
- **Verdict:** sound. **Confidence:** high.

### Branch-level review fixed two regressions the slices introduced (whole-spec review, high)

`codex review --base` over the whole run found two behaviours no per-slice
gate exercises. The shared camera-key controller (slice 17) listened on the
window and accepted a wheel event from any canvas, so scrolling over the HUD
minimap — also a canvas — zoomed the battlefield; the pre-run handler was
bound to `#battlefield`. It now takes the scene canvas and ignores every other
target (a test dispatches on a second canvas and expects no zoom). And a slice
rewrote the campaign date readout's speed labels as `${multiplier}x` (2x/4x)
while the top bar kept 1x/3x/10x; `web/src/campaign/speeds.ts` now owns the
multipliers (1/2/4) and the player-facing labels (1x/3x/10x, the pre-run
values — the labels are rate names, not multipliers, and that predates this
run).

- **The gap:** neither behaviour is pinned by a scene.
- **The reach:** the wheel handler needs a canvas; any new speed consumer
  reads `speeds.ts`.
- **Verdict:** sound. **Confidence:** high.

### Closing audit fixes: the shell's unused `setSun`, the lab's noise duplicate (whole-spec review, high)

Unbiased auditors checked the closing record against the code and found two
claims the code contradicted. The frame shell still exposed `setSun`, unused
since the apply helpers were deleted — it is gone, so the required `sun`
option is the only way a sun enters a shell. The renderer-lab ground shader
carried a byte-equivalent copy of `hash`/`vnoise`; it now splices
`NOISE_WGSL`. The `renderer-lifecycle` scene, which only means something on a
hardware adapter, gained a `scene:lifecycle:hardware` script so it can be run
by name.

- **The gap:** the invariants were written before the last two owners were
  checked.
- **The reach:** none beyond the invariants now holding.
- **Verdict:** sound. **Confidence:** high.

### Slice-specific contracts that future code inherits

The following were decided inside one slice and hold across the codebase;
each is one paragraph because the reach is narrow.

- **Campaign golden (slice 28):** exactly 400 ticks with commander AI off, two
  hostile armies on adjacent tiles of the committed map, one battle resolved
  by the estimator; the hash covers army movement/stance, ordered city
  owners, treasuries and every encounter payload, using the sim golden's
  word-wise FNV-1a convention and seed 7 (the existing determinism seed).
  Changing campaign state layout moves this hash on purpose.
- **Vitest layout (slice 15):** node-environment files declare it per file
  (`// @vitest-environment node`) because Vitest 4 has no environment globs;
  the `src/**/*.test.ui.ts` include stays so the suite keeps its 30-file
  coverage; hand-written type shims were replaced by `@types/node` and
  `@types/pngjs`; the `.mjs` telemetry lib keeps a sibling `.d.ts` because the
  scene runner is plain node.
- **`@packages/*` alias (slice 16):** preserves each package-relative suffix
  (`src/`, `assets/`, `bake/`) because consumers import outside `src`;
  renderer-lab's tsconfig extends the web config to inherit it.
- **Campaign flood/pathfind (slice 30):** the flood callbacks are `pass` and
  `visit` and the flood returns the location that requested `Stop`; the
  campaign `test_map()` literal is one JSON fixture shared by the lib seam
  test and `tests/common`.
- **Sim clock (slice 17):** `SimClock` owns the freeze flag; each scene keeps
  its renderer-specific fixed-time effect.
- **Seating tripwire (slice 01):** lives in a dedicated `battle-seating`
  scene over three catalog maps (`generated-seed-7` was highland-vale under
  another name and was dropped) and shoots until the crowd has drawn; the two
  bespoke water scenes were deleted with their provider.
- **Campaign entity builders (slice 18):** `entityFrame.ts` (geometry,
  occupancy, markers, carts), `labels.ts` (label composition), `scenery.ts`
  (prop selection); renderer-facing inputs are defined there and the
  frontend passes its controlled-stage and climate decisions in; `Allegiance`,
  `ArmyView`, `CityView` moved to the builder owner; the stats-key snapshot
  test reads the real `stats()` through inert pass doubles.
- **Campaign cost and encounters (slice 31):** a `Cost` enum with one
  `per_soldier_milligold` lookup; `Encounter::new` takes `[attacker, defender]`
  preparation times and owns id allocation plus the RNG seed draw.
- **Force trace (slice 23):** `Tracer::record` takes an optional `before`;
  `None` records a ready delta, `Some` a capped before/after sample.
- **Weave shots (slice 24):** the bin includes `tests/common` by path rather
  than exposing a `sim::testkit` module.
- **Battle scene owners (slice 19):** `BattleWorld` holds game/memory,
  renderer/audio, camera rig, wasm readers and the lifecycle signal; terrain,
  controls, orders, crowd frames, presentation and HUD/modals are their own
  modules; the debug API is built from those owners' methods.
- **Campaign ↔ sim boundary (slice 32):** campaign owns unit-option policy as
  `contract::StatModifiers`, sim applies them to `UnitClass`, game-wasm
  composes; the stance/progress-ring projection lives in `campaign::sim`.
  (Codex's first pass made sim a production dependency of campaign; it was
  sent back.)
- **HUD store (slice 20):** the 60 Hz unit-card grid keeps its imperative
  handle; battle info, FPS and toolbar share the scene store;
  `getGraphicsSettings()` stays a cloned read while `useGraphicsSettings()`
  reads a cached snapshot; `useHudStore` selectors cache with `Object.is`.
- **Scene boots (slice 21):** the shared battle boots wait on
  `battleRendererReady` (renderer ready and every soldier uploaded); flows
  that prepare storage, measure startup or need per-DPR setup keep direct
  navigation; the retired `gfx=` probe branches are gone.
- **Lab archive (slice 02):** the remaining direct lab consumers retired with
  their providers (the `battle-effects` route went with the raw-WebGPU effects
  pass); the water-field interfaces folded into `gerstnerField.ts`.
- **Sim spawn (slice 25):** `SpawnSpec` orders placement/formation before
  identity/stats/look/team; `look` is always explicit; headless auto-resolve
  lives in each consuming crate's test-common; the raw `spawn_unit` test
  helper keeps its historical neutral-body arrays.
- **Frame graph (slice 03):** `FrameGraphCommands` keeps `clear`, `passes`,
  `precompute`; terrain and markers landed as one commit.
- **Mapgen owners (slice 33):** `gazetteer`, `descope`, `landmass`,
  `reconnect`, `road_measure`, `map_io`, `debraid`; the Olisipo ferry
  allowance is keyed by endpoint ids 50283/50726; the wire schema keeps an
  untagged name-or-id `NodeRef`; the "re-bake is byte-identical" gate became
  the test gates because the default bake panics at HEAD with fresh upstream
  inputs (pre-existing, recorded as found-but-deferred).
- **Noise (slice 05):** canonical `fbm` is unshifted 1x/2x/4x octaves;
  `ridged` stays in `mapPass.ts` as a terrain-specific signal; the cloud and
  fog signals keep their shifted coordinates locally.
- **Campaign haze (slice 06):** the haze constant is spliced into the
  campaign fog shader (fog is the only campaign haze consumer); the photoreal
  horizon builder keeps the battle haze.
- **Grass telemetry (slices 10–12):** production scenes get only the rebuild
  telemetry they read, the focus ring is described by one stable strategy
  string, blade materials are keyed by tier name (`near`/`mid`/`far`), the
  transition uniforms own an immutable snapshot via `transition()`, and the
  200k-record stats sample runs when records change rather than per frame
  (measured: 0.0049 → 0.0055 ms per `stats()` call, effectively constant). A
  1–2 px wobble Codex saw on `grass-close-shifted` did not reproduce in five
  runs and was accepted on that evidence.
- **Lab routes (slice 04):** route modules are named after their URL leaf and
  export `route`; crowd fixtures live in `labFixtures.ts`, campaign fixtures
  in `labCampaign.ts`, and the three.js camera/animation loop shared by the
  two photoreal routes in `labPhotoreal.ts`.
- **Sim split (slice 26):** tick orchestration calls free functions owned by
  `steer`, `separation` and `combat::run`; `UnitPre` and `SoldierCtx` carry
  only the seam's fields; owner-specific context structs (`PairCtx`,
  `ImpactCtx`, `MomentumCtx`, `WeaponRepelCtx`, `WallsCtx`, `TargetSearch`,
  `Attack`, `SwingNeighborhood`) replace positional slices; the no-feature
  `Tracer` keeps the force-trace signature; every function is at or under
  300 lines. The third follow-up was requested on the orchestrator's
  mis-measurement (a scan that missed `pub(super)` functions); its extra
  split was small and kept.
- **Dead-code notes (slice 07):** the tree presets were trimmed to the five
  in use; `smoothstep` moved to the shared owner (now `math.ts`).

## Trivial discretion (not audited individually)

Internal names, file names where the spec delegated them, comment wording,
and the order of struct fields: about twenty such calls across the slices,
all recorded in the commit messages.
