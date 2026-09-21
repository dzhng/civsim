# Stable zoom pixel visibility localization

The same corrected-source archive was replayed through packet 354, without source
recapture. Only 65×65 crops and compact reports were written (3,566,571 charged
bytes including repeated report writes). All 354 history camera/crowd/active-grass
hash checks passed; endpoint GPU command checks passed. Original archives and
previous replay images remain unchanged. Browser errors were empty.

At each zoom endpoint, the original submission was snapshotted first. The lab then
redrew the already-prepared public world and camera without simulation, residency,
time or pose updates. A third render temporarily hid scene objects whose names
start with `battle-grass`, then restored their exact visibility. Crowd meshes and
L3 impostors stayed present. These are diagnostic altered-scene renders, not a
replacement parity baseline. The ordinary replay mode performs none of them.

At (1500,786), source RGB is [105,105,50]. Original and repeated prepared renders
both produce [112,112,43]; hiding grass changes it to [131,141,67]. Grass therefore
contributes to this pixel. At (1529,1105), source RGB is [104,97,88]. Original,
repeated and grass-hidden renders all produce [93,91,88]. Hiding grass does not
change this second discrepancy. Both remain stable source/replay differences and
the strict pixel gate remains red. This evidence does not establish primitive,
ordering, derivative or sampling cause; those require separate public draw/state
localization. No intermediate image parity or performance claim is made.
