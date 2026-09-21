import { describe, it, expect, vi } from "vitest";
import { trackNativeGpuAllocations } from "../../../packages/battle-renderer/src/nativeGpuAllocations";
import { trackBufferLifetime } from "../../../packages/battle-renderer/src/bufferLifetimeCheck";
import { trackTextureLifetime } from "../../../packages/battle-renderer/src/textureLifetimeCheck";
import { textureAllocationBytes } from "../../../packages/battle-renderer/src/textureAllocationBytes";

function deviceMock() {
  return {
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createTexture: vi.fn((d: GPUTextureDescriptor) => {
      const size = Array.isArray(d.size)
        ? d.size
        : [
            (d.size as GPUExtent3DDict).width,
            (d.size as GPUExtent3DDict).height ?? 1,
            (d.size as GPUExtent3DDict).depthOrArrayLayers ?? 1,
          ];
      return {
        width: size[0],
        height: size[1] ?? 1,
        depthOrArrayLayers: size[2] ?? 1,
        destroy: vi.fn(),
      };
    }),
  } as unknown as GPUDevice;
}
const texture = (
  size: GPUExtent3D,
  extra: Partial<GPUTextureDescriptor> = {},
): GPUTextureDescriptor => ({ size, format: "rgba8unorm", usage: 4, ...extra });

describe("logical GPU allocation accounting", () => {
  it("retains simultaneous growth peak through replacement and repeated disposal", () => {
    const device = deviceMock();
    const tracker = trackNativeGpuAllocations(device);
    const small = device.createBuffer({ size: 16, usage: 8 });
    const tex = device.createTexture(texture([4, 4]));
    const grown = device.createBuffer({ size: 32, usage: 8 });
    small.destroy();
    small.destroy();
    expect(tracker.snapshot()).toMatchObject({
      currentBytes: 96,
      peakBytes: 112,
      buffers: { liveCount: 1, createdCount: 2, currentBytes: 32, peakBytes: 48 },
    });
    tex.destroy();
    grown.destroy();
    expect(tracker.snapshot()).toMatchObject({
      currentBytes: 0,
      peakBytes: 112,
      textures: { liveCount: 0 },
    });
  });
  it("distinguishes shrinking volumes from array layers and includes every mip and sample", () => {
    expect(textureAllocationBytes(texture([8, 4, 4], { dimension: "3d", mipLevelCount: 4 }))).toBe(
      588,
    );
    expect(
      textureAllocationBytes(
        texture({ width: 8, height: 4, depthOrArrayLayers: 4 }, { mipLevelCount: 4 }),
      ),
    ).toBe(688);
    expect(textureAllocationBytes(texture([8, 4], { sampleCount: 4 }))).toBe(512);
    expect(textureAllocationBytes(texture([8], { dimension: "1d", mipLevelCount: 4 }))).toBe(60);
  });
  it("marks current totals unavailable while unknown resources live and peak permanently unknown", () => {
    const device = deviceMock();
    const tracker = trackNativeGpuAllocations(device);
    const unknown = device.createTexture(texture([4, 4], { format: "depth24plus" }));
    expect(tracker.snapshot()).toMatchObject({
      currentBytes: null,
      peakBytes: null,
      textures: { unknownCount: 1, currentBytes: null, peakBytes: null },
    });
    unknown.destroy();
    expect(tracker.snapshot()).toMatchObject({
      currentBytes: 0,
      peakBytes: null,
      textures: { unknownCount: 0, currentBytes: 0, peakBytes: null },
    });
  });
  it("preserves existing check APIs and restores public methods without destroying owned resources", () => {
    const device = deviceMock();
    const originalBuffer = device.createBuffer;
    const originalTexture = device.createTexture;
    const buffers = trackBufferLifetime(device);
    const textures = trackTextureLifetime(device);
    const b = device.createBuffer({ size: 4, usage: 8 });
    const t = device.createTexture(texture([1]));
    expect(buffers.createdCount()).toBe(1);
    expect(buffers.liveCount()).toBe(1);
    expect(textures.liveCount()).toBe(1);
    buffers.restore();
    textures.restore();
    expect(device.createBuffer).toBe(originalBuffer);
    expect(device.createTexture).toBe(originalTexture);
    expect(buffers.liveCount()).toBe(1);
    b.destroy();
    t.destroy();
    expect(buffers.liveCount()).toBe(0);
    expect(textures.liveCount()).toBe(0);
  });
  it("does not count creation that throws", () => {
    const device = deviceMock();
    device.createBuffer = () => {
      throw Error("failed");
    };
    const tracker = trackNativeGpuAllocations(device);
    expect(() => device.createBuffer({ size: 16, usage: 8 })).toThrow("failed");
    expect(tracker.snapshot().currentBytes).toBe(0);
  });
});
