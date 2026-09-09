import { afterEach, expect, test, vi } from "vitest";
import { Camera } from "../shared/camera";
import { eyePosition } from "@packages/renderer-core/src/camera3d";
import { Input, type OrderSink } from "./input";

const aborts: AbortController[] = [];
afterEach(() => {
  for (const a of aborts.splice(0)) a.abort();
  document.body.replaceChildren();
});
function fixture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 700;
  document.body.append(canvas);
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 1200,
    height: 700,
    right: 1200,
    bottom: 700,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const camera = new Camera(canvas);
  camera.setRig({ min: 0.4, max: 8 }, { width: 2400, height: 1600 });
  camera.zoom = 7.9;
  const sink: OrderSink = {
    pickUnit: vi.fn(() => -1),
    unitsInScreenRect: vi.fn(() => []),
    allUnits: vi.fn(() => [0]),
    dragMove: vi.fn(),
    orderPoint: vi.fn(),
    orderFacing: vi.fn(),
    togglePace: vi.fn(),
    reform: vi.fn(),
    toggleKite: vi.fn(),
    togglePursue: vi.fn(),
    toggleFire: vi.fn(),
  };
  const controller = new AbortController();
  aborts.push(controller);
  const input = new Input(canvas, camera, sink, controller.signal);
  const mouse = (type: string, x: number, y: number, extra: MouseEventInit = {}) =>
    (type === "mousedown" ? canvas : window).dispatchEvent(
      new MouseEvent(type, { clientX: x, clientY: y, button: 2, bubbles: true, ...extra }),
    );
  return { canvas, camera, sink, input, mouse };
}

test("right-drag looks around at a fixed eye with or without a unit selected, and never orders", () => {
  for (const selected of [[], [0]]) {
    const { camera, sink, input, mouse } = fixture();
    input.selected = selected;
    const before = camera.params();
    const eye = eyePosition(before);
    mouse("mousedown", 600, 350);
    mouse("mousemove", 630, 370);
    mouse("mousemove", 670, 380);
    mouse("mouseup", 670, 380);
    const after = camera.params();
    const end = eyePosition(after);
    expect(after.yaw).not.toBe(before.yaw);
    expect(after.pitch).not.toBe(before.pitch);
    expect(Math.hypot(...end.map((v, i) => v - eye[i]))).toBeLessThan(0.001);
    expect(sink.orderPoint).not.toHaveBeenCalled();
    expect(sink.orderFacing).not.toHaveBeenCalled();
  }
});

test("right-click issues exactly one order, while a drag returning to its start issues none", () => {
  const { input, sink, mouse } = fixture();
  input.selected = [0];
  mouse("mousedown", 600, 350);
  mouse("mouseup", 600, 350);
  expect(sink.orderPoint).toHaveBeenCalledTimes(1);
  mouse("mousedown", 600, 350);
  mouse("mousemove", 650, 350);
  mouse("mousemove", 600, 350);
  mouse("mouseup", 600, 350);
  expect(sink.orderPoint).toHaveBeenCalledTimes(1);
});

test("Alt + right-drag preserves facing orders without rotating the camera", () => {
  const { input, sink, camera, mouse } = fixture();
  input.selected = [0];
  const before = camera.params();
  mouse("mousedown", 600, 350, { altKey: true });
  mouse("mousemove", 670, 380, { altKey: true });
  mouse("mouseup", 670, 380, { altKey: true });
  expect(camera.params()).toEqual(before);
  expect(sink.orderFacing).toHaveBeenCalledTimes(1);
  expect(sink.orderPoint).not.toHaveBeenCalled();
});

test("a click into the sky does not send an order to the camera target", () => {
  const { input, sink, camera, mouse } = fixture();
  input.selected = [0];
  camera.pitchAboutEye(-1.5);
  mouse("mousedown", 600, 100);
  mouse("mouseup", 600, 100);
  expect(sink.orderPoint).not.toHaveBeenCalled();
});

test("a selection box can start in the sky and cover visible units", () => {
  const { input, sink, mouse } = fixture();
  vi.mocked(sink.unitsInScreenRect).mockReturnValue([0]);
  mouse("mousedown", 400, 0, { button: 0 });
  mouse("mousemove", 850, 500, { button: 0 });
  mouse("mouseup", 850, 500, { button: 0 });
  expect(sink.unitsInScreenRect).toHaveBeenCalledWith(400, 0, 850, 500);
  expect(input.selected).toEqual([0]);
});
