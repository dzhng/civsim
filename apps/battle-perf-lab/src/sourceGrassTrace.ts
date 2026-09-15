/** Bounded, read-only public WebGPU call tracing for the source grass control.
 * No backend internals, descriptor changes, submissions or resource writes are introduced. */
export function traceSourceGrass(nativeDevice: GPUDevice) {
  type Draw = {
    device: GPUDevice;
    phase: string;
    mesh: string;
    pipeline: GPURenderPipeline | undefined;
    groups: Map<number, GPUBindGroup>;
    buffer: GPUBuffer;
    offset: number;
    uniforms?: Map<GPUBuffer, Uint8Array>;
    viewport?: number[];
  };
  const modules = new WeakMap<GPUShaderModule, string>(),
    pipelines = new WeakMap<GPURenderPipeline, string>(),
    groups = new WeakMap<GPUBindGroup, GPUBindGroupDescriptor>();
  const buffers = new WeakMap<GPUBuffer, GPUDevice>(),
    commands = new WeakMap<GPUCommandBuffer, Draw[]>(),
    bundles = new WeakMap<GPURenderBundle, Draw[]>();
  const uniformWrites = new WeakMap<GPUBuffer, Uint8Array>(),
    submitted: Draw[] = [];
  const pipelineCreates: Record<string, number> = {};
  let phase = "unmarked",
    mesh = "unmarked",
    dropped = 0;
  const restores: (() => void)[] = [];
  const proto = Object.getPrototypeOf(nativeDevice) as GPUDevice;
  const patch = <T extends object, K extends keyof T>(object: T, key: K, value: T[K]) => {
    const before = object[key];
    object[key] = value;
    restores.push(() => {
      object[key] = before;
    });
  };
  patch(
    proto,
    "createBuffer",
    new Proxy(proto.createBuffer, {
      apply(fn, device, args) {
        const b = Reflect.apply(fn, device, args);
        buffers.set(b, device);
        return b;
      },
    }),
  );
  patch(
    proto,
    "createShaderModule",
    new Proxy(proto.createShaderModule, {
      apply(fn, device, args) {
        const m = Reflect.apply(fn, device, args);
        modules.set(m, args[0].code);
        return m;
      },
    }),
  );
  patch(
    proto,
    "createBindGroup",
    new Proxy(proto.createBindGroup, {
      apply(fn, device, args) {
        const b = Reflect.apply(fn, device, args);
        groups.set(b, { ...args[0], entries: Array.from(args[0].entries) });
        return b;
      },
    }),
  );
  patch(
    proto,
    "createRenderPipeline",
    new Proxy(proto.createRenderPipeline, {
      apply(fn, device, args) {
        const p = Reflect.apply(fn, device, args);
        const code = modules.get(args[0].vertex.module) ?? "";
        pipelines.set(p, code);
        if (device !== nativeDevice && code.includes("PhotorealBladeField"))
          pipelineCreates[phase] = (pipelineCreates[phase] ?? 0) + 1;
        return p;
      },
    }),
  );
  patch(
    proto,
    "createRenderPipelineAsync",
    new Proxy(proto.createRenderPipelineAsync, {
      apply(fn, device, args) {
        return Reflect.apply(fn, device, args).then((p: GPURenderPipeline) => {
          const code = modules.get(args[0].vertex.module) ?? "";
          pipelines.set(p, code);
          if (device !== nativeDevice && code.includes("PhotorealBladeField"))
            pipelineCreates[phase] = (pipelineCreates[phase] ?? 0) + 1;
          return p;
        });
      },
    }),
  );
  const watch = (
    pass: GPURenderPassEncoder | GPURenderBundleEncoder,
    device: GPUDevice,
    draws: Draw[],
  ) => {
    let pipeline: GPURenderPipeline | undefined, viewport: number[] | undefined;
    const bound = new Map<number, GPUBindGroup>();
    const setPipeline = pass.setPipeline;
    pass.setPipeline = new Proxy(setPipeline, {
      apply(fn, receiver, args) {
        pipeline = args[0];
        return Reflect.apply(fn, receiver, args);
      },
    });
    const setGroup = pass.setBindGroup;
    pass.setBindGroup = new Proxy(setGroup, {
      apply(fn, receiver, args) {
        if (args[1]) bound.set(args[0], args[1]);
        else bound.delete(args[0]);
        return Reflect.apply(fn, receiver, args);
      },
    });
    if ("setViewport" in pass) {
      const set = pass.setViewport;
      pass.setViewport = new Proxy(set, {
        apply(fn, receiver, args) {
          viewport = Array.from(args);
          return Reflect.apply(fn, receiver, args);
        },
      });
    }
    const draw = pass.drawIndexedIndirect;
    pass.drawIndexedIndirect = new Proxy(draw, {
      apply(fn, receiver, args) {
        if (
          device !== nativeDevice &&
          (pipelines.get(pipeline!) ?? "").includes("PhotorealBladeField")
        ) {
          if (draws.length < 64)
            draws.push({
              device,
              phase,
              mesh,
              pipeline,
              groups: new Map(bound),
              buffer: args[0],
              offset: args[1] ?? 0,
              viewport,
            });
          else dropped++;
        }
        return Reflect.apply(fn, receiver, args);
      },
    });
    if ("executeBundles" in pass) {
      const execute = pass.executeBundles;
      pass.executeBundles = new Proxy(execute, {
        apply(fn, receiver, args) {
          const list = Array.from(args[0]) as GPURenderBundle[];
          for (const bundle of list)
            for (const d of bundles.get(bundle) ?? []) {
              if (draws.length < 64) draws.push({ ...d, phase });
              else dropped++;
            }
          return Reflect.apply(fn, receiver, [list]);
        },
      });
    }
  };
  patch(
    proto,
    "createCommandEncoder",
    new Proxy(proto.createCommandEncoder, {
      apply(fn, device, args) {
        const encoder: GPUCommandEncoder = Reflect.apply(fn, device, args),
          draws: Draw[] = [];
        encoder.beginRenderPass = new Proxy(encoder.beginRenderPass, {
          apply(begin, receiver, passArgs) {
            const pass = Reflect.apply(begin, receiver, passArgs);
            watch(pass, device, draws);
            return pass;
          },
        });
        encoder.finish = new Proxy(encoder.finish, {
          apply(finish, receiver, finishArgs) {
            const command = Reflect.apply(finish, receiver, finishArgs);
            commands.set(command, draws);
            return command;
          },
        });
        return encoder;
      },
    }),
  );
  patch(
    proto,
    "createRenderBundleEncoder",
    new Proxy(proto.createRenderBundleEncoder, {
      apply(fn, device, args) {
        const encoder: GPURenderBundleEncoder = Reflect.apply(fn, device, args),
          draws: Draw[] = [];
        watch(encoder, device, draws);
        encoder.finish = new Proxy(encoder.finish, {
          apply(finish, receiver, finishArgs) {
            const bundle = Reflect.apply(finish, receiver, finishArgs);
            bundles.set(bundle, draws);
            return bundle;
          },
        });
        return encoder;
      },
    }),
  );
  const queueProto = Object.getPrototypeOf(nativeDevice.queue) as GPUQueue;
  patch(
    queueProto,
    "writeBuffer",
    new Proxy(queueProto.writeBuffer, {
      apply(fn, receiver, args) {
        const [buffer, offset, data, dataOffset = 0, size] = args;
        if (buffer.usage & GPUBufferUsage.UNIFORM && buffer.size <= 16384) {
          const elementBytes =
            ArrayBuffer.isView(data) && "BYTES_PER_ELEMENT" in data
              ? Number(data.BYTES_PER_ELEMENT)
              : 1;
          const source = ArrayBuffer.isView(data)
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : new Uint8Array(data);
          const start = dataOffset * elementBytes,
            end = size === undefined ? source.byteLength : start + size * elementBytes;
          const prior = uniformWrites.get(buffer) ?? new Uint8Array(buffer.size);
          prior.set(source.subarray(start, end), offset);
          uniformWrites.set(buffer, prior);
        }
        return Reflect.apply(fn, receiver, args);
      },
    }),
  );
  patch(
    queueProto,
    "submit",
    new Proxy(queueProto.submit, {
      apply(fn, receiver, args) {
        const list = Array.from(args[0]) as GPUCommandBuffer[];
        for (const command of list)
          for (const d of commands.get(command) ?? []) {
            const uniform = new Map<GPUBuffer, Uint8Array>();
            for (const group of d.groups.values())
              for (const entry of groups.get(group)?.entries ?? []) {
                const resource = entry.resource;
                if ("buffer" in resource) {
                  const bytes = uniformWrites.get(resource.buffer);
                  if (bytes) uniform.set(resource.buffer, bytes.slice());
                }
              }
            if (submitted.length < 64) submitted.push({ ...d, uniforms: uniform });
            else dropped++;
          }
        return Reflect.apply(fn, receiver, [list]);
      },
    }),
  );
  const read = async (device: GPUDevice, buffer: GPUBuffer, offset: number, size: number) => {
    if (!(buffer.usage & GPUBufferUsage.COPY_SRC)) return null;
    const staging = device.createBuffer({
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    try {
      const e = device.createCommandEncoder();
      e.copyBufferToBuffer(buffer, offset, staging, 0, size);
      device.queue.submit([e.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      return new Uint32Array(staging.getMappedRange().slice(0));
    } finally {
      staging.destroy();
    }
  };
  return {
    phase(value: string) {
      phase = value;
    },
    mark(value: string) {
      mesh = value;
    },
    clear() {
      submitted.length = 0;
      dropped = 0;
    },
    async snapshot() {
      const result = [];
      for (const d of submitted) {
        const bindings = [];
        for (const [groupId, group] of d.groups)
          for (const entry of groups.get(group)?.entries ?? []) {
            const resource = entry.resource;
            if (!("buffer" in resource)) continue;
            const b = resource.buffer,
              offset = resource.offset ?? 0;
            const uniform = d.uniforms?.get(b);
            const words = uniform
              ? new Uint32Array(uniform.buffer)
              : await read(buffers.get(b) ?? d.device, b, offset, Math.min(64, b.size - offset));
            bindings.push({
              group: groupId,
              binding: entry.binding,
              size: b.size,
              offset,
              usage: b.usage,
              words: words ? Array.from(words) : null,
              floats: words ? Array.from(new Float32Array(words.buffer)) : null,
            });
          }
        result.push({
          phase: d.phase,
          mesh: d.mesh,
          viewport: d.viewport,
          command: Array.from((await read(d.device, d.buffer, d.offset, 20)) ?? []),
          bindings,
          shader: (pipelines.get(d.pipeline!) ?? "")
            .split("\n")
            .filter((line) => /@binding|@group|var<.*Photoreal/.test(line)),
        });
      }
      return { dropped, pipelineCreates, draws: result };
    },
    dispose() {
      for (const restore of restores.reverse()) restore();
    },
  };
}
