# Current ownership and visibility controls

The four geographic composition snapshots now follow the accepted rock material
and fitted shadows. Their prior baselines dated to31cb9a00, before45f22efb's rock
imagery anded5f0bc2's shadow fitting. No renderer or scene code changes in this
checkpoint. [Measurements](pixels.json) show the current captures match the earlier
reported actual images exactly; root and independent review inspected those pairs.
Framing, ownership quadrants, roads, terrain silhouette, fog footprints and entity
membership remain consistent. Fractured rock and darker, softer object shadows
are the visible differences; individual commit attribution is not isolated.

The [strict repeat](repeat.json) has zero changed pixels in all four captures.
Ownership updates still change157745 pixels, toggling political color off restores
natural terrain exactly, and moving visibility changes182761 pixels substantially.
Visible entity replacement and visibility persistence during detail admission pass.
The existing300ms fixture waits did not cause observed drift in these runs; this
is not a general asynchronous-lifecycle proof. Full regional geography and final
production lifecycle acceptance remain open.

Before images are retained here; current images live under
[canonical campaign shots](../../../../../web/shots/campaign/).

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| campaign-ownership | Older rock and shadow image | Current material/shadows; exact repeat | Reconcile accepted rendering changes; same territory alignment. **moved** |
| campaign-ownership-changed | Older rock and shadow image after owner change | Current image with same visible ownership update | Preserve the mutation oracle. **moved** |
| campaign-visibility-west | Older visible-west composition | Current rock/shadows; same city and one woodland | Preserve fog/entity membership. **moved** |
| campaign-visibility-east | Older visible-east composition | Current rock/shadows; same army and one woodland | Preserve visibility movement and tile-admission checks. **moved** |

No thresholds, behavioral assertions, source data or simulation state changed.
