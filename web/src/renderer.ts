import type { Camera } from './camera';
import { buildAtlas, COLS, ROWS } from './atlas';

/** Meters of painted wilds beyond every map edge (camera bounds match). */
export const WILDS_MARGIN = 1600;

export const CLASS_NAMES = [
  'Heavy Infantry', 'Light Infantry', 'Long Swords', 'Phalanx', 'Archers',
  'Skirmishers', 'Shock Cavalry', 'Horse Archers', 'Artillery Crew',
];

// ---------------------------------------------------------------- shaders --

const SPRITE_VS = `#version 300 es
layout(location=0) in vec2 a_quad;      // -0.5..0.5 unit quad
layout(location=1) in vec2 a_pos;       // world meters
layout(location=2) in float a_facing;   // radians, 0 = +x (sprites face +x)
layout(location=3) in float a_row;      // atlas row
layout(location=4) in float a_frame;    // atlas column
layout(location=5) in float a_size;     // world meters across the quad
layout(location=6) in float a_alive;    // 1 living, 0 corpse
layout(location=7) in float a_unit;
uniform vec4 u_cam;
uniform float u_pass;     // 0 = corpses, 1 = living, 2 = all
uniform float u_selected;
uniform vec2 u_sheet;     // cols, rows
out vec2 v_uv;
out float v_kill;
out float v_lit;
void main() {
  float want = u_pass > 1.5 ? 1.0 : (abs(a_alive - u_pass) < 0.5 ? 1.0 : 0.0);
  v_kill = 1.0 - want;
  vec2 f = vec2(cos(a_facing), sin(a_facing));
  vec2 r = vec2(-f.y, f.x);
  vec2 world = a_pos + (f * a_quad.x + r * a_quad.y) * a_size;
  vec2 clip = (world - u_cam.zw) * u_cam.xy;
  gl_Position = vec4(clip * want, want > 0.5 ? 0.0 : 2.0, 1.0);
  vec2 cell = vec2(a_frame, a_row);
  v_uv = (cell + vec2(a_quad.x + 0.5, 0.5 - a_quad.y)) / u_sheet;
  v_lit = abs(a_unit - u_selected) < 0.5 ? 1.35 : 1.0;
}`;

const SPRITE_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
in float v_kill;
in float v_lit;
uniform sampler2D u_tex;
out vec4 o;
void main() {
  if (v_kill > 0.5) discard;
  vec4 c = texture(u_tex, v_uv);
  if (c.a < 0.04) discard;
  o = vec4(c.rgb * v_lit, c.a);
}`;

const GROUND_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
uniform vec4 u_cam;
uniform vec4 u_rect;   // expanded quad (map + wilds margin)
uniform vec4 u_inner;  // map sub-rect within the quad: offset.xy, size.zw
out vec2 v_uv;         // MAP-relative uv: <0 or >1 = the wilds
out vec2 v_world;
void main() {
  vec2 world = u_rect.xy + a_corner * u_rect.zw;
  v_world = world;
  vec2 clip = (world - u_cam.zw) * u_cam.xy;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_uv = (a_corner - u_inner.xy) / u_inner.zw;
}`;

// Procedural ground: the tint id picks a palette; value noise breaks it up;
// water animates. Terrain data texture: R = speed, G = rough, B = tint/8.
const GROUND_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec2 v_world;
uniform sampler2D u_terrain;
uniform float u_time;
out vec4 o;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  bool outside = v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0;
  vec3 t = outside ? vec3(1.0, 0.6, 0.0) : texture(u_terrain, v_uv).rgb;
  float tint = outside ? 99.0 : floor(t.b * 8.0 + 0.5);
  float n1 = noise(v_world * 0.11);
  float n2 = noise(v_world * 0.45);
  float n = n1 * 0.7 + n2 * 0.3;

  vec3 col;
  if (tint < 0.5) {            // sunny meadow
    col = mix(vec3(0.435, 0.561, 0.290), vec3(0.545, 0.682, 0.333), n);
    col *= 0.94 + 0.06 * noise(v_world * 1.7);
    // Wildflower speckles, because a battlefield was a meadow yesterday.
    float fl = noise(v_world * 2.9 + 7.3);
    if (fl > 0.935) {
      float pick = hash(floor(v_world * 2.9 + 7.3));
      vec3 flower = pick > 0.66 ? vec3(0.95, 0.62, 0.78)
                  : pick > 0.33 ? vec3(0.98, 0.95, 0.85)
                  : vec3(0.99, 0.83, 0.38);
      col = mix(col, flower, smoothstep(0.935, 0.97, fl));
    }
  } else if (tint < 1.5) {     // bright water
    float w = noise(v_world * 0.22 + vec2(u_time * 0.25, u_time * 0.18));
    col = mix(vec3(0.235, 0.455, 0.604), vec3(0.337, 0.580, 0.722), w);
    // Sun glitter drifting downstream.
    float sp = noise(v_world * 0.9 + vec2(-u_time * 0.7, u_time * 0.2));
    col += vec3(0.35) * smoothstep(0.88, 0.97, sp);
  } else if (tint < 2.5) {     // crags
    float ridge = abs(noise(v_world * 0.18) - 0.5) * 2.0;
    col = mix(vec3(0.45, 0.43, 0.41), vec3(0.68, 0.65, 0.61), ridge);
    col *= 0.88 + 0.12 * n2;
  } else if (tint < 3.5) {     // sandstone city wall
    vec2 brick = fract(v_world * vec2(0.24, 0.5));
    float mortar = step(0.92, brick.x) + step(0.9, brick.y);
    col = mix(vec3(0.72, 0.62, 0.48), vec3(0.55, 0.47, 0.37), clamp(mortar, 0.0, 1.0));
    col *= 0.92 + 0.08 * n2;
  } else if (tint < 4.5) {     // forest floor
    col = mix(vec3(0.290, 0.420, 0.235), vec3(0.365, 0.490, 0.270), n);
  } else if (tint < 5.5) {     // warm marsh / mud
    col = mix(vec3(0.42, 0.35, 0.24), vec3(0.52, 0.44, 0.30), n);
    col += 0.05 * smoothstep(0.6, 0.9, noise(v_world * 0.33));
  } else if (tint > 90.0) {    // the wilds beyond the field
    float wild = noise(v_world * 0.06);
    col = mix(vec3(0.30, 0.40, 0.22), vec3(0.22, 0.31, 0.18), wild);
    col *= 0.85 + 0.15 * n2;
    // Sparse dark canopy clumps so it reads as untamed country.
    col = mix(col, vec3(0.16, 0.24, 0.13), smoothstep(0.62, 0.85, noise(v_world * 0.18 + 3.7)));
  } else {                     // golden field / scree
    col = mix(vec3(0.60, 0.55, 0.38), vec3(0.70, 0.64, 0.44), n2);
  }

  col *= 0.90 + 0.10 * t.r;    // slow ground reads darker, honestly
  // The battlefield bound: a crisp double line at the true map edge.
  vec2 du = fwidth(v_uv) * 2.0;
  float bx = min(smoothstep(0.0, du.x, abs(v_uv.x)), smoothstep(0.0, du.x, abs(v_uv.x - 1.0)));
  float by = min(smoothstep(0.0, du.y, abs(v_uv.y)), smoothstep(0.0, du.y, abs(v_uv.y - 1.0)));
  float border = 1.0 - min(bx, by);
  col = mix(col, vec3(0.92, 0.86, 0.62), border * 0.85);
  o = vec4(col, 1.0);
}`;

const LINE_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec3 a_color;
uniform vec4 u_cam;
out vec3 v_color;
void main() {
  vec2 clip = (a_pos - u_cam.zw) * u_cam.xy;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
}`;

const LINE_FS = `#version 300 es
precision mediump float;
in vec3 v_color;
out vec4 o;
void main() { o = vec4(v_color, 0.9); }`;

const TRI_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_color;
uniform vec4 u_cam;
out vec4 v_color;
void main() {
  vec2 clip = (a_pos - u_cam.zw) * u_cam.xy;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
}`;

const TRI_FS = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 o;
void main() { o = v_color; }`;

// ---------------------------------------------------------------- helpers --

function compile(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

interface SpriteBufs {
  pos: WebGLBuffer;
  facing: WebGLBuffer;
  row: WebGLBuffer;
  frame: WebGLBuffer;
  size: WebGLBuffer;
  alive: WebGLBuffer;
  unit: WebGLBuffer;
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private sprite: WebGLProgram;
  private ground: WebGLProgram;
  private line: WebGLProgram;
  private atlasTex: WebGLTexture;
  private terrainTex: WebGLTexture | null = null;
  private mapRect: [number, number, number, number] = [0, 0, 1, 1];

  private quadBuf: WebGLBuffer;
  private groundVao: WebGLVertexArrayObject;
  private n = 0;

  private soldierBufs: SpriteBufs;
  private soldierVao: WebGLVertexArrayObject;
  private decalVao: WebGLVertexArrayObject;
  private decalCount = 0;
  private bannerVao: WebGLVertexArrayObject;
  private bannerBufs: SpriteBufs;

  private lineVao: WebGLVertexArrayObject;
  private lineBuf: WebGLBuffer;
  private tri: WebGLProgram;
  private triVao: WebGLVertexArrayObject;
  private triBuf: WebGLBuffer;

  readonly atlasCanvas: HTMLCanvasElement;
  private soldierRowOf: (cls: number, team: number) => number;
  private decalRow: number;
  private start = performance.now();

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true })!;
    this.gl = gl;
    this.sprite = compile(gl, SPRITE_VS, SPRITE_FS);
    this.ground = compile(gl, GROUND_VS, GROUND_FS);
    this.line = compile(gl, LINE_VS, LINE_FS);

    const atlas = buildAtlas();
    this.atlasCanvas = atlas.canvas;
    this.soldierRowOf = atlas.soldierRow;
    this.decalRow = atlas.decalRow;
    this.atlasTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);

    this.groundVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.groundVao);
    const gq = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, gq);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const mkBufs = (): SpriteBufs => ({
      pos: gl.createBuffer()!, facing: gl.createBuffer()!, row: gl.createBuffer()!,
      frame: gl.createBuffer()!, size: gl.createBuffer()!, alive: gl.createBuffer()!, unit: gl.createBuffer()!,
    });
    this.soldierBufs = mkBufs();
    this.bannerBufs = mkBufs();
    this.soldierVao = gl.createVertexArray()!;
    this.decalVao = gl.createVertexArray()!;
    this.bannerVao = gl.createVertexArray()!;

    this.lineVao = gl.createVertexArray()!;
    this.lineBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
    gl.bindVertexArray(null);

    this.tri = compile(gl, TRI_VS, TRI_FS);
    this.triVao = gl.createVertexArray()!;
    this.triBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.triVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.triBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
    gl.bindVertexArray(null);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
  }

  private setupSpriteVao(vao: WebGLVertexArrayObject, bufs: SpriteBufs) {
    const gl = this.gl;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const inst = (loc: number, buf: WebGLBuffer, comps: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, comps, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(loc, 1);
    };
    inst(1, bufs.pos, 2);
    inst(2, bufs.facing, 1);
    inst(3, bufs.row, 1);
    inst(4, bufs.frame, 1);
    inst(5, bufs.size, 1);
    inst(6, bufs.alive, 1);
    inst(7, bufs.unit, 1);
    gl.bindVertexArray(null);
  }

  setStatic(soldierUnit: Uint32Array, teams: number[], classes: number[], radii: Float32Array) {
    const gl = this.gl;
    this.n = soldierUnit.length;
    const rows = new Float32Array(this.n);
    const sizes = new Float32Array(this.n);
    const units = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const u = soldierUnit[i];
      const cls = classes[u];
      rows[i] = this.soldierRowOf(cls, teams[u]);
      const mounted = cls === 6 || cls === 7;
      sizes[i] = mounted ? 4.6 : Math.max(2.2, radii[i] * 6.8);
      units[i] = u;
    }
    const up = (buf: WebGLBuffer, data: Float32Array) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    };
    up(this.soldierBufs.row, rows);
    up(this.soldierBufs.size, sizes);
    up(this.soldierBufs.unit, units);
    this.setupSpriteVao(this.soldierVao, this.soldierBufs);
    this.setupSpriteVao(this.bannerVao, this.bannerBufs);
  }

  setTerrain(w: number, h: number, cell: number, ox: number, oy: number, speed: Float32Array, rough: Float32Array, tint: Uint8Array) {
    const gl = this.gl;
    this.mapRect = [ox, oy, w * cell, h * cell];
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = Math.round(speed[i] * 255);
      data[i * 4 + 1] = Math.round(rough[i] * 255);
      data[i * 4 + 2] = Math.round((tint[i] / 8) * 255);
      data[i * 4 + 3] = 255;
    }
    this.terrainTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.terrainTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Scatter static decals: trees on forest cells, boulders on the crags.
    const hash = (x: number, y: number, s: number) => {
      let v = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
      v = (v ^ (v >> 13)) * 1274126177;
      return ((v ^ (v >> 16)) >>> 0) / 4294967296;
    };
    const pos: number[] = [];
    const facing: number[] = [];
    const row: number[] = [];
    const frame: number[] = [];
    const size: number[] = [];
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const t = tint[cy * w + cx];
        const px = ox + (cx + 0.5) * cell;
        const py = oy + (cy + 0.5) * cell;
        if (t === 4 && hash(cx, cy, 1) < 0.16) {
          pos.push(px + (hash(cx, cy, 2) - 0.5) * cell * 1.6, py + (hash(cx, cy, 3) - 0.5) * cell * 1.6);
          facing.push(hash(cx, cy, 6) * 6.28);
          row.push(this.decalRow);
          frame.push(Math.floor(hash(cx, cy, 4) * 3));
          size.push(7 + hash(cx, cy, 5) * 5);
        } else if (t === 2 && hash(cx, cy, 7) < 0.015) {
          pos.push(px, py);
          facing.push(hash(cx, cy, 9) * 6.28);
          row.push(this.decalRow);
          frame.push(3);
          size.push(9 + hash(cx, cy, 8) * 7);
        }
      }
    }
    this.decalCount = facing.length;
    const mk = (data: number[] | Float32Array) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), gl.STATIC_DRAW);
      return b;
    };
    this.setupSpriteVao(this.decalVao, {
      pos: mk(pos), facing: mk(facing), row: mk(row), frame: mk(frame),
      size: mk(size), alive: mk(new Float32Array(this.decalCount).fill(1)),
      unit: mk(new Float32Array(this.decalCount).fill(-2)),
    });
  }

  draw(
    positions: Float32Array,
    facings: Float32Array,
    frames: Float32Array,
    alive: Float32Array,
    count: number,
    camera: Camera,
    selectedPrimary: number,
    banners: { x: number; y: number; team: number; unit: number }[],
    bannerSize = 11,
  ) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.06, 0.07, 0.06, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const cam = camera.uniform();
    const time = (performance.now() - this.start) / 1000;

    if (this.terrainTex) {
      gl.useProgram(this.ground);
      gl.uniform4f(gl.getUniformLocation(this.ground, 'u_cam'), cam[0], cam[1], cam[2], cam[3]);
      {
        const M = WILDS_MARGIN;
        const [ox, oy, w, h] = this.mapRect;
        gl.uniform4f(gl.getUniformLocation(this.ground, 'u_rect'), ox - M, oy - M, w + 2 * M, h + 2 * M);
        gl.uniform4f(gl.getUniformLocation(this.ground, 'u_inner'), M / (w + 2 * M), M / (h + 2 * M), w / (w + 2 * M), h / (h + 2 * M));
      }
      gl.uniform1f(gl.getUniformLocation(this.ground, 'u_time'), time);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.terrainTex);
      gl.uniform1i(gl.getUniformLocation(this.ground, 'u_terrain'), 0);
      gl.bindVertexArray(this.groundVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    }

    gl.useProgram(this.sprite);
    gl.uniform4f(gl.getUniformLocation(this.sprite, 'u_cam'), cam[0], cam[1], cam[2], cam[3]);
    gl.uniform2f(gl.getUniformLocation(this.sprite, 'u_sheet'), COLS, ROWS);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(gl.getUniformLocation(this.sprite, 'u_tex'), 0);
    const uPass = gl.getUniformLocation(this.sprite, 'u_pass');
    const uSel = gl.getUniformLocation(this.sprite, 'u_selected');
    gl.uniform1f(uSel, selectedPrimary);

    const up = (buf: WebGLBuffer, data: Float32Array) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    };
    up(this.soldierBufs.pos, positions.subarray(0, count * 2));
    up(this.soldierBufs.facing, facings.subarray(0, count));
    up(this.soldierBufs.frame, frames.subarray(0, count));
    up(this.soldierBufs.alive, alive.subarray(0, count));

    gl.bindVertexArray(this.soldierVao);
    gl.uniform1f(uPass, 0); // the fallen, underneath
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.uniform1f(uPass, 1); // the living
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);

    if (this.decalCount > 0) {
      gl.uniform1f(uPass, 2);
      gl.uniform1f(uSel, -10);
      gl.bindVertexArray(this.decalVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.decalCount);
      gl.bindVertexArray(null);
    }

    if (banners.length > 0) {
      const n = banners.length;
      const pos = new Float32Array(n * 2);
      const frame = new Float32Array(n);
      const unit = new Float32Array(n);
      banners.forEach((b, i) => {
        pos[2 * i] = b.x;
        pos[2 * i + 1] = b.y;
        frame[i] = 4 + b.team;
        unit[i] = b.unit;
      });
      up(this.bannerBufs.pos, pos);
      up(this.bannerBufs.facing, new Float32Array(n).fill(Math.PI / 2));
      up(this.bannerBufs.row, new Float32Array(n).fill(this.decalRow));
      up(this.bannerBufs.frame, frame);
      up(this.bannerBufs.size, new Float32Array(n).fill(bannerSize));
      up(this.bannerBufs.alive, new Float32Array(n).fill(1));
      up(this.bannerBufs.unit, unit);
      gl.uniform1f(uPass, 2);
      gl.uniform1f(uSel, selectedPrimary);
      gl.bindVertexArray(this.bannerVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      gl.bindVertexArray(null);
    }
  }

  /** Filled translucent triangles in world space (attack arcs, etc). */
  drawTris(verts: Float32Array, camera: Camera) {
    if (verts.length === 0) return;
    const gl = this.gl;
    const cam = camera.uniform();
    gl.useProgram(this.tri);
    gl.uniform4f(gl.getUniformLocation(this.tri, 'u_cam'), cam[0], cam[1], cam[2], cam[3]);
    gl.bindVertexArray(this.triVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.triBuf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 6);
    gl.bindVertexArray(null);
  }

  drawOverlay(verts: Float32Array, camera: Camera) {
    if (verts.length === 0) return;
    const gl = this.gl;
    const cam = camera.uniform();
    gl.useProgram(this.line);
    gl.uniform4f(gl.getUniformLocation(this.line, 'u_cam'), cam[0], cam[1], cam[2], cam[3]);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, verts.length / 5);
    gl.bindVertexArray(null);
  }
}
