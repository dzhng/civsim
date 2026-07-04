# Battle Identity — realistic soldiers, faction reading, Rome-2 banners

How you READ a battle: soldiers look like men (bronze/steel/linen/leather/skin),
faction shows only on accent parts (shield, crest, tunic band) and the banner —
a real 3D standard standing in the world (battle AND campaign), not a UI decal;
ownership shows through stat bars (only YOUR units have them); selection shows
through the flag glow plus campaign-green rings under every soldier; the camera
opens with your army at the bottom and zooms down to soldier eye level; arrows
fly visibly; archers draw and loose. One menu path into battle (Custom Battle)
with a faction picker.

**Visual north star** (`assets/`): `ref-rome2-banners.png` — vertical
swallowtail cloth banners on a crossbar pole, faction field + emblem, gold trim,
standing IN the world as 3D cloth. `ref-rome2-closeup.jpeg` — soldiers read as
materials, faction carried by shields/crests/tunics; camera just above helmet
height. `ref-medieval2-battle.jpg` — armies as steel masses with heraldic
accents at ground level. `ref-rome2-campaign-banner.png` — the campaign map's
settlement banner: a tall faction cloth flying over the city itself, readable
at strategic zoom.

## Next Agent Prompt

*Status (2026-07-05): slice 11 plants the shared 3D standard in battle. The
flag is gone from `UnitBanner`; one lit, depth-tested, waving standard is
uploaded per visible unit through the photoreal three.js world (instanced TSL
layer, `photoreal-renderer/battle/standardLayer.ts`), with selection lift on
the flag and DOM bars/chips temporarily projected to the 3D pole top.
Decisions the orchestrator review forced, binding for 12/13:
- WebGPU caps a pipeline at 8 vertex buffers; the layer packs livery gold as
  a uniform and one meta vec4 — new per-instance data must reuse slots, not
  add attributes (the first version failed pipeline creation at 9 buffers,
  invisible to sandboxed gates).
- Standards yaw-billboard to `camera.yaw` — cloth yawed to unit facing is
  edge-on (invisible) from the battle camera. Tilt-to-camera at vista pitch
  was tried and REJECTED (reads as fallen poles).
- Legibility floor measures the projection (`standardScale`, cloth-width
  target in px via worldToScreen deltas) — the rig's zoom curve is a 77°-down
  telephoto for most of its range (slice-06 design), so zoom-keyed curves lie.
  Consequence: at vista zoom flags are honest specks; team identity there is
  carried by the readout — slice 12's billboards inherit that duty explicitly.
  The Rome-2 reference look lives in the swoop regime (zoom ~8.5+), pinned by
  the battle-standards-approach baseline. No shadows on standards (a scaled
  marker casting building-length shadows betrays the floor).
Next: slice 12 moves bars/chips into world-anchored GPU billboards and
retires `UnitBanner`/`?test=banners` entirely. Do not reintroduce a DOM
overlay for the readout — David rejected it for registration jitter and no
depth interaction. An unprimed critique of the slice-11 shots found readout
defects slice 12 MUST fix, not port: the bar-stack floats with an air gap
above the finial (anchor the billboard to the pole, no gap); the stripes are
anonymous and near-identical for friend and foe (team identity must read
from the marker at a glance — the reference puts identity on the cloth and
keeps stats as a small garnish); enemy units at tactical zoom show NO marker
at all when they have no chips (enemy needs a minimal flag-colored presence);
chip rows overflow and wrap misaligned; the selection affordance on the
readout is nearly invisible. Slice 13 then ports campaign army/settlement
standards and clears the campaign pennant re-bless debt.*

*Status (2026-07-04): David reviewed the shipped banners — NOT DONE. The flags
on both maps must be real 3D standards like Total War (in-scene waving cloth),
not a flat DOM SVG (battle) or static flat panels (campaign). Slices 10-13
added: 10 builds the ONE shared 3D standard asset; 11 plants it in battle;
12 moves the readout (bars/chips) out of the DOM into world-anchored GPU
billboards — David rejected keeping a DOM overlay (registration jitter, no
depth interaction; CSS matrix3d considered and rejected as worst-of-both);
13 converts the campaign army standard and adds the settlement banner
(`ref-rome2-campaign-banner.png`). Do 10 first — both maps consume it; 13
also clears the pennant-restyle re-bless debt noted below.*

*Status (2026-07-03): first nine slices landed on main. 01 faction table;
02 soldier realism (broad tint dead, accents saturated, linen lifted off
terrain); 03+04 vertical banners + ownership bars (note: banner-gallery's
old baseline passed stale once — re-blessed in 09); 05+06 rings + camera
(REGRESSION CAUGHT IN 09: the 10m absolute close-distance cap also captured
the reviewFrame hook which pinned zoomT=1 — review shots filmed as giant
close-ups; fixed by pinning the review camera to the UNCAPPED top-down
endpoint, zoom=rig min, pitchBias from topDownPitch 1.35); 07 arrows+archer
(golden 0x1dc6e35d979b486c -> 0xa12f53b1d6420bac; the first arrow renderer
round-tripped screen space and fanned airborne arrows into viewCenter —
effects lines now carry per-vertex z; slice 08's menu/picker changes rode
into 07's commit cf2643bb via a shared-tree add -A, content verified);
08 single Custom Battle entry + azure/crimson picker; 09 full re-bless (17
vibe timelines, banner gallery, battle renderer scenes). Remaining known
debt: campaign scene re-bless for the pennant restyle happens with the next
campaign pass (campaign map shots unaffected by battle changes except the
marker pennant silhouette); write-anim GIF for the shoot clip is reviewable
via the arrows-close draw poses.*

Implement in order; 01 is the foundation (color unification) every visual
slice consumes. After each slice: gates green, screenshot-critique on new
shots, commit, update this section. The two named bugs (default yaw leaves the
player on the LEFT of screen; projectile z never exported) are in slices 06/07.
Work in this worktree; dev server for filming MUST be this worktree's on
:5174 strict-port (5173 belongs to another checkout).

- [x] 01 faction-table — one battle faction table (Azure/Crimson fake factions), 7 hardcoded color sites collapse onto it; baselines byte-stable
- [x] 02 soldier-realism — kill broad tint, accent-only faction (shield/crest/tunic), LOD/impostor legibility kept
- [x] 03 banners — Rome-2 vertical swallowtail (battle DOM SVG + campaign pennant), faction field
- [x] 04 ownership-bars — 4 bars (hp/cohesion/morale/stamina) on OWN units only; enemy = flag only
- [x] 05 selection-rings — campaign-green ring under each soldier of selected units (+ existing flag glow)
- [x] 06 camera — default yaw = -PI/2 (own army bottom); max zoom-in eye ~2-3m (absolute close endpoint)
- [x] 07 arrows+archer — projectile z export, visible arced arrows, archer draw/loose cycle; arrow regression scene zoomed-in + zoomed-out
- [x] 08 menu — single Custom Battle entry; faction picker (colors only for now)
- [x] 09 integrate — vibe re-bless (soldier look moves every frame), model sheets, close-spec
- [x] 10 standard-asset-3d — ONE shared 3D standard (pole/crossbar/finial + waving swallowtail cloth), size tiers, deterministic wind; model sheet + anim GIF
- [x] 11 battle-3d-banners — flag leaves the DOM into the scene (depth-tested, legibility floor at tactical zoom); selection glow moves onto the 3D standard; bars/chips stay DOM only until 12
- [ ] 12 readout-billboards — bars/chips become world-anchored camera-facing GPU billboards at the pole top (glyph atlas like campaign labels); UnitBanner DOM retired; gallery becomes a renderer scene
- [ ] 13 campaign-3d-banners — army standard mesh → shared asset; settlement banner over cities (tier-sized, Roma ref); garrison flag keeps the city anchor without doubling up

## Slice 10 handoff (landed)

The shared standard asset is `packages/game-renderer/src/models/shared/
standardAsset.ts` (geometry builder, size tiers `battle-unit` /
`campaign-army` / `settlement-banner`, livery from `battle/factionColors.ts`,
TS wave-function twin) with the raw WebGPU review consumer in
`standardPass.ts` (WGSL `clothWave` matches the TS twin; explicit `cam.time`,
hashed per-instance phase — no wall clock). Contracts slices 11-13 consume:
- **Weight channel `uvWeightMaterial.z`**: 0 = rigid (pole/crossbar/finial/
  shadow); >0 = rides the wave. Cloth is sewn at the crossbar (weight 0 at
  v=0) and swings hardest at the swallowtail tips. TRIM AND EMBLEM ARE NOT
  RIGID — they sample the cloth's weight field at their (u,v) so they billow
  with the cloth (a rigid border on waving cloth reads detached; strips are
  subdivided along their length or they stay straight while the cloth bends).
- **Cloth is centered on the pole** (Rome-2 silhouette), hanging
  poleRadius+0.03 in front. The wave's toward-pole lobe is capped at quarter
  amplitude (`STANDARD_WAVE_BACK_LOBE`; wind presses the banner forward) so
  the cloth can NEVER pierce the pole — an unprimed critique caught the
  piercing when the lobe was symmetric; a unit test pins the cap. Geometry is
  single-sided with cull off and abs() lighting — duplicated coplanar back
  faces z-fight and randomly win.
- Review gates: `web/scenes/models/shared-standard-models.mjs` (6 snapCheck
  baselines under `web/shots/models/shared/standards/`, framing + livery
  pixel metrics; review cameras/gate table live in the renderer-lab router
  beside the route, grass-config precedent — the asset module is
  production-contract only).
  Regen: `bun run --cwd web shots:models:standards`; wave GIFs:
  `shots:models:standards:anim` (both need a vite on a free strict port +
  `VERIFY_URL`, hardware Chrome per `web/shots/README.md`). Determinism
  proven: second no-update run = 0 px on all six.

## Recon facts — 3D standards (verified 2026-07-04, file:line current)

**Battle flag today.** Pure DOM: `UnitBanner` (`web/src/battle/unitBanner.ts`)
draws pole/finial/crossbar/cloth/emblem as inline SVG (:48-81), team fill from
the faction table's `bannerCss` (`factionColors.ts:15,21`), CSS at
`index.html:563+`. Screen-placed by `updateUnitBanners` (`scene.ts:475`),
bottom-anchored at the projected pole foot (`place()`, unitBanner.ts:157-161).
Bars/chips/selection live in the same component; the banner gallery
(`?test=banners`, `mountBannerGallery`) snapshots it engine-free.

**Campaign flags today.** Real meshes but static flat panels, no cloth
motion: army standard = `buildCampaignStandardMesh`
(`campaignEntityModels.ts:59-85`, white `panel3d` faces take faction livery),
drawn per stack by `CampaignEntityPass` (`entityPass.ts:86`); it is what the
figure LOD collapses to at far zoom (`renderer.ts:796-802`). The city mesh has
its own mast + static flag panels (`campaignEntityModels.ts:14-27`). A
garrisoned army's standard anchors on the city (`renderer.ts:969-974`).
Far-zoom armies also get a 2D GPU marker chip (`campaignMapMarkers`,
`renderer.ts:948-986`) — map UI, not a flag.

**Wind precedent.** Grass already does deterministic shader wind:
per-instance `windPhase` hashed from seed, `windStrength` uniform
(`grassPass.ts:184-199`, `grassField.ts:208`) — the cloth wave follows this
pattern, driven by pinned scene time so snaps stay byte-stable.

## Recon facts (verified 2026-07-03, file:line current)

**Soldiers.** Placeholder box meshes per class, 3 LOD tiers + octahedral
impostor. Parts painted per-vertex: torso=linen, head=helmet, arms/legs=leather,
crest/shield/saddle=ACCENT (L0 only). Materials already reconstruct
bronze/iron/linen/leather PBR from painted colors
(`crowdLayer.ts:344-388`). Team color: sim team → `inst0.w` →
`teamMix = mix(tierBroadMix[lod], 0.98, teamMask)` → albedo mix
(`crowdLayer.ts:327-361`). The all-red/all-blue look IS
`SOLDIER_PBR_VALUES.accent.tierBroadMix = [0.30,0.48,0.66]`
(`soldierMesh.ts:27`) + `IMPOSTOR_BROAD_MIX = 0.55` (`impostorLayer.ts:37`).
The WGSL twin already has the target behavior behind
`factionMaskStrength` (`skinnedPipeline.ts:205`).
`web/tests/soldierMaterials.test.ts` pins mask localization.

**Banners.** Per-unit DOM `UnitBanner` (`web/src/battle/unitBanner.ts`):
inline SVG horizontal pennant (path at :45), `TEAM_HUE = [#6f9ae8, #e0604f]`
(:22), bars = hp + cohesion ONLY (:64-74; morale/stamina are chips from
`scene.ts:430-456`), placed at `scene.ts:481`, CSS in `index.html:562-620`,
`.sel` glow exists. Campaign flags: `mapPass.ts:364-395` pennant band
(moved since — current sites in the 3D-standards recon above).
Campaign selection ring: GPU pass, GREEN `[0.31,0.82,0.39]`
(`selectionPass.ts`, colors at `renderer.ts:703,775`). Battle has its own
line-ring primitive `pushRing` (`web/src/shared/overlays.ts:65-91`); selected
units today get two GOLD rings at unit center (`scene.ts:1070-1075`).
Ownership: team 0 = player (`info[o+6]`), selection already player-only
(`scene.ts:756-758`).

**Colors.** SEVEN independent hardcoded sites, no shared constant:
`crowdLayer.ts:327-331`, `impostorLayer.ts:38-39`, `overlayLayer.ts:183-186`,
`minimapPass.ts:193-197`, `unitBanner.ts:22`, `unitCard.ts:14`
(+ campaign has a real faction model: `campaign/data.ts:23`, `mapdata.rs`).

**Menu.** FIVE battle entries (1v1 duel modal, 5v5, custom battle, campaign
handoff, URL deep-links) — `Menu.tsx:87-188`, `main.ts:440-478`. Custom battle
UI: `ArmyBuilder.tsx` + `armyBuilderState.ts` + `quickBattleCatalog.ts`
(`QuickBattleConfig = {mapId, teams}`); faction picker goes in the ArmyPanel
header (:116). Harnesses boot via URL params and pass NO faction — table
defaults keyed by team index keep them byte-stable.

**Camera.** `BATTLE_CURVE` (`cameraRig.ts:53-63`): close endpoint is
`distInFactor: 0.6 * fieldReach` (map-relative!) at `vistaPitch 0.28` → eye
~33-66m up at max zoom. Target: ABSOLUTE close distance ~8-12m → eye 2-3m.
Interactive open (`scene.ts:200-249`) never sets yaw → yaw 0 → +Y is
screen-RIGHT → player reads LEFT. The review hook already proves the fix:
`camera.yaw = -PI/2` (`scene.ts:1592-1594`).

**Arrows.** Sim computes full ballistics incl. z (`missiles.rs:98,295`), wasm
exports x/y/kind but NOT z (`game-wasm/src/lib.rs:319-332`), renderer draws
flat 1.4m ground-level 2D lines (`scene.ts:1076-1090`). No projectile layer in
photoreal-renderer.

**Archer.** No shoot clip exists (`schema.ts:1-9`); firing sets no flag
(`missiles.rs:283`); a loosing archer falls through to idle
(`scene.ts:1308-1324`). Full seam: sim loosing-ttl → wasm ptr → frame code →
`animationState.ts:36-56` → clip in `soldier-placeholders.mjs` (copy attack_a
block :61-64, both arms draw) → `ANIMS` in
`web/shots/models/scripts/soldier-animation.mjs`.

## Contracts

- **Faction = id + name + colors, keyed by team index for defaults.** Index
  0/1/2 reproduce today's blue/red/neutral EXACTLY so every existing baseline
  and harness holds without changes. Fake shot factions: `azure` (team 0
  default) and `crimson` (team 1 default). The picker overrides colors only —
  the team integer pipe (`inst0.w`, `unit.team`) is untouched.
- **Faction color lives on accent parts only** (shield, helmet crest, tunic
  band, saddle blanket) + the banner; body materials read as bronze/iron/
  linen/leather/skin. Distance legibility must survive: shield/accent
  presence at L1/L2 (extend geometry or a painted patch) and the impostor
  keeps a mask-driven tint (broad floor down, not to zero blind — sweep and
  eyeball at tactical zoom).
- **Flags are 3D, everywhere a flag flies.** One shared standard asset
  (pole + crossbar + finial + vertical swallowtail cloth) rendered in-scene —
  depth-tested, lit, cloth waving on deterministic wind — at three sizes:
  battle unit standard, campaign army standard, campaign settlement banner.
  No flat DOM/SVG flags, no static flag panels. Flat 2D flag glyphs survive
  only as map UI (far-zoom marker chips, label rows), never as the in-world
  flag. The battle readout (bars/chips) rides the standard as in-scene GPU
  billboards — world-anchored at the pole top, camera-FACING (never tilted;
  perspective comes from the anchor + distance scaling, clamped for
  legibility), same frame and depth buffer as the flag. No DOM per-unit UI
  survives in battle.
- **Ownership reads as: bars = yours.** Own units: hp/cohesion/morale/stamina
  bars above the banner. Enemy: banner only (chips like ROUT may stay — they
  are battle events, not private stats).
- **Selection reads as: glow + green soldier rings** (campaign green
  0.31/0.82/0.39), rings sized to soldier footprint (~0.5m), only for
  selected own units.
- **One menu path into battle.** Custom Battle. Deep links stay for
  harnesses/vibes (not user-facing).
- **Camera:** own army bottom at open (yaw -PI/2); max zoom-in eye height
  2-3m ("a tiny bit higher than a soldier"); zoom-out unchanged.
- **Determinism discipline unchanged** — every new/changed visual goes
  through snapCheck; vibe re-bless per write-vibe; adapter provenance per
  screenshot-regression.

## Gates (every visual slice)

Model sheets and/or focused scenes for the changed surface; the battle-lod
zoom-sweep test (team-colour share metric) for soldier changes; vibe crops for
in-battle look; unprimed screenshot-critique as the LAST check on any shot;
compare-screenshots against `assets/ref-*` where a reference exists (verdict:
less wrong, not pixel-match). Full walls: `bun run typecheck`, web tests,
`scripts/test-mechanics` (sim untouched except arrows slice: golden re-pin
expected there ONLY if the loosing flag changes sim state — keep it
render-only if possible; the ttl mirrors hit_ttl which IS sim state, so
expect one deliberate golden re-pin in slice 07).

## Risks

- Soldier-look changes move EVERY vibe/model/battle baseline — do the
  re-bless once in slice 09, not per-slice (slices verify on focused scenes).
- Impostor legibility at range is the known trade-off the old broad tint
  papered; the LOD sweep metric is the guard.
- Banner restyle touches campaign snapshots too (mapPass pennants).
- scene.ts is shared by slices 04/05/06/07 — serialize those (single lane).
- `soldier-assets` bake feeds VAT shared by every surface; clip additions
  re-bake — run the anim review harness before trusting.
- 3D standards (slices 10-13): waving cloth is time-dependent — every snap
  must pin scene time or the baselines flap; standards + readout billboards
  are new per-unit draws at tactical zoom (instance them, budget like the
  crowd); glyph-atlas text at chip sizes must be proven legible before the
  DOM dies (the campaign labels are the precedent, but chips are smaller —
  check at min banner scale); the engine-free banner gallery cannot survive
  slice 12 — its replacement renderer scene must land IN slice 12, not as
  debt; killing `buildCampaignStandardMesh`'s panels moves campaign entity
  baselines — re-bless rides in slice 13, not before.
