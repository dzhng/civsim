# Shared landscape quality

Status: implementation active; slices 01–03, 06 and 09 complete; production adapter adopted, acceptance still open. Updated: 2026-09-21.

Make the campaign landscape meet the supplied reference's quality and bring the same character to battle: connected ridges and valleys, ground that becomes mountain, vegetation that belongs to its slopes, and coherent water and lighting. Battle matches the location's character; it does not reconstruct campaign geography.

## Next Agent Prompt

Work in `/Users/david/dev/game/.worktrees/map-landscape-quality` on `codex/map-landscape-quality`.
Production uses the shared rendering foundation; overall visual quality still
falls short of the reference. Keep every open slice below open until its own
acceptance evidence is complete.

**Current pickup:** test a downward-only saddle variation along the dominant
ridge, holding all heights at or below the parent. The previous crest prominence
control improved summit distinction but amplified walls/fins; it is not adopted.
The original runtime formula is restored. Evidence and exact rejected formula
are in slice04's `crest-prominence` folder. No alternate worktree is retained.
The lab `targetZ` parameter pins the actual camera during shape changes. Use the
same real Alps regional/close clay and natural frames before broader validation.

The finer-mesh clay comparison is rejected: close stair steps improve but regional
character does not, at3.5× triangles. Evidence is in slice04's
accepted-field-sampling/visual folder. No resolution/residency redesign follows.

The forest-edge size prototype is rejected: regional Alps inspection and fresh
review found smaller scattered trees but no material improvement to dense woodland
boundaries. Three candidate campaign captures completed with no page errors;
no final ecological acceptance follows. Evidence remains in
`throwaway/edge-age-campaign/`. The prototype and obsolete comparison worktrees
are deleted, rather than retained as alternatives.

Next priorities: mountain/forest visual quality, direct label coverage checks,
coast/water motion and campaign/battle handoff, then full visual and hardware
acceptance. The original regional white-pixel gate remains red; replace it only
with positive/negative checks of actual label owners. The10m battle camera still
has a recorded33.74ms p95 against33ms; profile rather than weaken the gate.

Evidence: adopted rock material has14 browser checks, exact campaign repeats and
125 lifetime checks. Stable toolbar markup makes both full battle frames repeat
exactly. On2026-09-21 all565 frontend tests passed; the previously timed-out
allocation check also passed independently, with its timeout and budget unchanged.
Detailed evidence remains in each slice's assets; this is not final acceptance.

Only this task's integrated landscape worktree remains. The four remaining side
worktrees, their branches, and older backup archives were deleted at the user's
request. Do not refer to them as available controls. Rejected work must not be
retained just in case. Fetched staging66cf9293 is already an ancestor.
Claude previously reached a spending limit; use Opus when available without
changing billing. Continue autonomously, keep one GPU lane, and preserve all gates.

### Global TODO

- [x] [01 — World-stable surface and evidence](slices/01-surface-contract.md)
- [x] [02 — One-world campaign composition proof](slices/02-campaign-composition-proof.md)
- [x] [03 — Bounded terrain residency and joins](slices/03-bounded-terrain.md)
- [ ] [04 — Connected mountain form and foothills](slices/04-mountain-form.md)
- [ ] [05 — Shared rock, scree and grass response](slices/05-terrain-material.md)
- [x] [06 — Tree crown representation and scale](slices/06-crown-shapes.md)
- [ ] [07 — Forests, edges and intermediate ground detail](slices/07-ecological-placement.md)
- [ ] [08 — Coasts, channels and river connections](slices/08-water-boundaries.md)
- [x] [09 — Shared water depth, surf and motion](slices/09-water-response.md)
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

- One physical rendering foundation: campaign adopts the existing `PhotorealWorld` substrate. Share surface math, terrain/water response, model identities and environmental lighting. Keep strategic geography and battle physics in their existing owners.
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
