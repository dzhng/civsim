import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = resolve(process.argv[2] ?? 'throwaway/native-replay/dist');
const files = (await readdir(directory)).filter(name => name.endsWith('.mjs'));
const code = Object.fromEntries(
  await Promise.all(
    files.map(async name => [name, await readFile(resolve(directory, name), 'utf8')]),
  ),
);
const providers = files.filter(name =>
  code[name].includes('Replay requested an uncaptured grass prepareRender boundary'),
);
assert.equal(providers.length, 1, 'one emitted publication provider');
const provider = providers[0];
const reachable = (entry, seen = new Set()) => {
  if (seen.has(entry)) return seen;
  assert.ok(code[entry], `missing emitted module ${entry}`);
  seen.add(entry);
  for (const match of code[entry].matchAll(/from ["']\.\/([^"']+\.mjs)["']/g)) reachable(match[1], seen);
  return seen;
};
const entries = ['control.mjs', 'scene.mjs', 'typegpuScene.mjs', 'vgpuScene.mjs', 'publications.mjs', 'spool.mjs'];
for (const entry of entries)
  assert.ok(reachable(entry).has(provider), `${entry} must reach the shared provider chunk`);
const sceneModule = [...reachable('scene.mjs')].find(name => code[name].includes('packages/battle-renderer/src/grassField.ts'));
assert.ok(sceneModule, 'actual native field is present in scene graph');
const imports = entry => {
  const line = code[entry].split('\n').find(line => line.includes(`"./${provider}"`));
  return Object.fromEntries(
    line
      .match(/\{([^}]+)\}/)[1]
      .split(',')
      .map(part => {
        const [exported, local = exported] = part.trim().split(/\s+as\s+/);
        return [local, exported];
      }),
  );
};
const fieldRegion = code[sceneModule].match(
  /#region packages\/battle-renderer\/src\/grassField\.ts([\s\S]*?)\/\/#endregion/,
)?.[1];
const publicConstructor = code['publications.mjs'].match(/(\w+) as BattleGrassResidency/)?.[1];
assert.ok(fieldRegion && publicConstructor, 'native field and public provider are emitted');
// Typed-array helpers may be emitted before the field constructor. Compare only
// imported constructors in this module's region, not its first `new` expression.
const fieldImports = imports(sceneModule);
const fieldConstructors = [...fieldRegion.matchAll(/\bnew\s+(\w+)\(/g)]
  .map((match) => fieldImports[match[1]])
  .filter((name) => name !== undefined);
assert.deepEqual(
  fieldConstructors,
  [imports('publications.mjs')[publicConstructor]],
  'native field constructs the public replay provider, not a separate sampler',
);

// Exercise the emitted control/publications boundary, not the source config.
const publications = await import(pathToFileURL(resolve(directory, 'publications.mjs')).href);
const { createReplayControl } = await import(
  pathToFileURL(resolve(directory, 'control.mjs')).href
);
const profile = publications.productionBladeFieldProfile();
const camera = {
  x: 0,
  y: 0,
  zoom: 1,
  zoomT: 0,
  camera3d: {
    target: [0, 0, 0],
    distance: 30,
    pitch: 0.5,
    yaw: 0,
    fovY: 0.8,
    aspect: 1,
    near: 1,
    far: 2000,
  },
};
const source = new publications.BattleGrassResidency(
  profile,
  publications.initialBladeFieldTransition(profile),
);
publications.beginGrassPublicationCapture();
source.prepareRender(camera.camera3d, 64);
const batch = publications.takeGrassPublications();
source.dispose();
publications.beginGrassPublicationReplay();
const replay = new publications.BattleGrassResidency(
  profile,
  publications.initialBladeFieldTransition(profile),
);
let presentations = 0;
const scene = {
  resize: async () => {},
  setVisibility: () => {},
  uploadTriangles: () => {},
  prepare: async () => replay.prepareRender(camera.camera3d, 64),
  encode: () => presentations++,
  stats: () => ({}),
};
const control = await createReplayControl({
  scene,
  submitPresentation: () => { scene.encode(); },
  waitForSubmittedWork: async () => {},
  assets: { soldierUnit: new Uint32Array(), teams: [] },
  appearances: {},
  settings: {
    shadows: 'single',
    viewport: { width: 64, height: 64, pixelRatio: 1 },
    grass: true,
    farGrass: true,
    bloom: true,
    post: true,
  },
});
try {
  await control.submit(
    {
      frameId: 1,
      simTick: 0,
      camera,
      timeSeconds: 0,
      commands: [
        { method: 'drawTris', args: [new Float32Array(), camera] },
        { method: 'render', args: [] },
      ],
    },
    batch,
  );
  publications.assertGrassPublicationsConsumed();
  assert.equal(presentations, 1);
  assert.deepEqual(replay.snapshot().transition, batch[0].state.transition);
  console.log(
    JSON.stringify(
      {
        entries,
        provider,
        emittedModules: files.length,
        nativeFieldUsesPublicProvider: true,
        files: Object.fromEntries(
          files.map(name => [
            name,
            {
              bytes: Buffer.byteLength(code[name]),
              sha256: createHash('sha256').update(code[name]).digest('hex'),
            },
          ]),
        ),
        runtimePublicationConsumed: true,
        presentations,
        gpu: false,
      },
      null,
      2,
    ),
  );
} finally {
  control.dispose();
  replay.dispose();
}
