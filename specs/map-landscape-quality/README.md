# Shared landscape quality

Status: implementation active; foundations01–03 and crown owner06 complete; campaign crown/water accepted, merged battle consumers and final visual acceptance open. Updated: 2026-09-22.

Make the campaign landscape meet the supplied reference's quality and bring the same character to battle: connected ridges and valleys, ground that becomes mountain, vegetation that belongs to its slopes, and coherent water and lighting. Battle matches the location's character; it does not reconstruct campaign geography.

## Next Agent Prompt

Use `/Users/david/dev/game/.worktrees/map-landscape-quality`, branch
`codex/map-landscape-quality`. Keep this single worktree and one GPU capture lane.

**Current pickup: production-owner retirement, then one integrated acceptance pass.**
The user has directed us to stop repeated visual polishing and move forward.
Keep the accepted visuals; resolve pending fixes once, then prioritize functional
integration and final whole-frame review. The unverified rock-projection
sharpening experiment has been reverted. Do not restart mountain experiments.

The obsolete raw whole-map renderer is removed in the pending diff. Its water
motion check now exercises the real campaign. The corrected source mask passes
near-water isolation, but the control exposes excessive distant motion. The [motion correction](assets/slice-09/strategic-motion/README.md) now passes
its motion and phase-return contracts. [Composition fixtures](assets/slice-02/composition-current/README.md)
are reconciled and repeat exactly. The retained lab suite exposed stale source
audits and two model depth probes; repaired checks are now running. Current
conquest, handoff, reinforcements and save/load pass. [Native lifecycle](assets/slice-15/native-lifecycle/README.md)
passes all ten cycles. Hardware measurements follow on the final source build. Use one
GPU lane and linked public assets.

Accepted scoped evidence remains valid: [production preview](assets/slice-14-production/preview-owner/README.md),
[CSS density and input](assets/slice-12/css-density/README.md),
[overlay restoration](assets/slice-11/overlay-current/README.md),
[battle turf publication](assets/slice-13/turf-current/README.md),
[forest boundaries](assets/slice-07/budget-edges/README.md), and
[joined battle water](assets/slice-08/battle-ocean-join/README.md).
Reuse these checks where their contracts are unchanged. The full turf run plus
publication-race probe and representative corrected repeat do not need another
full replay solely because the wait was hardened.

Keep shared neutral data/policy and backend-local adapters: Three campaign,
TypeGPU battle. Final visual quality and integrated acceptance remain open;
scoped evidence does not close the entire spec. Claude authentication is
unavailable; do not change authentication or billing.

The finite remaining checks are tracked in [final integration closeout](assets/closeout-status.md).

### Closeout scope

The user's latest direction is to keep matching character sufficient and move
forward rather than continue isolated visual tuning. Freeze the accepted art
while finishing functional integration and the finite missing-view review.
Further mountain-form tuning, intermediate undergrowth, shoreline fringe polish
and lighting micro-adjustments are deferred. Intermediate growth was not
implemented; the original reference-quality floor has not been established.
Do not convert those facts into a claim that the original visual targets passed.
Clear regressions, broken interactions, incorrect grounding and lifecycle failures
remain in scope and must be resolved.

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
