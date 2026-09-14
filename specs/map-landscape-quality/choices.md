# Implementation choices

## Accepted

- **World-aligned sample windows.** A requested window snaps outward at its lower edge to the existing sample lattice. This may shift the Italian sample origin by 1 km, but keeps shared terrain and tree placement identical when another window visits the same place. The camera does not move. Slice 01.
- **Finite coast influence.** The surface uses a halo wider than the existing coast response plus the normal stencil, and caps reported shore distance at that response's range. This bounds regional work without treating a tile edge as a shore. A later water profile must extend this same owner if it needs greater influence. Slice 01.
- **Indexed grid traversal for picking.** Pointer rays walk crossed grid cells and intersect their actual triangles, rather than scan the entire terrain or guess a flat plane. Source physics stays separate. Slice 01.
- **Runtime revision identity.** Each generated surface receives a new presentation revision. Revision identity cannot be reused merely because two builds cover the same coordinates; spatial cache keys are a separate concern. Slice 01.

- **Campaign composition inputs stay renderer data.** The new world receives mesh geometry, world anchors, existing road vertices and a visibility sampler. The application retains commands and DOM cards. The small proof uses the actual city mesh and shared standards plus a deliberately simple army fixture; full entity/crowd adoption remains in 12. Slice 02.
- **Fog and territory follow the ground material.** Their color response uses the terrain's own geometry rather than separate raised translucent terrain copies. This removes visible ridge-edge seams and also lets roads consume the same visibility signal. Slice 02; production territory and vision inputs arrive in 11.
- **Cards anchor above the actual standard.** Placement derives from the shared standard tier's pole height and object scale; terrain occlusion still tests the body, so a flag tip behind a ridge does not make its hidden army label visible. A selected card may overlay map scenery, as other screen UI does. Slice 02.
- **Authored model normals are authoritative.** The city/fixture model material transforms the shared models' authored normals into view space explicitly. This handles their mixed legacy winding without reversing exterior lighting or changing the source models for every consumer. Slice 02.
- **Shutdown waits for outstanding timing readbacks.** The shared world releases its canvas immediately but destroys the renderer only after pending query reads settle. Original per-frame timing sampling is preserved; failures still disable further allocation and cannot be overwritten by older successful reads. Slice 02.

## Crown representation decisions

- **Sound, medium confidence:** Replace the recursive branch tree generator
  with a shared crown surface and attached close leaf detail. Independent
  near/far generators produced incompatible shapes; the same coverage floor
  is simpler and fits the reference's broad canopy volumes. The unused
  generator is deleted rather than retained as another appearance mode.
- **Sound, high confidence:** Keep the dense crown at close range and add leaf
  detail over it. Minification can remove small cutouts without hollowing out
  the entire tree; shadows and visible geometry retain the same coverage.
- **Sound, high confidence:** Normalize sampled atlas RGB by sampled alpha in
  both renderer consumers. Black transparent texels otherwise produce a dark
  line through filtering; this is the existing atlas's color contract.
- **Sound, medium confidence:** Project normalized model height through the
  active camera and use CSS pixels for tree detail selection. DPR changes do
  not change an object's perceived size, and per-instance selection avoids
  flipping a whole forest together.

Variant count, thresholds, crown proportions and constructor details were
explicitly delegated by the slice and are not additional architecture choices.

- **Sound, high confidence:** Pack equal-topology variants into one instanced
  geometry per family/detail. Separate variant meshes exceeded the existing
  production draw budget; shape attributes preserve variety at the same draw
  count as before.
- **Sound, high confidence:** Use one cutout mask for visible and shadow passes.
  The renderer's shadow override does not inherit opacity nodes, so opacity-only
  fading left hidden cards casting shadows. The common mask follows the actual
  shared renderer contract.
