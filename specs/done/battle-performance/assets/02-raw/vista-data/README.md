# Shared vista geometry

The existing outer terrain mesh and mixed-resolution seam recipes now live in
renderer-independent data. `buildBattleTerrainData` returns the completed rings;
Three consumes them directly. Its previous geometry-mutating seam adapter is
removed. Native and typed runtimes can upload the same completed attributes and
indices without importing Three or reproducing a second terrain recipe.

A CPU differential compared the previous source against the extracted builder
for all four ground covers and three cell sizes (8, 64 and 128 meters). Three
mixed-resolution seam fixtures match all attributes and triangle indices exactly.
A composed three-ring case also matches every previously rendered position,
normal, water weight, tint, surface color and final winding. The existing lowered
bay seam/raycast regression passes unchanged, and the raw TypeScript project passes.
No visual improvement or performance claim follows from this extraction.

The data representation retains the ground recipe's index convention. The shared
front-side conversion runs once at upload, including seam triangles. Normal aliases
carry identical values. Vertex RGB slots unused by the ground material are filled
from the actual surface-color attribute after joining; all consumed render
attributes remain exact. Renderer resources and material behavior remain outside
this CPU owner. Vista material rendering and its transparent far ring remain the
next native integration gate.
