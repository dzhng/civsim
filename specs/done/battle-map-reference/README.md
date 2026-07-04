# Battle map — highland-valley reference match (SUPERSEDED)

**Status: superseded, abandoned mid-flight — not shipped.** David decided
(2026-07-04) to restart battle-map style work from scratch in
`specs/battle-map-style/` with a procedural sim-side map generator. This spec
tried to make the battle map read like the reference vista in
`assets/target-battle-map.png` by building the look bottom-up from isolated
visual variables — grass, relief, cliffs, sky, fog, water — toward a composed
master shot. The composition ladder (terrain relief, cliffs, sky, fog, water,
compose) never got past grass; the grass ladder itself became a long,
well-recorded chain of rejected primitives. That rejection ledger, the
meta-findings about how to judge grass at all, and the handful of pieces that
landed on main are what this record preserves.

Two events killed the plan as written:

1. **The renderer substrate changed underneath it (2026-07-02).** The
   `3d-perspective-renderer` spec (`specs/done/3d-perspective-renderer/`)
   replaced the 2.5D tilted-ortho projection with a real 3D perspective camera
   and moved battle production onto three.js WebGPU + TSL
   (`packages/photoreal-renderer`, `PhotorealBattleWorld`). Everything this
   spec built in `packages/game-renderer/src/battle/*` — the bespoke WGSL grass
   pass, meadow texture path, and the whole workbench route family — is off the
   production path.
2. **The supersession decision (2026-07-04).** Rather than re-home the ladder
   onto the new substrate slice by slice, the style work restarts clean in
   `specs/battle-map-style/`, generating the map procedurally on the sim side.
   The new spec copies what it needs from `assets/` here.

A parallel codex branch (GitHub PR #3, now closed) continued this spec past
the mainline state with slices 10–21 (heightmap ingest, slope masks, vista/band
cameras, cliff material, the foreground dense-grass band, LOD collapse, fog,
and compose). Its salvage is recorded on the local git ref **`pr-3-review`**
(commit `25b7106b`, "battle-map-reference: source checkpoint for grass perf
plan") — the fullest surviving state of this line of work, including the slice
files deleted from this archive.

## What landed on main and still lives

- **Slice 00 — reference workbench + palette lock.**
  `visualizations/target-vs-current.html` records the target-vs-current board
  and the neutral-albedo chip proposals (`#c0c178` near grass, `#99a05c`
  shadow/mid hummock, etc.) plus the two-preset decision (overcast-foggy vs
  golden-hour).
- **Slice 01 — zoom-coupled camera.** Landed, then superseded by the real 3D
  rig from the `3d-perspective-renderer` spec. The durable residue is the
  normalized `zoomT` lever, still exported from `web/src/battle/cameraRig.ts`
  and read by grass density and haze depth.
- **Slice 02 — grass blade/tuft primitive.** The pure mesh builder in
  `packages/game-renderer/src/models/shared/grassModels.ts`. Production
  photoreal foliage (`PhotorealGrassField` in
  `packages/photoreal-renderer/src/battle/foliageLayer.ts`) still instances
  the same CPU-built tuft scatter via `buildBattleTerrainGrass`
  (`packages/game-renderer/src/battle/grassPass.ts`), called from
  `packages/photoreal-renderer/src/battle/battleWorld.ts`.
- **Slice 03B1 — the grass field DATA contract.**
  `packages/game-renderer/src/battle/grassField.ts` — `sampleGrassField`,
  stable packed 4-vec4 records (position/type, width/height/bend/wind,
  yaw/seeds/clumpWeight, terrain normal), explicit budget/reject counters,
  `terrainNormalAt` beside the height sampler. Alive; the renderer-lab grass
  routes (`apps/renderer-lab/src/router.ts`) consume it. This contract is
  substrate-independent: any future grass system should keep field records as
  the data owner, whatever renders them.
- **Slice 06C — one weather owner.** `CIVSIM_ENVIRONMENTS` in
  `packages/game-renderer/src/environment/environment.ts` (with
  `WATER_ENVIRONMENTS` as the water-facing alias): ground, grass, horizon,
  water, and soldiers consume the same sun/key/fill/haze/exposure fields over
  neutral material albedos.
- **The material/light reconciliation**, written into the `aesthetics` skill
  itself ("Lighting & weather is an environment",
  `references/battle-overcast-highland.png`): the cold reference and the warm
  Aegean shots are the same world under two environment presets, not two art
  styles.

Dead on the production path but still in-tree at close time: the bespoke
battle grass/ground/horizon passes under `packages/game-renderer/src/battle/*`
and the workbench scenes (`web/scenes/battle/battle-grass-field.mjs`,
`battle-map-reference*.mjs`) — slated for deletion with the rest of the
bespoke battle WGSL. Note: `web/scenes/battle/battle-map-reference.mjs` and
`battle-grass-field.mjs` still reference assets by the old
`specs/battle-map-reference/` path; fix or delete them when that cleanup
happens.

## Principles that outlive the spec

- **Materials are neutral albedo; mood is an environment preset.** Never bake
  golden-hour amber or overcast grey into a base color. If a render looks
  wrong, fix the preset, not the albedo.
- **One height source.** Everything that seats on the ground goes through
  `terrainHeightAt` / `TerrainHeightField`; relief is a render-side
  `verticalScale`/profile knob, never a forked sampler.
- **One aerial-perspective owner.** The water work proved the shape
  (`haze01` from distance, detail fades by `1 - haze01`, final color mixes
  toward the environment haze color so the horizon dissolves). Never inline
  per-pass fog constants; never use haze to disguise unfinished grass, cliffs,
  or water.
- **A green snapshot proves _unchanged_, never _good_.** Reference-facing
  acceptance needs three gates: snapshot stability, a `compare-screenshots`
  crop/metric comparison against the owning target crop, and an unprimed
  neutral critique told exactly which variable it may judge.
- **One visual variable per slice, one comparison crop per slice.** Whole-frame
  comparison belongs only to a final compose gate. Judging grass by the full
  vista frame invites "make the painting match" passes that tune five
  variables at once.
- **Determinism.** Grass/feature/scenery scatter is seed-stable so snapshots
  reproduce.

## Meta-findings — how to judge grass (the expensive lessons)

These came out of ~25 rejected passes and the PR #3 continuation; they are the
part a future grass effort would otherwise re-derive at full price.

1. **Blade anatomy cannot be ratified at the vista camera.** At the
   integration vista the nominal 1.12-world-unit blade projects to ~4.5 px; a
   close review gate projects the same blade to ~12 px (measured in PR #3's
   camera gate, slice 14b on `pr-3-review`). Ratify blade/body anatomy at the
   close gate, then integrate at the vista. Every attempt to "discover"
   foreground grass by tuning the wide reference shot failed; camera/crop/proxy
   repair cannot make a comparison fair while the body layer is absent.
2. **Acceptance must pair positive and negative anchors or metrics get
   gamed.** Raw edge energy and contrast reward 1-px stipple. A candidate must
   pass the target crop AND known-bad controls must fail on the identical
   crop: grass-off fails, flat-stipple controls fail, and structural checks
   (downsample-retained structure, vertical anisotropy, tall-run
   density/count, rooted darkness, palette) stop isolated spikes from gaming
   a lower-band gate.
3. **The retained winner** was the `field-fiber-shell` / `field-near` stack
   (field-owned near-shell selection, least-wrong of every mainline family)
   plus the **False Earth close-grass architecture** — camera-snapped grid,
   GPU-computed packed blade data, Voronoi clumps, Bezier blades,
   terrain-normal alignment, view-dependent thickness, distance-LOD draw
   buffers (`momentchan/false-earth`, native three.js/WebGPU/TSL). The
   mainline ladder's endpoint was exactly "reproduce the source material in
   its native stack before more civsim-native approximation"; PR #3 did that
   and carried it through slices 14–18. Salvage: `pr-3-review`.
4. **Failure has two poles, and civsim-native approximations bounced between
   them:** "flat paint" (continuous coverage, no structure — every
   material-only domain) and "markers/cards/flecks" (structure as discrete
   artifacts — every sparse-emitter geometry). Card/instance count was never
   the missing variable; density-only passes moved between poles without
   escaping them.
5. **Separate coverage ownership from visual material.** The one accepted
   material-side move (03B3A): a raw field channel proves ownership while a
   softened coverage channel drives falloff. Material can own broad meadow
   mass; it cannot fake volume.

## The rejection ledger

Every family below landed as working plumbing/telemetry and was rejected on
visual evidence (crop metrics + unprimed critique). Evidence archives live
under `assets/03b4-evidence/…` — full shots, crops, diffs, stats JSON per
family.

### Judged at the wide reference camera

| Family | Verdict |
| --- | --- |
| Brute-force all-card tuft density (~83k tris) | Sparkly stipple, expensive; card count is not an acceptance metric |
| Zero-blade meadow material + volume proxies (03B3/03B3B) | Flat painted/combed plane; band softened by 03B3A coverage channel, volume unfixable in material |
| Hard root geometry — diamond/oval marks, root-fiber mat (03B4B; `03b4b-*` evidence) | Separated olive stains / decal glyphs on a smooth plane |
| Soft root-mass material layer (03B4B2; `03b4b2-soft-root-mass/`) | Removes glyphs, still a smooth painted carpet, streaks stretch the ground plane |
| Clump-emitted `soft-root-fiber` ribbons (03B4C; `03b4c-soft-root-fiber/`) | 157 clump emitters too sparse at this camera; more geometry per clump becomes flecks/stipple before it becomes grass |
| `field-fiber-shell` / `field-near` one-strip shell (03B4C2/C3; `03b4c2-*`, `03b4c3-*`) | 5200 field-owned shell records read as a smooth sheet with faint streaks; width/lift/view-thickness variants near-invisible or dark stipple. **Least wrong — kept as the baseline** |
| Mesh-only alternates: alpha stand-ins, billboard clusters, volume cards (03B4C4; `03b4c4-*`) | Sparse marks over a painted meadow |
| Texture-backed atlas cards, field-cell aggregation + density/placement/scale tuning (03B4C5/A/B; `03b4c5-texture-backed-grass-volume/`) | Repeated stamps/flecks at wrong scale over exposed flat meadow; midground unmoved; placement/scale-only tuning insufficient |
| Few large texture-carrier sheets (03B4C5B2) | Hard straw/wire islands, exposed ground, abrupt depth transition — edge energy overshoots as stick structure, not soft body |
| Many micro-blade carriers, 28k micro cards (03B4C5B3) | Mostly invisible or pixel grit; density/count is not the missing variable |

### Judged in the fixed close lab (`03b4c5-close-foreground-lab/`)

| Family | Verdict |
| --- | --- |
| Camera/crop/proxy scale repair (lab-route, scale-repair) | Rejected as "unfair scale" — the missing variable is the body, not the framing |
| `texture-volume` cards — matrix winner + continuity repair + alpha/cutout/dither render models (body-architecture-matrix, body-continuity-repair, body-alpha-render-model) | Least wrong of the matrix but hanging-curtain / hay-mat islands; shape repair loses body or makes starburst cards; every alpha semantic keeps card silhouettes or erases the body |
| Non-card per-record fibers — `field-fiber-body`/`field-fiber-bundle` (field-fiber-body-architecture) | Remove card artifacts by deleting the visible body; sparse regular pins at 0.13–0.15x target edge energy |
| Dense field-cell/subcell micro-sources (field-fiber-source-topology) | ~1M triangles for 0.17–0.21x target edge energy; still isolated clumps and ruler/marker posts |
| Source-attached strand/woven mats (continuous-strand-body-representation) | Empty centers, perimeter fan/card patches, wrong scale, repeated comb grouping |
| Field-owned material-only strand domain (field-owned-strand-material-domain) | Continuous but flat paint with marker posts exposed; ~0.05x edge energy |
| Field-owned shell geometry (field-owned-body-silhouette-layer) | Oversized card/stamp swipes over flat paint |
| Field-owned micro-strand geometry (field-owned-micro-strand-silhouette) | 52k target-scale micro-strands collapse into isolated yellow fleck clusters — near-parity with the rejected shell |
| Field-owned continuous strand/nap texture (field-owned-continuous-strand-texture) | Flat green terrain with faint diagonal scratches |

Endpoint of the ladder: stop approximating, reproduce the False Earth close
material in its native three.js/WebGPU/TSL stack first (the `AA` slice), then
translate the winning variables. That is where PR #3 picked up.

## Visual provenance

- **`assets/target-battle-map.png`** — the requirement. The reference vista
  David supplied (a cool foggy Icelandic/Hebridean highland valley: dense
  cool-green meadow foreground, rolling hummocks, layered grey ridge walls in
  heavy haze, cold inlet right, flat overcast sky). Every comparison crop and
  edge-energy metric in the ledger was measured against crops of this image.
  It reconciles with the warm Aegean `aesthetics` register via the
  neutral-albedo + environment-preset split above.
- **`assets/water-fog-reference/haze-gerstner.png`, `albedo-overcast.png`** —
  archived water-work shots that defined the aerial-perspective contract the
  fog slice was required to reuse (distance `haze01`, detail fade, mix toward
  the environment haze color).
- **`assets/03b4-evidence/`** — the rejection evidence itself:
  target/candidate/diff crops, contact sheets, comparison reports, and stats
  JSON for every family in the ledger. `false-earth-close-material-reference/`
  holds the supplied False Earth close-up the AA slice was to reproduce.
- **`visualizations/target-vs-current.html`** — the Slice 00 palette-lock
  board: target vs the then-current battle render, with the neutral-albedo
  chip proposals.

## Where the work continues

`specs/battle-map-style/` — fresh start, procedural sim-side map generator on
the photoreal (three.js WebGPU + TSL) substrate. Required reading from here:
the rejection ledger and meta-findings above (the failure modes are
substrate-independent), the grass field data contract in
`packages/game-renderer/src/battle/grassField.ts`, and the PR #3 salvage at
`pr-3-review`.
