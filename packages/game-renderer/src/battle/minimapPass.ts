import type { OverlayRenderPass, RawFrameShell } from '../../../renderer-core/src/frameShell';
import { compileShader } from '../../../renderer-core/src/compileShader';
import { gpuMultisample } from '../../../renderer-core/src/pipelineContracts';
import { factionForTeam } from './factionColors';

export interface MinimapUnit {
  x: number;
  y: number;
  team: 0 | 1 | 2;
  selected?: boolean;
}

export interface MinimapWorldBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface MinimapCameraBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BattleMinimapData {
  world: MinimapWorldBounds;
  camera?: MinimapCameraBounds;
  units: MinimapUnit[];
}

export interface BattleMinimapStats {
  rects: number;
  units: number;
  selectedUnits: number;
}

interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: [number, number, number, number];
}

const MINIMAP_WGSL = `
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vs(@location(0) quad: vec2f, @location(1) rect: vec4f, @location(2) color: vec4f) -> VsOut {
  let p = mix(rect.xy, rect.zw, quad * 0.5 + vec2f(0.5));
  var out: VsOut;
  out.pos = vec4f(p, 0.0, 1.0);
  out.color = color;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  return in.color;
}`;

export class BattleMinimapPass {
  private pipeline: GPURenderPipeline;
  private quadBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer;
  private capacity = 0;
  private rectCount = 0;
  private statsValue: BattleMinimapStats = { rects: 0, units: 0, selectedUnits: 0 };

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = compileShader(device, MINIMAP_WGSL, 'battle-minimap');
    this.pipeline = device.createRenderPipeline({
      label: 'battle-minimap-pipeline',
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
          {
            arrayStride: 32,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x4' },
              { shaderLocation: 2, offset: 16, format: 'float32x4' },
            ],
          },
        ],
      },
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
      multisample: gpuMultisample(shell.sampleCount),
    });
    this.quadBuffer = device.createBuffer({
      label: 'battle-minimap-quad',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.quadBuffer, 0, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    this.instanceBuffer = device.createBuffer({
      label: 'battle-minimap-empty',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(data: BattleMinimapData) {
    const rects = buildRects(data, this.shell.stats().width, this.shell.stats().height);
    this.statsValue = {
      rects: rects.length,
      units: data.units.length,
      selectedUnits: data.units.filter((u) => u.selected).length,
    };
    this.rectCount = rects.length;
    if (rects.length > this.capacity) {
      this.capacity = Math.max(rects.length, this.capacity * 2, 64);
      this.instanceBuffer = this.shell.device.createBuffer({
        label: 'battle-minimap-rects',
        size: this.capacity * 8 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    const packed = new Float32Array(rects.length * 8);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const x0 = (r.x / this.shell.stats().width) * 2 - 1;
      const y0 = 1 - (r.y / this.shell.stats().height) * 2;
      const x1 = ((r.x + r.w) / this.shell.stats().width) * 2 - 1;
      const y1 = 1 - ((r.y + r.h) / this.shell.stats().height) * 2;
      const o = i * 8;
      packed[o] = x0;
      packed[o + 1] = y1;
      packed[o + 2] = x1;
      packed[o + 3] = y0;
      packed.set(r.color, o + 4);
    }
    if (packed.length > 0) this.shell.device.queue.writeBuffer(this.instanceBuffer, 0, packed);
  }

  draw(pass: OverlayRenderPass) {
    if (this.rectCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.draw(4, this.rectCount);
  }

  stats(): BattleMinimapStats {
    return { ...this.statsValue };
  }
}

function buildRects(data: BattleMinimapData, width: number, height: number): ScreenRect[] {
  const mapW = Math.min(188, Math.max(132, width * 0.20));
  const mapH = Math.min(126, Math.max(88, height * 0.18));
  const x = 16;
  const y = height - mapH - 16;
  const rects: ScreenRect[] = [
    { x: x - 3, y: y - 3, w: mapW + 6, h: mapH + 6, color: [0.08, 0.075, 0.055, 0.84] },
    { x, y, w: mapW, h: mapH, color: [0.38, 0.42, 0.24, 0.82] },
    { x, y: y + mapH * 0.74, w: mapW, h: mapH * 0.26, color: [0.19, 0.42, 0.54, 0.88] },
  ];
  if (data.camera) {
    const c0 = project(data.camera.x0, data.camera.y0, data.world, x, y, mapW, mapH);
    const c1 = project(data.camera.x1, data.camera.y1, data.world, x, y, mapW, mapH);
    const vx = Math.min(c0.x, c1.x);
    const vy = Math.min(c0.y, c1.y);
    const vw = Math.max(5, Math.abs(c1.x - c0.x));
    const vh = Math.max(5, Math.abs(c1.y - c0.y));
    rects.push({ x: vx, y: vy, w: vw, h: 1.6, color: [1, 0.93, 0.64, 0.9] });
    rects.push({ x: vx, y: vy + vh, w: vw, h: 1.6, color: [1, 0.93, 0.64, 0.9] });
    rects.push({ x: vx, y: vy, w: 1.6, h: vh, color: [1, 0.93, 0.64, 0.9] });
    rects.push({ x: vx + vw, y: vy, w: 1.6, h: vh, color: [1, 0.93, 0.64, 0.9] });
  }
  for (const unit of data.units) {
    const p = project(unit.x, unit.y, data.world, x, y, mapW, mapH);
    const size = unit.selected ? 4.2 : 3.0;
    const primary = factionForTeam(unit.team).primary;
    const color: [number, number, number, number] = unit.selected
      ? [1, 0.80, 0.20, 1]
      : [primary[0], primary[1], primary[2], 0.96];
    rects.push({ x: p.x - size * 0.5, y: p.y - size * 0.5, w: size, h: size, color });
  }
  return rects;
}

function project(x: number, y: number, world: MinimapWorldBounds, mapX: number, mapY: number, mapW: number, mapH: number) {
  const wx = Math.max(1, world.x1 - world.x0);
  const wy = Math.max(1, world.y1 - world.y0);
  return {
    x: mapX + ((x - world.x0) / wx) * mapW,
    y: mapY + (1 - (y - world.y0) / wy) * mapH,
  };
}
