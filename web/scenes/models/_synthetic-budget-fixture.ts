import type { AppearanceBundle } from "../../../packages/soldier-assets/src/appearanceBundle";
import type { ActionObservation } from "../../../packages/crowd-runtime/src/actionTimeline";
import type { SoldierMeshData } from "../../../packages/soldier-assets/src/mesh";
import { mountedTemporalFixture } from "./_mounted-temporal-fixture";
import { bakeLocalAnimation } from "../../../packages/soldier-assets/src/localAnimation";
import { sampleRigLocalPoseSeconds } from "../../../packages/soldier-assets/src/localPose";

/** Interleaved observed histories, with a setup length independent of crowd size. */
export function staggeredBudgetObservations(
  count: number,
  tick: number,
  appearanceId: number,
): ActionObservation[] {
  return Array.from({ length: count }, (_, index) => ({
    appearanceId,
    alive: true,
    health: 100,
    mountHealth: 100,
    speedMps: tick >= [1, 3, 6][index % 3] ? 1 : 0,
    forwardMps: tick >= [1, 3, 6][index % 3] ? 1 : 0,
    routing: false,
    incapacitated: false,
    guardedFacing: false,
    lateralMps: 0,
    running: tick >= 13,
    atEase: false,
    pikeReady: false,
    fighting: false,
    releaseTtl: tick >= 12 && tick < 18 ? 0.5 - (tick - 12) / 30 : 0,
    releaseAgeSeconds: tick >= 12 && tick < 18 ? (tick - 12) / 30 : 0,
  }));
}

export interface SyntheticBudgetOptions {
  /** Midpoint passes per mesh tier; far geometry stays fixed. */
  subdivisions?: [number, number, number];
  /** Total equivalent joints per weighted seed joint, including the original. */
  jointCopies?: number;
  /** Four changes palette-address locality, not the fixed four-slot shader. */
  influences?: 1 | 4;
  /** Equal subintervals of existing authored intervals, not a fixed-rate bake. */
  keySubdivisions?: number;
}

/** Fixed UV-space checker across resolutions: changes texture cost, not pattern density.
 * Generated locally in the browser; these diagnostic maps are never soldier art. */
export async function budgetTextureSurface(
  surface: AppearanceBundle["surface"],
  size: number,
): Promise<AppearanceBundle["surface"]> {
  if (!Number.isSafeInteger(size) || size < 16)
    throw new Error("Texture size must be an integer >=16");
  const result = structuredClone(surface);
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d")!;
  for (const channel of ["baseColor", "normal", "orm"] as const) {
    const colors =
      channel === "baseColor"
        ? [
            [190, 180, 160, 255],
            [210, 200, 180, 255],
          ]
        : channel === "normal"
          ? [
              [124, 128, 255, 255],
              [132, 128, 255, 255],
            ]
          : [
              [235, 150, 16, 255],
              [255, 170, 32, 255],
            ];
    const pixels = context.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const checker = (Math.floor((x * 16) / size) + Math.floor((y * 16) / size)) % 2;
        pixels.data.set(colors[checker], (y * size + x) * 4);
      }
    context.putImageData(pixels, 0, 0);
    const png = await canvas.convertToBlob({ type: "image/png" });
    result.textures[channel] = {
      image: new Uint8Array(await png.arrayBuffer()),
      mimeType: "image/png",
      sampler: {
        magFilter: "linear",
        minFilter: "linear",
        mipmapFilter: "linear",
        wrapS: "repeat",
        wrapT: "repeat",
      },
    };
  }
  result.materials = result.materials.map((material) => ({
    ...material,
    textures: { baseColor: true, normal: true, metallicRoughness: true, occlusion: true },
  }));
  return result;
}

/** Numerical cost subject only. Equivalent surfaces are not new model art. */
export function syntheticBudgetFixture(
  source: AppearanceBundle,
  options: SyntheticBudgetOptions = {},
): AppearanceBundle {
  const fixture = mountedTemporalFixture(source);
  const subdivisions = options.subdivisions ?? [0, 0, 0];
  for (const [tier, passes] of subdivisions.entries()) {
    if (!Number.isSafeInteger(passes) || passes < 0)
      throw new Error("Subdivision passes must be nonnegative integers");
    for (let pass = 0; pass < passes; pass++) fixture.tiers[tier] = subdivide(fixture.tiers[tier]);
  }
  const copies = options.jointCopies ?? 1;
  if (!Number.isSafeInteger(copies) || copies < 1)
    throw new Error("Joint copies must be positive integers");
  const influences = options.influences ?? 1;
  if (![1, 4].includes(influences) || influences > copies)
    throw new Error("Influences require one or four available joint copies");
  if (copies > 1) expandJoints(fixture, copies, influences);
  const keySubdivisions = options.keySubdivisions ?? 1;
  if (!Number.isSafeInteger(keySubdivisions) || keySubdivisions < 1)
    throw new Error("Key subdivisions must be positive integers");
  if (keySubdivisions > 1) {
    const original = structuredClone(fixture.rig);
    for (const clip of fixture.rig.clips) {
      const samples = new Map<number, ReturnType<typeof sampleRigLocalPoseSeconds>>();
      for (const [joint, track] of Object.entries(clip.tracks)) {
        for (const field of ["T", "R", "S"] as const) {
          const channel = track[field];
          if (!channel) continue;
          const width = field === "R" ? 4 : 3,
            offset = Number(joint) * 10 + (field === "T" ? 0 : field === "R" ? 3 : 7);
          const times: number[] = [],
            values: number[] = [];
          channel.times.forEach((time, index) => {
            times.push(time);
            values.push(...channel.values.slice(index * width, (index + 1) * width));
            if (index + 1 === channel.times.length) return;
            for (let part = 1; part < keySubdivisions; part++) {
              const inserted = time + ((channel.times[index + 1] - time) * part) / keySubdivisions;
              if (inserted > clip.duration) continue;
              times.push(inserted);
              if (!samples.has(inserted))
                samples.set(inserted, sampleRigLocalPoseSeconds(original, clip.name, inserted));
              values.push(...samples.get(inserted)!.slice(offset, offset + width));
            }
          });
          track[field] = { ...channel, times, values };
        }
      }
    }
  }
  fixture.animation = bakeLocalAnimation(fixture.rig);
  return fixture;
}

function expandJoints(fixture: AppearanceBundle, copies: number, influences: 1 | 4): void {
  const pools = new Map<number, number[]>();
  for (const mesh of fixture.tiers)
    for (let i = 0; i < mesh.joints.length; i += 4) {
      if (mesh.weights[i] !== 1 || mesh.weights.slice(i + 1, i + 4).some((w) => w !== 0))
        throw new Error("Synthetic joint expansion requires a rigid seed");
      pools.set(mesh.joints[i], [mesh.joints[i]]);
    }
  if (fixture.rig.bones.length + pools.size * (copies - 1) > 65536)
    throw new Error("Synthetic joints exceed the mesh index width");
  const mask = fixture.manifest.presentation!.riderUpperBodyJoints!;
  // Equivalent siblings add palette work without changing motion or hierarchy depth.
  for (const [joint, pool] of pools) {
    const bone = fixture.rig.bones[joint];
    for (let copy = 1; copy < copies; copy++) {
      const index = fixture.rig.bones.length;
      const name = `${bone.name}-budget-${copy}`;
      fixture.rig.bones.push({ ...structuredClone(bone), name });
      for (const clip of fixture.rig.clips)
        if (clip.tracks[joint]) clip.tracks[index] = structuredClone(clip.tracks[joint]);
      if (mask.includes(bone.name)) mask.push(name);
      pool.push(index);
    }
  }
  const used = new Set<number>();
  for (const mesh of fixture.tiers) {
    const counters = new Map<number, number>();
    for (let i = 0; i < mesh.joints.length; i += 4) {
      const joint = mesh.joints[i],
        cursor = counters.get(joint) ?? 0;
      const pool = pools.get(joint)!;
      for (let influence = 0; influence < 4; influence++) {
        mesh.joints[i + influence] = pool[(cursor + (influence % influences)) % copies];
        mesh.weights[i + influence] = influence < influences ? 1 / influences : 0;
        if (influence < influences) used.add(mesh.joints[i + influence]);
      }
      counters.set(joint, cursor + 1);
    }
  }
  for (const pool of pools.values())
    if (pool.some((joint) => !used.has(joint)))
      throw new Error("Joint copies exceed referenced seed vertices; subdivide first");
}

function subdivide(mesh: SoldierMeshData): SoldierMeshData {
  const fields = Object.keys(mesh).filter((field) => field !== "indices") as Exclude<
    keyof SoldierMeshData,
    "indices"
  >[];
  const count = mesh.positions.length / 3;
  const values = Object.fromEntries(
    fields.map((field) => [field, Array.from(mesh[field])]),
  ) as Record<(typeof fields)[number], number[]>;
  const edges = new Map<string, number>();
  const midpoint = (a: number, b: number) => {
    const key = a < b ? `${a}/${b}` : `${b}/${a}`;
    if (edges.has(key)) return edges.get(key)!;
    const index = values.positions.length / 3;
    for (const field of fields) {
      const width = mesh[field].length / count;
      for (let component = 0; component < width; component++) {
        const va = mesh[field][a * width + component],
          vb = mesh[field][b * width + component];
        // This rigid, flat seed avoids influence truncation and categorical interpolation.
        if (
          ["joints", "weights", "materialIds", "normals", "tangents"].includes(field) &&
          va !== vb
        )
          throw new Error(`Synthetic subdivision requires matching edge ${field}`);
        values[field].push((va + vb) / 2);
      }
    }
    edges.set(key, index);
    return index;
  };
  const indices: number[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = mesh.indices.subarray(i, i + 3);
    const ab = midpoint(a, b),
      bc = midpoint(b, c),
      ca = midpoint(c, a);
    indices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return {
    ...Object.fromEntries(
      fields.map((field) => [
        field,
        field === "joints" ? Uint16Array.from(values[field]) : Float32Array.from(values[field]),
      ]),
    ),
    indices:
      values.positions.length / 3 > 65536 ? Uint32Array.from(indices) : Uint16Array.from(indices),
  } as SoldierMeshData;
}
