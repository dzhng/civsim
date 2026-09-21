# Verification behavior changes

| Test | Previous behavior | New behavior | Why |
|---|---|---|---|
| Existing post preset/grade/bloom cases, all three backends | 72 passing opaque HDR cases | Same input, tolerance and output; all remain exact | Preserve prior evidence while adding native bypass |
| Native post-off alpha cases | No bypass control; first implementation failed at alpha zero and fractional alpha | Eight direct Three output comparisons pass exactly | Match actual output alpha ordering; failing report retained |
| Partial post constructor cleanup | Injected failure left one resource live | All admitted resources released | The constructor must own failure cleanup |
| Frame constructor with nested post failure | Five post resources survived parent cleanup | Zero resources remain | Parent cannot dispose an object whose constructor never returned |
| Resize and pending lifecycle guards | No resize API | Retain camera identity, atomically replace resources, reject concurrency, prevent publication after disposal | Complete-scene owner can resize without rebuilding component bindings |

No simulation, authored visual policy, production renderer selection or acceptance threshold changed. Empty-scene 4x resolve and complete-scene visual/temporal parity remain open.
