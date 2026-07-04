# Battle map - highland valley style pass

Build a battle scene in the same style family as the reference: dense close
grass, softer midground meadow, terrain-owned background cliffs, and distance
fog. This is no longer an exact image-replication task. The active target is a
coherent scene with the same visual language and topological roles.

## Next Agent Prompt

**Status 2026-07-04:** Slice 17 now carries the retained
`field-fiber-shell` / `field-near` grass prototype into the locked lower
foreground crop. The old exact-reference chase is closed; the target is
style-family parity built one band at a time:

- `assets/style-references/current-band-composition-2026-07-04.png` is the
  current state David critiqued. It already separates foreground grass,
  midground meadow, and background cliffs, but the bands are underdeveloped.
- `assets/target-battle-map.png` is the perspective style reference.
- `assets/style-references/topdown-heightmap-layout.png` is the loose topology
  guide, not a pixel map.

**Current pickup:** start
[18-full-terrain-false-earth-grass-perf.md](slices/18-full-terrain-false-earth-grass-perf.md).
Stop foreground-only grass tuning. First cover the whole slope-eligible terrain
with the retained False Earth / `field-fiber-shell` grass architecture and
measure performance honestly. Only after that perf evidence exists should a
later slice introduce LOD. Keep the Slice 16 camera, terrain, cliffs, fog, and
environment fixed while measuring this baseline.

**Important correction:** do not reinvent foreground grass. Reuse the
already-built field-owned grass stack from this goal: `sampleGrassField`, the
False Earth close-grass spike, and the accepted battle-integrated
`field-fiber-shell` / `field-near` route. Texture-carrier and
`field-fiber-body` / `field-subcell` remain controls for rejected carpet/stipple
failure modes, not destination grass.

**Global TODO**

- [x] 10 - Heightmap ingest/layout: one macro height source and clay review.
- [x] 11 - Slope mask/passability: cliffs and impassibility derive from terrain
      slope/normal data.
- [x] 12 - Vista clay camera: battle route renders the heightmap from the
      hilltop camera.
- [x] 12b - Horizon/band camera gate: horizon at vertical middle and stable
      foreground/midground/background crops.
- [x] 13 - Background cliff height and silhouette: make cliffs/mountains read as
      terrain-owned masses, roughly 3x taller than the current shot, before
      judging material polish.
- [x] 14 - Foreground dense grass: promote the existing field-owned close grass
      machinery on the battle heightmap; real green/olive colors only. Treat
      remaining close-blade oracle failures as diagnostic polish, not a reason
      to start another primitive or block scene composition.
  - [x] 14a - Heightmap grass foundation: field stack, terrain mask, meadow/root
        body, and texture-carrier control are wired.
  - [x] 14b - Blade legibility: the field-fiber/field-strand line plus close
        camera gate are the retained grass foundation for this style target;
        texture-carrier is a negative/control, not acceptance.
- [x] 15 - Midground grass LOD collapse: blur/collapse grass into meadow mass
      with distance, without visible rings or bare terrain.
- [x] 16 - Band camera/composition lock: centered horizon, stable foreground,
      midground, and cliff crops from one review camera.
- [x] 17 - Foreground grass band integration: reuse the existing dense
      field-owned grass foundation with green/olive colors in the lower band.
- [ ] 18 - Full-terrain False Earth grass perf: cover every slope-eligible
      terrain band with the retained grass architecture and measure perf before
      LOD.
- [ ] 18b - Grass LOD from evidence: after Slice 18 perf data exists, collapse
      distant grass into the cheapest acceptable LOD.
- [ ] 19 - Background cliff scale/bases: make terrain-owned cliffs read about 3x
      taller than the current shot, with impassible slope ownership and less
      pasted bases.
- [ ] 20 - Distance fog and environment: reuse the shared water/environment fog
      family so distance increases haze across grass, terrain, and cliffs.
- [ ] 21 - Style-family compose: only after the band slices pass, judge the full
      frame against the reference vibe.

Update this prompt before ending any implementation pass.

## Current State

The latest battle shot is useful because it exposes the scene as three bands:

- **Foreground:** grass exists and the best field-owned close-grass machinery is
  the retained foundation for this direction. Do not replace it with a new
  primitive unless a later focused polish slice proves a specific missing
  capability. Texture-carrier density is useful evidence, but it is not the
  accepted foreground look.
- **Midground:** Slice 15 adds deterministic near/mid/far field record
  stratification and a gate proving close grass geometry is bounded while the
  field-owned meadow material carries the midground mass.
- **Background:** Slice 13 makes the cliff/mountain masses much taller and keeps
  them terrain/passability-owned. Remaining cliff debt is style debt: side walls
  still read slabby, cliff tops are too shelf-like, and the hard foreground
  terrain mask makes bases read pasted until midground/foreground terrain and
  fog slices improve depth.
- **Atmosphere:** fog is not yet doing the water-shot style depth work. It now
  waits until the band geometry reads without fog.
- **Camera:** Slice 16 relocks the current composed shot after the later
  terrain/grass changes. Later slices must not move the camera to hide terrain,
  grass, cliff, or fog problems.

Slice 12b pins that camera: `horizonYRatio=0.5071` against a target of `0.50`
with `+/-0.03` tolerance, using the terrain-aware hilltop target
`targetZ=19.414`. Evidence lives in
`assets/slice-12b-horizon-band-camera/`. The accepted gate is not final visual
quality: fresh critique still flags a flat foreground, hard foreground-to-
midground transition, noisy midground strip, low/edge-weighted cliffs, and low
overall scan readability. Treat those as inputs to Slices 13-15, not reasons to
move the camera again.

Slice 13 raises the terrain-owned background cliffs: map-space background
`maxHeight=125.473`, projected cliff `skyBlockHeightRatio=0.2371` versus the
pre-Slice-13 shelf metric `0.0927`, and `valleyFloorPassableRatio=0.9659` with
the valley corridor still reachable. Evidence lives in
`assets/slice-13-cliff-material-relief/`. The accepted gate is a geometry
checkpoint, not final cliff art.

Slice 14b's stronger grass work was restored into the live spec because its
scenes and assets already exist. Current evidence says the integration vista is
too distant to ratify individual blades (`1.12` world-unit blades project to
`4.536px`), while the close heightmap gate projects them to `12.011px`. For the
current style-family goal, stop treating that hard oracle as the active blocker:
carry the best field-owned grass forward, then judge whether the full scene
needs more foreground polish after midground LOD, fog, and composition are in
place.

Slice 15 publishes the LOD collapse gate in
`assets/slice-15-midground-grass-lod-collapse/`. The route opts into stratified
field-record budgeting across near/mid/far tiers (`[7680,5920,2400]` in the
current gate) instead of capping by grid iteration order. The rendered close
accent keeps a bounded subset (`accentLodCounts=[3194,1768,238]`, one draw
call), while the field meadow keeps the whole sampled field (`fieldCoverage=0.06`,
`avgDensity=0.053`) for the soft midground mass. Fresh critique still flags the
midground as too airbrushed and the full scene as too flat/pasted at cliff bases;
that is now owned by the Slice 18 whole-terrain grass/perf baseline, Slice 18b
evidence-led LOD, Slice 19 cliff base, and Slice 20 fog/depth passes, not a
reason to restart grass.

Slice 17 publishes the foreground band integration gate in
`assets/slice-17-foreground-grass-band-integration/`. The old/current shell
route submitted fibers but projected `0` accent records into the locked
foreground crop; the accepted candidate keeps `grassPrimitiveFamily=
field-fiber-shell`, `accentAggregation=field-near`, one draw call, and projects
`1144` accent records into the crop with `231` reaching the bottom third. The
foreground crop comparison moves from smooth meadow to visible upright fibers:
`candidateShellDelta.strongRatio=0.3193`, `meanDelta=15.9096`, and current
delta remains `0`. This accepts foreground occupancy/rooting only. The next
grass job is not another foreground tune: Slice 18 must first run the same
False Earth-style grass across the entire slope-eligible terrain and publish
perf telemetry. Slice 18b can add LOD only where the measurements require it.

The current implementation screenshot shows a workable three-band composition,
but the remaining acceptance must stay band-scoped:

- **Slice 16 camera:** accepted as a camera/crop lock. `horizonYRatio=0.5071`
  against `0.50 +/- 0.03`; crop contract is foreground
  `{x:0.06,y:0.72,w:0.88,h:0.25}`, midground
  `{x:0.06,y:0.56,w:0.88,h:0.16}`, background
  `{x:0.02,y:0.24,w:0.96,h:0.32}`. The final critique still says
  foreground/midground are visually bland and too similar; that is now Slice 18
  whole-terrain grass/perf and Slice 18b LOD debt, not a reason to move the
  camera.
- **Slice 17 foreground:** accepted as lower-frame `field-fiber-shell`
  occupancy/rooting on the retained prototype grass. The locked foreground
  vista crop judges grass mass/palette/rooting, not individual blade anatomy;
  blade legibility stays on the close foreground camera gate. Midground
  softness, cliff shape, and fog are out of scope.
- **Slice 18 full-terrain grass/perf:** cover the whole slope-eligible terrain
  with the retained grass architecture and measure draw calls, instances,
  triangles, memory, and frame timing before any LOD simplification.
- **Slice 18b evidence-led LOD:** after perf data exists, collapse distant grass
  into mid/far LOD only where needed. Do not preemptively swap primitives or hide
  failed coverage behind meadow.
- **Slice 19 cliffs:** cliff/mountain height, silhouette, terrain bases, and
  impassible slope ownership only. The target is roughly 3x stronger background
  height/presence than the current screenshot, not a detached backdrop.
- **Slice 20 fog:** distance haze only, using the shared water/environment
  family. Fog cannot be used to hide failed geometry or grass.
- **Slice 21 compose:** first whole-frame style-family verdict.

## Style Contract

- **Foreground dense grass:** close grass is made from the existing field-owned
  False Earth style architecture, not a new scratch primitive. It should read as
  dense, rooted green/olive blades in the lower foreground; texture-carrier
  speckle/carpet is a control, not acceptance.
- **Whole-terrain grass first:** the retained False Earth-style grass must be
  tried across all slope-eligible terrain before adding LOD. LOD is a response
  to measured perf/readability, not the starting point.
- **Mid/far LOD grass:** after whole-terrain coverage is measured, individual
  blades may disappear into cheaper meadow mass as distance increases. It should
  read like intentional LOD, not missing grass.
- **Background cliffs:** cliffs are terrain features and impassible terrain.
  They are not cards, separate backdrop sheets, or decorative meshes detached
  from the heightfield/slope field.
- **Distance fog:** use the same shared environment/fog abstraction as the water
  work. Materials keep neutral albedos; the environment sets mood and haze.
- **Composition:** the final shot should have foreground grass, midground meadow,
  and background cliff masses visible at once, with the horizon line centered
  vertically.

## Architecture Invariants

- **One terrain source owns the map.** Presentation terrain, passability,
  slope/normal masks, and grass eligibility derive from the same height source.
- **Slope owns cliff legality.** Above the cliff threshold, cells become rock and
  impassible; transition bands can become scree/slow ground.
- **Grass is camera-aware but terrain-owned.** Close grass may generate records
  relative to the camera for density/perf, but placement still comes from terrain
  position, normal, slope eligibility, and the shared green/olive palette.
- **Environment owns mood.** Grass, cliffs, water, terrain, and soldiers keep
  neutral base colors. Shared environment presets own sun, haze, fog, and
  exposure.
- **Visual gates are variable-scoped.** Judge one visual variable per slice with
  a crop/mask. Whole-frame comparison waits for Slice 21.

Slope-derived impassibility is standard terrain practice: Unity exposes a
NavMesh `agentSlope` limit
(`https://docs.unity3d.com/ScriptReference/AI.NavMeshBuildSettings-agentSlope.html`),
and Recast exposes `walkableSlopeAngle`
(`https://recastnav.com/structrcConfig.html`). Civsim should use the same
principle while keeping the source of truth in its own heightfield/slope data.

## Active Slice Graph

```text
10 heightmap ingest/layout
  -> 11 slope mask/passability
  -> 12 vista clay camera
  -> 12b horizon/band camera
  -> 13 background cliff height/silhouette
  -> 14a heightmap grass foundation
  -> 14b foreground blade legibility
  -> 15 midground grass LOD foundation
  -> 16 band camera/composition lock
  -> 17 foreground grass band integration (done)
  -> 18 full-terrain False Earth grass perf
  -> 18b grass LOD from evidence
  -> 19 background cliff scale/bases
  -> 20 distance fog/environment
  -> 21 style-family compose
```

## Verification Rules

- Every visual slice must run
  [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md) as an
  unprimed final read before acceptance.
- When comparing against a reference or previous attempt, use
  [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md) for a
  less-wrong verdict. Metrics are guards, not acceptance.
- Keep top-down and perspective checks separate. The top-down image guides macro
  topology; the perspective reference guides style and camera.
- For each visual slice, state the judged crop/mask and the visual variable.
  Foreground grass does not accept cliff shape; cliff height does not accept
  grass; fog does not accept bad terrain.
- Human checkpoints do not block. Open shots with
  [preview-shots](../../.agents/skills/preview-shots/SKILL.md), give the user a
  short chance to react, then decide on evidence and record the decision.

## Provenance

The retired exact-match plan and old detailed grass archaeology are preserved
under `archive/`. Useful lessons:

- The False Earth close-grass work is valuable and should be reused.
- Analytic coefficient tuning failed as a route to final visual quality.
- Metrics can be fitted; visual slices require fresh critique.
- Whole-frame comparison before band slices pass causes churn.
