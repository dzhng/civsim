# Normal correction verification

The new uniform/tall/wide fixture checks the same scaled props against an
independent baked transform. Uniform remains exact. Tall/wide were previously
visibly wrong and now meet the measured CPU/GPU precision bound; their production
snapshots repeat exactly. The initially authored cross-path zero-delta assertion
was replaced only after measuring quantization and proving the old code still
fails by a wide margin. No existing snapshot comparator or tolerance changed.

Regional, vegetation and tree-LOD images change only in illumination of
nonuniformly scaled props. Their silhouettes, terrain, positions, membership,
water and camera controls remain fixed.
