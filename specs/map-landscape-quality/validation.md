# Review and verification contract

## What constitutes visual acceptance

The [reference](assets/landscape-reference.png) is the quality floor. The [regional spike verdict](verification.md) is a rejection of final art, not an approved baseline. A slice must improve its named variable; the completed feature must meet the whole landscape target in production.

Hold camera, viewport, DPR, world/seed, surface revision, environment, time, and unrelated settings fixed while comparing a variable. Use both full frames and the relevant crop. Reference and real geography differ: compare landform/material qualities; do not optimize a full-frame pixel distance to a different coastline. Matching current screenshots is a reproducibility test only.

Each visual slice runs, in order:

1. Its named scene and behavioral checks through `web/scene.mjs` and `snapCheck`.
2. Direct inspection of the actual PNG plus 2×–4× feature crops.
3. `compare-screenshots`: candidate versus prior and reference, with relevant telemetry and an explicit less-wrong/both-wrong verdict. Keep a full frame so a crop cannot hide regressions.
4. An unprimed `screenshot-critique` as the last visual acceptance check. Inspect and resolve high-confidence findings; record remaining wrongness and the slice that owns it. An in-scope failure requires another iteration, not a re-bless.
5. After an intentional baseline update, repeat on SwiftShader with zero pixel differences. Retain evidence under the feature assets as well as active harness baselines.

Show milestone shots with `preview-shots` or the app artifact panel. Checkpoints are non-blocking: allow a short response window while doing independent work, then decide from evidence and continue. No permission question or five-minute idle wait is required. Close unattended Preview windows before proceeding.

## Fixed review subjects

Existing prototype regions and cameras are defined in [campaignLandscape route](../../apps/renderer-lab/src/routes/campaignLandscape.ts); preserve those shots as historical evidence. Slice 01 creates the canonical fixture/camera registry for subsequent comparisons. Use existing production camera rigs for production gates rather than copying formulas into a test.

| Subject | What must be visible | Reference region, in original 1280×720 pixels |
|---|---|---|
| Mountain form | Dominant crest, secondary ridges, valley and broad foothill in the same frame | x220–760, y190–710 |
| Rock/grass material | A sunlit rock face, a shaded face, and a gentle green shelf | x260–640, y280–620 |
| Woodland | Dense interior, irregular edge, sparse outliers, and isolated crown scale | x690–1250, y0–220; x90–340, y450–700 |
| Shore structure | Mountain-to-sea meeting, beach, narrow inlet, river mouth | x560–980, y330–650 |
| Water response | Nearshore turquoise, offshore darkening, broken surf | x770–1200, y240–570 |
| Plains detail | Open grass plus small vegetation/stone accents | x10–220, y130–390 |

Candidate crop bounds come from the fixture's semantic landmarks, not copied reference pixels. The numeric reference boxes are review guidance, not image classifier thresholds.

Production campaign coverage includes regional Alps and Italy, Aegean/island or narrow-channel geography, a dry southern region, a river mouth, and a wetter northern region. Test natural and political views, fog on/off, overview, full tilt, maximum supported zoom, and one yawed view. Preserve city coordinates and road connectivity across those views. Battle coverage includes generated highland, wooded, and coastal scenes plus authored A/B/C and campaign city/crossing handoffs where available.

## Existing commands

From the worktree root:

```sh
bun run --cwd web typecheck
bun run --cwd web test
bun run --cwd web build
VERIFY_GPU=1 VERIFY_URL=http://localhost:5186 node web/scene.mjs campaign-landscape tree-canopies terrain-water
```

Other existing gates to reuse selectively: `campaign-production`, `campaign-visual`, `campaign-map-alignment`, `campaign-lod`, `campaign-collision`, `campaign-frame`, `campaign-polish-roads`, `campaign-polish-markers`, `campaign-save-load`, `campaign-handoff`, `campaign-conquest`, `campaign-reinforcements`, `battle-ground-turf`, `battle-terrain-seams`, `battle-terrain-controls`, `battle-seating`, `battle-camera-zoom`, and `renderer-lifecycle`. Inspect their current metadata and assertions before modifying them; a source-path/renderer-label assertion may need to become a behavioral assertion during migration.

Hardware checks use the existing scripts `bun run --cwd web perf:renderer:hardware` and `bun run --cwd web perf:30k`, with `VERIFY_URL` targeting this worktree. Their existing hardware classification/metrics stay authoritative. Extend them rather than create a parallel report owner.

Any new scene names in slice files are **planned deliverables**, not commands that already work. Register them through the existing scene discovery structure. If Rust changes, run the repository wasm build before browser checks. Physical-terrain changes are outside scope, so any unexpected Rust terrain/hash/matchup change is a regression to investigate, not a new baseline to accept.

## Behavior that must survive migration

- Actual pointer clicks at DPR1 and DPR2 hit raised terrain/entities at the rendered pixel, including off-center tilted views. Do not use the same projection helper for both stimulus and oracle.
- Roads reach endpoints, stay on land according to the render mask, cross only existing bridges/crossings, and follow the same surface as cities and selection.
- City/army labels, cards, allegiance/faction treatments, fog hiding, territory clipping, selection and marker depth remain legible and correct.
- Campaign movement, encounters, conquest/reinforcement state, save/load, and campaign→battle→campaign preserve existing behavior.
- Generated and authored battle terrain physics, fixed seeds, passability, deployment lanes and crossings remain unchanged. Shared visual masks never write `speed`, `rough`, or Rust `height`.
- Repeated navigation does not grow owned resources; surface revisions and stale tile completion cannot strand the view in permanent low detail or a loading loop.

When tests or snapshots move, produce the `change-report` behavior ledger from the actual diff: previous behavior, new behavior, why, and provenance. Never claim the baseline moved merely because the new renderer is different; tie each move to an intended visual or interaction change. Each substantive implementation slice closes with `review` and an independent Codex review.
