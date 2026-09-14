# Change ledger

No existing test behavior was re-pinned or weakened.

- `terrainView`: overview leaves coarse coverage; nearby motion retains most
  requested identities, distant travel replaces them, and return recovers them.
- `tiledTerrainMemory`: an unchanged GPU upload can retain an older array while
  the query surface owns new arrays; all live buffers must count. The omission
  was reproduced as a failing byte-total assertion, then corrected.
- `landscape-traversal`: real geography now exercises sharp reversal during a
  worker request, overview/Alps/Italy/distant/return, repeated residency plateaus,
  idle stability, continuous camera motion, hardware timing and DPR2 bounds.
  It adds new exact baselines rather than changing the analytic join fixtures.
