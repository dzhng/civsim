import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCameraKeyController, type CameraKeyTarget } from "./cameraKeys";

function key(type: "keydown" | "keyup", value: string) {
  window.dispatchEvent(new KeyboardEvent(type, { key: value }));
}

describe("createCameraKeyController", () => {
  let calls: {
    pan: [number, number][];
    yaw: number[];
    pitch: number[];
    zoom: [number, number, number][];
  };
  let target: CameraKeyTarget;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    calls = { pan: [], yaw: [], pitch: [], zoom: [] };
    target = {
      panWorld: (dx, dy) => calls.pan.push([dx, dy]),
      yaw: (delta) => calls.yaw.push(delta),
      pitchOrZoom: (delta) => calls.pitch.push(delta),
      zoomAt: (px, py, factor) => calls.zoom.push([px, py, factor]),
      panSpeed: () => 10,
    };
  });

  afterEach(() => dispose?.());

  it.each([
    ["w", 0, 10],
    ["arrowup", 0, 10],
    ["s", 0, -10],
    ["arrowdown", 0, -10],
    ["a", -10, 0],
    ["arrowleft", -10, 0],
    ["d", 10, 0],
    ["arrowright", 10, 0],
  ])("maps %s to its pan axis", (value, dx, dy) => {
    const controller = createCameraKeyController(target);
    dispose = controller.dispose;
    key("keydown", value);

    controller.update(1);

    expect(calls.pan).toEqual([[dx, dy]]);
  });

  it("maps Q/E and Z/X to continuous yaw and pitch", () => {
    const controller = createCameraKeyController(target);
    dispose = controller.dispose;
    key("keydown", "q");
    key("keydown", "z");
    controller.update(0.5);
    key("keyup", "q");
    key("keyup", "z");
    key("keydown", "e");
    key("keydown", "x");
    controller.update(0.5);

    expect(calls.yaw).toEqual([0.35, -0.35]);
    expect(calls.pitch).toEqual([0.2, -0.2]);
  });

  it("combines edge pan with the configured sprint multiplier", () => {
    const controller = createCameraKeyController(target);
    dispose = controller.dispose;
    key("keydown", "shift");
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 5, clientY: 795 }));

    controller.update(0.5);

    expect(calls.pan).toEqual([[-15, -15]]);
  });

  it("normalizes wheel input and zooms at device-pixel coordinates", () => {
    const controller = createCameraKeyController(target);
    dispose = controller.dispose;
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);

    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 30,
        deltaY: 3,
        deltaMode: WheelEvent.DOM_DELTA_LINE,
      }),
    );

    expect(calls.zoom[0][0]).toBe(40);
    expect(calls.zoom[0][1]).toBe(60);
    expect(calls.zoom[0][2]).toBeCloseTo(Math.pow(1.0015, -48 * 0.2));
    canvas.remove();
  });

  it("stops handling input after disposal", () => {
    const controller = createCameraKeyController(target);
    controller.dispose();
    dispose = undefined;
    key("keydown", "w");

    controller.update(1);

    expect(calls.pan).toEqual([]);
  });
});
