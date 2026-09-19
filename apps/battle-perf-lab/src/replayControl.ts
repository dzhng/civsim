import {
  buildCrowdInstances,
  type CrowdInstance,
} from '../../../packages/crowd-runtime/src/instanceData';
import type { AppearanceBundle } from '../../../packages/soldier-assets/src/appearanceBundle';
import type { createRawBattleScene } from '../../../packages/battle-renderer/src/battleScene';
import type { BattleReplayAssets, BattleReplayFrame, BattleReplaySettings } from './fixture';
import {
  queueGrassPublications,
  assertGrassPublicationsConsumed,
  type GrassPublication,
} from './CaptureGrassResidency';

type SceneMethods = Pick<
  Awaited<ReturnType<typeof createRawBattleScene>>,
  | 'resize'
  | 'setVisibility'
  | 'seatingHeightAt'
  | 'uploadCrowd'
  | 'uploadReadouts'
  | 'uploadTriangles'
  | 'uploadTacticalLines'
  | 'prepare'
  | 'settleGrass'
>;

export type ReplayScene = {
  stats(): unknown;
} & {
  [K in keyof SceneMethods]: K extends 'seatingHeightAt'
    ? SceneMethods[K]
    : (
        ...args: Parameters<SceneMethods[K]>
      ) => ReturnType<SceneMethods[K]> | Promise<ReturnType<SceneMethods[K]>>;
};

/** Recorded semantic control only. Begin publication replay before constructing
 * the borrowed scene; its residency must be the importer-scoped replay provider.
 * Caller owns scene/device/context lifetime and configures terrain, catalog,
 * environment, grade and shadows from the same fixture before attaching. A failed
 * batch requires disposing/recreating that scene/provider, not only this adapter. */
export async function createReplayControl({
  submitPresentation,
  waitForSubmittedWork,
  scene,
  assets,
  settings,
  appearances,
}: {
  submitPresentation(): void | Promise<void>;
  waitForSubmittedWork(): Promise<void>;
  scene: ReplayScene;
  assets: BattleReplayAssets;
  settings: BattleReplaySettings;
  appearances: Readonly<Record<number, AppearanceBundle>>;
}) {
  if (settings.shadows === 'csm')
    throw Error('Native replay requires the recorded single/off shadow mode');
  const soldierUnit = new Uint32Array(assets.soldierUnit);
  const teams = assets.teams.map(team => (team === 1 ? 1 : 0));
  const mountedClasses = Object.entries(appearances)
    .filter(([, a]) => a.manifest.mounted)
    .map(([id]) => Number(id));
  const { width, height, pixelRatio } = settings.viewport;
  await scene.resize(Math.floor(width * pixelRatio), Math.floor(height * pixelRatio));
  await scene.setVisibility({
    grass: settings.grass,
    farGrass: settings.farGrass,
    bloom: settings.bloom,
    post: settings.post,
  });
  let disposed = false,
    busy = false,
    failed = false,
    time = 0;
  let camera: BattleReplayFrame['camera'] | null = null;
  const pool: CrowdInstance[] = [];
  const counts = {
    commands: 0,
    crowdUploads: 0,
    readoutUploads: 0,
    triangleUploads: 0,
    tacticalUploads: 0,
    presentations: 0,
    settles: 0,
  };
  const check = () => {
    if (disposed) throw Error('Native replay control disposed');
    if (failed) throw Error('Native replay must restart its scene after a failed command batch');
  };
  const present = async (onPresentation?: () => void) => {
    // Captured menu history initializes camera with draw/drawTris/tactical lines.
    // Do not substitute the frame's terminal camera for an earlier render.
    if (!camera) throw Error('Replay render precedes a captured camera command');
    await scene.prepare({ camera, time });
    check();
    const submitted = submitPresentation();
    try {
      onPresentation?.();
    } finally {
      await submitted;
    }
    check();
    counts.presentations++;
  };
  return {
    async submit(
      frame: BattleReplayFrame,
      publications: readonly GrassPublication[],
      onPresentation?: () => void,
    ) {
      check();
      if (busy) throw Error('Native replay submission already in flight');
      busy = true;
      try {
        queueGrassPublications(publications);
        const lastPresentation = frame.commands.reduce(
          (last, command, index) =>
            command.method === 'render' ||
            command.method === 'drawTacticalLines' ||
            command.method === 'settlePresentedFrame'
              ? index
              : last,
          -1,
        );
        for (const [index, command] of frame.commands.entries()) {
          const capture = index === lastPresentation ? onPresentation : undefined;
          check();
          switch (command.method) {
            case 'setTime':
              time = command.args[0];
              break;
            case 'draw': {
              const [positions, facings, playback, alive, count, nextCamera] = command.args;
              // Source frameDt currently only assigns an otherwise unused frame uniform;
              // pose timing comes from the complete recorded playback, not that delta.
              const built = buildCrowdInstances(
                {
                  positions,
                  facings,
                  playback,
                  alive,
                  count,
                  soldierUnit,
                  unitTeam: teams,
                  mountedClasses,
                  terrainHeight: scene.seatingHeightAt,
                },
                pool,
              );
              camera = nextCamera;
              await scene.uploadCrowd(built.instances, camera, time);
              counts.crowdUploads++;
              break;
            }
            case 'uploadUnitReadouts':
              await scene.uploadReadouts(...command.args);
              check();
              counts.readoutUploads++;
              break;
            case 'drawTris':
              await scene.uploadTriangles(command.args[0]);
              camera = command.args[1];
              counts.triangleUploads++;
              break;
            case 'drawTacticalLines':
              await scene.uploadTacticalLines(command.args[0]);
              camera = command.args[1];
              counts.tacticalUploads++;
              await present(capture);
              break;
            case 'render':
              await present(capture);
              break;
            case 'settlePresentedFrame':
              await scene.settleGrass(camera ?? undefined);
              check();
              if (camera) await present(capture);
              await waitForSubmittedWork();
              counts.settles++;
              break;
            default: {
              const unsupported: never = command;
              throw Error(
                `Unsupported recorded command: ${(unsupported as { method: string }).method}`,
              );
            }
          }
          counts.commands++;
        }
        assertGrassPublicationsConsumed();
        return {
          frameId: frame.frameId,
          simTick: frame.simTick,
          counts: { ...counts },
          scene: scene.stats(),
        };
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        busy = false;
      }
    },
    waitForSubmittedWork: () => {
      check();
      return waitForSubmittedWork();
    },
    stats() {
      check();
      return { ...counts, scene: scene.stats() };
    },
    dispose() {
      disposed = true;
      camera = null;
      pool.length = 0;
    },
  };
}
