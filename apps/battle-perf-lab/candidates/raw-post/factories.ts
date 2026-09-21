import { destroyVgpuTarget } from "../../src/vgpu/targetLifetime";
import { frame, target } from "vgpu";
import { RawBattlePost } from "../../src/raw/world/post";
import { createTypegpuPost } from "../../../../packages/battle-renderer/src/world/post";
import { createVgpuPost } from "../../src/vgpu/post";
import type { PostFactory } from "./control";

export const factories: Record<string, PostFactory> = {
  raw: native(async (...args) => new RawBattlePost(...args)),
  typegpu: native(createTypegpuPost),
  async vgpu(device, input, width, height, format) {
    const post = await createVgpuPost(device, input, width, height, format);
    const output = target(post.gpu, { size: [width, height], format });
    return {
      setGrade: post.setGrade,
      async render(bloom = true) {
        await frame(post.gpu, (current) => post.encode(current, output, bloom)).done;
        await post.gpu.settled();
        return output.color.gpu;
      },
      dispose() {
        destroyVgpuTarget(output);
        post.dispose();
      },
    };
  },
};
function native(
  factory: (...args: Parameters<typeof createTypegpuPost>) => Promise<{
    setGrade: RawBattlePost["setGrade"];
    encode: RawBattlePost["encode"];
    dispose(): void;
  }>,
): PostFactory {
  return async (device, input, width, height, format) => {
    const post = await factory(device, input, width, height, format);
    const output = device.createTexture({
      size: [width, height],
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    return {
      setGrade: (grade, exposure) => post.setGrade(grade, exposure),
      async render(bloom = true, enabled = true) {
        const encoder = device.createCommandEncoder();
        post.encode(encoder, output.createView(), bloom, enabled);
        device.queue.submit([encoder.finish()]);
        return output;
      },
      dispose() {
        output.destroy();
        post.dispose();
      },
    };
  };
}
