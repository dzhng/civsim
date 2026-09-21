import { createTypegpuSky } from "../../../../packages/battle-renderer/src/world/sky";
import { runSkyNumericalCheck, SKY_CHECK_SIZE } from "../../src/skyNumericalCheck";

const report = await runSkyNumericalCheck(async (device, params) => {
  const sky = await createTypegpuSky(device, params);
  const output = device.createTexture({
    size: [...SKY_CHECK_SIZE],
    format: "rgba16float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  return {
    lut: sky.lut,
    async renderBackground(rays) {
      sky.setRays(rays);
      const encoder = device.createCommandEncoder();
      sky.encodeBackground(encoder, output.createView());
      device.queue.submit([encoder.finish()]);
      return output;
    },
    dispose() {
      output.destroy();
      sky.dispose();
    },
  };
});
document.querySelector("#result")!.textContent = JSON.stringify(report, null, 2);
Object.assign(window, { __typegpuSky: report });
