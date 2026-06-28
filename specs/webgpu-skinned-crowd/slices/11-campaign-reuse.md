# 11 — Campaign Reuse

## Contract

Campaign army markers can reuse low-LOD soldier assets and animation contracts
without duplicating art or breaking campaign visual semantics.

## API Seam

- Shared asset manifest from the workbench.
- Low-LOD crowd preview module usable by campaign.
- Campaign adapter maps army class/faction/selection to the same asset contract.

## Playable Deliverable

- `/webgpu/campaign`
- Shows marching placeholder army figures, faction color, neutral standard,
  and green selection ring.

## Verification

- `web/scenes/campaign-webgpu-visual.mjs` passes or gets deliberately
  re-blessed after visual review; `verify-campaign-visual.mjs` delegates to the
  same scenario for compatibility.
- Snapshot cases cover our city, neutral city, road, diplomacy, class builder,
  city panel, and replenish toggle.
- Faction tint and selection rings remain readable.

## Must Stay Green

- Campaign ownership/livery semantics stay intact.
- Terrain, roads, fog, water, and city panels remain independently verifiable.

## Human Feedback

Review campaign readability separately from battle fidelity; the campaign needs
clear markers more than hero-detail soldiers.
