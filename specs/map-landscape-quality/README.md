# Shared landscape quality

Status: implementation active; foundations01–03 complete; campaign crown/water accepted, merged battle consumers and final visual acceptance open. Updated: 2026-09-21.

Make the campaign landscape meet the supplied reference's quality and bring the same character to battle: connected ridges and valleys, ground that becomes mountain, vegetation that belongs to its slopes, and coherent water and lighting. Battle matches the location's character; it does not reconstruct campaign geography.

## Next Agent Prompt

Work in `/Users/david/dev/game/.worktrees/map-landscape-quality` on
`codex/map-landscape-quality`. Keep this one worktree; do not retain alternate
implementations or create sibling project folders. The integrated server uses5186.
Inspect live processes and keep source edits out of the single GPU capture lane.

**Current pickup: restore categorical battle terrain coverage.** In 13, convert
source material IDs to rock/forest/scree weights before both CPU vista joins and
GPU interpolation. Grass-to-forest blends must never invent rock. Keep source
simulation grids unchanged and make Three/TypeGPU consume the same neutral
coverage recipe. Use the production CPU seam test before pixel verification.
Scenery integration in 06 is independent; keep shared API seams on one owner.

The road surface-width pass is complete: 1,064 frontend tests and typecheck pass;
three production views repeat exactly on final code; both canonical geography
views repeat exactly, restore their toggles exactly, and report no page errors.
Fresh reviews accept the bounded width improvement. Evidence, CPU memory cost,
test/readiness changes and older-baseline drift are in
`assets/slice-11/road-surface-width/`. Bright road styling and sharp bends remain
outside that pass. Only eight focused geographic tests were added/retained; do not
mistake this for whole 11 acceptance.

**Main boundary:** merge `72177093` integrates `fa2e11bf`. Battle now uses TypeGPU
and a simulation worker; campaign retains Three. Share neutral terrain, appearance,
scenery, asset and environment policy. Do not restore the retired battle backend.
The merged runtime passed1,060 frontend tests, typecheck, production build, release
WASM build, independent review and campaign→16,000-soldier battle→campaign with no
page errors; see `assets/main-integration/verification.md`. This proves integration,
not final art or hardware performance.

**Priority after roads:**

1. Restore missing battle appearance contracts: categorical coverage before CPU
   seams/GPU interpolation, then common rock/water response. Dry beauty normals
   already come from geometry. The current patch plan is in13.
2. Restore battle tree variants, projected detail selection and a common visible/
   shadow leaf mask in 06. Campaign crown work remains accepted; the new battle
   consumer does not yet satisfy it. Battle water verification in09 belongs to13.
3. Improve the reference gap: mountains still read as similar rounded ribs with
   narrow grass streaks, dark hollows and isolated woods. Try the smallest isolated
   source-rock/slope gate to reveal existing gentle shelves; require unchanged
   clay/geometry and reject a mere recoloring of the same ribs. Do not repeat
   rejected fine-mesh or raised-crest experiments without new evidence.
4. Complete label-owner coverage, shore/water motion, whole-frame/camera coverage,
   lifetime and hardware gates, then whole-spec review and closeout. The sibling
   landscape-traversal scene has the same old-camera readiness pattern; correct
   that before trusting its fresh timing or capture evidence.

Accepted pre-merge terrain/label evidence is in
`assets/slice-04/downward-saddles/`; earlier material and lifetime evidence remains
in its slice assets. Those captures do not accept the migrated battle renderer.
The old regional white-pixel label gate remains open; replace it only with direct
positive/negative checks of the actual label owner. Earlier performance numbers
are historical; run the current hardware gate for final acceptance.

Claude previously reached its spending limit. Use Opus when available without
changing billing; continue other authorized work when that service is unavailable.

### Global TODO

- [x] [01 — World-stable surface and evidence](slices/01-surface-contract.md)
- [x] [02 — One-world campaign composition proof](slices/02-campaign-composition-proof.md)
- [x] [03 — Bounded terrain residency and joins](slices/03-bounded-terrain.md)
- [ ] [04 — Connected mountain form and foothills](slices/04-mountain-form.md)
- [ ] [05 — Shared rock, scree and grass response](slices/05-terrain-material.md)
- [ ] [06 — Tree crown representation and scale](slices/06-crown-shapes.md)
- [ ] [07 — Forests, edges and intermediate ground detail](slices/07-ecological-placement.md)
- [ ] [08 — Coasts, channels and river connections](slices/08-water-boundaries.md)
- [ ] [09 — Shared water depth, surf and motion](slices/09-water-response.md)
- [ ] [10 — Coherent lighting and landscape composition](slices/10-environment.md)
- [ ] [11 — Campaign roads, ownership and fog](slices/11-campaign-geographic-layers.md)
- [ ] [12 — Campaign entities, labels and selection](slices/12-campaign-entities-labels.md)
- [ ] [13 — Battle presentation adopts the shared landscape](slices/13-battle-adoption.md)
- [ ] [14 — Production cutover and owner retirement](slices/14-production-cutover.md)
- [ ] [15 — Whole-game visual and hardware acceptance](slices/15-acceptance.md)

## Review map

Open the self-contained [interactive roadmap](visualizations/roadmap.html) to inspect dependencies and compare the reference with the current spike. The ladder has three phases: prove the rendering foundation (01–03), establish landscape quality (04–10, with battle adoption at 13), and migrate campaign presentation and accept production (11–15). These are small verification passes, not fifteen new subsystems.

Tree representation (06) can follow 01 independently. Water boundaries (08) can follow 04 without waiting for vegetation. Battle adoption (13) can follow 10 independently of campaign overlays. Production adoption is now integrated; final acceptance still waits for both worlds.

## Fixed decisions

- Share neutral surface math, terrain/water response policy, model identities and environmental lighting across Three campaign and TypeGPU battle. Each world owns one composition; strategic geography and battle physics retain their existing owners.
- Mountains are connected terrain, not large rock props. Grass, scree and exposed rock follow the landform. Vegetation follows actual cover, slope and clearances.
- Match the reference's landscape qualities, not its exact coastline or pixel colors. Audit whole frames after judging individual variables. The existing aesthetic remains Bronze-Age Aegean.
- Retain current battle site recipes and authored templates. No new locale schema, map generator, erosion simulator, package dependency or renderer upgrade by default.
- Use bounded world-aligned terrain tiles and a coarse overview. Keep world seeds, shore distance and surface queries stable across windows. Exact bounds and physical/rendered query semantics are in [architecture](architecture.md).
- One camera/projection, environment, surface revision and renderer composition per world. No second GPU canvas, duplicate palette, lasting backend switch or campaign import from a battle-specific material implementation. Keep development routes thin; remove displaced owners when their last consumers migrate.

## Acceptance

Every visual slice explicitly uses [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md) for candidate-versus-target judgment and an unprimed [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md) as its last visual acceptance check. Green snapshots alone do not establish quality. Freeze the slice's other variables, use its named crops, and resolve in-scope findings. Publish shots during non-blocking review; keep working and decide from evidence without another permission request.

Production acceptance requires campaign interaction, overlay depth, labels, save/load and battle handoff to work on the new owner; battle movement, passability and generation must stay unchanged. It also requires full-frame quality review, deterministic repeat captures, stable residency and real hardware evidence. Selected performance targets and honest unavailable-hardware handling live in [architecture](architecture.md).

## Evidence and rationale

- [Architecture and ownership](architecture.md): contracts, units, water signals, budgets and retirement.
- [Validation](validation.md): reference crops, scenario matrix, commands and acceptance rules.
- [Research](research.md): primary sources and what their techniques actually justify.
- [Draft synthesis and fog audit](drafting.md): independent alternatives and decisions.
- [Reference image](assets/landscape-reference.png), [current Alpine spike](assets/spikes/current-alps.png), [current Italian spike](assets/spikes/current-italy.png).
- [Spike verification](verification.md): measured results and outstanding visual defects.
- [Merged presentation controls](assets/integration/geography-battle-standards/README.md): integration evidence for the current ownership, battle-material and standard checkpoints.
- [Superseded exploration](exploration.md): historical discoveries; this README owns the next action.

After all slices ship, use close-spec to archive the ladder as durable rationale. Do not mark the feature complete merely because the spec or regional spike is complete.
