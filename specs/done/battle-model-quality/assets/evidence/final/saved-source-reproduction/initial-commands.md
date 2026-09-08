# Initial tracer and final gate commands

All commands ran from `/Users/david/dev/game-catalog-admission`. The output root
was freshly allocated as
`throwaway/catalog-admission/source-reproduction.cdjpuY`. Driver text is preserved
under `driver-records/`; its `prepare` operation uses `git archive` at
`2e200452f1fe2ab815923ac1f26000c729a1a636` for `packages/soldier-assets/bake`,
`packages/soldier-assets/src` and the 18 `.blend` paths in `manifest.json`, then
extracts into an empty `checkout/`. It verifies every extracted source hash
against the pinned source before any Blender operation.

```sh
node throwaway/catalog-admission/source-reproduction.cdjpuY/prepare.mjs > throwaway/catalog-admission/source-reproduction.cdjpuY/logs-prepare.txt 2>&1

PYTHONDONTWRITEBYTECODE=1 /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 2 --python throwaway/catalog-admission/source-reproduction.cdjpuY/inspect-sources.py -- /Users/david/dev/game-catalog-admission/throwaway/catalog-admission/source-reproduction.cdjpuY > throwaway/catalog-admission/source-reproduction.cdjpuY/logs/source-inventory.txt 2>&1

PYTHONDONTWRITEBYTECODE=1 /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 2 --python-exit-code 1 --python /Users/david/dev/game-catalog-admission/throwaway/catalog-admission/source-reproduction.cdjpuY/checkout/packages/soldier-assets/bake/blender-mesh-lods.py -- --source /Users/david/dev/game-catalog-admission/throwaway/catalog-admission/source-reproduction.cdjpuY/checkout/packages/soldier-assets/assets/source/heavy-kit/heavy-kit.blend --body HeavyKit-Deform --output /Users/david/dev/game-catalog-admission/throwaway/catalog-admission/source-reproduction.cdjpuY/products/heavy-kit --near-triangles 8000 --mid-triangles 1000 --far-triangles 800 > throwaway/catalog-admission/source-reproduction.cdjpuY/logs/heavy-kit-export.txt 2>&1

node throwaway/catalog-admission/source-reproduction.cdjpuY/verify-products.mjs heavy-kit > throwaway/catalog-admission/source-reproduction.cdjpuY/logs/heavy-kit-verify.txt 2>&1

node throwaway/catalog-admission/source-reproduction.cdjpuY/run-remaining.mjs > throwaway/catalog-admission/source-reproduction.cdjpuY/logs/full-run.txt 2>&1

bun throwaway/catalog-admission/source-reproduction.cdjpuY/finish.mjs > throwaway/catalog-admission/source-reproduction.cdjpuY/logs/final-contracts.txt 2>&1
```

Source inventory process 74908, heavy exporter 16515, heavy bake/load 96746,
remaining-source pool 76552 and final cross-tier/catalog gate 26781 all exited 0.
The inventory produced all 18 expected rows with packed textures; this verifies
script completion independently of Blender's default Python error exit handling.
The export jobs explicitly use `--python-exit-code 1` and each has a 15-minute
watchdog in the recorded orchestrator. No timeout fired.
