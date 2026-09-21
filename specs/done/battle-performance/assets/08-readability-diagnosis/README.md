# Tactical shadow diagnosis

Claude read-only audit is retained with root disposition. Confirmed: raw grass
passes shadow visibility1.0 and casts nothing; its emissive light is also unshadowed.
That establishes missing grass reception, not how much of perceived faintness it
causes. The [one-variable reception experiment](../08-grass-receiver/README.md) subsequently
found no clear readability improvement and was not adopted.

Rejected: the audit asserts the user's image is at the opposite end of the camera
rig. Its camera metadata is unavailable, and the visible composition resembles
the captured tactical view. Neither exact camera equivalence nor an opposite-end
claim is supported. Also rejected as proof: identical post processing or an
unshadowed indirect-light term does not rule out contrast compression or an ambient
light floor; those need measurements. They are left unchanged for the first test.

Root observed actual uploaded shadow matrices through a browser-only write hook,
without adding a production stats API or changing fits. All six samples retain
tick30/hash15927906182668164452 and no page errors. Orthographic row lengths recover
the installed square extent; receiver data supplies bias and PCF radius.

| Camera distance | Extent | World units / texel | Normal bias |
| --- | --- | --- | --- |
|63.52 |238.42 |0.2328 |0.0489 |
|252.03 |298.02 |0.2910 |0.0611 |
|859.10 |582.08 |0.5684 |0.1194 |
|2239.73 |1421.09 |1.3878 |0.2914 |
|3169.75 |1776.36 |1.7347 |0.3643 |
|3200.00 |1776.36 |1.7347 |0.3643 |

At the captured tactical camera, the audit's proposed sub-texel-density explanation
is not supported by its own0.3-unit rule-out value. Resolution does fall with wider
views, so wide/moving shadow coverage remains a separate obligation. No visual or
performance fix is claimed by these scalar observations.
