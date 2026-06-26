// The campaign's custom GLSL, registered into Babylon's ShaderStore under the
// camp* names that terrain3d's ShaderMaterials reference. Imported for its
// side effect (the registrations run at module load, before any material is
// built). NOISE/GRADE are shared snippets spliced into several programs.
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';

const NOISE = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
// Billowing fractal noise for drifting cloud banks.
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}`;

// Antique watercolour-atlas grade: brighten, gently desaturate, lift the
// shadows, and tint the whole frame a faint sepia paper-warmth.
const GRADE = `
vec3 grade(vec3 c) {
  c = pow(max(c, 0.0), vec3(0.92, 0.95, 1.00));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.06);
  c = c * 1.05 + 0.02;
  c *= vec3(1.02, 1.00, 0.95);
  return clamp(c, 0.0, 1.0);
}`;

ShaderStore.ShadersStore['campTerrainVertexShader'] = `
precision highp float;
attribute vec3 position;
uniform mat4 viewProjection;
uniform vec4 uBgRect; // minX, minY, maxX, maxY
varying vec2 vUV;
varying float vH;
varying float vZ;
varying vec2 vXY;
void main() {
  gl_Position = viewProjection * vec4(position, 1.0);
  vUV = vec2((position.x - uBgRect.x) / (uBgRect.z - uBgRect.x),
             (uBgRect.w - position.y) / (uBgRect.w - uBgRect.y));
  vH = position.z;
  vZ = gl_Position.w;
  vXY = position.xy;
}`;

ShaderStore.ShadersStore['campTerrainFragmentShader'] = `
precision highp float;
varying vec2 vUV;
varying float vH;
varying float vZ;
varying vec2 vXY;
uniform sampler2D uTerr, uLight, uBiome; // uLight: baked lambert*128
uniform sampler2D uVis; // player sight mask (fog of war)
uniform vec3 uEyePos, uSun, uFogC;
uniform vec2 uFx; // territory alpha, fog strength
uniform float uFogD, uTime, uCloud, uFow; // uFow: fog-of-war strength (0 = reveal-all)
uniform vec2 uViewport;
uniform vec4 uBgRect;
${NOISE}
${GRADE}
float nz(vec2 p, float freq, float px) {
  float fade = clamp(1.0 - freq * px * 2.2, 0.0, 1.0);
  if (fade <= 0.0) return 0.5; // sub-pixel octave: skip the hashes entirely
  return mix(0.5, vnoise(p * freq), fade);
}
void main() {
  vec4 b = texture2D(uBiome, vUV); // moisture, forest, rock, signed shore dist
  float water = 1.0 - smoothstep(0.497, 0.503, b.a);
  float px = max(fwidth(vXY.x), fwidth(vXY.y));
  vec3 col = vec3(0.0);

  if (water < 0.999) {
    // ---- land: moisture-graded grass, dune sand, canopy, rock, snow ----
    float m = b.r;
    float g1 = nz(vXY, 0.9, px);
    float g2 = nz(vXY, 3.1, px);
    // Watercolour atlas greens: pale olive in the dry south, soft sage where wet.
    vec3 grass = mix(vec3(0.66, 0.64, 0.42), vec3(0.40, 0.56, 0.33), smoothstep(0.22, 0.55, m));
    grass *= 0.90 + 0.13 * g1 + 0.08 * g2;
    float dune = abs(nz(vXY, 0.16, px) * 2.0 - 1.0);
    vec3 sand = mix(vec3(0.90, 0.81, 0.60), vec3(0.80, 0.69, 0.48), dune);
    sand *= 0.95 + 0.08 * nz(vXY, 1.6, px);
    vec3 ground = mix(sand, grass, smoothstep(0.16, 0.32, m));
    float landShore = (b.a - 0.5) * 24.0; // cells from the waterline
    ground = mix(vec3(0.85, 0.78, 0.60), ground, smoothstep(0.05, 0.6, landShore));
    float canopy = smoothstep(0.25, 0.7, b.g * (0.55 + 0.9 * nz(vXY, 0.55, px)));
    vec3 forestC = mix(vec3(0.24, 0.36, 0.20), vec3(0.32, 0.46, 0.26), nz(vXY, 1.9, px));
    ground = mix(ground, forestC, canopy);
    vec3 rockC = mix(vec3(0.58, 0.50, 0.42), vec3(0.72, 0.66, 0.58),
                     nz(vec2(vXY.x, vXY.y + vH * 0.9), 0.7, px));
    ground = mix(ground, rockC, smoothstep(0.35, 0.85, b.b) * (0.7 + 0.3 * g1));
    // Snow only frosts the very highest northern crests — on a watercolour
    // atlas the ranges read as tan ridges, not white blobs.
    float snowAt = 30.0 + clamp((700.0 - vXY.y) * 0.006, 0.0, 7.0);
    float snow = smoothstep(snowAt, snowAt + 6.0, vH + (nz(vXY, 0.5, px) - 0.5) * 6.0);
    ground = mix(ground, vec3(0.86, 0.86, 0.83), snow * 0.7);
    // political mode reads better over calmer ground
    float grey = dot(ground, vec3(0.333));
    ground = mix(ground, vec3(grey) * 1.08, uFx.x * 0.45);
    // Soft relief: ridges still carve, but shadows lift toward a flat
    // watercolour wash rather than crushing to dark earth.
    float li = pow(texture2D(uLight, vUV).r * 2.0, 1.12);
    col = ground * (0.22 + 0.82 * li);
    vec4 t = texture2D(uTerr, vUV);
    col = mix(col, t.rgb, t.a * uFx.x);
  }

  if (water > 0.001) {
    // ---- water: depth gradient, rolling wave normals, sun glint, foam ----
    float depth = clamp((0.5 - b.a) * 2.0, 0.0, 1.0);
    vec2 p1 = vXY + vec2(uTime * 4.6, uTime * 3.1);
    vec2 p2 = vXY + vec2(-uTime * 1.9, uTime * 1.6);
    float e = 0.55;
    float w0 = nz(p1, 0.35, px) * 0.65 + nz(p2, 1.15, px) * 0.35;
    float wx = nz(p1 + vec2(e, 0), 0.35, px) * 0.65 + nz(p2 + vec2(e, 0), 1.15, px) * 0.35 - w0;
    float wy = nz(p1 + vec2(0, e), 0.35, px) * 0.65 + nz(p2 + vec2(0, e), 1.15, px) * 0.35 - w0;
    vec3 wn = normalize(vec3(-wx * 1.6, -wy * 1.6, 1.0));
    float shelf = smoothstep(0.0, 0.28, depth + (nz(vXY, 0.5, px) - 0.5) * 0.1);
    // Antique-chart water: a muted slate blue, shallows toward pale teal.
    vec3 wcol = mix(vec3(0.40, 0.56, 0.64), vec3(0.16, 0.30, 0.44), shelf);
    wcol += 0.05 * (w0 - 0.5);
    vec3 V = normalize(uEyePos - vec3(vXY, 0.0));
    wcol += vec3(1.0, 0.95, 0.8) * pow(max(dot(reflect(-uSun, wn), V), 0.0), 70.0)
            * 0.6 * clamp(1.0 - 0.6 * px, 0.0, 1.0);
    wcol = mix(wcol, vec3(0.52, 0.64, 0.72), pow(1.0 - max(dot(wn, V), 0.0), 3.0) * 0.3);
    float foam = smoothstep(0.6, 0.0, (0.5 - b.a) * 24.0)
               * smoothstep(0.4, 0.8, nz(vXY + vec2(uTime * 3.0, -uTime * 2.0), 2.3, px));
    wcol = mix(wcol, vec3(0.88, 0.93, 0.94), foam * 0.7);
    col = mix(col, wcol, water);
  }

  if (uFx.y > 0.001) {
    float fog = (1.0 - exp(-pow(vZ * uFogD, 2.0))) * uFx.y;
    col = mix(col, uFogC, clamp(fog, 0.0, 1.0));
  }
  // Parchment grain: a faint mottled paper wash so the map reads watercolour.
  // Two cheap octaves (not fbm) — this runs on every fragment every frame.
  float grain = vnoise(vXY * 0.05) * 0.6 + vnoise(vXY * 0.27) * 0.4;
  col *= 0.95 + 0.11 * grain;
  // Fog-of-war clouds drifting in from the map's rim (overview only).
  if (uCloud > 0.001) {
    float edge = min(min(vXY.x - uBgRect.x, uBgRect.z - vXY.x),
                     min(vXY.y - uBgRect.y, uBgRect.w - vXY.y));
    float span = min(uBgRect.z - uBgRect.x, uBgRect.w - uBgRect.y);
    float rim = 1.0 - smoothstep(0.0, span * 0.28, max(edge, 0.0));
    vec2 cp = vXY * 0.0016 + vec2(uTime * 0.006, uTime * 0.0042);
    float cl = fbm(cp) * 0.6 + fbm(cp * 2.6 + 3.1) * 0.4;
    // Billowy cumulus: dense cores read bright, wisps grey — gives the bank depth.
    float cov = smoothstep(0.46 - rim * 0.42, 0.86 - rim * 0.36, cl);
    float clouds = pow(rim, 0.65) * cov * uCloud;
    vec3 cloudC = mix(vec3(0.74, 0.76, 0.80), vec3(0.97, 0.98, 1.0), smoothstep(0.4, 0.82, cl));
    col = mix(col, cloudC, clamp(clouds, 0.0, 1.0));
  }
  // Fog of war: outside the player's sight the world goes dark under a roiling
  // cloud bank. uVis.r is 1 where seen, 0 where hidden (soft vision edges).
  if (uFow > 0.001) {
    float seen = texture2D(uVis, vUV).r;
    float hidden = (1.0 - seen) * uFow;
    if (hidden > 0.001) {
      vec2 fp = vXY * 0.0015 + vec2(uTime * 0.005, uTime * 0.0032);
      float fc = fbm(fp) * 0.6 + fbm(fp * 2.5 + 1.7) * 0.4;
      vec3 dark = col * 0.16 + vec3(0.03, 0.04, 0.06); // unlit, ink-dark land/sea
      vec3 murk = mix(vec3(0.20, 0.22, 0.27), vec3(0.50, 0.53, 0.58), smoothstep(0.38, 0.82, fc));
      vec3 fogged = mix(dark, murk, smoothstep(0.4, 0.78, fc) * 0.9);
      col = mix(col, fogged, smoothstep(0.0, 0.65, hidden));
    }
  }
  // A quiet screen-space vignette frames the chart.
  vec2 vp = gl_FragCoord.xy / uViewport * 2.0 - 1.0;
  col *= 0.88 + 0.12 * smoothstep(1.55, 0.45, length(vp * vec2(1.0, 0.85)));
  gl_FragColor = vec4(grade(col), 1.0);
}`;

ShaderStore.ShadersStore['campTreeVertexShader'] = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 world0;
attribute vec4 world1;
attribute vec4 world2;
attribute vec4 world3;
uniform mat4 viewProjection;
uniform vec4 uBgRect;
varying vec2 vUV;
varying vec2 vLightUV;
varying float vZ;
void main() {
  mat4 world = mat4(world0, world1, world2, world3);
  vec4 wp = world * vec4(position, 1.0);
  gl_Position = viewProjection * wp;
  vUV = uv;
  vLightUV = vec2((world[3].x - uBgRect.x) / (uBgRect.z - uBgRect.x),
                  (uBgRect.w - world[3].y) / (uBgRect.w - uBgRect.y));
  vZ = gl_Position.w;
}`;

ShaderStore.ShadersStore['campTreeFragmentShader'] = `
precision highp float;
varying vec2 vUV;
varying vec2 vLightUV;
varying float vZ;
uniform sampler2D uAtlas, uLight;
uniform vec3 uFogC;
uniform vec2 uFx;
uniform float uFogD;
${GRADE}
void main() {
  vec4 c = texture2D(uAtlas, vUV);
  if (c.a < 0.5) discard;
  vec3 col = c.rgb * (texture2D(uLight, vLightUV).r * 2.0);
  if (uFx.y > 0.001) {
    float fog = (1.0 - exp(-pow(vZ * uFogD, 2.0))) * uFx.y;
    col = mix(col, uFogC, clamp(fog, 0.0, 1.0));
  }
  gl_FragColor = vec4(grade(col), c.a);
}`;

// Instanced 3D map models (armies, settlements): low-poly meshes thin-instanced
// per object. world0..3 carry the transform, iColor the owner's faction tint.
// The baked vertex color is the part's own material; its ALPHA flags whether
// the faction tint applies (1 = banner/livery, 0 = neutral stone/timber), so
// one mesh can mix faction-colored standards with neutral architecture.
ShaderStore.ShadersStore['campModelVertexShader'] = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec4 world0;
attribute vec4 world1;
attribute vec4 world2;
attribute vec4 world3;
attribute vec4 iColor;
attribute vec4 color;
uniform mat4 viewProjection;
varying vec3 vN;
varying vec3 vFaction;
varying vec3 vTint;
varying float vFac;
varying float vHi;
varying float vZ;
void main() {
  mat4 world = mat4(world0, world1, world2, world3);
  vec4 wp = world * vec4(position, 1.0);
  gl_Position = viewProjection * wp;
  vN = normalize((world * vec4(normal, 0.0)).xyz);
  vFaction = iColor.rgb;
  vTint = color.rgb;
  vFac = color.a;
  vHi = iColor.a; // per-instance highlight: 0 none, ~0.5 hover, 1 selected
  vZ = gl_Position.w;
}`;

ShaderStore.ShadersStore['campModelFragmentShader'] = `
precision highp float;
varying vec3 vN;
varying vec3 vFaction;
varying vec3 vTint;
varying float vFac;
varying float vHi;
varying float vZ;
uniform vec3 uSun, uFogC;
uniform float uFogD, uFogStr;
${GRADE}
void main() {
  float li = 0.45 + 0.7 * max(dot(normalize(vN), uSun), 0.0);
  // neutral parts keep their material; livery parts take the faction hue
  vec3 col = vTint * mix(vec3(1.0), vFaction, vFac) * li;
  // selection/hover: lift toward a warm glow so the picked army reads
  col = mix(col, col * 1.5 + vec3(0.28, 0.22, 0.08), vHi);
  if (uFogStr > 0.001) {
    float fog = (1.0 - exp(-pow(vZ * uFogD, 2.0))) * uFogStr;
    col = mix(col, uFogC, clamp(fog, 0.0, 1.0));
  }
  gl_FragColor = vec4(grade(col), 1.0);
}`;

// Contact shadows: soft dark discs the army/city models drop on the ground,
// nudged toward the anti-sun direction so they read as cast shadows. Cheap
// and deterministic — true CSM would need shadow-map plumbing through every
// custom material.
ShaderStore.ShadersStore['campShadowVertexShader'] = `
precision highp float;
attribute vec3 position;       // unit quad, XY in [-0.5, 0.5]
attribute vec4 world0;
attribute vec4 world1;
attribute vec4 world2;
attribute vec4 world3;
uniform mat4 viewProjection;
varying vec2 vL;
void main() {
  mat4 world = mat4(world0, world1, world2, world3);
  gl_Position = viewProjection * world * vec4(position, 1.0);
  vL = position.xy;
}`;

ShaderStore.ShadersStore['campShadowFragmentShader'] = `
precision highp float;
varying vec2 vL;
uniform float uStr;
void main() {
  float a = clamp(1.0 - length(vL) * 2.0, 0.0, 1.0);
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * a * uStr);
}`;

// Roads: flat granite ribbons draped on the terrain, drawn IN the 3D scene so
// the depth buffer lets city and army models occlude them — a causeway runs
// under the town that sits on it. `color` carries the granite shade (brighter
// per road level) and an edge-fade alpha used to feather the verge into the
// ground.
ShaderStore.ShadersStore['campRoadVertexShader'] = `
precision highp float;
attribute vec3 position;
attribute vec4 color;
uniform mat4 viewProjection;
varying vec4 vCol;
varying float vZ;
void main() {
  gl_Position = viewProjection * vec4(position, 1.0);
  vCol = color;
  vZ = gl_Position.w;
}`;

ShaderStore.ShadersStore['campRoadFragmentShader'] = `
precision highp float;
varying vec4 vCol;
varying float vZ;
uniform vec3 uFogC;
uniform float uFogD, uFogStr;
${GRADE}
void main() {
  vec3 col = vCol.rgb;
  if (uFogStr > 0.001) {
    float fog = (1.0 - exp(-pow(vZ * uFogD, 2.0))) * uFogStr;
    col = mix(col, uFogC, clamp(fog, 0.0, 1.0));
  }
  gl_FragColor = vec4(grade(col), vCol.a);
}`;
