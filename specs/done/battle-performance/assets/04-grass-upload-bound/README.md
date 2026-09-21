# Bound actual grass uploads across render consumers

The integrated camera probe caught an error below the sampler’s bounded tile
publication. The record storage used `DynamicDrawUsage`; pinned Three updates
that usage on every binding, even without a version change. The first binding
consumed the partial ranges and cleared them; later bindings uploaded the entire
65,536,000-byte capacity. The owner’s counters alone therefore understated the
work sent to WebGPU.

The storage now uses its default version-gated usage. Explicit edits still mark
it dirty and upload their ranges; routing and drawing share the resulting buffer.
There is no alternate uploader or extra GPU copy.

[Actual queue calls](hardware-writes.json) show that the same 180-step pan/zoom
went from 745 whole-capacity writes to zero. The largest grouped record upload
fell from 328,499,200 bytes to 819,200 bytes per reported render frame, matching
the existing eight-tile bound. Both runs retained one allocation created during
loading and reported no browser errors or invalid admitted coverage. These
instrumented runs prove submitted work bounds, not frame-rate improvement.
The before run is the newly integrated candidate, not the original game baseline.

The new `system/grass-upload-ranges.mjs` regression uses the real layer, pinned
renderer and GPU queue. [Before](red.log), one edited record caused its 64-byte
write plus two whole-buffer writes, and unchanged routing kept uploading.
[After](green.log), the edit uploads once at the correct offset, unchanged routes
upload nothing, and GPU readback proves that the new value arrived. No existing
test expectation or threshold changed. Thirty-eight grass tests, web typechecking
and an independent code review pass.
