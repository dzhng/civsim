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
    pickUnit: vi.fn(async () => -1),
    unitsInScreenRect: vi.fn(() => []),
    allUnits: vi.fn(() => [0]),
    dragMove: vi.fn(),
    orderPoint: vi.fn(),
    orderLine: vi.fn(),
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
  return { canvas, camera, sink, input, mouse, controller };
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
    expect(sink.orderLine).not.toHaveBeenCalled();
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

test("right-drag previews and gives front-edge orders without rotating the camera", () => {
  const { input, sink, camera, mouse } = fixture();
  input.selected = [0];
  const before = camera.params();
  mouse("mousedown", 600, 350);
  mouse("mousemove", 670, 380);
  const preview = input.rightDrag;
  expect(preview).not.toBeNull();
  mouse("mouseup", 670, 380);
  expect(camera.params()).toEqual(before);
  expect(sink.orderLine).toHaveBeenCalledWith([0], preview, false);
  expect(sink.orderLine).toHaveBeenCalledTimes(1);
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

test("frontage drag retains its ground anchor and passes the release endpoint", () => {
  const { input, camera, mouse, sink } = fixture();
  input.selected = [0];
  const a = camera.screenToWorld(500, 350)!;
  mouse("mousedown", 500, 350);
  camera.setViewCenter(30, 50);
  mouse("mousemove", 650, 350);
  const b = camera.screenToWorld(700, 350)!;
  mouse("mouseup", 700, 350);
  expect(sink.orderLine).toHaveBeenCalledWith(
    [0],
    { x0: a[0], y0: a[1], x1: b[0], y1: b[1] },
    false,
  );
});

test("a press box-selects until the authority answers, then converts to a drag-move", async () => {
  const { input, sink, mouse, camera } = fixture();
  input.selected = [4];
  let answer!: (unit: number) => void;
  vi.mocked(sink.pickUnit).mockImplementation(
    () =>
      new Promise<number>((resolve) => {
        answer = resolve;
      }),
  );
  mouse("mousedown", 600, 400, { button: 0 });
  mouse("mousemove", 660, 440, { button: 0 });
  // No answer yet: the common gesture is a box, and the press does not stall.
  expect(input.box).not.toBeNull();
  expect(input.dragDelta).toBeNull();

  answer(4);
  await Promise.resolve();
  expect(input.box, "the press turned out to be on the selection").toBeNull();
  const start = camera.screenToWorld(600, 400)!;
  const end = camera.screenToWorld(660, 440)!;
  expect(input.dragDelta).toEqual([end[0] - start[0], end[1] - start[1]]);
  // Release without another move: the delayed answer must retain the gesture.
  mouse("mouseup", 660, 440, { button: 0 });
  expect(sink.dragMove).toHaveBeenCalledExactlyOnceWith([4], end[0] - start[0], end[1] - start[1]);
  expect(input.dragDelta).toBeNull();
});

test("an answer that arrives after the gesture ended cannot change the selection", async () => {
  const { input, sink, mouse } = fixture();
  input.selected = [1];
  let answer!: (unit: number) => void;
  vi.mocked(sink.pickUnit).mockImplementation(
    () =>
      new Promise<number>((resolve) => {
        answer = resolve;
      }),
  );
  mouse("mousedown", 600, 400, { button: 0 });
  const stalePressAnswer = answer;
  mouse("mouseup", 600, 400, { button: 0 });
  stalePressAnswer(7);
  await Promise.resolve();
  expect(input.selected, "the press answer arrived after its gesture ended").toEqual([1]);
  // The release asked its own question, and that answer is the one that selects.
  answer(3);
  await Promise.resolve();
  expect(input.selected).toEqual([3]);
});

test("a previous press answer cannot convert a newer box gesture", async () => {
  const { input, sink, mouse } = fixture();
  input.selected = [4];
  const answers: ((unit: number) => void)[] = [];
  vi.mocked(sink.pickUnit).mockImplementation(
    () => new Promise<number>((resolve) => answers.push(resolve)),
  );
  mouse("mousedown", 600, 400, { button: 0 });
  mouse("mousemove", 660, 440, { button: 0 });
  mouse("mouseup", 660, 440, { button: 0 });
  input.selected = [4];
  mouse("mousedown", 700, 400, { button: 0 });
  mouse("mousemove", 760, 440, { button: 0 });
  answers[0](4);
  await Promise.resolve();
  expect(input.box).toEqual({ x0: 700, y0: 400, x1: 760, y1: 440 });
  expect(input.dragDelta).toBeNull();
  answers[1](-1);
  await Promise.resolve();
  mouse("mouseup", 760, 440, { button: 0 });
  expect(sink.unitsInScreenRect).toHaveBeenLastCalledWith(700, 400, 760, 440);
  expect(sink.dragMove).not.toHaveBeenCalled();
});

test.each(["press", "release"])("an aborted input ignores its pending %s pick", async (phase) => {
  const { input, sink, mouse, controller } = fixture();
  input.selected = [4];
  let answer!: (unit: number) => void;
  vi.mocked(sink.pickUnit).mockImplementation(
    () =>
      new Promise<number>((resolve) => {
        answer = resolve;
      }),
  );
  mouse("mousedown", 600, 400, { button: 0 });
  if (phase === "press") mouse("mousemove", 660, 440, { button: 0 });
  else mouse("mouseup", 600, 400, { button: 0 });
  const box = input.box;
  controller.abort();
  answer(phase === "press" ? 4 : 7);
  await Promise.resolve();
  expect(input.selected).toEqual([4]);
  expect(input.box).toEqual(box);
  expect(input.dragDelta).toBeNull();
  expect(sink.dragMove).not.toHaveBeenCalled();
});
