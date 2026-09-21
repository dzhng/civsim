import { tgpu, d } from "typegpu";
import {
  IMPOSTOR_STATE_FLOATS,
  ImpostorRecord,
  ImpostorState,
  ImpostorViewBlock,
  impostorDerivation,
  impostorRecordFloats,
  impostorViewBlock,
  writeImpostorState,
} from "../../../../packages/battle-renderer/src/world/impostorDerivation";
import {
  SHADER_F32,
  compareImpostorRecords,
  duplicateCells,
  impostorRecordSuites,
  type RecordProbe,
} from "./impostorRecordCases";
import { IMPOSTOR_ATLAS_POLICY } from "../../../../packages/soldier-assets/src/impostorAtlas";
import type { ImpostorAtlasLayout } from "../../../../packages/soldier-assets/src/impostorAtlas";

/** Hardware numerical control for the derived billboard record. A compute stage runs the
 * SAME typed derivation the vertex stage compiles, over the SAME fixture the CPU suite
 * uses, and its actual buffer contents are read back and compared to `packImpostors`.
 * Tolerances come from `impostorRecordCases` and are declared before any comparison.
 *
 * Two dispatches per atlas. The first hands each probe its own view from a diagnostic
 * array, so one pass covers a fixture whose cases each carry a camera. The second proves
 * the claim this work exists for: with the soldier buffer written once and never touched
 * again, publishing a new camera through the 48-byte uniform alone makes every record
 * that camera's.
 *
 * Correctness only. Nothing here is a timing or parity result. */

const ATLASES: ImpostorAtlasLayout[] = [
  { ...IMPOSTOR_ATLAS_POLICY, center: [0.137, -0.241, 0.913], worldSpan: 1.7 },
  { ...IMPOSTOR_ATLAS_POLICY, columns: 6, rows: 4, center: [0.137, -0.241, 0.913], worldSpan: 1.7 },
];
/** A camera no fixture case uses, published by a uniform write alone. */
const MOVED = { right: [0, 1, 0], up: [0, 0, 1], eye: [-31.5, 12.25, 9.5], fovY: 0.55 } as const;

export const WORKGROUP = 64;
/** The two diagnostic compute stages, and the bindings they read. Pure TypeGPU: a test
 * resolves these without a device, and the check below runs them on one. */
export function impostorRecordEntries(atlas: ImpostorAtlasLayout, count: number) {
  const layout = tgpu.bindGroupLayout({
    view: { uniform: ImpostorViewBlock },
    views: { storage: d.arrayOf(ImpostorViewBlock, count), access: "readonly" },
    states: { storage: d.arrayOf(ImpostorState, count), access: "readonly" },
    records: { storage: d.arrayOf(ImpostorRecord, count), access: "mutable" },
  });
  const { deriveImpostorRecord } = impostorDerivation(atlas);
  /** Each probe derived against its own camera, so one dispatch covers the whole fixture. */
  const perProbeEntry = tgpu.computeFn({
    workgroupSize: [WORKGROUP],
    in: { id: d.builtin.globalInvocationId },
  })(({ id }) => {
    "use gpu";
    if (id.x < count)
      layout.$.records[id.x] = deriveImpostorRecord(layout.$.states[id.x], layout.$.views[id.x]);
  });
  /** Every probe derived against the one published camera: the view block alone decides. */
  const publishedEntry = tgpu.computeFn({
    workgroupSize: [WORKGROUP],
    in: { id: d.builtin.globalInvocationId },
  })(({ id }) => {
    "use gpu";
    if (id.x < count)
      layout.$.records[id.x] = deriveImpostorRecord(layout.$.states[id.x], layout.$.view);
  });
  return { layout, perProbeEntry, publishedEntry };
}

async function readBack(
  device: GPUDevice,
  source: GPUBuffer,
  bytes: number,
): Promise<Float32Array> {
  const staging = device.createBuffer({
    size: bytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(source, 0, staging, 0, bytes);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    return new Float32Array(staging.getMappedRange().slice(0));
  } finally {
    staging.destroy();
  }
}

/** An `ImpostorRecord` occupies eight floats in the buffer this reads back; expanding one
 *  into the nine the oracle writes belongs to the record's own owner. */
const RECORD_STRIDE = 8;
const readRecord = (records: Float32Array, index: number) => {
  const o = index * RECORD_STRIDE;
  return impostorRecordFloats({
    anchor: d.vec3f(records[o], records[o + 1], records[o + 2]),
    faction: records[o + 3],
    tile: records[o + 4],
    span: records[o + 5],
    angle: records[o + 6],
    living: records[o + 7],
  });
};

async function checkAtlas(device: GPUDevice, atlas: ImpostorAtlasLayout) {
  const suites = impostorRecordSuites(atlas);
  const probes: RecordProbe[] = Object.values(suites).flat();
  const count = probes.length;
  const root = tgpu.initFromDevice({ device });
  const owned: { destroy(): void }[] = [];
  try {
    const { layout, perProbeEntry, publishedEntry } = impostorRecordEntries(atlas, count);
    const view = root.createBuffer(ImpostorViewBlock).$usage("uniform");
    const views = root.createBuffer(d.arrayOf(ImpostorViewBlock, count)).$usage("storage");
    const states = root.createBuffer(d.arrayOf(ImpostorState, count)).$usage("storage");
    const records = root.createBuffer(d.arrayOf(ImpostorRecord, count)).$usage("storage");
    owned.push(view, views, states, records);

    const group = root.createBindGroup(layout, { view, views, states, records });
    const perProbe = root.createComputePipeline({ compute: perProbeEntry }).with(group);
    const published = root.createComputePipeline({ compute: publishedEntry }).with(group);
    await Promise.all([perProbe.initAsync(), published.initAsync()]);

    const staging = new Float32Array(count * IMPOSTOR_STATE_FLOATS);
    probes.forEach((probe, index) =>
      writeImpostorState(probe.instance, staging, index * IMPOSTOR_STATE_FLOATS),
    );
    states.write(staging.buffer);
    views.write(probes.map((probe) => impostorViewBlock(probe.view)));
    const stateBytes = root.unwrap(states).size;
    const recordBytes = root.unwrap(records).size;

    const dispatch = async (pipeline: typeof perProbe) => {
      const encoder = device.createCommandEncoder({ label: "typegpu-impostor-records" });
      pipeline.with(encoder).dispatchWorkgroups(Math.ceil(count / WORKGROUP));
      device.queue.submit([encoder.finish()]);
      return readBack(device, root.unwrap(records), recordBytes);
    };

    const own = await dispatch(perProbe);
    const declared = compareImpostorRecords(
      atlas,
      probes,
      (_probe, index) => readRecord(own, index),
      SHADER_F32,
    );

    // The soldier buffer is not written again. Only the view block is.
    view.write(impostorViewBlock(MOVED));
    const after = await dispatch(published);
    const movedProbes = probes.map((probe) => ({ ...probe, view: MOVED, direction: undefined }));
    const moved = compareImpostorRecords(
      atlas,
      movedProbes,
      (_probe, index) => readRecord(after, index),
      SHADER_F32,
    );

    return {
      atlas: `${atlas.columns}x${atlas.rows}`,
      probes: count,
      suites: Object.fromEntries(Object.entries(suites).map(([name, list]) => [name, list.length])),
      duplicateCells: duplicateCells(atlas),
      tolerance: SHADER_F32.label,
      dotBand: SHADER_F32.dot,
      // What one soldier costs against what the whole camera costs.
      stateStrideBytes: d.sizeOf(ImpostorState),
      viewBlockBytes: d.sizeOf(ImpostorViewBlock),
      stateBytes,
      recordBytes,
      perProbeCamera: declared,
      cameraMovedByUniformAlone: moved,
      passed:
        declared.faults.length === 0 &&
        declared.nonfinite.length === 0 &&
        moved.faults.length === 0 &&
        moved.nonfinite.length === 0,
    };
  } finally {
    for (const resource of owned) resource.destroy();
    root.destroy();
  }
}

export async function runImpostorRecordCheck(device: GPUDevice) {
  device.pushErrorScope("validation");
  let scopeOpen = true;
  const closeScope = async () => {
    if (!scopeOpen) return null;
    scopeOpen = false;
    return await device.popErrorScope();
  };
  try {
    const results = [];
    for (const atlas of ATLASES) results.push(await checkAtlas(device, atlas));
    const validationError = await closeScope();
    return {
      results,
      validationError: validationError?.message ?? null,
      passed: results.every((result) => result.passed) && !validationError,
    };
  } finally {
    await closeScope();
  }
}
