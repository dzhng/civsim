import type { Camera } from './camera';

const SOLDIER_VS = `#version 300 es
layout(location=0) in vec2 a_quad;     // local quad corner, meters
layout(location=1) in vec2 a_pos;      // soldier position, world meters
layout(location=2) in float a_facing;  // radians, 0 = +x
layout(location=3) in vec3 a_color;
layout(location=4) in float a_unit;
layout(location=5) in float a_size;    // body scale (cavalry > men)
uniform vec4 u_cam;        // scale.xy, center.xy
uniform float u_selected;  // selected unit index or -1
out vec3 v_color;
void main() {
  vec2 f = vec2(cos(a_facing), sin(a_facing));
  vec2 r = vec2(f.y, -f.x);
  vec2 world = a_pos + (r * a_quad.x + f * a_quad.y) * a_size;
  vec2 clip = (world - u_cam.zw) * u_cam.xy;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color * (abs(a_unit - u_selected) < 0.5 ? 1.7 : 1.0);
}`;

const SOLDIER_FS = `#version 300 es
precision mediump float;
in vec3 v_color;
out vec4 outColor;
void main() { outColor = vec4(v_color, 1.0); }`;

const GROUND_VS = `#version 300 es
layout(location=0) in vec2 a_corner;   // 0..1 across the map rect
uniform vec4 u_cam;
uniform vec4 u_rect;                   // origin.xy, size.xy (world meters)
out vec2 v_uv;
void main() {
  vec2 world = u_rect.xy + a_corner * u_rect.zw;
  vec2 clip = (world - u_cam.zw) * u_cam.xy;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_uv = a_corner;
}`;

const GROUND_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 outColor;
void main() { outColor = texture(u_tex, v_uv); }`;

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
out vec4 outColor;
void main() { outColor = vec4(v_color, 0.9); }`;

// Soldier footprint: wider than deep, so facing is visible even as a quad.
const HALF_W = 0.34;
const HALF_D = 0.2;

// Class ids match Rust's UnitClassId order:
// Heavy, Light, LongSwords, Phalanx, Archers, Skirmishers, ShockCav, HorseArchers, ArtilleryCrew
export const CLASS_NAMES = [
  'heavy infantry',
  'light infantry',
  'long swords',
  'phalanx',
  'archers',
  'skirmishers',
  'shock cavalry',
  'horse archers',
  'artillery crew',
];

const RED_PALETTE: [number, number, number][] = [
  [0.72, 0.18, 0.14],
  [0.95, 0.45, 0.35],
  [1.0, 0.58, 0.18],
  [0.6, 0.12, 0.2],
  [0.9, 0.72, 0.3],
  [0.85, 0.55, 0.5],
  [0.95, 0.25, 0.45],
  [1.0, 0.5, 0.6],
  [0.7, 0.42, 0.3],
];

const BLUE_PALETTE: [number, number, number][] = [
  [0.16, 0.3, 0.75],
  [0.42, 0.6, 0.95],
  [0.2, 0.75, 0.85],
  [0.12, 0.2, 0.6],
  [0.55, 0.78, 0.9],
  [0.5, 0.62, 0.8],
  [0.45, 0.35, 0.95],
  [0.6, 0.55, 1.0],
  [0.35, 0.45, 0.6],
];

function classColor(team: number, cls: number): [number, number, number] {
  const palette = team === 0 ? RED_PALETTE : BLUE_PALETTE;
  return palette[cls] ?? palette[0];
}

interface Pass {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  uCam: WebGLUniformLocation;
}

export class Renderer {
  private gl: WebGL2RenderingContext;

  private soldiers: Pass;
  private uSelected: WebGLUniformLocation;
  private posBuf: WebGLBuffer;
  private facingBuf: WebGLBuffer;
  private colorBuf: WebGLBuffer;
  private unitBuf: WebGLBuffer;
  private sizeBuf: WebGLBuffer;
  private capacity = 0;

  private ground: Pass;
  private uRect: WebGLUniformLocation;
  private groundTex: WebGLTexture | null = null;
  private groundRect: [number, number, number, number] = [0, 0, 0, 0];

  private lines: Pass;
  private lineBuf: WebGLBuffer;
  private lineCapacityBytes = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    // --- soldier pass -------------------------------------------------------
    const sp = this.buildProgram(SOLDIER_VS, SOLDIER_FS);
    const svao = gl.createVertexArray()!;
    gl.bindVertexArray(svao);
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-HALF_W, -HALF_D, HALF_W, -HALF_D, -HALF_W, HALF_D, HALF_W, HALF_D]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.posBuf = this.instanceAttr(1, 2);
    this.facingBuf = this.instanceAttr(2, 1);
    this.colorBuf = this.instanceAttr(3, 3);
    this.unitBuf = this.instanceAttr(4, 1);
    this.sizeBuf = this.instanceAttr(5, 1);
    this.soldiers = { program: sp, vao: svao, uCam: gl.getUniformLocation(sp, 'u_cam')! };
    this.uSelected = gl.getUniformLocation(sp, 'u_selected')!;

    // --- ground pass --------------------------------------------------------
    const gp = this.buildProgram(GROUND_VS, GROUND_FS);
    const gvao = gl.createVertexArray()!;
    gl.bindVertexArray(gvao);
    const corners = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ground = { program: gp, vao: gvao, uCam: gl.getUniformLocation(gp, 'u_cam')! };
    this.uRect = gl.getUniformLocation(gp, 'u_rect')!;

    // --- line overlay pass --------------------------------------------------
    const lp = this.buildProgram(LINE_VS, LINE_FS);
    const lvao = gl.createVertexArray()!;
    gl.bindVertexArray(lvao);
    this.lineBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
    this.lines = { program: lp, vao: lvao, uCam: gl.getUniformLocation(lp, 'u_cam')! };

    gl.bindVertexArray(null);
    gl.clearColor(0.075, 0.085, 0.105, 1);
  }

  /** Build the ground texture from the sim's terrain grid (once per map). */
  setTerrain(
    w: number,
    h: number,
    cell: number,
    originX: number,
    originY: number,
    speed: Float32Array,
    rough: Float32Array,
  ) {
    const gl = this.gl;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const s = speed[i];
      const r = rough[i];
      // grass -> mud as ground slows; -> dark woods as roughness rises;
      // walls are rock gray.
      let cr = 62, cg = 72, cb = 52;
      if (s <= 0) {
        cr = 92; cg = 93; cb = 99;
      } else {
        const mud = Math.min(1, (1 - s) * 1.5);
        cr = cr + (94 - cr) * mud;
        cg = cg + (78 - cg) * mud;
        cb = cb + (58 - cb) * mud;
        cr = cr + (38 - cr) * r;
        cg = cg + (58 - cg) * r;
        cb = cb + (40 - cb) * r;
      }
      rgba[4 * i] = cr;
      rgba[4 * i + 1] = cg;
      rgba[4 * i + 2] = cb;
      rgba[4 * i + 3] = 255;
    }
    this.groundTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.groundTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.groundRect = [originX, originY, w * cell, h * cell];
  }

  /** Upload per-soldier data that never changes after spawn. */
  setStatic(soldierUnit: Uint32Array, unitTeam: number[], unitClass: number[], radii: Float32Array) {
    const n = soldierUnit.length;
    const colors = new Float32Array(n * 3);
    const unitIds = new Float32Array(n);
    const sizes = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const unit = soldierUnit[i];
      unitIds[i] = unit;
      sizes[i] = radii[i] / 0.33;
      const shade = 0.88 + 0.24 * ((unit * 2654435761) % 5) / 5;
      const [r, g, b] = classColor(unitTeam[unit], unitClass[unit]);
      colors[3 * i] = r * shade;
      colors[3 * i + 1] = g * shade;
      colors[3 * i + 2] = b * shade;
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.unitBuf);
    gl.bufferData(gl.ARRAY_BUFFER, unitIds, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);
    this.ensureCapacity(n);
  }

  draw(positions: Float32Array, facings: Float32Array, count: number, camera: Camera, selectedUnit: number) {
    const gl = this.gl;
    this.resizeToDisplay();
    this.ensureCapacity(count);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const cam = camera.uniform();

    if (this.groundTex) {
      gl.useProgram(this.ground.program);
      gl.bindVertexArray(this.ground.vao);
      gl.uniform4fv(this.ground.uCam, cam);
      gl.uniform4fv(this.uRect, this.groundRect);
      gl.bindTexture(gl.TEXTURE_2D, this.groundTex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions, 0, count * 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.facingBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, facings, 0, count);

    gl.useProgram(this.soldiers.program);
    gl.bindVertexArray(this.soldiers.vao);
    gl.uniform4fv(this.soldiers.uCam, cam);
    gl.uniform1f(this.uSelected, selectedUnit);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
  }

  /** Interleaved [x, y, r, g, b] pairs of line endpoints; drawn over everything. */
  drawOverlay(verts: Float32Array, camera: Camera) {
    if (verts.length === 0) return;
    const gl = this.gl;
    gl.useProgram(this.lines.program);
    gl.bindVertexArray(this.lines.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    if (verts.byteLength > this.lineCapacityBytes) {
      gl.bufferData(gl.ARRAY_BUFFER, verts.byteLength, gl.DYNAMIC_DRAW);
      this.lineCapacityBytes = verts.byteLength;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);
    gl.uniform4fv(this.lines.uCam, camera.uniform());
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.LINES, 0, verts.length / 5);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  private instanceAttr(location: number, size: number): WebGLBuffer {
    const gl = this.gl;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(location, 1);
    return buf;
  }

  private ensureCapacity(count: number) {
    if (count <= this.capacity) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, count * 2 * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.facingBuf);
    gl.bufferData(gl.ARRAY_BUFFER, count * 4, gl.DYNAMIC_DRAW);
    this.capacity = count;
  }

  private resizeToDisplay() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private buildProgram(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error('shader: ' + gl.getShaderInfoLog(shader));
      }
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(program));
    }
    return program;
  }
}
