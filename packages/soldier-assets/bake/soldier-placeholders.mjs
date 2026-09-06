import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakeRig, mat4FromTRS } from './vat.mjs';
import { createPlaceholderSoldierMeshTiers, PLACEHOLDER_MATERIALS } from '../src/soldierMesh.ts';
import { encodeSoldierMesh } from '../src/appearanceBundle.ts';
import { deriveAnimatedBounds } from './animated-bounds.mjs';

const ASSET_ROOTS = [new URL('../assets/', import.meta.url), new URL('../../../web/public/assets/soldiers/', import.meta.url)];
const FPS = 12;

const qx = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const qy = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const qz = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
const channel = (times, values) => ({ times, values: values.flat() });

function inverseBindTranslations(binds) {
  const world = [];
  for (const b of binds) {
    const parent = b.parent >= 0 ? world[b.parent] : [0, 0, 0];
    world.push([parent[0] + b.bind.T[0], parent[1] + b.bind.T[1], parent[2] + b.bind.T[2]]);
  }
  return world.map((t) => mat4FromTRS([-t[0], -t[1], -t[2]], [0, 0, 0, 1], [1, 1, 1]));
}

export function placeholderRig() {
  const binds = [
    { name: 'hips', parent: -1, bind: { T: [0, 0, 0.95], R: [0, 0, 0, 1], S: [1, 1, 1] } },
    { name: 'spine', parent: 0, bind: { T: [0, 0.02, 0.45], R: [0, 0, 0, 1], S: [1, 1, 1] } },
    { name: 'head', parent: 1, bind: { T: [0, 0, 0.42], R: [0, 0, 0, 1], S: [1, 1, 1] } },
    { name: 'arm_l', parent: 1, bind: { T: [-0.33, 0, 0.14], R: [0, 0, 0, 1], S: [1, 1, 1] } },
    { name: 'arm_r', parent: 1, bind: { T: [0.33, 0, 0.14], R: [0, 0, 0, 1], S: [1, 1, 1] } },
    { name: 'leg_l', parent: 0, bind: { T: [-0.16, 0, 0.00], R: [0, 0, 0, 1], S: [1, 1, 1] } },
    { name: 'leg_r', parent: 0, bind: { T: [0.16, 0, 0.00], R: [0, 0, 0, 1], S: [1, 1, 1] } },
  ];
  const inverse = inverseBindTranslations(binds);
  const bones = binds.map((b, i) => ({ ...b, inverseBind: inverse[i] }));
  const loop = [0, 0.25, 0.5, 0.75, 1];
  const swing = (amp, phase = 1) => loop.map((t) => qx(Math.sin((t * Math.PI * 2) + phase) * amp));
  const clips = [
    { name: 'idle', duration: 1, tracks: { 1: { R: channel(loop, loop.map((t) => qy(Math.sin(t * Math.PI * 2) * 0.03))) } } },
    {
      name: 'march', duration: 1, tracks: {
        3: { R: channel(loop, swing(0.38, 0)) },
        4: { R: channel(loop, swing(0.38, Math.PI)) },
        5: { R: channel(loop, swing(0.26, Math.PI)) },
        6: { R: channel(loop, swing(0.26, 0)) },
      },
    },
    {
      name: 'run', duration: 0.65, tracks: {
        0: { R: channel([0, 0.5, 1], [qx(-0.1), qx(0.08), qx(-0.1)]) },
        3: { R: channel(loop, swing(0.46, 0)) },
        4: { R: channel(loop, swing(0.46, Math.PI)) },
        5: { R: channel(loop, swing(0.38, Math.PI)) },
        6: { R: channel(loop, swing(0.38, 0)) },
      },
    },
    {
      name: 'attack_a', duration: 0.7, tracks: {
        1: { R: channel([0, 0.45, 1], [qz(0), qz(-0.22), qz(0.05)]) },
        4: { R: channel([0, 0.35, 0.7], [qx(-0.65), qx(1.2), qx(-0.25)]) },
      },
    },
    {
      name: 'shoot', duration: 0.75, tracks: {
        1: { R: channel([0, 0.55, 1], [qz(0.04), qz(-0.08), qz(0.02)]) },
        3: { R: channel([0, 0.55, 1], [qx(-0.75), qx(-1.18), qx(-0.78)]) },
        4: { R: channel([0, 0.55, 0.72, 1], [qx(-0.42), qx(1.08), qx(-0.2), qx(-0.42)]) },
      },
    },
    { name: 'hit_a', duration: 0.35, tracks: { 1: { R: channel([0, 0.5, 1], [qx(0), qx(-0.45), qx(0.05)]) } } },
    {
      name: 'death_a', duration: 0.9, tracks: {
        0: { R: channel([0, 1], [qx(0), qx(1.35)]), T: channel([0, 1], [[0, 0, 0.95], [0, 0.18, 0.28]]) },
        1: { R: channel([0, 1], [qx(0), qx(0.5)]) },
      },
    },
    { name: 'at_ease', duration: 1, tracks: { 3: { R: channel([0, 1], [qx(-0.1), qx(-0.1)]) }, 4: { R: channel([0, 1], [qx(-0.1), qx(-0.1)]) } } },
  ];
  return { bones, clips: clips.map((clip) => ({ ...clip, loop: ['idle', 'march', 'run', 'at_ease'].includes(clip.name) })) };
}

const ARCHETYPES = {
  0: { name: 'heavy-sword', mounted: false },
  1: { name: 'light-spear', mounted: false },
  2: { name: 'longsword', mounted: false },
  3: { name: 'phalanx', mounted: false },
  4: { name: 'archers', mounted: false },
  5: { name: 'skirmishers', mounted: false },
  6: { name: 'shock-cav', mounted: true },
  7: { name: 'horse-archers', mounted: true },
  8: { name: 'artillery-crew', mounted: false },
  9: { name: 'peasant', mounted: false },
  10: { name: 'light-sword', mounted: false },
  11: { name: 'heavy-spear', mounted: false },
  12: { name: 'medium-infantry', mounted: false },
  13: { name: 'medium-spear', mounted: false },
  14: { name: 'medium-phalanx', mounted: false },
  15: { name: 'shock-cav-sidearm', mounted: true },
  16: { name: 'heavy-phalanx-rest', mounted: false },
  17: { name: 'medium-phalanx-rest', mounted: false },
  18: { name: 'heavy-phalanx-sidearm', mounted: false },
  19: { name: 'medium-phalanx-sidearm', mounted: false },
};

function hashFloats(data) {
  return createHash('sha256').update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, value.indexFormat ? undefined : 2)}\n`;
}

function completeBundleFiles(rig, animation) {
  const files = {
    'baked/human-placeholder.skeleton.json': {
      ...rig, bones: rig.bones.map((bone) => ({ ...bone, inverseBind: Array.from(bone.inverseBind) })),
    },
    'baked/placeholder.materials.json': PLACEHOLDER_MATERIALS,
  };
  const appearances = {};
  const meshes = createPlaceholderSoldierMeshTiers();
  for (const [id, archetype] of Object.entries(ARCHETYPES)) {
    const path = `appearances/${archetype.name}`;
    const tiers = meshes[Number(id)];
    const tierPaths = tiers.map((mesh, lod) => {
      const name = `tier-${lod}.mesh.json`;
      files[`${path}/${name}`] = encodeSoldierMesh(mesh);
      return name;
    });
    appearances[id] = `${path}/appearance.json`;
    files[appearances[id]] = {
      name: archetype.name, mounted: archetype.mounted,
      skeleton: '../../baked/human-placeholder.skeleton.json',
      animation: '../../baked/human-placeholder.vat.json',
      materials: '../../baked/placeholder.materials.json',
      tiers: tierPaths,
      // Far atlases retain the complete equipment silhouette, not the coarse tier's omissions.
      far: { mesh: tierPaths[0], clip: 'idle', phase: 0 },
      bounds: deriveAnimatedBounds(tiers, animation),
    };
  }
  files['catalog.json'] = { appearances };
  return files;
}

export async function bakePlaceholder({ write = true } = {}) {
  const rig = placeholderRig();
  const baked = bakeRig(rig, FPS);
  const out = {
    schema: 1,
    skeleton: 'human-placeholder',
    fps: FPS,
    width: baked.width,
    height: baked.height,
    bones: baked.bones,
    clips: baked.clips,
    layout: 'RGBA32F, mat4 columns in rows bone*4..bone*4+3',
    sha256: hashFloats(baked.data),
    data: Array.from(baked.data, (v) => Number(v.toFixed(8))),
  };
  const files = completeBundleFiles(rig, out);
  files['baked/human-placeholder.vat.json'] = out;
  if (write) {
    for (const root of ASSET_ROOTS) {
      for (const [path, content] of Object.entries(files)) {
        const url = new URL(path, root);
        await mkdir(dirname(fileURLToPath(url)), { recursive: true });
        await writeFile(url, stableJson(content));
      }
    }
  }
  return { out, archetypes: ARCHETYPES, files };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const check = process.argv.includes('--check');
  const next = await bakePlaceholder({ write: !check });
  if (check) {
    let ok = true;
    for (const root of ASSET_ROOTS) {
      const appearanceRoot = new URL('appearances/', root);
      const entries = await readdir(appearanceRoot, { recursive: true, withFileTypes: true }).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return [];
      });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const path = `${entry.parentPath}/${entry.name}`;
        const relative = path.slice(fileURLToPath(root).length);
        if (!(relative in next.files)) {
          console.error(`obsolete generated asset: ${path}`);
          ok = false;
        }
      }
      for (const [path, content] of Object.entries(next.files)) {
        const url = new URL(path, root);
        const current = await readFile(url, 'utf8').catch((error) => {
          if (error.code !== 'ENOENT') throw error;
          return null;
        });
        if (current !== stableJson(content)) {
          console.error(`stale or missing generated asset: ${fileURLToPath(url)}`);
          ok = false;
        }
      }
    }
    if (!ok) {
      console.error('placeholder soldier bake is not up to date or not deterministic');
      process.exitCode = 1;
    } else {
      console.log('placeholder soldier bake is deterministic');
    }
  } else {
    console.log(`wrote ${Object.keys(next.files).length} placeholder assets to package and web roots`);
  }
}
