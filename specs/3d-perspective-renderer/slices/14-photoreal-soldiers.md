# Slice 14 — Photoreal soldiers

## Contract unlocked

Bronze/iron/linen crowds that survive both the close-up and the 30k vista: PBR
soldier materials, a real LOD/impostor ladder at photoreal cost, and grounded
contact. Deps: `11` (shadows to sit in); parallel with `12`/`13`.

## API seam

- **14a — PBR materials.** Per-class albedo/normal/orm/mask texture sets (already
  carried by the bespoke material bind groups — see the `soldier-materials` scene)
  onto the VAT crowd via node materials in
  `packages/photoreal-renderer/src/battle/crowdLayer.ts`: bronze/iron metalness,
  linen/leather roughness, faction accent masks **legible at gameplay zoom**
  (aesthetics: faction reads before class).
- **14b — 30k LOD/impostors + per-instance frustum culling.** Distance tiers +
  far impostors on the three crowd, **REUSING
  `packages/crowd-runtime/src/lod.ts` semantics** (tiers, hysteresis — the LOD
  policy owner does not fork). This **absorbs the deferred bespoke `04e`**
  (projected screen-height with a min-size floor) — build it once, here, on the
  surviving substrate. Far impostors replace the frameShell marker parity layer
  from `08`. **Frustum culling is explicit scope, not a free rider:** three culls
  an `InstancedMesh` as ONE whole-mesh bounding sphere, so per-instance culling
  needs CPU instance compaction against the `camera3d` frustum (what the bespoke
  prong did — 13.4k of 30.5k culled at vista) or GPU-driven culling; pick on
  evidence, publish culled counts in stats, and note that `11`'s shadow cascades
  re-render the crowd — cull against the UNION of view + active cascade frusta or
  shadows will pop at the screen edge. The brute-force spike headroom is spent by
  `09`–`13`; this is the ladder's true perf lever, judged by the `04f` gate at
  mid AND vista.
- **14c — grounding/contact AO.** Cheap contact darkening under soldiers (analytic
  contact term or blob AO node) — the "standing on the ground, not pasted" fix;
  distinct from `11`'s cast shadows.

## 14a implementation note

Status: implemented on branch `codex-14a`; 14b/14c remain separate.

- Channel mapping found and used: `albedo = cColor.rgb`, `normal = cNormal`
  skinned/yaw-rotated into world space, `orm = occlusion/roughness/metalness`
  in the canonical `skinnedPipeline` order, `factionMask = high-blue cColor`
  accent channel. The placeholder kit has no texture files yet, so the
  photoreal crowd consumes the existing vertex-channel encoding rather than
  inventing a parallel texture path.
- Metal/rough choices: bronze helmet/tip regions `metalness=0.82`,
  `roughness=0.46`; iron blade regions `metalness=0.92`, `roughness=0.38`;
  linen `roughness=0.90`, leather `0.74`, skin `0.66`, default `0.84`.
- Faction legibility approach: albedos stay neutral; the knob is accent
  saturation/mix (`broadMix=0.30`, `maskedMix=0.98`) so the team read survives
  gameplay zoom while high-blue mask areas still identify crests/shields.
- Stats: `PhotorealBattleWorld.stats().crowd.material` publishes the channel
  mapping, PBR constants, and per-class kit material names for scene assertions
  and reviewer inspection.
- Verification added: `web/tests/soldierMaterials.test.ts` pins the material
  identity, channel order, bronze/iron/faction mask decoding, and rough/metal
  ordering. `web/scenes/battle/photoreal-lighting.mjs` now asserts the material
  identity for the four fixed-time preset crops.
- Local limitation: this sandbox rejected local server binds (`EPERM` on both
  `::1:5174` and `127.0.0.1:5174`), so the SwiftShader scene/baseline run is
  ready but not executed here:
  `UPDATE_SHOTS=1 VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5174 node scene.mjs battle-photoreal-lighting`.

## 14b implementation note

Status: DONE on branch `codex-14bc` (resumed from a codex partial; audit verdict
below).

- **Audit verdict on the inherited diff.** KEPT: the LOD-tier mesh set
  (`createPlaceholderSoldierMeshTiers` L0 full / L1 drops crest·shield·weapon /
  L2 drops arms), the octahedral-impostor promotion (`impostorLayer.ts` from the
  verified spike, sampled-texture faction path, no double-linearize), the
  per-instance CPU culling against the UNION of view + CSM cascade frusta
  (`shadowRig.cullingFrusta()`), the `crowdLod.ts` seam consuming `lod.ts`, the
  spike deletions, and the stats histograms. FIXED: (1) distant faction read —
  the L1/L2 meshes DROP the crest/shield accent geometry that carried the team
  colour up close, so at range soldiers went dark-neutral and the perf
  crowd-visibility gate + a `screenshot-critique` both flagged unreadable
  far-crowd; the fix ramps the broad body tint UP at coarse tiers
  (`accent.tierBroadMix [0.30,0.48,0.66]`, L0 == the locked 14a value) and tints
  the WHOLE impostor silhouette toward faction (`IMPOSTOR_BROAD_MIX 0.55`), so
  far units read as Total-War coloured blocks — "faction before class" holds at
  distance. (2) the `battle-renderer-default` retired-route check asserted
  `markerLayer === 'none'`, the pre-14b state; at the duel default zoom a 2 m
  soldier subtends ~3 px so the whole crowd is legitimately the far impostor
  tier — re-blessed to accept `far-lod-impostor`.
- **LOD policy owner unforked.** `crowd-runtime/lod.ts` owns tiers/hysteresis/
  min-size floor; `crowdLod.ts` calls its `assignCrowdLodsByDistance` (projected
  on-screen height, min-size floor = the absorbed `04e`); the crowd never grew a
  second policy.
- **Culling.** CPU instance compaction; a soldier survives if its bounding
  sphere hits ANY of {view frustum} ∪ {active CSM cascade frusta} so off-screen
  casters keep their shadows. Stats publish `culling {input,visible,culled,
  viewFrusta,shadowFrusta}` + assigned/visible tier histograms.
- **Spike DELETED (refactor-clean, nothing spike-shaped survives):**
  `packages/photoreal-renderer/src/battle/impostorSpike.ts`,
  `apps/renderer-lab/src/impostorSpikeRoute.ts`, the `/renderer/impostor-spike`
  route entry, `web/scenes/battle/impostor-spike.mjs`, and
  `web/shots-spike/impostor-spike-{mesh,impostor,split}.png`.
- **Gates.** typecheck; `test:unit` 71 pass incl. re-derived screen-size-driven
  `photorealCrowdLod.test.ts` (monotonic coarsening + min-size floor +
  hysteresis); SwiftShader battle suite green incl. the `battle-terrain-elevation`
  seating tripwire `match=true` (0.46 % snapshot drift); `photoreal-lighting` /
  `-parity` / `-shadows` crowd crops within tolerance (≤0.93 %, no re-bless);
  `lod-tiers` monotonic + `meshVariants 60`. Pop-check ±5° yaw: team pixels
  3001/2977/3082, verydark≈0 — no impostor tile pop.
- **Perf (hardware, apple/metal-3, 30 560 soldiers + dense foliage):** mid 3.63 /
  vista 3.59 ms (12e baseline 5.85 / 7.89 → vista −4.3 ms, mid −2.2 ms — the
  ladder's perf lever). Crowd-visibility team pixels mid 7 718 / vista 13 702,
  BOTH above the pre-14b full-mesh baseline (2 562 / 5 288) — the far crowd reads
  faction MORE clearly than the wasteful full mesh, at half the frame cost.
- **Non-blocking human-eyeball checkpoint (record + decide on evidence):** a
  fresh `screenshot-critique` on the vista still notes (a) the melee centre reads
  busy — mostly the dense vista grass fill + the tightly-packed real crowd, not
  the soldiers; (b) impostors are flat "coloured tiles" at extreme vista (the
  legibility-vs-volume trade of a strong far tint — the readable choice; the
  alternative was dark blocks); (c) a red-vs-blue profile asymmetry that tracks
  facing (octahedral side vs front tile) + the perf harness's row-alternating
  synthetic peasant grid, not a per-faction bug. None block 14b (gate = perf +
  tier correctness); all are tuning candidates for David's checkpoint.

## 14c implementation note

Status: DONE on branch `codex-14bc`.

- Analytic contact AO on the crowd material `aoNode`: darkens ONLY indirect
  (sky/IBL) light over the bottom `band` = 0.42 world units of the local mesh
  height, to `1 − strength` = 0.45 at the contact line, fading to 1.0 above.
  Rides `aoNode`, so it never touches the sun's direct term — that is 11's cast
  shadow, a distinct owner. Living soldiers only (a prone corpse's whole body is
  low, so it is gated by the corpse flag). Constants live on
  `SOLDIER_PBR_VALUES.contactAo` for scene/reviewer assertion.
- Cheap: a few inline TSL ops, zero new draw calls, no ground decal (so no
  z=0-under-terrain alignment risk); frame-time-neutral in the 30k gate above.
  Grounds the feet/ankles so soldiers read as standing on the ground, not pasted;
  the `photoreal-shadows` `shadow-contact` crop drift stays within tolerance.

## What the human can run / see

`/battle` at close and vista zoom; `/renderer/photoreal-crowd` (07's route, now
material-real); `write-model-sheet` contact sheets re-pointed at the photoreal
route.

## Verification

- One visual variable per sub-slice: 14a crop **`soldier-close`** (near-zoom rank;
  model-sheet cells) + **`formation-mid`** re-judged; 14b **no visual variable** —
  its gate is perf + tier correctness; 14c crop **`soldier-contact`** (feet/ground
  seam at mid zoom). Out of scope: animation cycles (write-anim owns motion),
  terrain (`13`).
- 14b gates: `lod-tiers`-style monotonicity unit test re-derived onto the photoreal
  crowd (screen-size driven, min-size floor); LOD tier histogram published in stats;
  `battle-lod` scene re-derived; **perf gate at mid AND vista framing** — this is
  THE perf checkpoint (30k + materials + shadows + foliage + sea all on); ledger
  entry with tier counts.
- 14a/14c: `compare-screenshots` vs `battle-formations-melee.jpg`;
  `screenshot-critique` last on every shot; `write-model-sheet` gate for the class
  roster.
- Standing gates: seating tripwire `match=true` (positions come from the sim-side
  heightfield — nothing about seating may move), battle suite, campaign
  byte-identical, deliberate re-bless.

## Must stay green

Standing gates 08b→17. `crowd-runtime/lod.ts` remains the LOD policy owner —
`crowdLayer` consumes its assignments; it does not grow a second policy.

## Research

- The spike's `crowd.ts` VAT pattern (promoted at `07`) — per-class VATs, mounted
  classes, faction masks.
- Octahedral impostors (t-pose sheets); three `BatchedMesh` / indirect-draw
  examples (fallback if per-class meshes multiply draw calls).
- `packages/crowd-runtime/src/lod.ts` + its tests (the semantics to re-derive).

## Human feedback that would change this slice

Faction legibility vs realism trade at mid zoom (accent saturation); impostor pop
distance ("I can see them switch") — both `preview-shots` checkpoints,
non-blocking, ~5 min, decide on evidence and record.
