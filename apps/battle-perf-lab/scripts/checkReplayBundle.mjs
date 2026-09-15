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
for (const entry of ['control.mjs', 'scene.mjs', 'publications.mjs']) {
  assert.ok(
    code[entry]?.includes(`"./${provider}"`),
    `${entry} must import the shared provider chunk`,
  );
}
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
const sceneConstructor = code['scene.mjs'].match(
  /#region apps\/battle-perf-lab\/src\/grassField\.ts[\s\S]*?\bnew\s+(\w+)\(/,
)?.[1];
const publicConstructor = code['publications.mjs'].match(/(\w+) as BattleGrassResidency/)?.[1];
assert.ok(
  sceneConstructor && publicConstructor,
  'native field and public provider constructors are emitted',
);
assert.equal(
  imports('scene.mjs')[sceneConstructor],
  imports('publications.mjs')[publicConstructor],
  'native field constructs the public replay provider, not a separate sampler',
);

// Exercise the emitted control/publications boundary, not the source config.
const publications = await import(pathToFileURL(resolve(directory, 'publications.mjs')).href);
const { createRawReplayControl } = await import(
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
const control = await createRawReplayControl({
  scene,
  device: {
    createCommandEncoder: () => ({ finish: () => ({}) }),
    queue: { submit: () => {}, onSubmittedWorkDone: async () => {} },
  },
  context: { getCurrentTexture: () => ({ createView: () => ({}) }) },
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
        entries: ['control.mjs', 'scene.mjs', 'publications.mjs'],
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
