# Shared landscape quality

Status: implementation active; foundations01–03 and crown owner06 complete; campaign crown/water accepted, merged battle consumers and final visual acceptance open. Updated: 2026-09-22.

Make the campaign landscape meet the supplied reference's quality and bring the same character to battle: connected ridges and valleys, ground that becomes mountain, vegetation that belongs to its slopes, and coherent water and lighting. Battle matches the location's character; it does not reconstruct campaign geography.

## Next Agent Prompt

Use `/Users/david/dev/game/.worktrees/map-landscape-quality`, branch
`codex/map-landscape-quality`. Keep this single worktree and one GPU capture lane.

**Current pickup: finish production-owner retirement, then remaining landscape
quality and integrated acceptance.** The [presentation checkpoint](assets/slice-12/presentation-checkpoint/README.md)
reconciles22 campaign captures, with exact repeats across two scoped runs. Label
fault injection now follows snapshots so it cannot perturb later card paint.
The camera uses CSS zoom consistently across DPR, and an independent fixed-pixel
click selects a real raised Aguntum city at both densities. This is scoped input
and camera evidence; broader lifecycle and final art remain open. The [regional natural preview](assets/slice-14-production/preview-owner/README.md)
now uses the production world, with matched visual review and exact repeats of both regional images.
Clay/surface controls remain explicit diagnostics. The [CSS-density policy](assets/slice-12/css-density/README.md) now preserves
labels, cards, scenery, figures and input speed across DPR, with six exact
repeated images. Next: corrected turf readiness and remaining mountain form.

The [joined water pass](assets/slice-08/battle-ocean-join/README.md) now removes
the mapC field/ocean intersection, shares their near-edge response, and passes
native/software motion, phase return and six exact software snapshot repeats.
The [lake-distance fix](assets/slice-09/lake-view-distance/README.md) is accepted
for distant glints. Flat water detail, soft coastal fringes and final composition
remain open; do not spend another spectrum-polish pass before the mountain test.
The direction shuffle was rejected on actual images despite better isotropy.

The [turf consumer](assets/slice-13/turf-current/README.md) now follows the
TypeGPU camera and grass publication. Its full52-check run, exact cold boots,
edge repeats and post-review readiness correction are scoped verification;
material/composition quality remains open. The [budget-edge pass](assets/slice-07/budget-edges/README.md) now softens
woodland selection boundaries, with two exact regional repeats. Raw whole-map retirement and its migrated production
water film are implemented but await browser acceptance. A separate sharper
rock-projection control has passed CPU checks but has not been rendered.
Inspect `throwaway/active-pickup.txt` and live processes before changing the single
capture lane; keep public assets linked rather than duplicating build trees.

Continue the remaining mountain, presentation and coast gates and
one integrated acceptance matrix. Reuse each matched capture across the slices
it proves rather than running duplicate08/09/13/15 reviews. Keep shared neutral
data/policy and backend-local adapters: Three campaign, TypeGPU battle.

| Accepted evidence | Remaining work |
| --- | --- |
| Foundations01–03, crown owner06, bounded residency | Complete landscape reference quality |
| [Chart atmosphere](assets/slice-10/chart-atmosphere/README.md), nine snapshots | Presentation checkpoint repeated; final composition remains open |
| [Label-owner controls](assets/slice-12/label-owners/README.md) | Broader presentation/interaction matrix |
| [Joined water](assets/slice-08/battle-ocean-join/README.md), lake and motion controls | Flat detail, shoreline fringe, other shores and composed quality |
| [Native adapter/liveness](assets/slice-15/adapter-identity/README.md) | Headful release timing and common hardware budget |
| [Current turf consumer](assets/slice-13/turf-current/README.md), exact scoped captures | Final composed art and hardware acceptance |

Recent mountain amplitude, scalar valley-remap and dominant-support controls were
rejected. New CPU-only Gaussian-support and base-slope-gated detail controls also
failed: steeper/fragmented interiors, and the gate adds large transition cliffs.
Do not repeat them. See existing slice04 assets and current scratch reports.
Claude is currently unavailable because its OAuth session expired. Continue
authorized work with available agents; do not change authentication or billing.

### Global TODO

- [x] [01 — World-stable surface and evidence](slices/01-surface-contract.md)
- [x] [02 — One-world campaign composition proof](slices/02-campaign-composition-proof.md)
- [x] [03 — Bounded terrain residency and joins](slices/03-bounded-terrain.md)
- [ ] [04 — Connected mountain form and foothills](slices/04-mountain-form.md)
- [ ] [05 — Shared rock, scree and grass response](slices/05-terrain-material.md)
- [x] [06 — Tree crown representation and scale](slices/06-crown-shapes.md)
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
