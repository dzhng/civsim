import assert from "node:assert/strict";
import test from "node:test";
import {
  cameraUniformData,
  CAMERA_UNIFORM_BYTES,
  CAMERA_UNIFORM_FLOATS,
  DEFAULT_SUN_AZIMUTH,
  DEFAULT_SUN_ELEVATION,
  type CameraSnapshot,
} from "../../packages/renderer-core/src/cameraUniform.ts";
import {
  eyePosition,
  invViewProj,
  viewProjMatrix,
  type Camera3DParams,
} from "../../packages/renderer-core/src/camera3d.ts";

// Packed float offsets (cameraUniform.ts): viewProj @0..15, invViewProj @16..31,
// eye @32..34, znear @35, focus @36..37, width @38, height @39, zoom @40,
// tilt @41, time @42, zfar @43, sunAz @44, sunEl @45, pads @46..47.
// The fixture camera3d carries a deliberately wrong aspect (999): the packer
// must override it with the live width/height so resize has a single owner.
const CAM3D: Camera3DParams = {
  target: [12, -30, 0],
  distance: 220,
  pitch: 0.55,
  yaw: 0.2,
  fovY: 0.6,
  aspect: 999,
  near: 1,
  far: 4000,
};
const SNAPSHOT: CameraSnapshot = {
  camera3d: CAM3D,
  x: 12,
  y: -30,
  zoom: 3.4,
  width: 1000,
  height: 600,
  time: 3,
  sunAzimuth: 0.7,
  sunElevation: 0.9,
};

function f32(value: number): number {
  return new Float32Array([value])[0];
}

test("cameraUniform: buffer layout is 48 floats / 192 bytes", () => {
  assert.equal(CAMERA_UNIFORM_FLOATS, 48);
  assert.equal(CAMERA_UNIFORM_BYTES, 192);
  const data = cameraUniformData(SNAPSHOT);
  assert.equal(data.length, CAMERA_UNIFORM_FLOATS);
  assert.equal(data.byteLength, CAMERA_UNIFORM_BYTES);
});

test("cameraUniform: packed viewProj/invViewProj/eye/znear/zfar equal camera3d for a fixture camera", () => {
  const data = cameraUniformData(SNAPSHOT);
  // aspect is overridden by live width/height (1000/600), not the supplied 999.
  const resolved: Camera3DParams = { ...CAM3D, aspect: SNAPSHOT.width / SNAPSHOT.height };
  const vp = viewProjMatrix(resolved);
  const ivp = invViewProj(resolved);
  const eye = eyePosition(resolved);
  for (let i = 0; i < 16; i++) assert.equal(data[i], vp[i], `viewProj[${i}] mismatch`);
  for (let i = 0; i < 16; i++) assert.equal(data[16 + i], ivp[i], `invViewProj[${i}] mismatch`);
  assert.equal(data[32], f32(eye[0]));
  assert.equal(data[33], f32(eye[1]));
  assert.equal(data[34], f32(eye[2]));
  assert.equal(data[35], 1); // znear
  assert.equal(data[43], 4000); // zfar
});

test("cameraUniform: an infinite-far camera packs zfar = 0 (sentinel)", () => {
  const cam3d: Camera3DParams = {
    target: [0, 140, 0],
    distance: 190,
    pitch: 0.2,
    yaw: -Math.PI / 2,
    fovY: 0.8,
    aspect: 1.6,
    near: 1,
  };
  const data = cameraUniformData({ ...SNAPSHOT, camera3d: cam3d });
  assert.equal(data[35], 1); // znear
  assert.equal(data[43], 0); // zfar: infinite-far sentinel
});

test("cameraUniform: the survivor scalars land at their offsets", () => {
  const data = cameraUniformData(SNAPSHOT);
  assert.equal(data[36], f32(12)); // focus.x = snapshot x
  assert.equal(data[37], f32(-30)); // focus.y = snapshot y
  assert.equal(data[38], 1000); // width
  assert.equal(data[39], 600); // height
  assert.equal(data[40], f32(3.4)); // zoom (detail gate)
  assert.equal(data[41], f32(Math.sin(0.55))); // tilt = sin(camera3d pitch)
  assert.equal(data[42], 3); // time
  assert.equal(data[44], f32(0.7)); // sunAz
  assert.equal(data[45], f32(0.9)); // sunEl
  assert.equal(data[46], 0); // pad
  assert.equal(data[47], 0); // pad
});

test("cameraUniform: unset time/sun default to 0 and the battle sun convention", () => {
  const { time: _time, sunAzimuth: _az, sunElevation: _el, ...bare } = SNAPSHOT;
  const data = cameraUniformData(bare);
  assert.equal(data[42], 0); // time: frozen frame
  assert.equal(data[44], f32(DEFAULT_SUN_AZIMUTH));
  assert.equal(data[45], f32(DEFAULT_SUN_ELEVATION));
});
