# battle-renderer

The final owner of the selected raw battle world, its GPU resources and its
shaders. The world itself is promoted here in a later pass; today the folder
holds only the renderer-neutral frame contracts in `src/types.ts`.

Those contracts exist so the frontend and a world implementation can name the
same per-frame data without either depending on the other. A type here must be
neutral: it describes what a battle frame _is_, never how a backend draws it.
Anything with a real owner elsewhere — terrain, water, environment, camera math,
assets — stays with that owner and is imported, not restated.

There is no re-export bridge. Consumers import from the owning module directly,
so moving a type is always a visible change in the import graph.
