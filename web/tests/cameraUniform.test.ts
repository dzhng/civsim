import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cameraUniformData,
  CAMERA_UNIFORM_BYTES,
  CAMERA_UNIFORM_FLOATS,
  DEFAULT_SUN_AZIMUTH,
  DEFAULT_SUN_ELEVATION,
  type CameraSnapshot,
} from '../../packages/renderer-core/src/cameraUniform.ts';
import { eyePosition, invViewProj, viewProjMatrix, type Camera3DParams } from '../../packages/renderer-core/src/camera3d.ts';

// The 12 legacy 2.5D scalars, exactly as slice 01 packed them. This literal is the
// frozen contract: growing the uniform (slice 02, appended matrices) must not
// disturb a single one, so every un-migrated pass stays byte-identical.
const LEGACY: CameraSnapshot = { x: 12, y: -30, zoom: 3.4, pitch: 0.42, yaw: 0.2, perspective: 0.03, width: 1000, height: 600, time: 3, sunAzimuth: 0.7, sunElevation: 0.9 };

function expectedLegacyScalars(c: CameraSnapshot): number[] {
  return [
    c.x, c.y, c.zoom, Math.max(0.2, Math.cos(c.pitch ?? 0)),
    c.width, c.height, Math.cos(c.yaw ?? 0), Math.sin(c.yaw ?? 0),
    Math.max(0, c.perspective ?? 0), c.time ?? 0, c.sunAzimuth ?? DEFAULT_SUN_AZIMUTH, c.sunElevation ?? DEFAULT_SUN_ELEVATION,
  ];
}

test('cameraUniform: buffer layout is the 52-float / 208-byte superset', () => {
  assert.equal(CAMERA_UNIFORM_FLOATS, 52);
  assert.equal(CAMERA_UNIFORM_BYTES, 208);
  const data = cameraUniformData(LEGACY);
  assert.equal(data.length, CAMERA_UNIFORM_FLOATS);
  assert.equal(data.byteLength, CAMERA_UNIFORM_BYTES);
});

test('cameraUniform: the 12 legacy scalars are byte-identical, with or without the real camera', () => {
  const legacyOnly = cameraUniformData(LEGACY);
  const expected = expectedLegacyScalars(LEGACY);
  for (let i = 0; i < 12; i++) {
    assert.equal(legacyOnly[i], new Float32Array([expected[i]])[0], `legacy scalar ${i} moved`);
  }
  // Appending the real camera must leave floats 0..11 (bytes 0..47) untouched.
  const withReal = cameraUniformData({ ...LEGACY, camera3d: { target: [12, -30, 0], distance: 220, pitch: 0.55, yaw: 0.2, fovY: 0.6, aspect: 1.6, near: 1, far: 4000 } });
  for (let i = 0; i < 12; i++) {
    assert.equal(withReal[i], legacyOnly[i], `legacy scalar ${i} disturbed by camera3d`);
  }
  // Legacy-only pack leaves the appended tail zeroed.
  for (let i = 12; i < CAMERA_UNIFORM_FLOATS; i++) assert.equal(legacyOnly[i], 0, `tail float ${i} not zero`);
});

test('cameraUniform: packed viewProj/invViewProj/eye equal camera3d for a fixture camera', () => {
  const cam3d: Camera3DParams = { target: [12, -30, 0], distance: 220, pitch: 0.55, yaw: 0.2, fovY: 0.6, aspect: 999, near: 1, far: 4000 };
  const data = cameraUniformData({ ...LEGACY, camera3d: cam3d });
  // aspect is overridden by live width/height (1000/600), not the supplied 999.
  const resolved: Camera3DParams = { ...cam3d, aspect: LEGACY.width / LEGACY.height };
  const vp = viewProjMatrix(resolved);
  const ivp = invViewProj(resolved);
  const eye = eyePosition(resolved);
  for (let i = 0; i < 16; i++) assert.equal(data[12 + i], vp[i], `viewProj[${i}] mismatch`);
  for (let i = 0; i < 16; i++) assert.equal(data[28 + i], ivp[i], `invViewProj[${i}] mismatch`);
  assert.equal(data[44], new Float32Array([eye[0]])[0]);
  assert.equal(data[45], new Float32Array([eye[1]])[0]);
  assert.equal(data[46], new Float32Array([eye[2]])[0]);
  assert.equal(data[47], 1); // znear
  assert.equal(data[48], 4000); // zfar
});

test('cameraUniform: an infinite-far camera packs zfar = 0 (sentinel)', () => {
  const cam3d: Camera3DParams = { target: [0, 140, 0], distance: 190, pitch: 0.2, yaw: -Math.PI / 2, fovY: 0.8, aspect: 1.6, near: 1 };
  const data = cameraUniformData({ ...LEGACY, camera3d: cam3d });
  assert.equal(data[47], 1);
  assert.equal(data[48], 0);
});
