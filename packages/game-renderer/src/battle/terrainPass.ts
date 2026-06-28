import type { BackgroundRenderPass, RawFrameShell, WorldRenderPass } from '../../../webgpu-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../webgpu-core/src/cameraWgsl';
import { webGpuWorldDepthStencil } from '../../../webgpu-core/src/pipelineContracts';

export type BattleTerrainFixture = 'coast' | 'melee' | 'dry-melee' | 'prop-field' | 'sim-tint';

export interface BattleTerrainPassStats {
  fixture: BattleTerrainFixture;
  quads: number;
  backgroundQuads: number;
  worldPropQuads: number;
  waterQuads: number;
  sceneryQuads: number;
  selectionQuads: number;
  cameraContract: 'shared-world-camera-wgsl';
}

interface TerrainQuad {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: number;
  alpha: number;
}

const BATTLE_TERRAIN_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) world: vec2f,
  @location(2) kind: f32,
  @location(3) alpha: f32,
};

@vertex
fn vs(@location(0) quad: vec2f, @location(1) inst0: vec4f, @location(2) inst1: vec4f) -> VsOut {
  let local01 = quad * 0.5 + vec2f(0.5);
  let world = vec2f(inst0.x + local01.x * inst0.z, inst0.y + local01.y * inst0.w);
  var out: VsOut;
  out.pos = projectGround(world, civsimBattleWorldDepth3d(vec3f(world, 0.08)));
  out.local = quad;
  out.world = world;
  out.kind = inst1.x;
  out.alpha = inst1.y;
  return out;
}

fn hash(p: vec2f) -> f32 {
  let p3 = fract(vec3f(p.xyx) * 0.1031);
  let q = p3 + dot(p3, p3.yzx + vec3f(33.33));
  return fract((q.x + q.y) * q.z);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
    mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x),
    u.y,
  );
}

fn fbm(p: vec2f) -> f32 {
  return vnoise(p) * 0.52 + vnoise(p * 2.11 + vec2f(4.3, 1.7)) * 0.31 + vnoise(p * 4.07 + vec2f(9.1, 6.4)) * 0.17;
}

fn ridge(p: vec2f) -> f32 {
  let r = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
  return r * r;
}

fn oval(local: vec2f, sx: f32, sy: f32) -> f32 {
  return 1.0 - smoothstep(0.72, 1.0, length(vec2f(local.x / sx, local.y / sy)));
}

fn edgeFeather(local: vec2f) -> f32 {
  let x = smoothstep(-1.0, -0.82, local.x) * (1.0 - smoothstep(0.82, 1.0, local.x));
  return x;
}

fn terrainColor(in: VsOut) -> vec4f {
  let n = fbm(in.world * 0.72) * 0.20 + fbm(in.world * 0.11) * 0.18;

  if (in.kind < 0.5) {
    let shore = smoothstep(-1.0, 1.0, in.local.y);
    let shallow = vec3f(0.46, 0.72, 0.76);
    let deep = vec3f(0.11, 0.28, 0.45);
    let longWave = sin((in.world.x * 0.18 - in.world.y * 0.34) + sin(in.world.x * 0.035) * 1.8) * 0.5 + 0.5;
    let crossWave = sin(in.world.x * 0.52 + in.world.y * 0.17 + fbm(in.world * 0.032) * 4.0) * 0.5 + 0.5;
    let crest = smoothstep(0.72, 0.96, longWave) * smoothstep(0.48, 0.90, crossWave);
    let streak = smoothstep(0.86, 0.995, sin(in.world.x * 0.95 - in.world.y * 0.11 + fbm(in.world * 0.055) * 5.0) * 0.5 + 0.5);
    let shoreFoamBand = smoothstep(0.18, -0.12, abs(in.local.y + 0.58));
    let farBreak = smoothstep(0.48, 0.86, shore) * crest * 0.26;
    let foam = (shoreFoamBand * (0.52 + crest * 0.48) + farBreak) * (0.74 + fbm(in.world * 0.95) * 0.26);
    let sunTrack = smoothstep(0.18, 0.0, abs(in.local.x + in.local.y * 0.24)) * smoothstep(-0.92, 0.28, in.local.y);
    let glint = (streak * 0.12 + crest * 0.08 + sunTrack * 0.16) * (1.0 - shore * 0.28);
    let water = mix(shallow, deep, shore) + vec3f(0.09, 0.11, 0.08) * glint;
    return vec4f(mix(water, vec3f(0.90, 0.91, 0.84), clamp(foam * 0.48, 0.0, 0.78)), in.alpha * edgeFeather(in.local));
  }

  if (in.kind < 1.5) {
    let beach = mix(vec3f(0.78, 0.66, 0.42), vec3f(0.88, 0.77, 0.54), n);
    let swash = smoothstep(0.78, 0.98, in.local.y) * smoothstep(0.22, -0.06, abs(sin(in.world.x * 0.19 + fbm(in.world * 0.038) * 3.0)));
    let dune = smoothstep(0.58, -0.16, abs(sin(in.world.x * 0.22 + in.world.y * 0.08 + fbm(in.world * 0.05) * 2.2)));
    return vec4f(mix(mix(beach, vec3f(0.95, 0.84, 0.60), dune * 0.18), vec3f(0.82, 0.78, 0.62), swash * 0.20), in.alpha * edgeFeather(in.local));
  }

  if (in.kind < 2.5) {
    let mud = mix(vec3f(0.30, 0.22, 0.13), vec3f(0.52, 0.39, 0.22), n);
    let footprint = smoothstep(0.86, 0.18, abs(sin(in.world.x * 2.3 + fbm(in.world * 0.16)) * cos(in.world.y * 2.0)));
    let cracked = ridge(vec2f(in.world.x * 0.36 + in.world.y * 0.08, in.world.y * 0.42)) * ridge(in.world * 0.18 + vec2f(3.0, 4.0));
    var churn = mix(mud, vec3f(0.62, 0.50, 0.31), footprint * 0.14 + cracked * 0.18);
    churn *= 0.78 + smoothstep(0.18, 0.92, ridge(in.world * 0.24)) * 0.22;
    let ragged = smoothstep(0.18, 0.86, fbm(in.world * 0.31 + vec2f(2.1, 7.4)));
    let a = oval(in.local, 1.0, 0.58) * mix(0.58, 1.0, ragged) * in.alpha;
    return vec4f(churn, a);
  }

  if (in.kind < 3.5) {
    let a = oval(in.local, 1.0, 0.52) * in.alpha;
    let shade = mix(vec3f(0.20, 0.16, 0.10), vec3f(0.36, 0.29, 0.16), n);
    return vec4f(shade, a);
  }

  if (in.kind < 4.5) {
    let core = oval(in.local, 0.74, 0.50);
    let clump = max(core, oval(in.local - vec2f(0.24, -0.10), 0.48, 0.36) * 0.82);
    let a = clump * in.alpha;
    let leaf = mix(vec3f(0.32, 0.41, 0.19), vec3f(0.64, 0.62, 0.32), n);
    return vec4f(leaf, a);
  }

  if (in.kind < 5.5) {
    let a = oval(in.local, 0.95, 0.42) * in.alpha;
    let glow = vec3f(1.00, 0.78, 0.25) * (0.55 + 0.45 * smoothstep(0.9, -0.1, length(in.local)));
    return vec4f(glow, a);
  }

  if (in.kind < 6.5) {
    let a = oval(in.local, 0.80, 0.55) * in.alpha;
    let ridge = smoothstep(0.92, 0.2, abs(in.local.x + in.local.y * 0.35));
    let stone = mix(vec3f(0.43, 0.39, 0.32), vec3f(0.70, 0.61, 0.45), max(n, ridge * 0.24));
    return vec4f(stone, a);
  }

  if (in.kind < 7.5) {
    let taper = smoothstep(-1.0, -0.55, in.local.y) * (1.0 - smoothstep(0.62, 1.0, in.local.y));
    let crown = 1.0 - smoothstep(0.30, 0.78, length(vec2f(in.local.x / 0.34, in.local.y)));
    let side = 1.0 - smoothstep(0.22, 0.62, length(vec2f((in.local.x - 0.20) / 0.30, (in.local.y + 0.16) / 0.78)));
    let trunk = smoothstep(0.08, 0.02, abs(in.local.x)) * smoothstep(-0.94, -0.54, in.local.y);
    let a = max(max(crown * taper, side * 0.55), trunk * 0.72) * in.alpha;
    let cypress = mix(vec3f(0.12, 0.24, 0.12), vec3f(0.29, 0.39, 0.18), n);
    return vec4f(mix(vec3f(0.31, 0.23, 0.14), cypress, max(crown, side)), a);
  }

  if (in.kind < 10.5) {
    let shore = smoothstep(-1.0, 1.0, in.local.y);
    let water = mix(vec3f(0.42, 0.67, 0.72), vec3f(0.10, 0.25, 0.40), shore);
    let ripple = smoothstep(0.78, 0.98, sin(in.world.x * 0.55 + in.world.y * 0.18 + fbm(in.world * 0.05) * 4.0) * 0.5 + 0.5);
    return vec4f(water + vec3f(0.08, 0.09, 0.06) * ripple, in.alpha);
  }

  if (in.kind < 11.5) {
    let rockRidge = ridge(vec2f(in.world.x * 0.36 + in.world.y * 0.08, in.world.y * 0.42));
    let stone = mix(vec3f(0.36, 0.34, 0.30), vec3f(0.63, 0.56, 0.43), max(n, rockRidge * 0.34));
    let edge = oval(in.local, 1.0, 0.74);
    return vec4f(stone, in.alpha * mix(0.42, 1.0, edge));
  }

  if (in.kind < 12.5) {
    let canopy = mix(vec3f(0.17, 0.29, 0.13), vec3f(0.34, 0.45, 0.20), fbm(in.world * 0.18 + vec2f(3.0, 7.0)));
    let trunkFleck = smoothstep(0.82, 0.97, fbm(in.world * 1.2 + vec2f(8.0, 2.0)));
    let ragged = mix(0.48, 1.0, fbm(in.world * 0.34 + vec2f(1.2, 5.7)));
    return vec4f(mix(canopy, vec3f(0.12, 0.10, 0.07), trunkFleck * 0.26), in.alpha * oval(in.local, 1.0, 0.76) * ragged);
  }

  if (in.kind < 13.5) {
    let cracked = ridge(vec2f(in.world.x * 0.31 + in.world.y * 0.07, in.world.y * 0.38));
    let mud = mix(vec3f(0.34, 0.25, 0.15), vec3f(0.58, 0.46, 0.28), n + cracked * 0.18);
    let ragged = mix(0.52, 1.0, fbm(in.world * 0.41 + vec2f(6.0, 2.0)));
    return vec4f(mud, in.alpha * oval(in.local, 1.0, 0.62) * ragged);
  }

  let wave = smoothstep(0.10, 0.0, abs(sin(in.world.x * 0.24 + in.world.y * 0.46 + fbm(in.world * 0.06) * 2.0)));
  let fade = oval(in.local, 1.0, 0.34) * in.alpha;
  return vec4f(vec3f(0.92, 0.88, 0.72), fade * wave * edgeFeather(in.local) * 0.52);
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  return terrainColor(in);
}

@fragment
fn fsCutout(in: VsOut) -> @location(0) vec4f {
  let c = terrainColor(in);
  if (c.a < 0.38) {
    discard;
  }
  return vec4f(c.rgb, 1.0);
}`;

export class BattleTerrainPass {
  private backgroundPipeline: GPURenderPipeline;
  private propPipeline: GPURenderPipeline;
  private quadBuffer: GPUBuffer;
  private backgroundInstanceBuffer: GPUBuffer;
  private propInstanceBuffer: GPUBuffer;
  private backgroundCapacity = 0;
  private propCapacity = 0;
  private quads: TerrainQuad[] = [];
  private backgroundQuads: TerrainQuad[] = [];
  private worldPropQuads: TerrainQuad[] = [];
  private fixture: BattleTerrainFixture = 'dry-melee';
  private fieldRect: [number, number, number, number] = [-58, -12, 116, 46];
  private statsValue: BattleTerrainPassStats = {
    fixture: 'dry-melee',
    quads: 0,
    backgroundQuads: 0,
    worldPropQuads: 0,
    waterQuads: 0,
    sceneryQuads: 0,
    selectionQuads: 0,
    cameraContract: 'shared-world-camera-wgsl',
  };

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'battle-terrain-wgsl', code: BATTLE_TERRAIN_WGSL });
    const vertex = {
      module,
      entryPoint: 'vs',
      buffers: [
        { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' as const }] },
        {
          arrayStride: 32,
          stepMode: 'instance' as const,
          attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x4' as const },
            { shaderLocation: 2, offset: 16, format: 'float32x4' as const },
          ],
        },
      ],
    };
    this.backgroundPipeline = device.createRenderPipeline({
      label: 'battle-terrain-underpaint-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex,
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{
          format: shell.info.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'triangle-strip' },
    });
    this.propPipeline = device.createRenderPipeline({
      label: 'battle-terrain-world-props-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex,
      fragment: {
        module,
        entryPoint: 'fsCutout',
        targets: [{ format: shell.info.format }],
      },
      primitive: { topology: 'triangle-strip' },
      depthStencil: webGpuWorldDepthStencil('read-write', 'less-equal'),
    });
    this.quadBuffer = device.createBuffer({
      label: 'battle-terrain-quad',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.quadBuffer, 0, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    this.backgroundInstanceBuffer = device.createBuffer({
      label: 'battle-terrain-empty-underpaint-instances',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.propInstanceBuffer = device.createBuffer({
      label: 'battle-terrain-empty-world-prop-instances',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  setFixture(fixture: BattleTerrainFixture) {
    this.fixture = fixture;
    this.rebuild();
  }

  setFieldRect(rect: [number, number, number, number]) {
    this.fieldRect = rect;
    this.rebuild();
  }

  setTintGrid(opts: { w: number; h: number; cell: number; ox: number; oy: number; tint: Uint8Array }) {
    this.fixture = 'sim-tint';
    this.fieldRect = [opts.ox, opts.oy, opts.w * opts.cell, opts.h * opts.cell];
    this.quads = terrainQuadsFromTint(opts);
    this.statsValue = terrainStats(this.fixture, this.quads);
    this.upload();
  }

  private rebuild() {
    this.quads = makeFixture(this.fixture, this.fieldRect);
    this.statsValue = terrainStats(this.fixture, this.quads);
    this.upload();
  }

  draw(pass: BackgroundRenderPass) {
    this.drawQuadBatch(pass, this.backgroundPipeline, this.backgroundInstanceBuffer, this.backgroundQuads.length);
  }

  drawProps(pass: WorldRenderPass) {
    this.drawQuadBatch(pass, this.propPipeline, this.propInstanceBuffer, this.worldPropQuads.length);
  }

  private drawQuadBatch(
    pass: BackgroundRenderPass | WorldRenderPass,
    pipeline: GPURenderPipeline,
    instanceBuffer: GPUBuffer,
    count: number,
  ) {
    if (count === 0) return;
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.setVertexBuffer(1, instanceBuffer);
    pass.draw(4, count);
  }

  stats(): BattleTerrainPassStats {
    return { ...this.statsValue };
  }

  private upload() {
    this.backgroundQuads = this.quads.filter((quad) => !isWorldPropQuad(quad));
    this.worldPropQuads = this.quads.filter(isWorldPropQuad);
    this.backgroundInstanceBuffer = this.uploadQuadBatch(
      'battle-terrain-underpaint-instances',
      this.backgroundQuads,
      this.backgroundInstanceBuffer,
      this.backgroundCapacity,
      (capacity) => { this.backgroundCapacity = capacity; },
    );
    this.propInstanceBuffer = this.uploadQuadBatch(
      'battle-terrain-world-prop-instances',
      this.worldPropQuads,
      this.propInstanceBuffer,
      this.propCapacity,
      (capacity) => { this.propCapacity = capacity; },
    );
  }

  private uploadQuadBatch(
    label: string,
    quads: TerrainQuad[],
    buffer: GPUBuffer,
    capacity: number,
    setCapacity: (capacity: number) => void,
  ) {
    const stride = 8;
    let nextBuffer = buffer;
    if (quads.length > capacity) {
      const nextCapacity = Math.max(quads.length, capacity * 2, 32);
      setCapacity(nextCapacity);
      nextBuffer = this.shell.device.createBuffer({
        label,
        size: nextCapacity * stride * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (quads.length === 0) return nextBuffer;
    const data = new Float32Array(quads.length * stride);
    for (let i = 0; i < quads.length; i++) {
      const q = quads[i];
      const o = i * stride;
      data[o] = q.x;
      data[o + 1] = q.y;
      data[o + 2] = q.w;
      data[o + 3] = q.h;
      data[o + 4] = q.kind;
      data[o + 5] = q.alpha;
    }
    this.shell.device.queue.writeBuffer(nextBuffer, 0, data);
    return nextBuffer;
  }
}

function terrainStats(fixture: BattleTerrainFixture, quads: TerrainQuad[]): BattleTerrainPassStats {
  const worldPropQuads = quads.filter(isWorldPropQuad).length;
  return {
    fixture,
    quads: quads.length,
    backgroundQuads: quads.length - worldPropQuads,
    worldPropQuads,
    waterQuads: quads.filter((q) => q.kind === 0 || q.kind === 8 || q.kind === 10).length,
    sceneryQuads: quads.filter((q) => q.kind === 3 || q.kind === 4 || q.kind === 6 || q.kind === 7 || q.kind === 11 || q.kind === 12).length,
    selectionQuads: quads.filter((q) => q.kind === 5).length,
    cameraContract: 'shared-world-camera-wgsl',
  };
}

function isWorldPropQuad(quad: TerrainQuad): boolean {
  return quad.kind === 4 || quad.kind === 6 || quad.kind === 7;
}

function terrainQuadsFromTint(opts: { w: number; h: number; cell: number; ox: number; oy: number; tint: Uint8Array }): TerrainQuad[] {
  const used = new Uint8Array(opts.w * opts.h);
  const quads: TerrainQuad[] = [];
  for (let y = 0; y < opts.h; y++) {
    for (let x = 0; x < opts.w; x++) {
      const i = y * opts.w + x;
      const tint = opts.tint[i] ?? 0;
      if (used[i] || tint === 0) continue;
      let runW = 1;
      while (x + runW < opts.w && !used[i + runW] && opts.tint[i + runW] === tint) runW++;
      let runH = 1;
      scanRows:
      while (y + runH < opts.h) {
        const row = (y + runH) * opts.w + x;
        for (let k = 0; k < runW; k++) {
          if (used[row + k] || opts.tint[row + k] !== tint) break scanRows;
        }
        runH++;
      }
      for (let yy = 0; yy < runH; yy++) {
        used.fill(1, (y + yy) * opts.w + x, (y + yy) * opts.w + x + runW);
      }
      const style = styleForTerrainTint(tint);
      quads.push({
        x: opts.ox + x * opts.cell,
        y: opts.oy + y * opts.cell,
        w: runW * opts.cell,
        h: runH * opts.cell,
        kind: style.kind,
        alpha: style.alpha,
      });
    }
  }
  appendTerrainProps(quads, opts);
  return quads;
}

function styleForTerrainTint(tint: number): { kind: number; alpha: number } {
  switch (tint) {
    case 1: return { kind: 10, alpha: 0.96 }; // water
    case 2: return { kind: 11, alpha: 0.88 }; // rock
    case 3: return { kind: 11, alpha: 0.94 }; // wall/stone
    case 4: return { kind: 12, alpha: 0.038 }; // forest
    case 5: return { kind: 13, alpha: 0.014 }; // mud
    case 6: return { kind: 13, alpha: 0.012 }; // scree/field
    default: return { kind: 13, alpha: 0.42 };
  }
}

function appendTerrainProps(quads: TerrainQuad[], opts: { w: number; h: number; cell: number; ox: number; oy: number; tint: Uint8Array }) {
  let treeCount = 0;
  let shrubCount = 0;
  let churnCount = 0;
  let rockCount = 0;
  let potholeCount = 0;
  const maxTrees = 3200;
  const maxShrubs = 3400;
  const maxChurn = 780;
  const maxRocks = 3200;
  const maxPotholes = 4200;
  for (let y = 0; y < opts.h; y++) {
    for (let x = 0; x < opts.w; x++) {
      const tint = opts.tint[y * opts.w + x] ?? 0;
      const edge = isTintBoundary(opts, x, y, tint);
      if (tint === 4 && (treeCount < maxTrees || shrubCount < maxShrubs)) {
        const treeThreshold = edge ? 0.72 : 0.50;
        if (hashCell(x, y, 17) < treeThreshold && treeCount < maxTrees) {
          const center = jitteredCellCenter(opts, x, y, 31, 0.42);
          const size = opts.cell * ((edge ? 2.9 : 2.4) + hashCell(x, y, 43) * 2.7);
          quads.push({
            x: center.x - size * 0.46,
            y: center.y - size * 0.18,
            w: size * 0.92,
            h: size * 0.36,
            kind: 3,
            alpha: 0.14 + hashCell(x, y, 53) * 0.09,
          });
          quads.push({
            x: center.x - size * 0.34,
            y: center.y - size * 0.62,
            w: size * 0.68,
            h: size * 1.24,
            kind: 7,
            alpha: 0.88 + hashCell(x, y, 59) * 0.10,
          });
          treeCount++;
        }
        const shrubThreshold = edge ? 0.84 : 0.50;
        if (hashCell(x, y, 181) < shrubThreshold && shrubCount < maxShrubs) {
          const center = jitteredCellCenter(opts, x, y, 191, edge ? 0.58 : 0.48);
          const size = opts.cell * ((edge ? 2.5 : 2.0) + hashCell(x, y, 199) * 2.8);
          quads.push({
            x: center.x - size * 0.58,
            y: center.y - size * 0.32,
            w: size * 1.16,
            h: size * 0.64,
            kind: 4,
            alpha: 0.54 + hashCell(x, y, 211) * 0.28,
          });
          shrubCount++;
        }
      } else if ((tint === 5 || tint === 6) && (churnCount < maxChurn || rockCount < maxRocks || potholeCount < maxPotholes)) {
        const churnRoll = hashCell(x, y, 61);
        if (churnRoll < (tint === 5 ? 0.22 : 0.10) && churnCount < maxChurn) {
          const center = jitteredCellCenter(opts, x, y, 67, edge ? 0.58 : 0.48);
          const size = opts.cell * ((edge ? 2.4 : 2.9) + hashCell(x, y, 73) * 4.3);
          quads.push({
            x: center.x - size * 0.52,
            y: center.y - size * 0.32,
            w: size * 1.04,
            h: size * 0.64,
            kind: 2,
            alpha: tint === 5 ? 0.18 : 0.12,
          });
          churnCount++;
        }
        const potholeRoll = hashCell(x, y, 71);
        if (potholeRoll < (tint === 5 ? 0.82 : 0.58) && potholeCount < maxPotholes) {
          const center = jitteredCellCenter(opts, x, y, 83, edge ? 0.60 : 0.46);
          const size = opts.cell * (1.0 + hashCell(x, y, 97) * 2.6);
          quads.push({
            x: center.x - size * 0.55,
            y: center.y - size * 0.28,
            w: size * 1.1,
            h: size * 0.56,
            kind: 3,
            alpha: tint === 5 ? 0.26 : 0.18,
          });
          potholeCount++;
        }
        const rockRoll = hashCell(x, y, 109);
        if (rockRoll < (tint === 6 ? 0.52 : 0.38) && rockCount < maxRocks) {
          const center = jitteredCellCenter(opts, x, y, 127, edge ? 0.52 : 0.40);
          const size = opts.cell * (1.1 + hashCell(x, y, 149) * 2.7);
          quads.push({
            x: center.x - size * 0.50,
            y: center.y - size * 0.35,
            w: size,
            h: size * 0.7,
            kind: 6,
            alpha: 0.52 + hashCell(x, y, 167) * 0.20,
          });
          rockCount++;
        }
      }
    }
  }
}

function isTintBoundary(opts: { w: number; h: number; tint: Uint8Array }, x: number, y: number, tint: number): boolean {
  if (tint === 0) return false;
  return getTint(opts, x - 1, y) !== tint
    || getTint(opts, x + 1, y) !== tint
    || getTint(opts, x, y - 1) !== tint
    || getTint(opts, x, y + 1) !== tint;
}

function getTint(opts: { w: number; h: number; tint: Uint8Array }, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= opts.w || y >= opts.h) return 0;
  return opts.tint[y * opts.w + x] ?? 0;
}

function jitteredCellCenter(opts: { cell: number; ox: number; oy: number }, x: number, y: number, seed: number, amount: number): { x: number; y: number } {
  const jx = (hashCell(x, y, seed) - 0.5) * amount;
  const jy = (hashCell(x, y, seed + 1) - 0.5) * amount;
  return {
    x: opts.ox + (x + 0.5 + jx) * opts.cell,
    y: opts.oy + (y + 0.5 + jy) * opts.cell,
  };
}

function hashCell(x: number, y: number, seed: number): number {
  let n = (x * 374761393 + y * 668265263 + seed * 362437) | 0;
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function makeFixture(fixture: BattleTerrainFixture, fieldRect: [number, number, number, number]): TerrainQuad[] {
  if (fixture === 'sim-tint') return [];
  const [fx, fy, fw, fh] = fieldRect;
  const cx = fx + fw * 0.5;
  const cy = fy + fh * 0.5;
  const sx = Math.max(140, Math.min(520, fw * 0.92));
  const sy = Math.max(46, Math.min(108, fh * 0.38));
  const waterY = cy - sy * 0.78;
  const waterH = sy * 0.34;
  const beachY = waterY + waterH * 0.72;
  const beachH = sy * 0.16;
  const coastalBase: TerrainQuad[] = [
    { x: cx - sx * 0.53, y: waterY, w: sx * 1.06, h: waterH, kind: 0, alpha: 0.98 },
    { x: cx - sx * 0.54, y: beachY, w: sx * 1.08, h: beachH, kind: 1, alpha: 0.92 },
    { x: cx - sx * 0.50, y: beachY - beachH * 0.16, w: sx * 1.00, h: beachH * 0.38, kind: 8, alpha: 0.58 },
    { x: cx - sx * 0.47, y: beachY + beachH * 0.72, w: sx * 0.92, h: beachH * 0.34, kind: 8, alpha: 0.32 },
  ];
  const shrubs: TerrainQuad[] = [
    { x: cx - sx * 0.26, y: cy - sy * 0.06, w: 4.6, h: 3.0, kind: 4, alpha: 0.92 },
    { x: cx - sx * 0.17, y: cy + sy * 0.12, w: 5.2, h: 3.2, kind: 4, alpha: 0.88 },
    { x: cx + sx * 0.17, y: cy + sy * 0.08, w: 4.8, h: 3.0, kind: 4, alpha: 0.90 },
    { x: cx + sx * 0.30, y: cy - sy * 0.16, w: 3.4, h: 2.1, kind: 6, alpha: 0.82 },
    { x: cx + sx * 0.33, y: beachY + beachH * 0.55, w: 3.0, h: 10.5, kind: 7, alpha: 0.94 },
    { x: cx + sx * 0.37, y: beachY + beachH * 0.34, w: 2.5, h: 9.2, kind: 7, alpha: 0.88 },
    { x: cx + sx * 0.41, y: beachY + beachH * 0.46, w: 2.8, h: 10.0, kind: 7, alpha: 0.90 },
  ];
  const shadows: TerrainQuad[] = [
    { x: cx - sx * 0.22, y: cy - sy * 0.18, w: 20, h: 5.8, kind: 3, alpha: 0.20 },
    { x: cx + sx * 0.16, y: cy + sy * 0.02, w: 21, h: 6.0, kind: 3, alpha: 0.18 },
  ];
  const meleeDetails: TerrainQuad[] = [
    { x: cx - sx * 0.40, y: cy + sy * 0.04, w: sx * 0.18, h: sy * 0.34, kind: 2, alpha: 0.48 },
    { x: cx + sx * 0.22, y: cy + sy * 0.16, w: sx * 0.13, h: sy * 0.22, kind: 2, alpha: 0.34 },
    { x: cx - 27, y: cy - sy * 0.28, w: 54, h: 27, kind: 2, alpha: 0.70 },
    ...shadows,
    { x: cx - sx * 0.34, y: cy + sy * 0.28, w: 11.5, h: 7.0, kind: 6, alpha: 0.82 },
    { x: cx + sx * 0.27, y: cy + sy * 0.33, w: 9.2, h: 5.8, kind: 6, alpha: 0.76 },
    { x: cx - sx * 0.30, y: cy + sy * 0.14, w: 12.0, h: 7.2, kind: 4, alpha: 0.74 },
    { x: cx + sx * 0.34, y: cy + sy * 0.09, w: 10.0, h: 6.4, kind: 4, alpha: 0.70 },
    ...shrubs.slice(0, 4),
  ];
  if (fixture === 'dry-melee') {
    return meleeDetails;
  }
  if (fixture === 'melee') {
    return [
      ...coastalBase,
      ...meleeDetails,
      ...shrubs.slice(4, 6),
    ];
  }
  if (fixture === 'prop-field') {
    return [
      ...shadows,
      ...shrubs,
      { x: cx - sx * 0.36, y: cy + sy * 0.18, w: 5.8, h: 3.3, kind: 4, alpha: 0.90 },
      { x: cx + sx * 0.38, y: cy + sy * 0.16, w: 6.2, h: 3.5, kind: 4, alpha: 0.88 },
      { x: cx + sx * 0.03, y: cy + sy * 0.23, w: 3.8, h: 2.4, kind: 6, alpha: 0.84 },
      { x: cx - sx * 0.42, y: beachY + beachH * 0.30, w: 2.7, h: 9.8, kind: 7, alpha: 0.88 },
    ];
  }
  return [...coastalBase, ...shadows, ...shrubs];
}
