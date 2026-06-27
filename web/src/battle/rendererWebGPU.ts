import type { Camera } from '../shared/camera';
import { buildCrowdInstances, type CrowdInstance } from '../../../packages/crowd-runtime/src/instanceData';
import { BattleOverlayPass } from '../../../packages/game-renderer/src/battle/overlayPass';
import { BattleTerrainPass } from '../../../packages/game-renderer/src/battle/terrainPass';
import { createFrameShell, type MarkerInstance, type OverlayRenderPass, type RawFrameShell } from '../../../packages/webgpu-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../packages/webgpu-core/src/cameraWgsl';
import { SkinnedCrowdPipeline } from '../../../packages/webgpu-core/src/skinnedPipeline';
import { loadPlaceholderVat } from '../../../packages/soldier-assets/src/placeholders';
import { createPlaceholderSoldierMeshes } from '../../../packages/soldier-assets/src/soldierMesh';

export class BattleRendererWebGPU {
  readonly ready: Promise<void>;
  readonly pitch = 0.32;
  fixedTime: number | null = null;

  private shell: RawFrameShell | null = null;
  private terrain: BattleTerrainPass | null = null;
  private crowd: SkinnedCrowdPipeline | null = null;
  private overlay: BattleOverlayPass | null = null;
  private tris: BattleTrianglePass | null = null;
  private debugBlocks: BattleTrianglePass | null = null;
  private soldierUnit = new Uint32Array(0);
  private unitTeam: number[] = [];
  private unitClass: number[] = [];
  private terrainRect: [number, number, number, number] = [-220, -180, 440, 360];
  private terrainGrid: { w: number; h: number; cell: number; ox: number; oy: number; tint: Uint8Array } | null = null;
  private instances: CrowdInstance[] = [];
  private markers: MarkerInstance[] = [];
  private triangleVerts = new Float32Array();
  private staticSoldiers = 0;
  private frozenFrameKey: string | null = null;
  private skipFrozenFrame = false;
  private blockMode = new URLSearchParams(location.search).get('debug') === 'blocks';
  private framePerf = {
    buildMs: 0,
    uploadMs: 0,
    drawMs: 0,
    frameCpuMs: 0,
  };
  private frameStart = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ready = this.init();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.shell?.resize();
  }

  setStatic(soldierUnit: Uint32Array, teams: number[], classes: number[]) {
    this.soldierUnit = new Uint32Array(soldierUnit);
    this.unitTeam = teams.map((team) => (team === 1 ? 1 : 0));
    this.unitClass = classes.map((cls) => Math.max(0, Math.floor(cls || 0)));
    this.staticSoldiers = soldierUnit.length;
    this.frozenFrameKey = null;
    this.instances = [];
    this.markers = [];
    this.triangleVerts = new Float32Array();
    this.crowd?.upload([]);
    this.tris?.upload(this.triangleVerts);
    this.debugBlocks?.upload(this.triangleVerts);
  }

  setTerrain(w: number, h: number, cell: number, ox: number, oy: number, tint?: Uint8Array) {
    this.terrainRect = [ox, oy, w * cell, h * cell];
    this.terrainGrid = tint ? { w, h, cell, ox, oy, tint: new Uint8Array(tint) } : null;
    if (this.terrainGrid) this.terrain?.setTintGrid(this.terrainGrid);
    else this.terrain?.setFieldRect(this.terrainRect);
  }

  draw(
    positions: Float32Array,
    facings: Float32Array,
    frames: Float32Array,
    alive: Float32Array,
    count: number,
    camera: Camera,
  ) {
    if (!this.shell || !this.crowd) return;
    const frameKey = this.fixedTime !== null ? frozenFrameKey(camera, count, this.soldierUnit.length) : null;
    if (frameKey && frameKey === this.frozenFrameKey) {
      this.skipFrozenFrame = true;
      this.framePerf = { buildMs: 0, uploadMs: 0, drawMs: 0, frameCpuMs: 0 };
      return;
    }
    this.skipFrozenFrame = false;
    this.frameStart = performance.now();
    this.shell.setCamera(cameraSnapshot(camera));
    const buildStart = performance.now();
    const built = buildCrowdInstances({
      positions,
      facings,
      frames,
      alive,
      soldierUnit: this.soldierUnit,
      unitTeam: this.unitTeam,
      unitClass: this.unitClass,
      simTick: Math.floor((this.fixedTime ?? performance.now() / 1000) * 30),
      count,
    });
    const buildEnd = performance.now();
    if (camera.zoom < 1.2) {
      this.instances = [];
      this.markers = built.instances.map((inst) => ({
        x: inst.x,
        y: inst.y,
        facing: inst.facing,
        faction: inst.faction,
        size: inst.classId === 6 || inst.classId === 7 ? 1.45 : 1.1,
        lod: 3,
      }));
    } else {
      this.instances = built.instances;
      this.markers = [];
    }
    const uploadStart = performance.now();
    this.crowd.upload(this.instances);
    this.debugBlocks?.upload(this.blockMode ? buildDebugBlockTriangles(positions, alive, this.soldierUnit, this.unitTeam, count) : new Float32Array());
    const uploadEnd = performance.now();
    this.framePerf = {
      buildMs: buildEnd - buildStart,
      uploadMs: uploadEnd - uploadStart,
      drawMs: 0,
      frameCpuMs: uploadEnd - this.frameStart,
    };
  }

  drawTris(verts: Float32Array, camera: Camera) {
    if (!this.shell || !this.tris) return;
    this.frozenFrameKey = null;
    this.skipFrozenFrame = false;
    this.shell.setCamera(cameraSnapshot(camera));
    this.triangleVerts = new Float32Array(verts);
    const uploadStart = performance.now();
    this.tris.upload(verts);
    this.framePerf.uploadMs += performance.now() - uploadStart;
  }

  drawOverlay(verts: Float32Array, camera: Camera) {
    if (!this.shell || !this.terrain || !this.crowd || !this.overlay || !this.tris || !this.debugBlocks) return;
    if (this.skipFrozenFrame) return;
    this.shell.setCamera(cameraSnapshot(camera));
    if (this.frameStart === 0) this.frameStart = performance.now();
    const uploadStart = performance.now();
    this.overlay.upload(this.fixedTime !== null ? frozenSelectionOverlay(verts) : verts);
    if (this.triangleVerts.length === 0) this.tris.upload(this.triangleVerts);
    this.framePerf.uploadMs += performance.now() - uploadStart;
    const drawStart = performance.now();
    this.shell.drawFrame({
      clear: { r: 0.16, g: 0.24, b: 0.15, a: 1 },
      terrainBackdropRect: expandedTerrainRect(this.terrainRect),
      terrainRect: this.terrainRect,
      terrainStyle: camera.zoom < 1.2 ? 'wide-detail' : 'default',
      markers: this.markers,
      background: (pass) => {
        this.terrain!.draw(pass);
      },
      world: (pass) => {
        this.crowd!.draw(pass);
      },
      overlay: (pass) => {
        this.debugBlocks!.draw(pass);
        this.tris!.draw(pass);
        this.overlay!.draw(pass);
      },
    });
    const done = performance.now();
    this.framePerf.drawMs = done - drawStart;
    this.framePerf.frameCpuMs = done - this.frameStart;
    this.triangleVerts = new Float32Array();
    if (this.fixedTime !== null) {
      this.frozenFrameKey = frozenFrameKey(camera, this.staticSoldiers, this.soldierUnit.length);
    } else {
      this.frozenFrameKey = null;
    }
  }

  stats() {
    const shell = this.shell?.stats();
    const crowd = this.crowd?.stats();
    const markerCount = shell?.markerCount ?? this.markers.length;
    const skinnedCount = crowd?.instances ?? this.instances.length;
    return {
      renderer: 'webgpu',
      ready: this.shell !== null,
      width: shell?.width ?? 0,
      height: shell?.height ?? 0,
      soldiers: skinnedCount + markerCount,
      expectedSoldiers: this.staticSoldiers,
      drawCalls: (crowd?.drawCalls ?? 0) + (markerCount > 0 ? 1 : 0),
      lod: {
        skinned: skinnedCount,
        impostors: markerCount,
      },
      device: shell?.device ?? 'initializing',
      atmosphere: shell?.atmosphere ?? 'initializing',
      cameraContract: shell?.cameraContract ?? 'initializing',
      skinnedCameraContract: crowd?.cameraContract ?? 'initializing',
      phases: shell?.phases ?? [],
      depth: shell?.depth ?? null,
      terrain: this.terrain?.stats() ?? null,
      performance: {
        buildMs: roundMs(this.framePerf.buildMs),
        uploadMs: roundMs(this.framePerf.uploadMs),
        drawMs: roundMs(this.framePerf.drawMs),
        frameCpuMs: roundMs(this.framePerf.frameCpuMs),
      },
    };
  }

  async settlePresentedFrame() {
    if (!this.shell) return;
    await this.shell.device.queue.onSubmittedWorkDone();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await this.shell.device.queue.onSubmittedWorkDone();
  }

  private async init() {
    this.shell = await createFrameShell(this.canvas);
    this.terrain = new BattleTerrainPass(this.shell);
    if (this.terrainGrid) this.terrain.setTintGrid(this.terrainGrid);
    else {
      this.terrain.setFieldRect(this.terrainRect);
      this.terrain.setFixture('dry-melee');
    }
    this.overlay = new BattleOverlayPass(this.shell);
    this.tris = new BattleTrianglePass(this.shell);
    this.debugBlocks = new BattleTrianglePass(this.shell);
    this.crowd = new SkinnedCrowdPipeline(
      this.shell,
      createPlaceholderSoldierMeshes([0.20, 0.42, 0.88]),
      await loadPlaceholderVat(),
    );
  }
}

function frozenSelectionOverlay(verts: Float32Array) {
  const stride = 5;
  const maxSegmentLength = 12;
  const out: number[] = [];
  for (let i = 0; i + stride * 2 <= verts.length; i += stride * 2) {
    const x0 = verts[i];
    const y0 = verts[i + 1];
    const x1 = verts[i + stride];
    const y1 = verts[i + stride + 1];
    if (Math.hypot(x1 - x0, y1 - y0) > maxSegmentLength) continue;
    for (let k = 0; k < stride * 2; k++) out.push(verts[i + k]);
  }
  return new Float32Array(out);
}

function roundMs(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}

function cameraSnapshot(camera: Camera) {
  return {
    x: camera.x,
    y: camera.y,
    zoom: camera.zoom,
    pitch: camera.pitch ?? 0.32,
    yaw: camera.yaw ?? 0,
  };
}

function frozenFrameKey(camera: Camera, count: number, staticSoldiers: number) {
  return [
    roundKey(camera.x),
    roundKey(camera.y),
    roundKey(camera.zoom),
    roundKey(camera.pitch ?? 0),
    roundKey(camera.yaw ?? 0),
    count,
    staticSoldiers,
  ].join(':');
}

function roundKey(value: number) {
  return Number.isFinite(value) ? value.toFixed(4) : 'nan';
}

function expandedTerrainRect([x, y, w, h]: [number, number, number, number]): [number, number, number, number] {
  const margin = Math.max(120, Math.max(w, h) * 0.22);
  return [x - margin, y - margin, w + margin * 2, h + margin * 2];
}

function buildDebugBlockTriangles(
  positions: Float32Array,
  alive: Float32Array,
  soldierUnit: Uint32Array,
  unitTeam: number[],
  count: number,
) {
  const bounds = new Map<number, { x0: number; y0: number; x1: number; y1: number; team: number }>();
  for (let i = 0; i < count; i++) {
    if ((alive[i] ?? 0) <= 0.5) continue;
    const unit = soldierUnit[i] ?? 0;
    const x = positions[i * 2];
    const y = positions[i * 2 + 1];
    const prev = bounds.get(unit);
    if (prev) {
      prev.x0 = Math.min(prev.x0, x);
      prev.y0 = Math.min(prev.y0, y);
      prev.x1 = Math.max(prev.x1, x);
      prev.y1 = Math.max(prev.y1, y);
    } else {
      bounds.set(unit, { x0: x, y0: y, x1: x, y1: y, team: unitTeam[unit] ?? 0 });
    }
  }
  const verts: number[] = [];
  for (const b of bounds.values()) {
    const pad = 2.4;
    const x0 = b.x0 - pad;
    const y0 = b.y0 - pad;
    const x1 = b.x1 + pad;
    const y1 = b.y1 + pad;
    const color: [number, number, number, number] = b.team === 1 ? [0.88, 0.20, 0.16, 0.88] : [0.18, 0.44, 1.0, 0.88];
    pushTri(verts, x0, y0, x1, y0, x1, y1, color);
    pushTri(verts, x0, y0, x1, y1, x0, y1, color);
  }
  return new Float32Array(verts);
}

function pushTri(
  verts: number[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  color: [number, number, number, number],
) {
  verts.push(ax, ay, ...color, bx, by, ...color, cx, cy, ...color);
}

class BattleTrianglePass {
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GPUBuffer;
  private capacity = 0;
  private vertexCount = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'battle-triangle-wgsl', code: TRIANGLE_WGSL });
    this.pipeline = device.createRenderPipeline({
      label: 'battle-triangle-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x4' },
          ],
        }],
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
      primitive: { topology: 'triangle-list' },
    });
    this.vertexBuffer = device.createBuffer({
      label: 'battle-triangle-empty',
      size: 6 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(vertices: Float32Array) {
    this.vertexCount = Math.floor(vertices.length / 6);
    if (this.vertexCount > this.capacity) {
      this.capacity = Math.max(this.vertexCount, this.capacity * 2, 128);
      this.vertexBuffer = this.shell.device.createBuffer({
        label: 'battle-triangle-vertices',
        size: this.capacity * 6 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (vertices.length > 0) this.shell.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
  }

  draw(pass: OverlayRenderPass) {
    if (this.vertexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount);
  }
}

const TRIANGLE_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vs(@location(0) world: vec2f, @location(1) color: vec4f) -> VsOut {
  var out: VsOut;
  out.pos = projectGround(world, 0.0);
  out.color = color;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  return in.color;
}`;
