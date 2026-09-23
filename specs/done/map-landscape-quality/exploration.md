# Map landscape quality

> Superseded planning record. Follow the [implementation spec](README.md) for current decisions, sequence, and pickup point. This document preserves the exploration that preceded the spec; its open items are resolved or assigned there.

## Quality contract

The [user reference](assets/landscape-reference.png) is the minimum quality bar for the whole campaign landscape. Mountains and their connection to the terrain come first. Improvement over old baselines alone is insufficient. Connected ranges, broad foothills, slope-dependent grass-to-rock transitions, integrated vegetation, and coherent lighting also govern battle terrain.

The player must read landforms at gameplay scale. Scenery should form woodland masses with visible crowns; microscopic leaf geometry is not a substitute for coverage. Mountains need broad readable faces and valleys, not a carpet of ridged noise. Water needs depth and shore structure rather than a uniform halo.

## Exploration map

### Known knowns — user decisions

- Scope includes the whole campaign landscape, with mountains first, and the same integration principles on battle maps.
- Battles match the campaign location's terrain character while retaining independent tactical layouts. This avoids forcing strategic geography into deployment/passability requirements.
- Consolidate logic wherever it simplifies the final system, including migration to battle's rendering substrate.
- Make reversible implementation and visual choices autonomously. Spikes are authorized; do not turn these choices into permission requests.
- Keep all work and evidence on this worktree.

### Known unknowns — implementation decisions and open evidence

- **Chosen:** share the actual physical terrain material, lighting/environment, water response, and model registry. Preserve map-specific geometry generation, density, and gameplay constraints.
- **Chosen:** one surface per view owns rendered height queries, including the triangle diagonal. Changing interpolation silently can bury roads or float soldiers.
- **Chosen:** evaluate real Alpine and Adriatic/Apennine regions at fixed regional cameras before production integration. Add overview, close, political, and gameplay placement gates during promotion.
- **OPEN:** hardware frame-time and memory acceptance. The regional prototype records geometry work; production promotion requires hardware measurements with full overlays and crowds. Software rasterization is only the correctness oracle.
- **OPEN:** extending slope material treatment to authored/template battle maps. Their gameplay semantics must be inspected before assigning slope bands; the current spike does not change their terrain generation.

### Unknown knowns — visual interpretation, delegated to the agent

- The reference's cohesion comes from readable ranges, continuous foothills, irregular material transitions, vegetation masses, and directional shadows acting together.
- Keep the Mediterranean setting and strategic legibility. Camera, detail scale, and canopy density may differ between campaign and battle while material ownership stays shared.
- Judging a cropped terrain preview does not establish that the production campaign meets the quality bar. Full labels, roads, ownership, and armies remain part of acceptance.

### Unknown unknowns — discoveries from code and spikes

- Campaign mountains were separate meshes over a coarse height field, with a separate material and single-height anchoring. Removing those meshes alone previously left insufficient relief.
- Battle already provides connected generated landforms and slope materials. Its forest scatter approximates regions by circles, then checks water but not forest membership or slope at each tree candidate. That audit finding remains outstanding.
- Detailed tree cards lose visible coverage at strategic scale while their geometry and shadows remain expensive. A coarse crown mode in the shared registry provides readable coverage at much lower triangle cost; near-view leaf models remain available.
- The shared water helper returned linear albedo, but the terrain material converted the blended water a second time. The material now converts dry terrain first and blends water in linear space. A matched consumer fixture exposes the previous mismatch.
- Coarse biome shore distance smeared real coastal shapes in the first spike. The regional mesh now derives its shoreline from the campaign's detailed render mask.
- Material-detail frequency needs its own unit scale. Geometry, coast masks, water coordinates, and placement stay in the map's native coordinates.
- Full production migration remains substantial: campaign's raw GPU overlay passes cannot be layered over a second three.js canvas without losing common depth and picking. Port their data onto one world rather than introduce parallel canvases.

## Verification and visual review

See the [spike evidence and outstanding visual findings](README.md).

Use `VERIFY_GPU=1 VERIFY_URL=http://localhost:5186 node web/scene.mjs campaign-landscape tree-canopies terrain-water` for the narrow visual gates. Run without `UPDATE_SHOTS` after intentionally updating candidates to verify determinism. Unit surface tests live in [campaignLandscape.test.ts](../../../web/tests/campaignLandscape.test.ts).

Every accepted visual pass requires direct PNG inspection, a fresh unprimed screenshot critique, and comparison against the user reference. Pixel equality only establishes reproducibility. Keep unresolved critique findings visible; do not relabel a prototype as final art.

The current surface builder lives in [campaignLandscape.ts](../../../packages/game-renderer/src/terrain/campaignLandscape.ts); the review route composes existing battle rendering owners. This bounded regional builder is a spike, not a second authoritative campaign terrain store. Replace the old production relief owner when promoting the accepted design, rather than retaining both indefinitely.
