// @vitest-environment node
import { expect, test } from 'vitest';
import { createReplayControl } from '../../apps/battle-perf-lab/src/replayControl';
import {
  BattleGrassResidency,
  beginGrassPublicationCapture,
  takeGrassPublications,
  beginGrassPublicationReplay,
  productionBladeFieldProfile,
  initialBladeFieldTransition,
} from '../../apps/battle-perf-lab/src/CaptureGrassResidency';
import type {
  BattleReplayAssets,
  BattleReplayCommand,
  BattleReplayFrame,
  BattleReplaySettings,
} from '../../apps/battle-perf-lab/src/fixture';
import type { CrowdInstance } from '../../packages/crowd-runtime/src/instanceData';
const camera = {
  x: 1,
  y: 2,
  zoom: 3,
  zoomT: 0.4,
  camera3d: {
    target: [1, 2, 3] as [number, number, number],
    distance: 30,
    pitch: 0.5,
    yaw: 0,
    fovY: 0.8,
    aspect: 1.6,
    near: 1,
    far: 2000,
  },
};
const assets: BattleReplayAssets = {
  soldierCatalogUrl: 'catalog',
  soldierUnit: new Uint32Array([1, 0]),
  teams: [0, 1],
  classes: [0, 6],
  terrain: { w: 1, h: 1, cell: 1, ox: 0, oy: 0, tint: new Uint8Array(1) },
  terrainOptions: {},
};
const settings: BattleReplaySettings = {
  environment: 'golden-hour',
  shadows: 'single',
  grassQuality: 'standard',
  grass: true,
  farGrass: true,
  bloom: true,
  post: true,
  postGrade: null,
  viewport: { width: 1440, height: 900, pixelRatio: 2 },
};
const playback = (appearanceId: number) =>
  ({ appearanceId, base: { destination: { clip: 'idle', phase: 0.2 }, weight: 1 } }) as never;
const draw = (x: number): BattleReplayCommand => ({
  method: 'draw',
  args: [
    new Float32Array([x, 2, 3, 4]),
    new Float32Array([0, 1]),
    [playback(6), playback(0)],
    new Float32Array([1, 0]),
    2,
    camera,
    0.016,
  ],
});
function fixture(publicationCount: number) {
  const profile = productionBladeFieldProfile();
  const source = new BattleGrassResidency(profile, initialBladeFieldTransition(profile));
  beginGrassPublicationCapture();
  for (let i = 0; i < publicationCount; i++) source.prepareRender(camera.camera3d, 1800);
  const publications = takeGrassPublications();
  source.dispose();
  beginGrassPublicationReplay();
  const residency = new BattleGrassResidency(profile, initialBladeFieldTransition(profile));
  const log: any[] = [];
  const scene = {
    resize: async (w: number, h: number) => {
      log.push(['resize', w, h]);
    },
    setVisibility: (v: unknown) => log.push(['visibility', v]),
    seatingHeightAt: (x: number, y: number) => x + y,
    uploadCrowd: (instances: CrowdInstance[], c: unknown, time: number) =>
      log.push(['crowd', structuredClone(instances), c, time]),
    uploadReadouts: async (...args: unknown[]) => {
      log.push(['readouts', ...args]);
    },
    uploadTriangles: (v: Float32Array) => log.push(['triangles', Array.from(v)]),
    uploadTacticalLines: (v: unknown) => log.push(['lines', v]),
    prepare: async (input: { camera: typeof camera; time: number }) => {
      log.push(['prepare', input]);
      residency.prepareRender(input.camera.camera3d, 1800);
    },
    encode: () => log.push(['encode']),
    settleGrass: async (c: unknown) => {
      log.push(['settle', c]);
      residency.settle();
    },
    stats: () => ({}),
  };
  const device = {
    createCommandEncoder: () => ({ finish: () => ({}) }),
    queue: {
      submit: () => log.push(['submit']),
      onSubmittedWorkDone: async () => {
        log.push(['wait']);
      },
    },
  };
  const context = { getCurrentTexture: () => ({ createView: () => ({}) }) };
  return { publications, log, scene, device, context, residency };
}
const frame = (commands: BattleReplayCommand[]): BattleReplayFrame => ({
  frameId: 1,
  simTick: 123,
  timeSeconds: 999,
  camera,
  commands,
});

function attach(f: ReturnType<typeof fixture>, submitPresentation: () => void | Promise<void> = () => { f.scene.encode(); f.device.queue.submit(); }) {
  return createReplayControl({
    waitForSubmittedWork: () => f.device.queue.onSubmittedWorkDone(),
    submitPresentation,
    scene: f.scene as never,
    assets,
    settings,
    appearances: {
      0: { manifest: { mounted: false } },
      6: { manifest: { mounted: true } },
    } as never,
  });
}

test('preserves every draw upload and render boundary, including camera-aware settle', async () => {
  const f = fixture(3);
  const control = await attach(f);
  try {
    const lines = {
      groundCues: new Float32Array(),
      rings: new Float32Array(),
      effects: new Float32Array(),
    };
    const result = await control.submit(
      frame([
        { method: 'setTime', args: [7] },
        draw(10),
        draw(20),
        { method: 'drawTacticalLines', args: [lines, camera] },
        { method: 'render', args: [] },
        { method: 'settlePresentedFrame', args: [] },
      ]),
      f.publications,
    );
    expect(f.log.filter(x => x[0] === 'crowd').map(x => x[1][0].x)).toEqual([10, 20]);
    const built = f.log.find(x => x[0] === 'crowd')[1];
    expect(built.map((x: CrowdInstance) => [x.faction, x.mounted, x.alive, x.elevation])).toEqual([
      [1, true, true, 12],
      [0, false, false, 7],
    ]);
    expect(f.log.find(x => x[0] === 'settle')[1]).toEqual(camera);
    expect(result.counts).toMatchObject({
      crowdUploads: 2,
      presentations: 3,
      settles: 1,
      commands: 6,
    });
    expect(f.log.filter(x => x[0] === 'prepare').map(x => x[1].time)).toEqual([7, 7, 7]);
  } finally {
    control.dispose();
    f.residency.dispose();
  }
});
test('retains uploads across frames and refreshes changed camera without another crowd upload', async () => {
  const f = fixture(2);
  const control = await attach(f);
  try {
    const triangles = new Float32Array([1, 2, 3]);
    await control.submit(
      frame([
        { method: 'uploadUnitReadouts', args: [[], []] },
        draw(5),
        { method: 'drawTris', args: [triangles, camera] },
        { method: 'render', args: [] },
      ]),
      f.publications.slice(0, 1),
    );
    const shifted = { ...camera, x: 8 };
    const result = await control.submit(
      frame([
        { method: 'setTime', args: [12] },
        { method: 'drawTris', args: [new Float32Array(), shifted] },
        { method: 'render', args: [] },
      ]),
      f.publications.slice(1),
    );
    expect(f.log.filter(x => x[0] === 'triangles').map(x => x[1])).toEqual([[1, 2, 3], []]);
    expect(f.log.filter(x => x[0] === 'prepare').at(-1)[1]).toEqual({ camera: shifted, time: 12 });
    expect(result.counts).toMatchObject({
      crowdUploads: 1,
      readoutUploads: 1,
      triangleUploads: 2,
      presentations: 2,
    });
  } finally {
    control.dispose();
    f.residency.dispose();
  }
});
test('missing publication boundary fails closed and cannot resume a partially executed batch', async () => {
  const f = fixture(0);
  const control = await attach(f);
  try {
    await expect(
      control.submit(frame([draw(1), { method: 'render', args: [] }]), []),
    ).rejects.toThrow('uncaptured grass');
    expect(f.log.filter(x => x[0] === 'submit')).toHaveLength(0);
    await expect(control.submit(frame([]), [])).rejects.toThrow('restart');
  } finally {
    control.dispose();
    f.residency.dispose();
  }
});
test('settle before first camera drains without inventing a presentation', async () => {
  const f = fixture(0);
  const control = await attach(f);
  try {
    const result = await control.submit(frame([{ method: 'settlePresentedFrame', args: [] }]), []);
    expect(result.counts).toMatchObject({ presentations: 0, settles: 1 });
    expect(f.log.map(x => x[0])).toEqual(['resize', 'visibility', 'settle', 'wait']);
  } finally {
    control.dispose();
    f.residency.dispose();
  }
});
test('unused source publications are rejected rather than silently discarded', async () => {
  const f = fixture(1);
  const control = await attach(f);
  try {
    await expect(control.submit(frame([draw(2)]), f.publications)).rejects.toThrow(
      'omitted a source grass',
    );
  } finally {
    control.dispose();
    f.residency.dispose();
  }
});

test('awaits asynchronous crowd upload before a later upload or presentation', async () => {
  const f = fixture(1);
  const original = f.scene.uploadCrowd;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  f.scene.uploadCrowd = (async (...args: Parameters<typeof original>) => {
    await gate;
    return original(...args);
  }) as typeof original;
  const control = await attach(f);
  try {
    const submitted = control.submit(frame([draw(5), { method: 'render', args: [] }]), f.publications);
    await Promise.resolve();
    expect(f.log.map(x => x[0])).toEqual(['resize', 'visibility']);
    release();
    await submitted;
    expect(f.log.slice(2).map(x => x[0])).toEqual(['crowd', 'prepare', 'encode', 'submit']);
    expect(f.log[2][1][0].x).toBe(5);
  } finally { control.dispose(); f.residency.dispose(); }
});

test('snapshots only the final actual submission before asynchronous validation completes', async () => {
  const f = fixture(2);
  let release!: () => void;
  const validation = new Promise<void>(resolve => { release = resolve; });
  let submitted = 0;
  const control = await attach(f, () => { submitted++; return submitted === 2 ? validation : Promise.resolve(); });
  let snapshot = 0;
  try {
    const pending = control.submit(frame([draw(5), { method: 'render', args: [] }, { method: 'render', args: [] }]), f.publications, () => { snapshot++; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(submitted).toBe(2);
    expect(snapshot).toBe(1);
    expect(control.stats().presentations).toBe(1);
    release();
    expect((await pending).counts.presentations).toBe(2);
  } finally { release(); control.dispose(); f.residency.dispose(); }
});
