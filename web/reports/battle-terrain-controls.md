# Battle terrain and controls

The reported generated seed, **455085311**, exposed three separate problems:
clicks intersected a flat plane below the visible ground; the destination HUD
kept showing an active order while its replacement waited for command delay;
and the carved bay stopped at the playable rectangle beneath an uncarved vista.
Different terrain mesh resolutions also left gaps at their boundaries.

Ground input now intersects an index of the displayed triangles. The latest
accepted destination appears immediately while simulation command delay stays
intact. Playable and distant water reaches share a continuous coast, and mesh
boundaries join using both edges' vertices and material attributes.

Right-drag now looks around with or without units selected. A click issues one
order; a camera drag issues none, even when it returns to its starting point.
Alt-right-drag retains facing orders. Q/E/Z/X and mouse look hold the camera eye,
distance, and lens fixed. Automatic horizon tilt follows physical distance:
100 m remains tactical, 40 m is about 55 degrees down, and 20 m about 28 degrees.

## Decisions and costs

- The rendered terrain owns picking. Three's existing Octree avoids a second
  terrain approximation or custom search implementation. The reported map
  indexes 231,224 triangles once during loading, taking about 1.9 seconds in
  hardware Chrome. This is an additional loading cost, not per-frame rebuilding.
  Ordinary scenery/ground-cue sampling retains the inexpensive height sampler.
- Manual look may aim beyond the map or into the sky. Clamping its target to
  terrain would move the eye during rotation. Sky clicks produce no order;
  selection boxes use projected unit centres so their corners may cross sky.
- The coast grades over 250 m on land and widens offshore. Its height changes
  are presentation-only: speed, roughness, and tint arrays were byte-identical
  before/after for seeds 1, 7, 8, and 455085311. The 64-seed passability sweep
  retains its connectivity, width, and blocker assertions.
- Independent review caught a source-height picking mismatch, selection boxes
  whose sky corners cancelled selection, and a stale fixed pitch assumption in
  review captures. All were corrected. A visual reviewer rejected an intermediate
  hanging terrain curtain; extending the actual coast resolved it. Fresh final
  visual review found the distant terrain continuous with no new defects.
- Final review also caught a disappearing minimap footprint when downward
  corner rays missed the finite mesh. Its planar overview now extends those
  rays and clips the indicator to the minimap; ground orders still reject misses.

## CHANGE LEDGER

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `camera.test.ts`: pitch at distance ceiling | Expected a camera dolly when tilting at the zoom ceiling. | Requires the eye to remain fixed through the turn. | Look no longer changes distance to keep a terrain target. **moved** |
| `camera.test.ts`: grazing elevated-ground pick | New regression hit the flat plane instead of the projected raised point. | Intersects the surface within 0.1 m. | Input now inverts the visible surface projection. **moved** |
| `camera.test.ts`: uneven-terrain look | New regression exposed height/lens/zoom drift during turns. | Eye, distance, and lens remain fixed across zoom levels. | Manual look has an explicit target elevation. **moved** |
| `cameraRig.test.ts`: continuity | Compared equally spaced authored dial positions. | Bounds angle and lens changes through 1% physical distance steps. | Wheel input follows physical distance and the requested tilt happens later. **moved** |
| `cameraRig.test.ts`: physical auto-tilt | New regression allowed horizon-like tilt too far from the ground. | Tactical above 100 m; horizon-like only below 25 m. | Delayed tilt matches the requested behavior. **moved** |
| `input.test.ts`: right-drag, click, facing, sky, selection | No dedicated input contract covered these gestures. | Tests selected/unselected fixed-eye look, one order per click, zero orders per look drag, Alt-facing, sky rejection, and screen selection. | Pins gesture ownership and valid ground targets. **added** |
| `game-wasm`: `order_preview_shows_latest_destination_while_command_is_transmitting` | Observed preview at old destination (20, 0) while replacement waited. | Exports requested (60, 10) immediately; active simulation order still waits. | Acknowledges intent without changing order mechanics. **moved** |
| `battleTerrainSeam.test.ts` | A lowered playable edge left a gap beneath the vista; source-only peaks could affect picks. | Rays hit joined geometry and ignore vertices omitted from the drawn mesh. | Rendering and picking share the actual triangle surface. **added** |
| `genmap`: curated seed 1 hash | `e28cbaf0d2e6e796` | `35787940547b4e73` | Smooth coastal relief changes its height channel. Seeds 7 and 8 retain their hashes. **re-pinned** |
| `genmap`: 64-seed flank peak assertion | Every flank required a 200 m peak, including water reaches. | Land flanks retain the 200 m floor; all retain the 280 m ceiling. | Grading a coast can lower its ridge: seed 10 reaches 182.21 m. Passability checks are unchanged. **moved** |
| `genmap`: reported water reach | New regression exposed positive mountain elevations above the bay outside the map. | Bay remains at/below water level through vista bands; the shore has no single-cell cliff. | Coast shaping continues beyond the playable boundary. **added** |
| `battle-terrain-controls` | No end-to-end fixture for the reported map. | DPR2 ground clicks, immediate previews, right-drag/keyboard eye stability, sky-crossing selection, and physical tilt. | Exercises actual browser input against the supplied seed. **added** |
| `battle-terrain-seams` | No close east/west regression for this map. | Two frozen terrain screenshots, with HUD hidden to exclude unrelated HUD raster differences. | Pins the mountain/coast joins at ground-level views. **added** |
| `battleMinimap.test.ts` | Finite terrain misses removed the minimap camera outline. | Downward off-map rays retain a finite overview; sky rays and invalid orders remain rejected. | Keeps schematic minimap feedback independent of valid order targets. **added** |
| `camera.test.ts`: wheel after elevated look | The new regression reached minimum zoom while the eye remained 437.82 m above flat ground. | Zoom reaches the close ground view without a camera reset. | Free-look elevation closes with remaining zoom distance. **moved** |
| `camera.test.ts`: outward wheel near the floor | The first reconciliation candidate amplified a fresh head turn, raising the eye from 15.2 m to 123.32 m in one small outward step. | The same step changes eye height by less than 1 m. | Only inward travel reconciles target elevation. **moved** |
| `battle-terrain-controls`: wheel after high free-look | The browser flow did not combine a high head turn with a full zoom-in. | Real keyboard look followed by wheel events must return the eye to ground level. | Covers the camera transition that independent review found. **added** |

## Verification

- 420 web tests and TypeScript check passed; production web build passed.
- Game-WASM tests passed; generated terrain tests passed including the 64-seed sweep.
- Hardware Chrome controls checks passed on the exact supplied setup at DPR2.
  Ground click errors were 0.14–0.54 m for integer browser pixel coordinates;
  measured eye drift during mouse and keyboard look was effectively zero.
- Matched before/after views and fresh independent visual review cover both
  mountain and coastline defects. Full-HUD screenshot repeats exposed unrelated
  HUD raster differences; terrain captures deliberately exclude that overlay.
- The final strict hardware screenshot repeat still differs by four east-view
  pixels and three west-view pixels, each by one colour-channel level. The zero
  tolerance was retained. These pixel gates remain red; visual inspection and
  the independent critique establish the geometry fix, not exact GPU raster
  reproducibility. No existing screenshot baseline was re-blessed.

## Follow-up review

The shape pass consolidated the game and renderer-lab vista readers, removed
the handwritten copy of generated WASM method types, and collapsed a redundant
height forwarding method. The code pass removed unused sink parameters and
stale comments, then fixed the independently identified high-look-to-zoom
regression and its near-floor outward-zoom edge case behind tests observed red
and green. The documentation pass
distinguishes source sampling from rendered-triangle picking and makes this
evidence reachable from the root terrain guide. Terrain shape, movement rules,
and screenshot tolerances are unchanged by this follow-up.
