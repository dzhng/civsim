# Shared landscape quality

Status: implementation active; slices 01–03, 06 and 09 complete; production adapter adopted, acceptance still open. Updated: 2026-09-15.

Make the campaign landscape meet the supplied reference's quality and bring the same character to battle: connected ridges and valleys, ground that becomes mountain, vegetation that belongs to its slopes, and coherent water and lighting. Battle matches the location's character; it does not reconstruct campaign geography.

## Next Agent Prompt

Work in `/Users/david/dev/game-map-landscape-quality` on `codex/map-landscape-quality`.
The production shared world, source mountain band, removed campaign rock props,
card packing, painted label bounds and ungraded screen UI are integrated. Shared
rock image ownership and geometric dry normals now pass564 frontend tests,
14 material browser checks with four exact repeats, three exact campaign repeats,
and125 production lifetime checks. The final material build matches the ten
artifacts used in that lifetime proof. Overall landscape quality remains below
the reference; no final slice acceptance follows from these checkpoints.

**Current pickup:** integrate the small stable-toolbar-markup fix from
`/Users/david/dev/game-screen-ui-output` (only Toolbar.tsx and Toolbar.test.tsx).
A red/green test proves the old5Hz refresh recreated unchanged SVG nodes; caching
the static markup preserves nodes and button state. The isolated actual battle
vista and rock-face frames now both repeat exactly. Root's earlier captures had
small toolbar-only drift on both hardware and software. Use the corrected
capture setup: freeze when the debug API is installed, verify tick60, then wait
for the0.2s HUD refresh and portrait decode. Ordinary freezeAtTick cannot rewind
a run that has already passed its requested tick.

Then compare the four-file forest-edge age/size prototype in
`/Users/david/dev/game-landscape-understory` (server5214) with parent5213.
Extra-budget shrubs and bush relocation were rejected. The new prototype uses
existing eligible sites and caps: smaller campaign fringe trees and a smaller,
more shrub-heavy battle edge. Real WASM seeds7/8 preserve every site and all-prop
forest exclusions; campaign stays at32,000 candidates, with59 site substitutions
from smaller coastal footprints.13 focused tests/typecheck pass. Visual value
and composition with the rock material remain unverified. Claude hit a monthly
spend limit; root completed this prototype's tests and review locally.

For mountain shape, the accepted-field CPU diagnostic finds1km geometry reduces
p95 interpolation error73%, at roughly4× mesh storage. Global1km and a9-tile
close-view version both exceed the unchanged128MiB allocation ceiling during the
existing transition test; both remain unadopted. The temporary sampling worktree
was removed, with failures archived in throwaway/sampling-allocation-probes.
Use the existing campaign-landscape lab's `cell` parameter for a bounded visual
control before designing any production refinement. Preserve the accepted height
field: earlier source-crest, signed-profile and natural/apron alternatives were
rejected. Finer sampling cannot create a new drainage topology by itself.

After these visual passes, finish the direct label-coverage oracle, canonical
campaign/battle acceptance, controlled handoff, water motion and hardware timing.
The original regional white-pixel floor remains red and unchanged; historical
audit proves it cannot establish neutral-name coverage, so any replacement needs
positive/negative actual-owner controls. The actual10m battle camera still has a
recorded33.74ms p95 against33ms; profile it rather than weaken the gate. Whole-game
visual/performance review, choices consolidation and spec closure remain open.

The user authorizes implementation/refactoring/spikes without permission questions.
Keep the original `/Users/david/dev/game` untouched and use isolated worktrees.
Use Claude Opus for implementation when available; don't change billing settings.
Keep one GPU verification lane and freeze runtime/scene edits during captures.
Do not let historical or flat-ground screenshots stand in for actual mountain
views. Retired worktree cleanup recovered about44GiB; preserve remaining controls
and unrelated work. Each owning slice/evidence folder retains detailed limits.

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
