# Reload before first preparation — actual GPU regression

The initial candidate2da55ab2 reproduces the review finding with real TypeGPU
resources and the full published crowd catalog. The probe inserts reload directly
after uploadCrowd, before any prepare, then asks the normal scene to prepare and
draw without another upload. It returns `Crowd audience frame is not ready`, with
no page errors or GPU warnings. [The report](early-before.json) records that
expected failure; this is a regression proof, not passing feature acceptance.

The harness uses the existing complete-scene setup and camera. Only the ordered
reload call and early return are inserted; the scene implementation is supplied
from the recorded exact Git commit. No production behavior or gate was relaxed.
The same sequence must pass on the corrected implementation. The correction and
post-change GPU result are still pending.
