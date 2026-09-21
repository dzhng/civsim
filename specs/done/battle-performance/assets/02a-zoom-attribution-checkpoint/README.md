# Zoom draw-object attribution

The same immutable archive was replayed through packet 354. Original source and
prior evidence were not changed. All 354 history gates and endpoint GPU indirect
commands pass. Altered-scene probes saved 65×65 crops only; total charged writes
were 3,612,434 bytes. Page errors were empty. The remaining pixel gate is red.

At zoom start (1500,786), the original replay submission now equals the source:
[105,105,50]. This is before any endpoint diagnostic toggle. Earlier replays
produced [112,112,43], so the previously stable discrepancy is now observed to vary.
Only hiding `battle-grass-ring-blades-mid` changes this target among the visible
grass draw objects, producing [131,141,67]. Restoring visibility returns the exact
baseline. This identifies the focus-ring mid-tier draw contribution, not the
reason for its variation. No atomic ordering or noise classification is claimed.

At zoom end (1529,1105), the original/repeated/restored replay remains [93,91,88],
versus source [104,97,88]. Only hiding `battle-crowd-3-main-lod0` changes that target
among the visible crowd meshes, producing [67,50,49]. The identified main-view
class 3 LOD0 mesh has 23952 indices. The recorded `count:1` is the object's count
property, not an independently read GPU instance count. The exact contributing
instance/primitive is not yet identified. Actual L3 impostors and all other crowd
content remain in the scene except during their individual visibility probe.

For each one-object probe, public light-shadow `autoUpdate` and `needsUpdate`
flags are captured, set false, then restored in finally along with object
visibility. The scene redraw uses the same public camera and prepared world;
it does not rerun camera, pose, residency or simulation updates. This holds the
existing shadow maps while isolating main-view object contributions. The restored
pixel equals the starting pixel at both endpoints.

A bounded public `positionNode.traverse` inspection visited 15 nodes but exposed
no StorageBufferAttribute values. Consequently this pass did not acquire grass
visible-index membership/order. The empty storage report is an unavailable probe,
not evidence of empty grass or matching order. A subsequent public issued-draw
resource trace can identify the actual ring-mid storage binding without private
backend mutation. No source recapture or performance claim is made.
