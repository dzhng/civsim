# 12 — Art Production Contract

## Contract

The placeholder contract becomes a real art handoff: artists can create assets,
load them in the workbench, see validation failures, and iterate without code
changes.

## API Seam

- `specs/webgpu-skinned-crowd/assets/ART_CONTRACT.md`
- Workbench validation schema.
- Import/bake/export commands from the asset workbench.

## Playable Deliverable

- Asset workbench with:
  - real asset pack import
  - side-by-side placeholder vs supplied art
  - skeleton/bone validation
  - clip preview
  - LOD preview
  - faction mask preview
  - screenshot/export pack

## Verification

- A sample “bad artist pack” fails with useful messages.
- A sample placeholder-derived “good pack” passes.
- Screenshots cover every individual body/model class, equipment silhouette,
  faction mask, LOD, mounted variant, and in-game readability view. A combined
  contact sheet is useful, but each model also needs an addressable screenshot
  entry so regressions name the exact missing class.
- Animation verification includes still frames and GIF-derived reference frames
  for every existing beat: idle/at-ease, walk, run, attack windup, attack
  strike, hit/recoil, death/crumple, mounted movement, and ranged firing.
- Legacy model baselines under `web/shots/baseline/models*` and animation GIFs
  under `web/shots/anim/` are reference evidence. Placeholder art is not final
  visual parity until these old silhouettes and animation beats are ported or
  intentionally improved.

## Must Stay Green

- Renderer still runs entirely on generated placeholders when no real art pack
  exists.
- Asset licensing/provenance is required for any non-generated pack.

## Human Feedback

This slice produces the thing you can hand to artists: the contract and the
workbench. Real art quality is judged here before it reaches the battle.
