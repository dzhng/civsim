# 02 — Placeholder-First Asset Workbench

## Contract

Artists and developers have a self-contained browser workbench for soldier
assets: generated placeholders, sample asset packs, upload/import, validation,
and live 3D preview. Renderer progress never waits on real art.

## API Seam

- `packages/soldier-assets/src/schema.ts`
  - manifest types for skeletons, clips, meshes, materials, LODs, masks.
- `packages/soldier-assets/src/validate.ts`
  - pure validation returning structured errors/warnings.
- `packages/soldier-assets/src/placeholders.ts`
  - deterministic generated placeholder kit.
- Workbench app route module:
  - `apps/webgpu-lab/src/router.ts` (`/webgpu/assets`)

## Playable Deliverable

- `/webgpu/assets`
- Panels:
  - asset pack list
  - paste/file/drop manifest validation lane
  - validation report
  - 3D preview/turntable
  - clip scrubber
  - faction mask preview
  - export/bake status

Current checkpoint:

- `/webgpu/assets` loads the deterministic placeholder kit, validates it,
  renders a skinned preview, and shows the intentionally broken sample errors.
- The same route now exposes a pasteable `manifest.json` area, JSON file picker,
  drag/drop zone, and structured import result. Imported manifests update
  `window.__webgpuLabStats.stats.imported` so scenarios and humans see the same
  contract status without adding code for each art pack.

## Verification

- Unit tests validate good and bad manifests.
- Scenario opens the workbench and previews the generated placeholder kit.
- `VERIFY_WEBGPU=1 node scene.mjs webgpu-lab-routes` checks the import UI is
  present and drives the validation button on a bad manifest.
- Screenshot captures the 3D preview and validation panel.
- Bad sample pack produces deterministic error messages.

## Must Stay Green

- No battle renderer depends on real art.
- Placeholder pack is committed or generated deterministically.

## Human Feedback

This is the fast art iteration hub. You should be able to hand this route to an
artist and ask them to make all red validation items disappear.
