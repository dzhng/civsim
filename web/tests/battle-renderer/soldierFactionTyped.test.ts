// @vitest-environment node
import { it, describe, expect } from "vitest";
import { tgpu, d } from "typegpu";
import {
  linearAlbedo,
  factionAccent,
} from "../../../packages/battle-renderer/src/shaders/soldierFactionTyped";
import { factionForTeam } from "../../../packages/game-renderer/src/battle/factionColors";
import { impostorSurfaceWgsl } from "../../../packages/battle-renderer/src/shaders/impostor";
import { overlayFunctions } from "../../../packages/battle-renderer/src/shaders/overlay";

/** The compile-time half of the typed conversion: `tsc --noEmit -p tests/tsconfig.json` fails
 * this file if any of these calls stops being rejected. Never executed. */
export function rejectedByTheCompiler() {
  // @ts-expect-error a colour is a vec3f, not a channel scalar
  linearAlbedo(0.5);
  // @ts-expect-error a vec2f is not a colour
  linearAlbedo(d.vec2f(0.5, 0.5));
  // @ts-expect-error a vec4f carries an alpha the transfer function has no meaning for
  linearAlbedo(d.vec4f(0.5, 0.5, 0.5, 1));
  // @ts-expect-error the faction index is an f32, not a colour
  factionAccent(d.vec3f(0, 0, 0));
  // @ts-expect-error both helpers return vec3f, never vec4f
  const widened: d.v4f = factionAccent(0);
  // @ts-expect-error a linear colour is not a scalar
  const narrowed: number = linearAlbedo(d.vec3f(0, 0, 0));
  const accepted: d.v3f = linearAlbedo(factionAccent(1));
  return [widened, narrowed, accepted];
}

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/** TypeGPU prints f32 literals at their exact value, so the palette comparison is exact. */
const vec3Literal = (rgb: readonly number[]) =>
  `vec3f(${rgb.map((channel) => Math.fround(channel)).join(", ")})`;

describe("typed soldier faction helpers", () => {
  it("transpiles both typed bodies to WGSL", () => {
    const wgsl = tgpu.resolve({
      template: "fn probe(c:vec3f,f:f32)->vec3f{return linearAlbedo(c)+factionAccent(f);}",
      externals: { linearAlbedo, factionAccent },
    });
    expect(wgsl).toContain("fn linearAlbedo(c: vec3f) -> vec3f");
    expect(wgsl).toContain("fn factionAccent(faction: f32) -> vec3f");
  });

  it("keeps one linearAlbedo owner behind factionAccent", () => {
    const wgsl = tgpu.resolve({
      template: "fn probe(c:vec3f,f:f32)->vec3f{return linearAlbedo(c)+factionAccent(f);}",
      externals: { linearAlbedo, factionAccent },
    });
    expect(occurrences(wgsl, "fn linearAlbedo(")).toBe(1);
    expect(occurrences(wgsl, "fn factionAccent(")).toBe(1);
  });

  it("carries the canonical faction palette into the shader body", () => {
    const wgsl = tgpu.resolve({
      template: "fn probe(f:f32)->vec3f{return factionAccent(f);}",
      externals: { factionAccent },
    });
    const emitted = [0, 1, 2].map((team) => vec3Literal(factionForTeam(team).primary));
    expect(new Set(emitted).size).toBe(3);
    for (const literal of emitted) expect(wgsl).toContain(literal);
    // Team order decides which army wears which colour, and the body reads first to last.
    const order = emitted.map((literal) => wgsl.indexOf(literal));
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it("evaluates the transfer function on both sides of the sRGB threshold", () => {
    expect(linearAlbedo(d.vec3f(0, 0.04045, 1))).toEqual(
      d.vec3f(0, 0.04045 * 0.0773993808, (0.9478672986 + 0.0521327014) ** 2.4),
    );
  });
});

describe("raw shader bodies bound to the typed helpers", () => {
  // The candidate pipelines keep their WGSL surface bodies and reach the helpers through
  // `$uses`, so the mixed raw-body/typed-external path has to resolve and share one owner.
  const ImpostorSurface = d.struct({
    base: d.vec3f,
    normal: d.vec3f,
    roughness: d.f32,
    metal: d.f32,
    ao: d.f32,
  });

  it("binds the impostor surface body to the typed factionAccent", () => {
    const surface = tgpu
      .fn(
        [d.vec2f, d.vec4f, d.texture2d(), d.texture2d(), d.texture2d(), d.sampler()],
        ImpostorSurface,
      )(impostorSurfaceWgsl(4, 4))
      .$uses({ ImpostorSurface, factionAccent });
    const wgsl = tgpu.resolve({
      template:
        "fn probe(uv:vec2f,p:vec4f,a:texture_2d<f32>,n:texture_2d<f32>,o:texture_2d<f32>,s:sampler)->ImpostorSurface{return surface(uv,p,a,n,o,s);}",
      externals: { surface, ImpostorSurface },
    });
    expect(wgsl).toContain("factionAccent(properties.x)");
    expect(occurrences(wgsl, "fn factionAccent(")).toBe(1);
    expect(occurrences(wgsl, "fn linearAlbedo(")).toBe(1);
  });

  it("binds the overlay fragment body to the typed linearAlbedo", () => {
    const shade = tgpu
      .fn(
        [d.vec4f, d.vec2f],
        d.vec4f,
      )(overlayFunctions("ring").fragment)
      .$uses({ linearAlbedo });
    const wgsl = tgpu.resolve({
      template: "fn probe(c:vec4f,l:vec2f)->vec4f{return shade(c,l);}",
      externals: { shade },
    });
    expect(wgsl).toContain("linearAlbedo(color.rgb");
    expect(occurrences(wgsl, "fn linearAlbedo(")).toBe(1);
  });
});
