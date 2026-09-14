# Implementation choices

## Accepted

- **World-aligned sample windows.** A requested window snaps outward at its lower edge to the existing sample lattice. This may shift the Italian sample origin by 1 km, but keeps shared terrain and tree placement identical when another window visits the same place. The camera does not move. Slice 01.
- **Finite coast influence.** The surface uses a halo wider than the existing coast response plus the normal stencil, and caps reported shore distance at that response's range. This bounds regional work without treating a tile edge as a shore. A later water profile must extend this same owner if it needs greater influence. Slice 01.
- **Indexed grid traversal for picking.** Pointer rays walk crossed grid cells and intersect their actual triangles, rather than scan the entire terrain or guess a flat plane. Source physics stays separate. Slice 01.
- **Runtime revision identity.** Each generated surface receives a new presentation revision. Revision identity cannot be reused merely because two builds cover the same coordinates; spatial cache keys are a separate concern. Slice 01.
