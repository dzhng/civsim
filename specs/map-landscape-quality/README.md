# Shared landscape quality

Status: implementation active; foundations01–03 complete; campaign crown/water accepted, merged battle consumers and final visual acceptance open. Updated: 2026-09-22.

Make the campaign landscape meet the supplied reference's quality and bring the same character to battle: connected ridges and valleys, ground that becomes mountain, vegetation that belongs to its slopes, and coherent water and lighting. Battle matches the location's character; it does not reconstruct campaign geography.

## Next Agent Prompt

Work in `/Users/david/dev/game/.worktrees/map-landscape-quality` on
`codex/map-landscape-quality`. Keep this one worktree and a single GPU capture
lane; inspect live processes before starting captures or replacing their build.

**Current pickup: finish battle tree variants/detail and migrated scene gates.**
The bitmap rock checkpoint is accepted: 1,072 tests, typecheck/build, five exact
battle repeats, three unchanged campaign views and independent review. See
[bitmap evidence](assets/slice-13/bitmap-rock/README.md). The [water conversion checkpoint](assets/slice-13/water-linear/README.md) also passes four exact repeats with unchanged dry ground. In06, the campaign detail thresholds were visually rejected for battle because they removed too much leaf silhouette; the refined battle profile is under verification. Keep shared selection logic and placement identity.

Campaign keeps Three and battle keeps main's TypeGPU renderer: share neutral
policy/data/assets, not backend wrappers or a restored battle backend.

Finish through four acceptance passes. Slice numbers identify owners, not twelve
separate projects or duplicate capture runs:

1. **Battle consumers (05–10/13):** finish rock and water response, stable tree
   variants and projected detail; judge composed highland, wooded and coastal
   production views. Leaf-mask consistency is already accepted.
2. **Campaign reference quality (04/05/07/10):** test the bounded source-rock/slope
   gate on fixed geometry, then judge actual mountain hierarchy, green foothills,
   woods and lighting together. Recoloring alone cannot accept deficient form.
   Do not repeat rejected geometry or size-only vegetation trials without new evidence.
3. **Campaign presentation and shores (08/11/12/14):** complete owner-aware label
   coverage, raised interaction/DPR checks, geographic overlays and the remaining
   coast/channel verdicts. Preserve accepted source, residency and road fixes.
4. **Integrated acceptance (15):** use its single matrix for full frames, motion,
   gameplay journeys, current hardware and lifetime evidence; then whole-spec
   review, choices consolidation and closeout. Reuse evidence across slice owners
   when it proves the same requirement, without narrowing any gate.

Before relying on them, reconcile the traversal camera-readiness check and the
battle shadow/turf scenes' retired stats/frame-settlement hooks with current
production contracts. Replace the legacy whole-frame label brightness oracle
only after missing-name and missing-card controls prove its owner-aware successor.

| Accepted checkpoint | Evidence | Acceptance still open |
| --- | --- | --- |
| Main renderer integration and campaign→16,000-soldier TypeGPU battle→campaign | [Main integration](assets/main-integration/verification.md) | Final art, current hardware and broader journeys |
| Connected terrain foundations and bounded campaign residency | 01–03 and [architecture](architecture.md) | Whole-frame reference quality |
| Downward saddles and crown design | [Saddles](assets/slice-04/downward-saddles/README.md), [crowns](assets/crowns/finish/README.md) | Broad foothills/composition; migrated battle variants/detail |
| Road surface width, fog update compatibility and settled geographic captures | [Roads](assets/slice-11/road-surface-width/README.md) | Geographic styling and full fog/overview coverage |
| Categorical terrain coverage and common leaf shadow cutout | [Coverage/shadows](assets/slice-13/coverage-shadow/README.md) | Other TypeGPU appearance consumers and composed acceptance |

Earlier performance and retired Three battle captures retain their original
scope; they do not accept the current TypeGPU renderer. Claude previously reached
its spending limit: use Opus when available without changing billing, and continue
other authorized work when unavailable.

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
