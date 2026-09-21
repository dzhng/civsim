import { afterEach, expect, test, vi } from "vitest";
import { eyePosition } from "@packages/renderer-core/src/camera3d";
import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import { Camera } from "../shared/camera";
import { BattleUnitPresentation } from "./battleUnitPresentation";
import type { BattleWorld } from "./battleWorld";

// Overlays are prepared for the frame that has not been drawn yet, so every
// assertion here builds against a camera no renderer has ever seen.

const STRIDE = Math.max(...Object.values(UNIT_INFO)) + 1;

afterEach(() => vi.unstubAllGlobals());

function fixture({ cssWidth = 1200, cssHeight = 700, dpr = 1 } = {}) {
  vi.stubGlobal("devicePixelRatio", dpr);
  const viewport = { width: cssWidth, height: cssHeight };
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { get: () => viewport.width });
  Object.defineProperty(canvas, "clientHeight", { get: () => viewport.height });
  const layout = (width: number, height: number) => {
    viewport.width = width;
    viewport.height = height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  };
  layout(cssWidth, cssHeight);
  const camera = new Camera(canvas);
  camera.setRig({ min: 0.4, max: 8 }, { width: 600, height: 400 });
  const info = new Float32Array(STRIDE);
  info[UNIT_INFO.routing] = 1; // one chip, so the unit carries a readout
  const presentation = new BattleUnitPresentation({
    camera,
    renderer: { heightAt: () => 0 },
    stride: STRIDE,
  } as unknown as BattleWorld);
  /** Frame the unit dead centre at `zoom`; the rig's forward offset moves the
   *  look target with zoom, so re-centre after every zoom change. */
  const look = (zoom: number, at: [number, number] = [0, 0]) => {
    camera.zoom = zoom;
    camera.setViewCenter(at[0], at[1]);
  };
  const build = () => {
    presentation.beginFrame(1);
    presentation.addSoldier(0, 0, 0, 1);
    presentation.finishFrame(1);
    return presentation.build([], info);
  };
  look(7.9);
  return { camera, layout, look, build };
}

/** CSS pixels per world metre at the look target, read off the camera's own
 *  world→screen projection — an independent derivation of the same scale. */
function projectedPxPerMeter(camera: Camera) {
  const step = 1e-3;
  const { right } = camera.groundAxes();
  const [cx, cy] = camera.viewCenter();
  const a = camera.worldToScreen(cx, cy, 0);
  const b = camera.worldToScreen(cx + right[0] * step, cy + right[1] * step, 0);
  return Math.hypot(b[0] - a[0], b[1] - a[1]) / step;
}

function eyeDistanceTo(camera: Camera, x: number, y: number, z: number) {
  const eye = eyePosition(camera.params());
  return Math.hypot(eye[0] - x, eye[1] - y, eye[2] - z);
}

test("a zoom with no frame drawn between builds resizes overlays on the next build", () => {
  const f = fixture();
  const far = f.build();
  // Nothing has ever been rendered, so a renderer-sourced scale would still be
  // at its startup fallback and drop the readout below the legibility floor.
  expect(far.standards).toHaveLength(1);
  expect(far.readouts).toHaveLength(1);
  const farPx = projectedPxPerMeter(f.camera);

  f.look(8);
  const near = f.build();
  const nearPx = projectedPxPerMeter(f.camera);

  expect(nearPx).toBeGreaterThan(farPx);
  expect(near.readouts[0].worldPerPx).toBeLessThan(far.readouts[0].worldPerPx);
  // World-per-pixel is exactly inverse to the projected density of the pose the
  // overlay was built for — not the pose behind it.
  // 6 digits: projectedPxPerMeter is a finite difference, not a closed form.
  expect(far.readouts[0].worldPerPx / near.readouts[0].worldPerPx).toBeCloseTo(nearPx / farPx, 6);
});

test("a pan with no frame drawn between builds rescales overlays by Euclidean eye distance", () => {
  const f = fixture();
  f.look(8);
  const centred = f.build();
  const centredDistance = eyeDistanceTo(f.camera, 0, 0, 0);

  // The unit stays put; only the camera slides, so the anchor moves off-axis.
  f.look(8, [6, 0]);
  const offset = f.build();
  const offsetDistance = eyeDistanceTo(f.camera, 0, 0, 0);

  expect(offsetDistance).toBeGreaterThan(centredDistance);
  expect(offset.readouts[0].worldPerPx / centred.readouts[0].worldPerPx).toBeCloseTo(
    offsetDistance / centredDistance,
    9,
  );
});

test("repeated builds at one camera are stable", () => {
  const f = fixture();
  expect(f.build()).toEqual(f.build());
});

test("overlay sizing is CSS-pixel sized: live viewport, indifferent to DPR", () => {
  const atOneX = fixture({ dpr: 1 }).build();
  const atThreeX = fixture({ dpr: 3 }).build();
  expect(atThreeX).toEqual(atOneX);

  // A viewport resize is reflected in the next overlay build.
  const f = fixture();
  const before = f.build();
  f.layout(1200, 1400);
  const after = f.build();
  expect(after.readouts[0].worldPerPx).toBeCloseTo(before.readouts[0].worldPerPx / 2, 9);
});

test("the near-hide threshold reads the camera and viewport being prepared", () => {
  const f = fixture();
  f.look(8);
  expect(f.build().standards).toHaveLength(1);
  // Same pose, a viewport tall enough to push the standard past its near cut.
  f.layout(1200, 2000);
  expect(f.build().standards).toHaveLength(0);
});
