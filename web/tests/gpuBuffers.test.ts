// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";

import {
  GrowableBuffer,
  makeIndexBuffer,
  makeVertexBuffer,
} from "@packages/renderer-core/src/gpuBuffers.ts";

interface RecordedBuffer {
  descriptor: GPUBufferDescriptor;
  destroyed: number;
}

function recordingDevice() {
  const buffers: RecordedBuffer[] = [];
  const writes: Array<{ buffer: RecordedBuffer; data: Uint8Array }> = [];
  const device = {
    createBuffer(descriptor: GPUBufferDescriptor) {
      const buffer = {
        descriptor,
        destroyed: 0,
        destroy() {
          this.destroyed++;
        },
      };
      buffers.push(buffer);
      return buffer;
    },
    queue: {
      writeBuffer(buffer: RecordedBuffer, _offset: number, data: ArrayBufferView) {
        writes.push({
          buffer,
          data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice(),
        });
      },
    },
  } as unknown as GPUDevice;
  return { device, buffers, writes };
}

test("GrowableBuffer applies its floor, doubles, and reports reallocations", () => {
  Object.assign(globalThis, { GPUBufferUsage: { COPY_DST: 1, VERTEX: 2 } });
  const recording = recordingDevice();
  const growable = new GrowableBuffer(recording.device, "instances", GPUBufferUsage.VERTEX, 128);

  assert.equal(growable.capacityBytes, 128);
  assert.equal(
    recording.buffers[0].descriptor.usage,
    GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  );
  assert.equal(growable.write(new Uint8Array(64)), false);
  assert.equal(growable.capacityBytes, 128);
  assert.equal(growable.write(new Uint8Array(129)), true);
  assert.equal(growable.capacityBytes, 256);
  assert.equal(growable.write(new Uint8Array(300)), true);
  assert.equal(growable.capacityBytes, 512);
  assert.equal(recording.writes.length, 3);
  assert.deepEqual(
    recording.buffers.map((buffer) => buffer.destroyed),
    [1, 1, 0],
  );
  growable.dispose();
  growable.dispose();
  assert.deepEqual(
    recording.buffers.map((buffer) => buffer.destroyed),
    [1, 1, 1],
  );
  assert.throws(() => growable.write(new Uint8Array(1)), /disposed/);
});

test("static vertex and index buffers upload data and pad uint16 indices to four bytes", () => {
  Object.assign(globalThis, {
    GPUBufferUsage: { COPY_DST: 1, INDEX: 2, VERTEX: 4 },
  });
  const recording = recordingDevice();
  const vertices = makeVertexBuffer(recording.device, "vertices", new Float32Array([1, 2, 3]));
  const indices = makeIndexBuffer(recording.device, "indices", new Uint16Array([7, 8, 9]));

  assert.equal((vertices as unknown as RecordedBuffer).descriptor.size, 12);
  assert.equal((indices as unknown as RecordedBuffer).descriptor.size, 8);
  assert.deepEqual(Array.from(recording.writes[1].data), [7, 0, 8, 0, 9, 0, 0, 0]);
});

test("uint32 indices preserve vertices beyond 65535 and upload only the supplied view", () => {
  Object.assign(globalThis, { GPUBufferUsage: { COPY_DST: 1, INDEX: 2 } });
  const recording = recordingDevice();
  const source = new Uint32Array([99, 65536, 70000, 3, 88]);
  const indices = makeIndexBuffer(recording.device, "large-mesh", source.subarray(1, 4));

  assert.equal((indices as unknown as RecordedBuffer).descriptor.size, 12);
  assert.deepEqual(Array.from(new Uint32Array(recording.writes[0].data.buffer)), [65536, 70000, 3]);
  assert.deepEqual(Array.from(source), [99, 65536, 70000, 3, 88]);
});
