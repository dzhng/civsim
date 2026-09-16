import { expect, test } from "vitest";
import { init } from "vgpu/mock";
import { storage } from "vgpu";
import { destroyVgpuStorage, writeVgpuStorageAt } from "../src/vgpu/storageLifetime";

test("a partial vgpu storage write preserves surrounding records", async () => {
  const gpu = await init();
  const buffer = storage(gpu, 16);
  try {
    buffer.write(new Uint32Array([10, 20, 30, 40]));
    writeVgpuStorageAt(buffer, 4, new Uint32Array([99, 88]));
    expect(Array.from(new Uint32Array(await buffer.read()))).toEqual([10, 99, 88, 40]);
  } finally {
    destroyVgpuStorage(buffer);
    gpu.dispose();
  }
});
