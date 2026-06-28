# Campaign Acceptance Pass

## Contract

Campaign polish is accepted by focused evidence: the feedback screenshots are
addressed, the old renderer's strengths are preserved, and WebGPU is visibly
better where it diverges. This pass does not replace the slice-level workbench
checks; it confirms the independently accepted pieces still work together in
the real campaign.

## API Seam

- `web/scenes/campaign-webgpu-lod.mjs`
- screenshot regression harness under `web/`
- screenshot critique and compare-screenshots skills for visual review
- slice workbench outputs for roads, labels, terrain color, terrain relief,
  forests, and road-life props

## Human Review

Review the final contact sheet/crops for close Rome, central Italy natural,
central Italy faction view, mountain/forest crop, road-life crop, and fog crop.
Also review the accepted workbench outputs so regressions in the small seams do
not get hidden by the busy campaign map.

## Verification

- Run the campaign WebGPU scene bundle.
- Confirm every prior slice has a recorded screenshot-critique result.
- Run one final screenshot critique with cropped focus on labels, roads,
  mountains, forests, terrain color, and road-life props.
- Record accepted crops in this spec, not broad temporary report folders.
- Verify that no generated report folders or broad temporary image dumps were
  added to the spec.

## Done

- [ ] All starting feedback images have explicit before/after notes.
- [ ] No active blocker remains for label spacing, Ostia/Portus road/label,
  Rome south road continuity, natural terrain color, mountains, trees, or road
  life.
- [ ] Every slice has passed an unbiased screenshot critique with full images and
  tight crops.
- [ ] Workbench outputs and real campaign outputs both pass.
- [ ] The spec links only durable review evidence.
