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

test("middle-drag looks around at a fixed eye with or without a unit selected, and never orders", () => {
  for (const selected of [[], [0]]) {
    const { camera, sink, input, mouse } = fixture();
    input.selected = selected;
    const before = camera.params();
    const eye = eyePosition(before);
    mouse("mousedown", 600, 350, { button: 1 });
    mouse("mousemove", 630, 370, { button: 1 });
    mouse("mousemove", 670, 380, { button: 1 });
    mouse("mouseup", 670, 380, { button: 1 });
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

test("right-drag previews and gives formation-facing orders without rotating the camera", () => {
  const { input, sink, camera, mouse } = fixture();
  input.selected = [0];
  const before = camera.params();
  mouse("mousedown", 600, 350);
  mouse("mousemove", 670, 380);
  const preview = input.rightDrag;
  expect(preview).not.toBeNull();
  mouse("mouseup", 670, 380);
  expect(camera.params()).toEqual(before);
  expect(sink.orderFacing).toHaveBeenCalledWith(
    [0],
    preview!.x,
    preview!.y,
    preview!.facing,
    false,
  );
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

test("wheel after a middle-button turn cannot fling the eye sideways", () => {
  const { camera, canvas, mouse } = fixture();
  camera.pitchAboutEye(0.3 - camera.pitch);
  mouse("mousedown", 600, 350, { button: 1 });
  mouse("mousemove", 670, 335, { button: 1 });
  mouse("mouseup", 670, 335, { button: 1 });
  const before = camera.params(),
    eye = eyePosition(before);
  canvas.dispatchEvent(
    new WheelEvent("wheel", { clientX: 850, clientY: 190, deltaY: -120, bubbles: true }),
  );
  const after = camera.params(),
    end = eyePosition(after);
  const travel = Math.hypot(...end.map((v, i) => v - eye[i]));
  const zoomTravel = before.distance - after.distance;
  expect(after.pitch).toBeCloseTo(before.pitch, 8);
  expect(after.yaw).toBe(before.yaw);
  expect(travel, `wheel travel ${zoomTravel} moved eye ${travel}m`).toBeLessThan(
    zoomTravel * 2 + 0.5,
  );
});

test("battle wheel sensitivity doubles the previous distance response", () => {
  const { camera, canvas } = fixture();
  camera.zoom = 3;
  const distance = camera.params().distance;
  canvas.dispatchEvent(
    new WheelEvent("wheel", { clientX: 600, clientY: 350, deltaY: -120, bubbles: true }),
  );
  // The previous 120-pixel wheel input retained 96.47% of distance. Twofold
  // logarithmic travel retains about 93.06%, not a doubling of the zoom factor.
  expect(camera.params().distance / distance).toBeCloseTo(0.93058, 3);
});
