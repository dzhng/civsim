# Slice 8 — battle open-sea integration notes (surface map)

Concrete integration facts gathered before implementation. The look is frozen
(S2–S7); this slice only reconciles seam/depth/MSAA/seating.

## The ocean edge (`battle/horizonPass.ts`)

- `setEdges(bounds, edges, field)` calls `buildEdge(builder, role, side, edgeX, y0, y1, field, baseZ)`
  for west (`edgeX=x0=ox`, `outward=-1`) and east (`edgeX=x1=ox+w*cell`, `outward=+1`).
  `baseZ = terrainHeightAt(field, edgeX, midY)` — the shoreline height datum.
- `role:'ocean'` branch (currently a flat `gradQuad`) covers world-XY:
  **X ∈ [edgeX + outward·(-24) … edgeX + outward·4000]** (near = 24 into the field, far = 4000 out),
  **Y ∈ [y0-400 … y1+400]**, sloping z `baseZ-4` (near) → `baseZ-80` (far).
- Whole horizon is ONE interleaved mesh (pos/normal/color, stride 40, uint16), drawn in one
  pipeline: `projectWorld3d(world, civsimBattleWorldDepth3d(world))`, group 0 = camera only,
  `gpuOpaqueColorTarget`, `triangle-list`/cull none, `gpuWorldDepthStencil('read-write')`,
  **NO `multisample`** (must add `gpuMultisample(shell.sampleCount)`).
- Retire `WATER_DEEP`/`WATER_SHALLOW` consts (lines 22–23) once the quad is gone.

## Wiring / camera / sun

- Live battle: `web/src/battle/renderer.ts` — `new BattleHorizonPass(shell)` (shell sampleCount=1),
  `setEdges(...)` in `applyTerrain()`; frame-graph entry `battle-horizon` (`world-opaque`/
  `world-depth`/`read-write`) is the FIRST world pass. Live edges from `deriveBattleEdgeRoles`.
- Lab: `/renderer/battle-terrain-3d?gate=coastal-scrub&view=west` — camera
  `{ x:-halfW+360, y:midY, zoom:0.95, pitch:0.26, yaw:-π/2 }` looks west/outward at the ocean.
  `coastal-scrub` = wasm map 2, edges `{west:'ocean', east:'cliff', N/S:'open-fog'}`, verticalScale 2.6.
- **Sun:** battle sets none → frameShell defaults (`DEFAULT_SUN_AZIMUTH/ELEVATION`) which MATCH the
  horizon shader's hardcoded `normalize(-0.40,-0.28,0.87)`. `waterShade` reads `sunDirection()` off
  the camera uniform (already populated). No `setSun` needed for battle.
- **Env preset:** battle uses no env; the daytime golden-hour Aegean is the fit → drive battle
  water with `WATER_ENVIRONMENTS.golden` (warm key, blue sea). Sky/clear stays the battle clear.

## Depth / seam

- Water plane MUST project with `projectWorld3d` and depth `civsimBattleWorldDepth3d(vec3(world, z))`
  where `z = baseZ + waveHeight`, so it seats under props/crowd (read-write depth) with no z-fight.
- Seam invariant (`horizonPass.ts:19-23`): the near water (lapping the turf at `edgeX+outward·-24`)
  must match the field's ground-water tint so no stripe shows at the shore. Reconcile colour/haze
  at the boundary; the field water (groundPass) is a flat blue tint today.

## Verify / re-bless

- `battle-terrain-blockers.mjs` drives `coastal-scrub&view=west` → `terrain-blockers/coastal-scrub-west.png`
  (primary ocean shot) and `river-and-crags&view=east` → `river-and-crags-east.png`. Both re-bless
  (animated water at a FIXED `t` for determinism — the route needs a `t` param like the lab).
- `terrain-3d/coastal-scrub.png` + `river-and-crags.png` have ocean in the far background → may shift.
- New scene `web/scenes/battle/water-open-sea.mjs` (coastal, VERIFY_GPU, fixed t).
- Must stay green: wall/cliff edges (`walled-plain-*`, `coastal-scrub-east`, `river-and-crags-west`).

## Bind-group note

The shipped `WaterFieldSource`/`WaterPlanePass` use **@group(1)** for the field (not the spec
draft's @group(2)). Reuse `waterPlanePass` (make base-z + rect configurable) rather than
re-implementing — the WGSL (`waterField`+`waterShade`+palette+env) is the single source.

---

## Attempt 1 findings (2026-07-01) — what worked, what remains

An implementation was built and reverted (kept off main) because one shoreline
seam could not be resolved cleanly in-budget. Everything below was VERIFIED
working — repeat it, then finish the seam.

**Worked (verified):**
- Swap the `role:'ocean'` gradQuad for a `WaterPlanePass` per ocean edge, seated at
  `baseZ`, drawn after the blocker mesh in the same `battle-horizon` world-depth pass.
  One shared `GerstnerWaterField`; `WATER_ENVIRONMENTS.golden`. Added
  `multisample: gpuMultisample(shell.sampleCount)`. Retired `WATER_DEEP/SHALLOW`.
- The animated turquoise sea renders correctly on both ocean edges (coastal-scrub
  west, river-and-crags east — `outward` ±1 both fine). `battle-renderer-default`
  (live battle) stayed green; perf stayed at budget (battle-max-crowd 8.33 ms with
  the 560² plane); deterministic at `cam.time=0`.
- **`WaterPlanePass` needed three surface-scale generalizations** (all default to the
  lab values → all lab scenes stayed byte-identical): `baseZ`; `hazeNear/hazeFar`
  (the battle camera stands ~360 u inland, so the lab's 55–300 haze range washed out
  the whole sea — battle wants ~500–1800); and **a shore-keyed depth ramp**
  (`shoreX`, `depthNear/Far`): camera-distance depth wrongly reads the inland-camera's
  shore as "deep blue"; keying depth on `abs(worldX - shoreX)` gives shallow turquoise
  at the shore, which is what matches the field water.

**The unresolved seam (finish here):**
- At `?view=west` (a near-horizontal grazing edge view) EVERY distance ramp — depth,
  haze, and the shore-fade `seaStrength` — compresses into a thin screen band, so each
  transition reads as a ruler-straight horizontal line. An unprimed critic repeatedly
  flagged the water↔water seam (organic grass/shore edges above it were fine).
- Tried: a `seaStrength` fade (waves+foam → flat calm shallow at the shore) and noise-
  jittering that boundary. It softened but did not kill the line, because the visible
  hard line is really the **haze** transition (near blue → far hazed-tan), not only the
  wave fade — the fix must jitter/feather ALL the ramps, or reduce reliance on them at
  this view.
- Deeper cause: the sea must reconcile with the FIELD'S OWN aerial haze (terrainPass
  `haze = vec3f(0.78,0.75,0.64)`, `aerial = smoothstep(120,420,dist)*~0.22`) and the
  field water tint at the boundary — this is genuinely shared with **S9 (coastal field
  water)**. Recommendation: do S8 + S9 together, or first unify the field water onto
  `waterShade` so both sides of the shoreline are the same material and the seam
  cannot exist. Also verify at a real gameplay 3/4 camera (not only the grazing
  `view=west` edge test), where the ramps do not compress as harshly.
