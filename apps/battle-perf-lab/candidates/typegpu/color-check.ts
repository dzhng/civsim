import { tgpu, d } from "typegpu";
import {
  linearAlbedo,
  factionAccent,
} from "../../../../packages/battle-renderer/src/shaders/soldierFactionTyped";
import { soldierFactionWGSL } from "../../../../packages/battle-renderer/src/shaders/soldierFaction";
import { factionForTeam } from "../../../../packages/game-renderer/src/battle/factionColors";

/** Numerical control for the typed soldier-faction helpers. The same inputs run through the
 * typed TypeGPU bodies and through the untouched raw WGSL on one device, and every output
 * word is compared bit for bit. The raw module is the independent oracle and is never routed
 * through TypeGPU here. Correctness only; this is not a timing or parity result. */

const SRGB_EDGE = 0.04045;
const ACCENT_CLOTH: Triple = [0.42, 0.34, 0.26];
/** Loose bound for the JS double reference below; the typed-vs-raw gate itself is exact. */
const REFERENCE_TOLERANCE = 1e-6;

type Triple = [number, number, number];

/** Neighbouring f32 values, so the `c <= 0.04045` branch is probed from both sides. */
function ulp(value: number, steps: number): number {
  const bytes = new ArrayBuffer(4);
  const floats = new Float32Array(bytes);
  const ints = new Int32Array(bytes);
  floats[0] = Math.fround(value);
  ints[0] += floats[0] >= 0 ? steps : -steps;
  return floats[0];
}

const gray = (value: number): Triple => [value, value, value];

const colorCases: { label: string; rgb: Triple }[] = [
  { label: "black", rgb: gray(0) },
  { label: "white", rgb: gray(1) },
  { label: "srgb-edge", rgb: gray(SRGB_EDGE) },
  { label: "srgb-edge-minus-1ulp", rgb: gray(ulp(SRGB_EDGE, -1)) },
  { label: "srgb-edge-plus-1ulp", rgb: gray(ulp(SRGB_EDGE, 1)) },
  { label: "srgb-edge-minus-4ulp", rgb: gray(ulp(SRGB_EDGE, -4)) },
  { label: "srgb-edge-plus-4ulp", rgb: gray(ulp(SRGB_EDGE, 4)) },
  { label: "srgb-edge-straddled", rgb: [ulp(SRGB_EDGE, -1), SRGB_EDGE, ulp(SRGB_EDGE, 1)] },
  { label: "srgb-edge-minus-1e-5", rgb: gray(SRGB_EDGE - 1e-5) },
  { label: "srgb-edge-plus-1e-5", rgb: gray(SRGB_EDGE + 1e-5) },
  { label: "srgb-edge-minus-1e-3", rgb: gray(SRGB_EDGE - 1e-3) },
  { label: "srgb-edge-plus-1e-3", rgb: gray(SRGB_EDGE + 1e-3) },
  { label: "near-zero", rgb: gray(1e-8) },
  { label: "dark-mixed", rgb: [0, 1e-4, 0.02] },
  { label: "faction-0-primary", rgb: [...factionForTeam(0).primary] as Triple },
  { label: "faction-1-primary", rgb: [...factionForTeam(1).primary] as Triple },
  { label: "faction-neutral-primary", rgb: [...factionForTeam(2).primary] as Triple },
  { label: "accent-cloth", rgb: ACCENT_CLOTH },
  // Representative range: an ascending ramp per channel, offset so no sample is a pure gray.
  ...Array.from({ length: 33 }, (_, step) => {
    const base = step / 32;
    return {
      label: `ramp-${step}`,
      rgb: [base, (base + 1 / 3) % 1, (base + 2 / 3) % 1] as Triple,
    };
  }),
];

const factionCases: { label: string; faction: number }[] = [
  { label: "team-0", faction: 0 },
  { label: "team-1", faction: 1 },
  { label: "neutral", faction: 2 },
  { label: "boundary-0.5", faction: 0.5 },
  { label: "boundary-0.5-minus-1ulp", faction: ulp(0.5, -1) },
  { label: "boundary-0.5-plus-1ulp", faction: ulp(0.5, 1) },
  { label: "boundary-1.5", faction: 1.5 },
  { label: "boundary-1.5-minus-1ulp", faction: ulp(1.5, -1) },
  { label: "boundary-1.5-plus-1ulp", faction: ulp(1.5, 1) },
  { label: "below-first-team", faction: -0.25 },
  { label: "above-neutral", faction: 2.5 },
  // Representative range across and past both step edges.
  ...Array.from({ length: 33 }, (_, step) => ({
    label: `sweep-${step}`,
    faction: (step / 32) * 2.5 - 0.25,
  })),
];

const COLOR_SAMPLES = Array.from(
  { length: Math.max(colorCases.length, factionCases.length) },
  (_, index) => {
    const color = colorCases[index % colorCases.length];
    const faction = factionCases[index % factionCases.length];
    return { label: `${color.label}|${faction.label}`, rgb: color.rgb, faction: faction.faction };
  },
);

const COUNT = COLOR_SAMPLES.length;
const OUTPUT_FLOATS = COUNT * 2 * 4;
const Inputs = d.arrayOf(d.vec4f, COUNT);
const Outputs = d.arrayOf(d.vec4f, COUNT * 2);

const layout = tgpu.bindGroupLayout({
  src: { storage: Inputs, access: "readonly" },
  dst: { storage: Outputs, access: "mutable" },
});

const typedEntry = tgpu.computeFn({
  workgroupSize: [64],
  in: { id: d.builtin.globalInvocationId },
})(({ id }) => {
  "use gpu";
  if (id.x < COUNT) {
    const sample = layout.$.src[id.x];
    layout.$.dst[id.x * 2] = d.vec4f(linearAlbedo(sample.xyz), 0);
    layout.$.dst[id.x * 2 + 1] = d.vec4f(factionAccent(sample.w), 0);
  }
});

const rawShader = `@group(0) @binding(0) var<storage, read> src : array<vec4f, ${COUNT}>;
@group(0) @binding(1) var<storage, read_write> dst : array<vec4f, ${COUNT * 2}>;
${soldierFactionWGSL}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id : vec3u) {
  if (id.x < ${COUNT}u) {
    let sample = src[id.x];
    dst[id.x * 2u] = vec4f(linearAlbedo(sample.xyz), 0);
    dst[id.x * 2u + 1u] = vec4f(factionAccent(sample.w), 0);
  }
}`;

/** The formula again in JS doubles, as a coarse guard against both GPU paths being broken
 * the same way. It is not the equality oracle — the raw WGSL is. */
function referenceLinearAlbedo(rgb: Triple): Triple {
  return rgb.map((c) =>
    c <= SRGB_EDGE ? c * 0.0773993808 : (c * 0.9478672986 + 0.0521327014) ** 2.4,
  ) as Triple;
}

function referenceFactionAccent(faction: number): Triple {
  const team = faction < 1.5 ? (faction < 0.5 ? 0 : 1) : 2;
  const primary = referenceLinearAlbedo([...factionForTeam(team).primary] as Triple);
  const cloth = referenceLinearAlbedo(ACCENT_CLOTH);
  return primary.map((channel, i) => channel * 0.65 + cloth[i] * 0.35) as Triple;
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
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(source, 0, staging, 0, bytes);
  device.queue.submit([encoder.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const copy = staging.getMappedRange().slice(0);
  staging.unmap();
  staging.destroy();
  return new Float32Array(copy);
}

async function runColorNumericalCheck(device: GPUDevice) {
  device.pushErrorScope("validation");
  let scopeOpen = true;
  const closeScope = async () => {
    if (!scopeOpen) return null;
    scopeOpen = false;
    return await device.popErrorScope();
  };
  const root = tgpu.initFromDevice({ device });
  const inputBytes = COUNT * 16;
  const outputBytes = OUTPUT_FLOATS * 4;
  const storage = (bytes: number) =>
    device.createBuffer({
      size: bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
  const input = storage(inputBytes);
  const typedOutput = storage(outputBytes);
  const rawOutput = storage(outputBytes);
  try {
    const packed = new Float32Array(COUNT * 4);
    COLOR_SAMPLES.forEach((sample, index) => {
      packed.set([...sample.rgb, sample.faction], index * 4);
    });
    device.queue.writeBuffer(input, 0, packed);

    const typedPipeline = root.createComputePipeline({ compute: typedEntry }).with(
      root.createBindGroup(layout, {
        src: root.createBuffer(Inputs, input).$usage("storage"),
        dst: root.createBuffer(Outputs, typedOutput).$usage("storage"),
      }),
    );
    const rawPipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: device.createShaderModule({ code: rawShader }), entryPoint: "main" },
    });
    const rawGroup = device.createBindGroup({
      layout: rawPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: input } },
        { binding: 1, resource: { buffer: rawOutput } },
      ],
    });
    await typedPipeline.initAsync();

    const workgroups = Math.ceil(COUNT / 64);
    const encoder = device.createCommandEncoder({ label: "typegpu-color-check" });
    typedPipeline.with(encoder).dispatchWorkgroups(workgroups);
    const rawPass = encoder.beginComputePass();
    rawPass.setPipeline(rawPipeline);
    rawPass.setBindGroup(0, rawGroup);
    rawPass.dispatchWorkgroups(workgroups);
    rawPass.end();
    device.queue.submit([encoder.finish()]);

    const typed = await readBack(device, typedOutput, outputBytes);
    const raw = await readBack(device, rawOutput, outputBytes);
    const typedBits = new Uint32Array(typed.buffer);
    const rawBits = new Uint32Array(raw.buffer);

    const mismatches: unknown[] = [];
    const referenceDeviations: unknown[] = [];
    let maxReferenceDeviation = 0;
    COLOR_SAMPLES.forEach((sample, index) => {
      const expected = [referenceLinearAlbedo(sample.rgb), referenceFactionAccent(sample.faction)];
      ["linearAlbedo", "factionAccent"].forEach((fn, slot) => {
        const base = (index * 2 + slot) * 4;
        for (let channel = 0; channel < 3; channel++) {
          const at = base + channel;
          if (typedBits[at] !== rawBits[at]) {
            mismatches.push({
              sample: sample.label,
              fn,
              channel,
              input: fn === "linearAlbedo" ? sample.rgb[channel] : sample.faction,
              typed: typed[at],
              raw: raw[at],
              typedBits: typedBits[at],
              rawBits: rawBits[at],
            });
          }
          const deviation = Math.abs(typed[at] - expected[slot][channel]);
          maxReferenceDeviation = Math.max(maxReferenceDeviation, deviation);
          if (deviation > REFERENCE_TOLERANCE) {
            referenceDeviations.push({
              sample: sample.label,
              fn,
              channel,
              typed: typed[at],
              reference: expected[slot][channel],
              deviation,
            });
          }
        }
      });
    });

    const produced = typed.some((value) => value !== 0);
    const validationError = await closeScope();
    return {
      samples: COUNT,
      colorCases: colorCases.length,
      factionCases: factionCases.length,
      comparedWords: COUNT * 2 * 3,
      mismatches,
      referenceDeviations,
      maxReferenceDeviation,
      produced,
      validationError: validationError?.message ?? null,
      passed:
        mismatches.length === 0 && referenceDeviations.length === 0 && produced && !validationError,
    };
  } finally {
    await closeScope();
    input.destroy();
    typedOutput.destroy();
    rawOutput.destroy();
    root.destroy();
  }
}

const report = await (async () => {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter available");
  const device = await adapter.requestDevice();
  try {
    return await runColorNumericalCheck(device);
  } finally {
    device.destroy();
  }
})().catch((error: unknown) => ({ passed: false, error: String(error) }));
document.querySelector("#result")!.textContent = JSON.stringify(report, null, 2);
Object.assign(window, { __typegpuColors: report });
