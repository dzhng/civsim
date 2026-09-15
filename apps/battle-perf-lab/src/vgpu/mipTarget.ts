import type { Target } from "vgpu";
/** A borrowed mip attachment implementing vgpu's public Target contract; Frame owns encoding. */
export function mipTarget(texture: Target["color"], level: number): Target {
  const size = [
    Math.max(1, texture.gpu.width >> level),
    Math.max(1, texture.gpu.height >> level),
  ] as const;
  const view = texture.gpu.createView({ baseMipLevel: level, mipLevelCount: 1 });
  return {
    gpu: texture.gpu,
    size,
    texelSize: [1 / size[0], 1 / size[1]],
    color: texture,
    colors: [texture],
    format: texture.gpu.format,
    sampleCount: 1,
    clearColor: [0, 0, 0, 0],
    resourceIdentity: texture.resourceIdentity,
    resize() {
      throw new Error("Borrowed image mip cannot resize");
    },
    onDestroy(cb) {
      return texture.onDestroy(() => cb(this));
    },
    renderPassDescriptor(opts = {}) {
      return {
        colorAttachments: [
          {
            view,
            loadOp: opts.preserve ? "load" : "clear",
            storeOp: "store",
            clearValue: opts.clear
              ? "r" in opts.clear
                ? opts.clear
                : [...opts.clear]
              : [0, 0, 0, 0],
          },
        ],
      };
    },
  };
}
