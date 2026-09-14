import { frame, target } from "vgpu";
import { RawBattlePost } from "../../src/raw/post";
import { createTypegpuPost } from "../typegpu/post";
import { createVgpuPost } from "../../src/vgpu/post";
import { runPostControl, type PostFactory } from "./control";

const factories: Record<string, PostFactory> = {
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
      dispose: post.dispose,
    };
  },
};
function native(factory: typeof createTypegpuPost): PostFactory {
  return async (device, input, width, height, format) => {
    const post = await factory(device, input, width, height, format);
    const output = device.createTexture({
      size: [width, height],
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    return {
      setGrade: (grade, exposure) => post.setGrade(grade, exposure),
      async render(bloom = true) {
        const encoder = device.createCommandEncoder();
        post.encode(encoder, output.createView(), bloom);
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
const backend = new URLSearchParams(location.search).get("backend") ?? "raw";
const factory = factories[backend];
if (!factory) throw new Error(`Unknown post backend: ${backend}`);
await runPostControl(factory, backend);
