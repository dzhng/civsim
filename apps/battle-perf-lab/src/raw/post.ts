import {
  BLOOM_STRENGTH,
  BLOOM_RADIUS,
  BLOOM_THRESHOLD,
  BLOOM_SMOOTH_WIDTH,
  type BattlePostGradeUniforms,
} from "../../../../packages/game-renderer/src/environment/postParameters";
import { fullscreenWGSL, postColorWGSL } from "../shared/postShader";

type Stage = {
  pipeline: GPURenderPipeline;
  group: GPUBindGroup;
  target: GPUTextureView;
  label: string;
};

/** Native comparison pass: borrowed device/input/output; owns only its intermediate
 * HDR textures, uniform and pipelines. No queue submission or waits during encode.
 * Recreate on resize/input replacement; no production backend switch. */
export class RawBattlePost {
  private readonly textures: GPUTexture[] = [];
  private readonly stages: Stage[] = [];
  private readonly uniform: GPUBuffer;
  private readonly finalPipeline: GPURenderPipeline;
  private readonly finalGroups: [GPUBindGroup, GPUBindGroup];
  private disposed = false;

  constructor(
    private readonly device: GPUDevice,
    input: GPUTextureView,
    width: number,
    height: number,
    outputFormat: GPUTextureFormat = "rgba8unorm",
  ) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64)
      throw new Error("Five-level parity bloom requires a framebuffer at least 64×64");
    if (outputFormat.endsWith("-srgb"))
      throw new Error("Post shader already applies sRGB transfer; output must not encode twice");
    const sampler = device.createSampler({ minFilter: "linear", magFilter: "linear" });
    this.uniform = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const texture = (w: number, h: number) => {
      const t = device.createTexture({
        size: [w, h],
        format: "rgba16float",
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_SRC,
      });
      this.textures.push(t);
      return t.createView();
    };
    const pipeline = (code: string, format: GPUTextureFormat = "rgba16float") => {
      const module = device.createShaderModule({ code: fullscreenWGSL + code });
      return device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vertex" },
        fragment: { module, entryPoint: "fragment", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });
    };
    const sampled =
      "@group(0) @binding(0) var linearSampler: sampler;\n@group(0) @binding(1) var source: texture_2d<f32>;\n";
    const sampledGroup = (p: GPURenderPipeline, source: GPUTextureView) =>
      device.createBindGroup({
        layout: p.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: source },
        ],
      });
    const high = pipeline(
      sampled +
        `
      @fragment fn fragment(v: VertexOut) -> @location(0) vec4f {
        let c = textureSample(source,linearSampler,v.uv);
        return mix(vec4f(0),c,smoothstep(${BLOOM_THRESHOLD},${BLOOM_THRESHOLD + BLOOM_SMOOTH_WIDTH},dot(c.rgb,vec3f(0.2126,0.7152,0.0722))));
      }`,
    );
    let w = Math.floor(width / 2),
      h = Math.floor(height / 2);
    const bright = texture(w, h);
    this.stages.push({
      pipeline: high,
      group: sampledGroup(high, input),
      target: bright,
      label: "bloom highpass",
    });
    let source = bright;
    const levels: GPUTextureView[] = [];
    let compositeTarget!: GPUTextureView;
    for (const radius of [6, 10, 14, 18, 22]) {
      const horizontal = texture(w, h),
        vertical = texture(w, h);
      if (levels.length === 0) compositeTarget = horizontal;
      const sigma = radius / 3;
      const weights = Array.from(
        { length: radius },
        (_, i) => (0.39894 * Math.exp((-0.5 * i * i) / (sigma * sigma))) / sigma,
      );
      for (const [axis, target] of [
        [0, horizontal],
        [1, vertical],
      ] as const) {
        const delta = axis === 0 ? `vec2f(${1 / w},0)` : `vec2f(0,${1 / h})`;
        const p = pipeline(
          sampled +
            `
          @fragment fn fragment(v: VertexOut) -> @location(0) vec4f {
            let weights = array<f32,${radius}>(${weights.join(",")});
            var color = textureSample(source,linearSampler,v.uv).rgb*weights[0];
            for(var i = 1; i < ${radius}; i++) {
              let offset = ${delta}*f32(i);
              color += (textureSample(source,linearSampler,v.uv+offset).rgb+textureSample(source,linearSampler,v.uv-offset).rgb)*weights[i];
            }
            return vec4f(color,1);
          }`,
        );
        this.stages.push({
          pipeline: p,
          group: sampledGroup(p, source),
          target,
          label: `bloom ${axis === 0 ? "horizontal" : "vertical"} ${levels.length}`,
        });
        source = target;
      }
      levels.push(vertical);
      w = Math.floor(w / 2);
      h = Math.floor(h / 2);
    }
    const composite = pipeline(`
      @group(0) @binding(0) var linearSampler: sampler;
      ${levels.map((_, i) => `@group(0) @binding(${i + 1}) var level${i}: texture_2d<f32>;`).join("\n")}
      @fragment fn fragment(v: VertexOut) -> @location(0) vec4f {
        return (${[1, 0.8, 0.6, 0.4, 0.2].map((f, i) => `textureSample(level${i},linearSampler,v.uv)*${f * (1 - BLOOM_RADIUS) + (1.2 - f) * BLOOM_RADIUS}`).join("+")})*${BLOOM_STRENGTH};
      }`);
    const compositeGroup = device.createBindGroup({
      layout: composite.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        ...levels.map((resource, i) => ({ binding: i + 1, resource })),
      ],
    });
    this.stages.push({
      pipeline: composite,
      group: compositeGroup,
      target: compositeTarget,
      label: "bloom composite",
    });
    // A zero texture gives bloom-off the same final pipeline without sampling an
    // uninitialized intermediate. WebGPU initializes newly allocated textures to zero.
    const zero = texture(1, 1);
    this.finalPipeline = pipeline(
      postColorWGSL +
        `
      @group(0) @binding(0) var linearSampler: sampler;
      @group(0) @binding(1) var scene: texture_2d<f32>;
      @group(0) @binding(2) var bloom: texture_2d<f32>;
      @group(0) @binding(3) var<uniform> grade: Grade;
      @fragment fn fragment(v: VertexOut) -> @location(0) vec4f {
        let hdr = textureSample(scene,linearSampler,v.uv)+textureSample(bloom,linearSampler,v.uv);
        return vec4f(outputSrgb(agx(gradeColor(hdr.rgb,grade),grade.exposure)),clamp(hdr.a,0.0,1.0));
      }`,
      outputFormat,
    );
    this.finalGroups = [zero, compositeTarget].map((bloom) =>
      device.createBindGroup({
        layout: this.finalPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: input },
          { binding: 2, resource: bloom },
          { binding: 3, resource: { buffer: this.uniform } },
        ],
      }),
    ) as [GPUBindGroup, GPUBindGroup];
  }

  setGrade(grade: BattlePostGradeUniforms, exposure: number) {
    if (this.disposed) throw new Error("Raw post is disposed");
    const values = [
      grade.strength,
      grade.saturationBoost,
      grade.contrast,
      grade.splitTone,
      grade.shadowLift,
      exposure,
      0,
      0,
    ];
    if (!values.every(Number.isFinite)) throw new Error("Post parameters must be finite");
    this.device.queue.writeBuffer(this.uniform, 0, new Float32Array(values));
  }

  encode(encoder: GPUCommandEncoder, output: GPUTextureView, bloom = true) {
    if (this.disposed) throw new Error("Raw post is disposed");
    const draw = (
      pipeline: GPURenderPipeline,
      group: GPUBindGroup,
      target: GPUTextureView,
      label: string,
    ) => {
      const pass = encoder.beginRenderPass({
        label,
        colorAttachments: [
          { view: target, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, group);
      pass.draw(3);
      pass.end();
    };
    if (bloom)
      for (const stage of this.stages) draw(stage.pipeline, stage.group, stage.target, stage.label);
    draw(this.finalPipeline, this.finalGroups[bloom ? 1 : 0], output, "grade AgX output");
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.uniform.destroy();
    for (const texture of this.textures) texture.destroy();
  }
}
