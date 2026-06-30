import type { RawFrameShell, WorldRenderPass } from '../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';
import { gpuOpaqueColorTarget, gpuWorldDepthStencil } from '../../../renderer-core/src/pipelineContracts';
import { compileShader } from '../../../renderer-core/src/compileShader';
import type { BattleGroundCover, BattleTerrainGrid } from './terrainFeatures';
import { terrainHeightAt, type TerrainHeightField } from '../terrain/heightField';

// The rolling battle ground: a height-displaced grid mesh that replaces the flat
// terrain quads, so soldiers, shadows, and props (which seat on the same height
// source) sit ON the ground instead of floating over it. Full-field ground cover
// (grass/yellow/scrub/sand) is the base; sim terrain tints layer feature colour
// on top. Lit by the surface normal so the relief reads.

const GROUND_COVER_COLOR: Record<BattleGroundCover, [number, number, number]> = {
  'green-grass': [0.40, 0.49, 0.26],
  'yellow-grass': [0.60, 0.57, 0.31],
  'scrub-grass': [0.52, 0.53, 0.34],
  sand: [0.74, 0.66, 0.46],
};

// Feature tints (sim tint byte → overlay colour); grass (0) keeps the cover.
const TINT_COLOR: Record<number, [number, number, number]> = {
  1: [0.26, 0.40, 0.52], // water
  2: [0.50, 0.47, 0.42], // rock
  3: [0.55, 0.52, 0.47], // wall
  4: [0.24, 0.34, 0.19], // forest floor
  5: [0.40, 0.33, 0.23], // mud
  6: [0.56, 0.53, 0.45], // scree/rough
};

const GROUND_WGSL = `
${WORLD_CAMERA_WGSL}
struct GroundUniform {
  meadow0: vec4f,
  meadow1: vec4f,
};
@group(1) @binding(0) var<uniform> ground: GroundUniform;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
  @location(1) light: f32,
  @location(2) world: vec2f,
  @location(3) fog: f32,
  @location(4) axes: vec2f,
};

fn hash(p: vec2f) -> f32 {
  let p3 = fract(vec3f(p.xyx) * 0.1031);
  let q = p3 + dot(p3, p3.yzx + vec3f(33.33));
  return fract((q.x + q.y) * q.z);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
             mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn fbm(p: vec2f) -> f32 {
  return vnoise(p) * 0.52 + vnoise(p * 2.11 + vec2f(4.3, 1.7)) * 0.31 + vnoise(p * 4.07 + vec2f(9.1, 6.4)) * 0.17;
}

fn ridge(p: vec2f) -> f32 {
  let r = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
  return r * r;
}

fn meadowWeight(axes: vec2f) -> f32 {
  let enabled = ground.meadow0.x;
  let depthT = smoothstep(ground.meadow1.x, ground.meadow1.y, axes.y);
  return enabled * mix(ground.meadow1.z, ground.meadow1.w, depthT);
}

fn meadowCarpet(world: vec2f, axes: vec2f) -> vec3f {
  let depthT = smoothstep(ground.meadow1.x, ground.meadow1.y, axes.y);
  let nearT = 1.0 - depthT;
  let warp = vec2f(
    fbm(world * 0.012 + vec2f(13.0, 2.0)) - 0.5,
    fbm(world * 0.014 + vec2f(5.0, 17.0)) - 0.5
  );
  let broad = fbm(world * 0.026 + warp * 3.4 + vec2f(2.0, 9.0));
  let clump = fbm(world * 0.072 + warp * 5.0 + vec2f(11.0, 4.0));
  let under = fbm(world * 0.145 + warp * 4.4 + vec2f(6.0, 3.0));
  let brushed = ridge(vec2f(
    world.x * 0.155 + world.y * 0.036 + warp.x * 2.2,
    world.y * 0.050 - world.x * 0.014 + broad * 1.1
  ));
  let felt = ridge(vec2f(
    world.x * 0.46 + world.y * 0.120 + warp.x * 3.8,
    world.y * 0.165 - world.x * 0.052 + warp.y * 2.6
  ));
  let mat = smoothstep(0.30, 0.78, broad);
  let shadowClump = smoothstep(0.48, 0.84, clump);
  let rootPocket = smoothstep(0.56, 0.88, under);
  let root = vec3f(0.38, 0.47, 0.35);
  let body = vec3f(0.56, 0.63, 0.49);
  let lift = vec3f(0.66, 0.70, 0.57);
  let shadow = vec3f(0.30, 0.40, 0.29);
  var col = mix(body, lift, mat * 0.12 + brushed * (0.035 + nearT * 0.020));
  col = mix(col, shadow, shadowClump * (0.22 + nearT * 0.28));
  col = mix(col, root, rootPocket * (0.12 + nearT * 0.12));
  col = mix(col, lift, felt * (0.020 + nearT * 0.025));
  col = mix(col, shadow, (1.0 - mat) * (0.08 + nearT * 0.10));
  col = mix(col, vec3f(0.64, 0.70, 0.62), depthT * 0.20);
  return col;
}

@vertex
fn vs(@location(0) world: vec3f, @location(1) normal: vec3f, @location(2) color: vec3f) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld3d(world, civsimBattleWorldDepth3d(world));
  let sun = normalize(vec3f(-0.38, -0.30, 0.87));
  out.light = clamp(dot(normalize(normal), sun) * 0.45 + 0.74, 0.5, 1.18);
  out.color = color;
  out.world = world.xy;
  let axes = cameraSpace(world.xy);
  out.axes = axes;
  out.fog = smoothstep(720.0, 1850.0, axes.y) * 0.52;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  // Grass/ground micro-detail across scales: a gentle large drift, a mid mottle,
  // and high-frequency blade speckle so the surface reads as textured ground at
  // the gameplay camera rather than a soft wash.
  let drift = (fbm(in.world * 0.08) - 0.5) * 0.10;
  let mottle = (fbm(in.world * 1.1) - 0.5) * 0.13;
  let blade = (fbm(in.world * 4.7) - 0.5) * 0.10 + (fbm(in.world * 12.0) - 0.5) * 0.06;
  let detail = clamp(1.0 + drift + mottle + blade, 0.68, 1.32);
  let warmKey = vec3f(1.06, 1.00, 0.86);
  let coolFill = vec3f(0.74, 0.79, 0.84);
  let grade = mix(coolFill, warmKey, clamp((in.light - 0.5) / 0.68, 0.0, 1.0));
  var col = in.color * detail * in.light * grade;
  let meadow = meadowWeight(in.axes);
  let meadowDepthT = smoothstep(ground.meadow1.x, ground.meadow1.y, in.axes.y);
  let meadowLight = mix(1.00, in.light, 0.24 + meadowDepthT * 0.18);
  let meadowCol = meadowCarpet(in.world, in.axes) * meadowLight * vec3f(0.94, 0.94, 0.98);
  col = mix(col, meadowCol, meadow);
  // Churn: where the ground is earthy (brown, r over g) the mud reads as trodden,
  // broken ground — a patchy dried crust over darker hollows, scored by
  // directional drag ruts — rather than a smooth, uniform stain.
  // Mud is both BROWN (r over g) and DARK; bright yellow/scrub grass is also
  // warm (r over g) but light, so key on brown AND dark to churn trodden mud
  // without cracking the dry grass cover.
  let brown = smoothstep(0.0, 0.05, in.color.r - in.color.g);
  let dark = 1.0 - smoothstep(0.30, 0.46, (in.color.r + in.color.g + in.color.b) / 3.0);
  let earth = brown * dark;
  // Clods at a coarse scale (so individual patches read as broken ground at the
  // gameplay camera, not sub-pixel speckle that averages back to a flat wash),
  // scored by long directional drag ruts.
  let clods = fbm(in.world * 0.07) * 0.6 + fbm(in.world * 0.16 + vec2f(5.0, 2.0)) * 0.4;
  let ruts = ridge(in.world * vec2f(0.11, 0.045) + vec2f(2.0, 0.0));
  let churn = clamp(0.58 + clods * 0.72 + ruts * 0.28, 0.42, 1.30);
  col = mix(col, col * churn, earth);
  let haze = vec3f(0.78, 0.82, 0.81);
  col = mix(col, haze, in.fog);
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}`;

export class BattleGroundPass {
  private pipeline: GPURenderPipeline;
  private groundBindGroupLayout: GPUBindGroupLayout;
  private groundBindGroup: GPUBindGroup;
  private uniformBuffer: GPUBuffer;
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private indexCount = 0;
  private triangles = 0;
  private meadowStats = {
    enabled: false,
    depthNear: 0,
    depthFar: 1,
    nearStrength: 0,
    farStrength: 0,
  };

  constructor(private shell: RawFrameShell) {
    const module = compileShader(shell.device, GROUND_WGSL, 'battle-ground-heightfield');
    this.groundBindGroupLayout = shell.device.createBindGroupLayout({
      label: 'battle-ground-uniform-layout',
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    this.pipeline = shell.device.createRenderPipeline({
      label: 'battle-ground-heightfield-pipeline',
      layout: shell.device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout, this.groundBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 36,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' },
          ],
        }],
      },
      fragment: { module, entryPoint: 'fs', targets: [gpuOpaqueColorTarget(shell.info.format)] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: gpuWorldDepthStencil('read-write'),
    });
    this.uniformBuffer = shell.device.createBuffer({
      label: 'battle-ground-uniforms',
      size: 8 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.groundBindGroup = shell.device.createBindGroup({
      label: 'battle-ground-uniform-bind-group',
      layout: this.groundBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
    this.setMeadow();
  }

  setMeadow(params: {
    depthNear?: number;
    depthFar?: number;
    nearStrength?: number;
    farStrength?: number;
  } = {}) {
    const depthNear = Number.isFinite(params.depthNear) ? params.depthNear! : 0;
    const depthFar = Number.isFinite(params.depthFar) ? params.depthFar! : 1;
    const nearStrength = Number.isFinite(params.nearStrength) ? params.nearStrength! : 0;
    const farStrength = Number.isFinite(params.farStrength) ? params.farStrength! : 0;
    const enabled = Math.max(0, Math.min(1, Math.max(nearStrength, farStrength)));
    this.meadowStats = {
      enabled: enabled > 0,
      depthNear,
      depthFar: Math.max(depthNear + 0.001, depthFar),
      nearStrength: Math.max(0, Math.min(1, nearStrength)),
      farStrength: Math.max(0, Math.min(1, farStrength)),
    };
    this.shell.device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array([
      enabled,
      0,
      0,
      0,
      depthNear,
      this.meadowStats.depthFar,
      this.meadowStats.nearStrength,
      this.meadowStats.farStrength,
    ]));
  }

  /** Build the displaced grid mesh from the grid (tint/dims) and a shared height
   *  field (carrying the render exaggeration, so props and soldiers ride the
   *  exact same surface). `step` cells per quad downsamples the sim grid (600×400)
   *  to a mesh fine enough to read the relief, coarse enough to stay cheap. */
  setTerrain(grid: BattleTerrainGrid, field: TerrainHeightField, cover: BattleGroundCover, step = 2) {
    const base = GROUND_COVER_COLOR[cover] ?? GROUND_COVER_COLOR['green-grass'];
    const nx = Math.floor(grid.w / step) + 1;
    const ny = Math.floor(grid.h / step) + 1;
    const verts = new Float32Array(nx * ny * 9);
    const cellWorld = (ci: number, cj: number): [number, number] => [
      grid.ox + Math.min(ci, grid.w - 1) * grid.cell + grid.cell * 0.5,
      grid.oy + Math.min(cj, grid.h - 1) * grid.cell + grid.cell * 0.5,
    ];
    // Box-filter the feature tint over the step block so a forest/mud boundary
    // fades across cells instead of stair-stepping per coarse vertex.
    const cellColor = (ci: number, cj: number): [number, number, number] => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -step; dy <= step; dy++) {
        for (let dx = -step; dx <= step; dx++) {
          const sx = ci + dx;
          const sy = cj + dy;
          if (sx < 0 || sy < 0 || sx >= grid.w || sy >= grid.h) continue;
          const overlay = TINT_COLOR[grid.tint[sy * grid.w + sx]];
          const c = overlay ? mix(base, overlay, 0.82) : base;
          r += c[0]; g += c[1]; b += c[2]; n++;
        }
      }
      return n > 0 ? [r / n, g / n, b / n] : base;
    };
    let v = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const ci = Math.min(i * step, grid.w - 1);
        const cj = Math.min(j * step, grid.h - 1);
        const [x, y] = cellWorld(ci, cj);
        const z = terrainHeightAt(field, x, y);
        // Surface normal from the height gradient (central difference in world).
        const d = grid.cell * step;
        const hx = terrainHeightAt(field, x + d, y) - terrainHeightAt(field, x - d, y);
        const hy = terrainHeightAt(field, x, y + d) - terrainHeightAt(field, x, y - d);
        const nlen = Math.hypot(hx, hy, 2 * d) || 1;
        const color = cellColor(ci, cj);
        verts[v++] = x; verts[v++] = y; verts[v++] = z;
        verts[v++] = -hx / nlen; verts[v++] = -hy / nlen; verts[v++] = (2 * d) / nlen;
        verts[v++] = color[0]; verts[v++] = color[1]; verts[v++] = color[2];
      }
    }
    const indices: number[] = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const dd = c + 1;
        indices.push(a, c, b, b, c, dd);
      }
    }
    this.upload(verts, new Uint32Array(indices));
    this.triangles = indices.length / 3;
  }

  private upload(verts: Float32Array, indices: Uint32Array) {
    const device = this.shell.device;
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.vertexBuffer = device.createBuffer({ label: 'battle-ground-vertices', size: verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.vertexBuffer, 0, verts);
    this.indexBuffer = device.createBuffer({ label: 'battle-ground-indices', size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.indexBuffer, 0, indices);
    this.indexCount = indices.length;
  }

  draw(pass: WorldRenderPass) {
    if (!this.vertexBuffer || !this.indexBuffer || this.indexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setBindGroup(1, this.groundBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint32');
    pass.drawIndexed(this.indexCount);
  }

  stats() {
    return {
      triangles: this.triangles,
      layer: 'battle-ground-heightfield' as const,
      meadow: this.meadowStats,
    };
  }
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
