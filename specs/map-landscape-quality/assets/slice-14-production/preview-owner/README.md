# Regional preview uses the production world

Natural real-region previews now delegate terrain residency, material, water,
scenery seating, lighting and shadow ownership to `PhotorealCampaignWorld`.
The route only supplies real source data, existing scenery policy, an explicit
review camera and readiness/lifetime handling. No production API or backend
switch was added. Fixed-cell clay and adjacent-surface fixtures remain deliberate
diagnostics; they must not dictate the natural preview's terrain resolution.

The matched controls are [Alps](before-alps.png) and [Italy](before-italy.png).
Current images live in the canonical [Alps](../../../../../web/shots/campaign/landscape-alps.png)
and [Italy](../../../../../web/shots/campaign/landscape-italy.png) baselines.
Actual camera pose, world and projection matrices match exactly in both pairs.
[Pixel measurements](pixel-metrics.json) establish a real change; [repeat](repeat.json)
records zero changed pixels in both independent candidate captures.
[Consumer checks](checks.json) prove production composition, ready terrain,
seated scenery, source-consistent center rays and clean GPU validation.

Root and independent matched-image review accept these as useful natural
previews, not final landscape quality. Production water is grayer than the old
preview's saturated blue, peripheral terrain is smoother, and some tree shading
and distant silhouettes differ. Major landmarks and layers remain aligned.
Dark pointed coastal shadows, cyan fringes, thin rivers and soft folds already
exist in the matched controls. The older canonical images also contained earlier
art changes; their missing pale rocks and slight framing changes must not be
attributed to this migration.

The producer now uses view-filtered scenery and streamed terrain instead of a
fixed patch. Submitted tree counts change2249→2454 in Alps and1125→1243 in Italy;
that is a different spatial working set, not new tree placement policy. Readiness
waits for complete residency, a fresh shadow frame and submitted GPU work; resize
invalidates it. Disposal releases the production world and its worker. Clay and
surface construction remain in their existing branch; preserved `cell=8` callers
explicitly request clay. Static review confirms that boundary; this checkpoint
does not claim a new full diagnostic screenshot sweep.

Lab typecheck, scene syntax, root build, formatting and independent code review
pass. This closes the duplicate natural-preview owner, while wider production
journeys, final art and hardware acceptance remain open.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Alps continuous terrain/trees | Fixed mesh triangle count, tree count and hardcoded mountain-prop metadata | Production substrate/depth, ready residency, resident tiles, seated scenery and matching ray revision | Prove the actual owner after migration. **moved** |
| Italy continuous terrain/trees | Same fixed-patch metadata gate | Same production-owner contract | Keep regional transfer on the same owner. **moved** |
| landscape-alps snapshot | Independent preview composition and older art baseline | Current production composition, exact repeated capture | Matches the game's landscape owner; existing quality gaps remain. **moved** |
| landscape-italy snapshot | Independent preview composition and older art baseline | Current production composition, exact repeated capture | Same ownership transfer with water/shore/tree composition visible. **moved** |
