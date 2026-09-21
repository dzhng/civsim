# Road review

Independent fresh eyes inspected all three production pairs and crops, then both
settled geography pairs and crops. Verdict: keep the candidate for road width.
The close Alpine branch loses its broad scalloped flare while its junction and
route remain connected. Regional Alps/Italy remain legible; no new missing route
or terrain detachment was visible. Existing bright/unshaded strips, angular bends
and terrain occlusion remain. Border appearance is unchanged; the geography
frames have too little distinct sea-lane coverage to claim a broad sea-lane audit.

Code review found a real interaction between partial fog uploads during road
reseating and full visibility refreshes. Both update orders reproduced the stale
upload range. Fog now uploads its full affected region; position updates remain
bounded. This removes the conflict without adding pending-upload state.

The shape keeps road generation and geographic seating with their existing
owners. No material, camera, gameplay route or GPU vertex layout changed. The
new source anchors cost 6,932,448 retained bytes in the production map; per-region
immutable center/offset data costs 13,864,896 bytes. Geography-owned CPU storage
moves 31,202,064→45,066,960 bytes; GPU storage stays 27,735,168 bytes. The extra
source anchors are outside that layer-owned CPU counter. This is an explicit
memory tradeoff for repeatable local surface width, not a free representation.
