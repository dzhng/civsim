# Legacy campaign reference baselines

Reference renders of the campaign map kept from the Babylon→WebGPU campaign
migration, archived here when the migration cross-check was retired. They are a
**record, not a gate** — nothing in the active harness reads them.

They were the targets the WebGPU campaign was held against while the renderer was
swapped (broad structure: sea/land, roads, labels, fog, political wash). The
campaign is WebGPU-only now, so the live readability/structure floors live in the
`campaign-*` scenes under `web/scenes/campaign/`; see
[`../verify-campaign.mjs`](../verify-campaign.mjs) for the archived harness that
produced these.
