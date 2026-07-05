# Battle Identity — how you read a battle (and a campaign map)

Shipped 2026-07-05. This record holds the why and the invariants; the code
holds the how. Entry points are named per section.

## What shipped

How a battle (and the campaign map above it) is READ:

- **Soldiers look like men.** Bodies render as bronze/iron/linen/leather/skin
  materials; faction color lives only on accent parts — shield, helmet crest,
  tunic band, saddle — never as a broad team tint.
- **Every flag is a real 3D standard.** One shared asset — pole, gold finial,
  crossbar, vertical swallowtail cloth with gold trim and emblem, waving on
  deterministic wind — flies in the battle world (one per unit), on campaign
  army stacks, and over every settlement. No DOM/SVG flags, no static flag
  panels anywhere. Flat 2D flag glyphs survive only as map UI (far-zoom
  marker chips, label rows).
- **The battle readout is text-status chips ONLY** (revised 2026-07-05:
  David cut the floating stat bars — the flag carries identity, the unit
  card carries stats). Chips render from a glyph atlas as camera-facing
  billboards at the pole top, at one readable screen size, and HIDE at range
  instead of shrinking (below ~24px of cloth width the row would out-scale
  the flag it garnishes). No per-unit DOM UI exists in battle. The review
  ladder (single / pair / row / wrapped max) is pinned by the banner-gallery
  scene's `banner-chips-*` baselines.
- **Selection reads as flag glow plus green rings** (campaign green) under
  each soldier of the selected own unit; the glow is an emissive lift on the
  3D standard's cloth.
- **The camera opens with your army at the bottom** (default yaw -PI/2) and
  zooms to soldier eye level (~2-3m) at the close endpoint.
- **Arrows fly visibly and archers draw and loose**; projectile z is exported
  from the sim and effects lines carry per-vertex depth.
- **One menu path into battle** (Custom Battle) with an azure/crimson faction
  picker; deep links remain for harnesses only.

## Visual provenance (`assets/`)

These images were the requirement — "done" meant "reads like these":

- `ref-rome2-banners.png` (Total War: Rome 2 battle screenshot, supplied by
  David) — vertical swallowtail cloth on a crossbar pole, faction field +
  emblem, gold trim, standing IN the world. Drove the standard's silhouette,
  the centered-on-pole cloth, and the decision that flags are world geometry.
- `ref-rome2-campaign-banner.png` (Rome 2 campaign screenshot, supplied by
  David) — a tall settlement banner towering over Roma. Drove the campaign
  settlement banner's existence and its proportion (banner towering over the
  town core, planted at the city mast).
- `ref-rome2-closeup.jpeg` — soldiers reading as materials with faction on
  accents; camera just above helmet height. Drove the accent-only faction
  rule and the close-camera endpoint.
- `ref-medieval2-battle.jpg` — armies as steel masses with heraldic accents.
  Drove the "identity at distance without broad tint" target.

Comparison verdicts were always "less wrong than before vs the reference",
never pixel-match.

## Where the code is

- **Shared standard asset**: `packages/game-renderer/src/models/shared/
  standardAsset.ts` — `buildStandardMesh(tier)`, `STANDARD_SIZE_TIERS`
  (battle-unit / campaign-army / settlement-banner), `standardWaveDisplacement`
  (the wave's TS reference), `STANDARD_WAVE_BACK_LOBE`, livery/seed/phase
  helpers. Contract tests: `web/tests/standardAsset.test.ts`.
- **Raw-WGSL consumer** (campaign + review lab): `standardPass.ts` beside it —
  `SharedStandardPass`, instanced, per-instance livery RGB + scale override;
  its WGSL `clothWave` must match the TS reference exactly.
- **Battle consumer** (three.js/TSL): `packages/photoreal-renderer/src/battle/
  standardLayer.ts` — instanced, TSL wave twin, selection emissive.
- **Battle readout**: `packages/photoreal-renderer/src/battle/readoutLayer.ts`
  (bar quads + chip glyph atlas + enemy plates + selection frame);
  state contract and gallery states in `web/src/battle/readoutState.ts`;
  scene upload + legibility floors in `web/src/battle/scene.ts`
  (`standardScale`, `GALLERY_UNIT_FOR_STATE`).
- **True-projection measurement**: `BattleRenderer.pxPerWorldAt`
  (`web/src/battle/renderer.ts`) → `PhotorealBattleWorld.pxPerWorldAt`.
- **Campaign integration**: `web/src/campaign/renderer.ts` —
  `campaignSettlementStandardScale` / `campaignArmyStandardScale` (exported;
  the renderer-lab review routes consume them), garrison/settlement
  no-double-up in `buildEntityFrame`.
- **Faction table**: `packages/game-renderer/src/battle/factionColors.ts`
  (`BATTLE_FACTIONS`) — the ONE color source for battle team identity; the
  campaign passes its real faction RGB as per-instance livery instead.
- **Review gates**: scenes `shared-standard-models` (asset sheets),
  `battle-3d-standards` (tactical/approach/eye), `banner-gallery`
  (readout state grid + pan-rigidity), `campaign-models` (entities incl.
  `standard-liveries`); baselines under `web/shots/models/shared/standards/`,
  `web/shots/battle/`, `web/shots/models/campaign/`. Wave-cycle GIFs:
  `web/shots/models/shared/standards/anim/` via
  `web/shots/models/scripts/standard-wave.mjs`.

## The reasons (what the code can't tell you)

**Why flags are world geometry and the readout is GPU billboards, not DOM.**
The original ship drew the flag as a DOM SVG and the bars as a DOM overlay.
David rejected it: a DOM overlay pins to whole pixels and composites in a
different pipeline, so it jitters against the smoothly-moving world, and it
can never be depth-tested (a flag that can't be occluded by a hill reads as
UI, not world). CSS `matrix3d` was considered and rejected as worst-of-both:
perspective-ish in stills, still sees no depth buffer, blurs under transform.
The readout is camera-FACING on purpose — perspective comes from the world
anchor and distance scaling, never from tilting the plate (a tilted bar is
unreadable at grazing angles; Total War does the same).

**Why legibility is measured, not curve-fit.** The battle rig is a ~77°-down
telephoto for most of its zoom range and swoops to eye level only at the end
(the camera slice's design). Consequences discovered the hard way: (a)
zoom-keyed scale curves lie — the floor must measure real
pixels-per-world-meter through the renderer's live perspective camera
(`pxPerWorldAt`); the rig's chart-style `worldToScreen` diverges in the swoop
regime and once produced 16m poles and sky-high readouts at eye level. (b) At
vista zoom, no honest world-scale flag can read — the flags are small and the
readout carries team identity there. (c) The Rome-2 reference look lives in
the swoop regime, pinned by the `battle-standards-approach` baseline.

**Why the cloth can never pierce the pole.** The wave's toward-pole lobe is
capped at quarter amplitude (`STANDARD_WAVE_BACK_LOBE`) — wind presses the
banner forward. With a symmetric wave the cloth swung through the pole and an
unprimed critique read it as "a diamond stabbed by a stick". A unit test pins
the cap; the cloth hangs poleRadius+0.03 in front of the pole.

**Why trim and emblem ride the cloth's wave field.** They are strips floating
just in front of the cloth; if they sample a different weight field (or stay
rigid) they visibly slide off the billowing cloth. Everything on the cloth
samples ONE physical-z weight field, and long strips are subdivided so they
bend with the cloth grid instead of staying straight between endpoints.

**Why the campaign scale rules are exported functions.** The renderer-lab
review routes once re-hardcoded the banner scale ratios at seven sites, so
production tuning silently no-opped in the review shots. Same lesson as
`CAMPAIGN_FIGURE_SIZE`: the review surface must track production by
construction. Also: the city MESH scale and the STANDARD scale are different
owners — building-relative sample points use the mesh scale.

**Why one faction table, keyed by team index.** Team defaults (azure team 0,
crimson team 1, neutral gold) reproduce the pre-existing blue/red/neutral
exactly, so every harness that passes no faction stays byte-stable. The
picker and the campaign override colors only; the team integer pipe is
untouched. Faction color localizes to accents because the old broad tint
destroyed the "men, not chess pieces" read; impostor/LOD legibility is
guarded by mask-localization tests (`web/tests/soldierMaterials.test.ts`).

**Determinism discipline.** Cloth wave time is an explicit input (`cam.time`
/ the photoreal world clock), phases are hashed from stable seeds, and every
snap pins scene time — a waving flag in a zero-tolerance screenshot suite
works only because nothing reads the wall clock.

## Invariants (violating these breaks the feature silently)

- The three wave implementations — TS reference (`standardWaveDisplacement`),
  WGSL (`clothWave` in `standardPass.ts`), TSL (`standardLayer.ts`) — must
  stay identical. The WGSL template and the TSL both consume
  `STANDARD_WAVE_BACK_LOBE`; the frequency/mix coefficients are still
  hand-coupled across the three.
- WebGPU caps a pipeline at 8 vertex buffers; the battle layers pack
  attributes deliberately (livery gold is a uniform; meta slots are shared).
  New per-instance data must reuse slots, not add attributes — the failure is
  a pipeline-creation error invisible to any test that only counts instances.
- Standards yaw-billboard to the camera; cloth yawed to unit facing is
  edge-on (invisible) from the battle camera.
- No CAST shadows on legibility-scaled battle standards — a scaled marker
  casting a building-length shadow betrays the trick. (The campaign standard
  keeps its small contact-blob ground decal; that is grounding, not a cast
  shadow, and campaign scales are modest.)
- Billboard anchors behind the camera must collapse (mirrored projection
  garbage otherwise); readout instance slots with no atlas entry must be
  zeroed, not skipped (stale buffer data rasterizes as orphan fragments).
- The flag itself is the unit marker; chips only ever ADD to it.
- Readout quads are UI, not world: opaque alphaTest-cutout material,
  `toneMapped=false`, `fog=false`, canvas atlas with `flipY=false` — the
  PhotorealMarkerLayer recipe. A `transparent: true` readout quad gets
  veiled by the transparent-pass ordering, the scene AgX grade desaturates
  chip colors, and default flipY mirrors a multi-row atlas so every cell
  samples its neighbor's padding (chips render as pale torn dashes — this
  exact stack of symptoms cost a long diagnosis; check these four flags
  first).
- The golden hash never moves for any of this — every piece is render-only.

## Dead ends (do not re-walk)

- **DOM flag + DOM bars** — shipped first, replaced; see reasons above.
- **Tilting standards toward the camera at vista pitch** (Total War map-card
  style) — implemented, filmed, rejected: reads as fallen poles.
- **Zoom-keyed legibility curves** — two attempts; both lied because the
  rig's zoom→distance mapping is nonlinear and back-loaded.
- **Coplanar duplicated backfaces for double-sided cloth** — z-fights and the
  dark-lit back randomly wins; the asset is single-sided with cull off and
  abs() lighting.
- **Chip widths from `text.length * k`** — under-sizes wide glyphs, which
  overflow their atlas cell and bleed into neighbors; widths come from
  `measureText`.
- **A pan-start snapshot for the readout rigidity gate** — byte-identical to
  the gallery frame by construction; the pair is gallery vs pan-end.
- **Gallery states on adjacent units** — column neighbors overlap each
  other's fixed-screen-size readouts and read as "torn" chips; states sit on
  units spread across both front lines (`GALLERY_UNIT_FOR_STATE`).

## Known follow-ups (recorded, not planned here)

- Chip declutter: overlapping units' chip rows can collide in screen space
  (no merge/fade behavior); at mid distance a chip row can out-scale the
  flag below it (the distance gate bounds but does not eliminate this).
- The kill-count chip renders as a bare glyph+number and reads as an
  orphaned token to fresh eyes; consider fusing counts into their parent
  chip (unprimed-critique finding, 2026-07-05).
- Garrisoned cities fly the garrison's standard at army scale — an argument
  exists for settlement scale in the occupier's livery (visual hierarchy).
- Emblem fidelity is a placeholder (disc + diamond + bar); real per-faction
  emblems are future work.
- Pre-existing, unrelated to this spec but observed during its gates:
  `battle-input dpr2 freezeAtTick` fails intermittently with a reproducible
  one-frame diff; battle-camera-zoom rig checks and several photoreal-sea/sky
  checks were already red on main.
