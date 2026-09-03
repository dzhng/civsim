# 08 — pass-primitives

**Contract unlocked:** the growable vertex buffer and the camera-only render
pipeline have one owner in `renderer-core`; campaign passes compose them.

## Seam

`packages/renderer-core/src/gpuBuffers.ts`:

```ts
export class GrowableBuffer {
  constructor(device: GPUDevice, label: string, usage: GPUBufferUsageFlags, floorBytes: number);
  readonly buffer: GPUBuffer; readonly capacityBytes: number;
  /** true when reallocated — rebuild any bind group that holds it */
  write(data: ArrayBufferView): boolean;
}
export function makeVertexBuffer(device: GPUDevice, label: string, data: Float32Array): GPUBuffer;
export function makeIndexBuffer(device: GPUDevice, label: string, data: Uint16Array): GPUBuffer; // pads to 4 bytes
```

`packages/renderer-core/src/pipelineContracts.ts` (already owns
`gpuMultisample`, `gpuWorldDepthStencil`):

```ts
export function cameraOnlyPipeline(shell: RawFrameShell, spec: {
  label: string; module: GPUShaderModule; buffers: GPUVertexBufferLayout[];
  target: "opaque" | "alpha"; depth: GpuDepthMode | null;
  topology?: GPUPrimitiveTopology; extraBindGroupLayouts?: GPUBindGroupLayout[];
}): GPURenderPipeline;
```

Consumers ported in one pass: `selectionPass.ts:152` (gets a floor),
`sceneryPass.ts:193, 269-278`, `entityPass.ts` (`ensure*` ×2, private
`makeVertexBuffer`/`makeIndexBuffer`), `standardPass.ts` (`ensure*` ×2),
the `mapPass.ts` pass classes (873/940/1021/1187), `soldierShadowPass.ts:70`,
`skinnedPipeline.ts:433`. The growth policy is today's
`Math.max(n, capacity*2, 128)`.

Firewall: the regex gates require `drawOpaque(pass: WorldRenderPass)`,
`drawShadows(...)`, `draw(pass: OverlayRenderPass)` to stay verbatim in the
named pass files; the helper sits behind them.

## Decisions resolved here

One growth policy; index buffers pad to 4 bytes (WebGPU requirement made
explicit in one place).

## Delegated to the implementer

Whether `GrowableBuffer` also owns the bind-group rebuild callback.

## Verification

- G0. Vitest seam test with a recording fake `GPUDevice`: doubling, floor,
  padding, reallocation flag.
- G-camp at **0 px**; G-lab (`campaign-ui`, `campaign-models` assert pass roles
  and draw counts — unchanged).
- Expected delta ≈ −350 lines across passes.

## Must stay green

Campaign scenes byte-identical.

## Feedback that would change this slice

None.
