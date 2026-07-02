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
