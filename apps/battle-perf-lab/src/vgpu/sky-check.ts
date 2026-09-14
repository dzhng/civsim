import { frame, target } from "vgpu";
import { createVgpuSky } from "./sky";
import { runSkyNumericalCheck, SKY_CHECK_SIZE } from "../skyNumericalCheck";
import { VGPU_CANDIDATE } from "./identity";
const lifetimes: { wrapperDisposed: boolean }[] = [];
const errors: string[] = [];
const report = await runSkyNumericalCheck(async (device, params) => {
  const sky = await createVgpuSky(device, params);
  const remove = sky.gpu.onError((error) => errors.push(String(error)));
  const output = target(sky.gpu, { size: SKY_CHECK_SIZE, format: "rgba16float" });
  return {
    lut: sky.lut.gpu,
    async renderBackground(rays) {
      sky.setRays(rays);
      await frame(sky.gpu, (current) => sky.encodeBackground(current, output)).done;
      await sky.gpu.settled();
      return output.color.gpu;
    },
    dispose() {
      remove();
      sky.dispose();
      sky.dispose();
      lifetimes.push({ wrapperDisposed: sky.gpu.disposed });
    },
  };
});
const result = {
  ...report,
  identity: VGPU_CANDIDATE,
  lifetimes,
  vgpuErrors: errors,
  passed: report.passed && errors.length === 0 && lifetimes.every((x) => x.wrapperDisposed),
};
document.querySelector("#result")!.textContent = JSON.stringify(result, null, 2);
Object.assign(window, { __vgpuSky: result });
