# Vibe checks

Manual, eyeball-it harnesses — **not** pass/fail gates. Each spawns a scenario,
screenshots it every N sim-seconds, and dumps the frames to flip through. The
`verify-*.mjs` harnesses *assert*; these just let you *look* (does a fight look
like a fight, does the camera read, does nobody get launched into orbit).

Needs the dev server up (`npx vite --port 5173 --strictPort` from `web/`).

```sh
cd web
node vibe/1v1.mjs              # heavy-vs-heavy duel, every 30 s until it resolves
A=3 B=6 node vibe/1v1.mjs      # override matchup by class id (phalanx vs cavalry)
```

Frames land in `web/vibe/shots/<name>/t###s.png` — **gitignored**, throwaway,
never baselines. (Pixel-exact regression baselines live in `web/shots/baseline/`
and are owned by the verify harnesses; don't mix the two.)

Shared plumbing is in `_lib.mjs`: `openBattle(query)` boots into a battle and
waits for the debug bridge; `vibeCapture(page, name, { frame, sample, label,
done })` runs the screenshot loop (position camera → freeze → snap → advance,
until `done`). A new vibe check is a dozen lines — see `1v1.mjs`.
