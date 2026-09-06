# Far material response: controlled diagnosis and grounding correction

The brighter-looking far result contained two different mechanisms. Missing
contact occlusion was a real material-grounding mismatch and is corrected.
Thin bright boundary bands are filtered-normal interpolation at the retained
96-pixel raster resolution; they are not stronger broad-face material response.
This evidence does not approve distance silhouette quality or the provisional
no-MSAA coverage policy.

## Controlled comparison

`battle-model-far-grounding` uses the production crowd, atlas bake, material,
lighting and camera owner. All tiers use the same detailed source geometry,
original normals, weights and idle VAT pose. Only the authored material is
uniform smooth blue (roughness 0.08, metallic 0); faction mask is zero. This
removes material boundaries and differing LOD geometry as confounders.

Camera direction matches atlas tile 5 exactly. A 2,000m camera with adjusted
field of view preserves the projected center scale while reducing perspective
variation: near-orthographic, not literally orthographic. Far is explicitly
selected at this inspection framing, not reached through genuine production
camera-distance LOD. The scene asserts the selected representation and tile.

The seven committed shots separate near self-shadow, near contact AO, far
grounding, dead gating, half-float property precision, and matched nearest
property filtering. No normal/facing replacement is used. The corpse diagnostic
tests the grounding gate on the existing representative far pose; it makes no
claim that corpse pose/animation fidelity has improved.

## Findings

- With near self-shadow disabled, the old far path differs by up to 15 RGB
  codes on stable lower-body interiors (p99 14). Disabling near contact AO too
  reduces this to one code. Height-dependent ambient grounding, not a different
  PBR response, explains the lower-body discrepancy.
- The corrected living comparison covers 3,557 stable interior pixels:
  max/p99 one code, mean maximum-channel difference 0.905. Dead gating agrees
  with authored-only near AO on 3,593 pixels: max/p99 one code.
- Normal/contact and ORM half-float control differs from production on stable
  interiors by at most one code (4,018 pixels, mean 0.053). Increasing precision
  is not the missing broad-face shading correction.
- The matched upper-face color is 72/112/166. Upper-body luminance p99 is
  107.3948 for unshadowed near, filtered far, and nearest-filter far. Dominant
  frontal-face colors are near 35/73/130 versus far 35/73/129.
- Nearest filtering on **all** property attachments removes the bright boundary
  bands while leaving stepped geometry coverage. Because upper-body albedo and
  ORM are uniform and contact is one, the removed bands isolate interpolated,
  renormalized normals across rasterized face boundaries. The spatial highlight
  distribution changes; broad-face peak response does not. This is a diagnostic
  control, not a proposed production filter change.
- Far still does not cast/receive mesh shadows. The near-only cast shadow is
  visible separately from surface shading; this pass does not add shadow cost.

## Correction and lifetime

One shared helper owns the existing posed-vertex contact response. Near calls
it with rolled local height. The atlas calls it with its weighted posed local
height and stores the interpolated factor in previously unused normal alpha,
separate from authored ORM occlusion. Display unassociates it by the same
coverage as all other properties and gates it with an explicit living-instance
attribute. Dead instances disable it, so corpse roll cannot incorrectly darken
a whole body. Representative-pose limits remain unchanged.

Atlas allocation is unchanged: 11,796,456 nominal bytes per appearance including
three RGBA8 mip chains and depth. The living attribute adds four bytes per
allocated instance capacity; it is not an extra atlas. The test-only half-float
control intentionally changes format and is not represented by the production
allocation estimate. No live readback or completion wait was added.

## Regression proof and change ledger

Removing only the far contact multiplication reproduces the old failure:
1,759 far pixels change, living interior p99 rises to 14/max15, and living/dead
grounding response becomes zero. Restoring it passes without tolerance changes.
Near snapshots are byte-identical across this mutation and restoration.

- `impostorLayer` facing/anchor test: now also verifies living/dead attribute
  upload; the previous facing and ownership behavior is unchanged.
- New grounding scene: pins the seven controlled render states, exact selected
  tile, unchanged atlas allocation, frozen pixels, living response, corpse gate,
  and precision comparison. Old missing grounding is explicitly red.
- Existing far snapshots require intentional lower-body shading refresh during
  integration. No near baseline should change from extracting the helper.

Raw green and mutation reports accompany this file. Independent image review
separately identifies the bottom-row boundary bands and coarse silhouettes;
it does not establish visual parity or art acceptance.

The six-panel `grounding-contact.png` is ordered near, unshadowed near,
authored-only AO near, far, half-float far, dead far. The three-panel
`filter-contact.png` is unshadowed near, production filtered far, nearest-filter
far. Both are nearest-neighbor crops of the committed full-frame shots. A second
fresh image-only reviewer identifies the middle filtered panel's stronger
fragmented bands and finds the outer panels closer; see `filter-review.txt`.
Independent focused code review found no correctness regression. Typecheck,
five focused unit tests and the seven-shot strict browser scene pass on the
shared integration checkpoint, with no page errors.
