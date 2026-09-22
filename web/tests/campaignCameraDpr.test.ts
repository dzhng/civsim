import { expect, test } from "vitest";
import { CampaignRenderer } from "../src/campaign/renderer";
import type { Camera3DParams } from "@packages/renderer-core/src/camera3d";

for (const cssZoom of [2.5, 7.5]) {
  test(`campaign ${cssZoom} CSS zoom preserves the real camera and raised city projection across DPR`, () => {
    const prior = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    const frames: { pose: Camera3DParams; city: number[]; pitch: number; panSpeed: number }[] = [];
    try {
      for (const dpr of [1, 2]) {
        Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: dpr });
        let pose: Camera3DParams | undefined;
        const renderer = Object.assign(Object.create(CampaignRenderer.prototype), {
          canvas: { width: 1280 * dpr, height: 800 * dpr, clientWidth: 1280, clientHeight: 800 },
          data: {
            map: { attribution: "real campaign" },
            bgRect: {
              min: [-2457.114629932917, -1696.1465021720048],
              max: [2255.2679394452243, 2187.924547264467],
            },
          },
          world: {
            world: { resize() {} },
            surface: { sampleRendered: (x: number, y: number) => ({ position: [x, y, 7] }) },
            prepareTerrain() {},
            setAerialStrength() {},
            setFrameCamera(value: Camera3DParams) {
              pose = value;
            },
          },
        }) as CampaignRenderer;
        const cam = { x: -450, y: 990, scale: cssZoom * dpr };
        renderer.clampCam(cam);
        expect(cam.scale / dpr).toBe(cssZoom);
        renderer.setFrameCamera(cam);
        const city = renderer.toScreen(-394.9378978577421, 993.4227894731976).map((v) => v / dpr);
        frames.push({
          pose: pose!,
          city,
          pitch: renderer.pitchForScale(cam.scale),
          panSpeed: renderer.panSpeed(cam.scale),
        });
        const overZoomed = { ...cam, scale: 100 * dpr };
        renderer.clampCam(overZoomed);
        expect(overZoomed.scale / dpr).toBe(8);
      }
    } finally {
      if (prior) Object.defineProperty(window, "devicePixelRatio", prior);
    }
    expect(frames[1].pose).toEqual(frames[0].pose);
    expect(frames[1].panSpeed).toBe(frames[0].panSpeed);
    expect(frames[1].pitch).toBe(frames[0].pitch);
    expect(frames[1].city[0]).toBeCloseTo(frames[0].city[0], 8);
    expect(frames[1].city[1]).toBeCloseTo(frames[0].city[1], 8);
  });
}
