# Visible-view sun shadows

Accepted bounded fitting improvement. Campaign uses the existing battle single-sun
rectangle fit over its complete canonical ground-view footprint. Sun direction,
environment, assets, materials, bias and 1024-square map size are unchanged.
Snapping the sun and target together in light space stabilizes shadow texels.
The view is not clipped to map bounds, because that changes projection scale
while panning. Battle retains its previous fitting math without stabilization.

The matched parent/final images and crops isolate this change on the same merged
entity inputs. Fresh review accepts visibly attached city shadows and sampled
boundary-pan continuity. Regular roof bands remain a limitation for further
lighting work; this is not full environment or reference-quality acceptance.

Verification: 516 web tests, typecheck, 12 focused shadow/camera tests, independent
code review, city picking/removal/reinsertion and four exact snapshot repeats.
Interior and boundary hardware pans return to identical images with 16.67ms
p95/max and no errors on Apple Metal3. Still samples do not prove absence of
between-frame shimmer. See [review](review.md) and the JSON reports.

Change ledger: the four `campaign-city-*` snapshots now pin the reviewed fitting
on current entity inputs. The matched parent separately reproduces the small
banner changes inherited from the unified entity frame; they are not attributed
to shadow fitting. No gameplay assertions or numeric thresholds changed.
