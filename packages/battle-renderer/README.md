# battle-renderer

Battle presentation contracts describe the camera and tactical data shared by the
frontend and the renderer. Neither side depends on the other's implementation to
name those inputs.

Types here describe what a battle frame contains. Terrain, water, environment,
camera math and assets keep their existing owners; consumers import those types
directly. There are no re-export bridges or duplicate frame declarations.
