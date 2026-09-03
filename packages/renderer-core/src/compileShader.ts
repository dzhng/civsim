// Every WGSL module in the renderer is compiled through `compileShader` so a
// bad shader surfaces a structured error (file, line, message) instead of a
// silently blank frame. `createShaderModule` itself never throws on a WGSL
// error — the diagnostic only arrives via `getCompilationInfo()`, which is
// async. We never await it inside the render loop: shaders are built once at
// pipeline-construction time, so the check runs as a fire-and-forget probe and
// reports through the registered handler (and the console).

export interface ShaderCompilationMessage {
  type: GPUCompilationMessageType;
  message: string;
  line: number;
  column: number;
}

type ShaderErrorHandler = (report: { label: string; messages: ShaderCompilationMessage[]; text: string }) => void;

let shaderErrorHandler: ShaderErrorHandler | null = null;

/** Route every compile error to the app shell (fatal-error surface, lab probe). */
export function setShaderErrorHandler(handler: ShaderErrorHandler | null): void {
  shaderErrorHandler = handler;
}

/** Create a shader module and asynchronously surface any WGSL compile errors. */
export function compileShader(device: GPUDevice, code: string, label: string): GPUShaderModule {
  const module = device.createShaderModule({ label: `${label}-wgsl`, code });
  void reportCompilationErrors(module, label);
  return module;
}

/** Normalized compilation messages for a module (used by tests and the fault lab). */
export async function shaderCompilationMessages(module: GPUShaderModule, label: string): Promise<ShaderCompilationMessage[]> {
  const m = module as { getCompilationInfo?: () => Promise<GPUCompilationInfo> };
  if (typeof m.getCompilationInfo !== 'function') return [];
  let info: GPUCompilationInfo;
  try {
    info = await m.getCompilationInfo();
  } catch {
    return [];
  }
  return info.messages.map((msg) => ({
    type: msg.type,
    message: msg.message,
    line: msg.lineNum,
    column: msg.linePos,
  }));
}

/** Human-readable block for a set of compile messages, keyed by shader label. */
function formatShaderErrors(label: string, messages: ShaderCompilationMessage[]): string {
  const lines = [`WGSL compile error in shader "${label}":`];
  for (const msg of messages) {
    lines.push(`  ${msg.type} at ${msg.line}:${msg.column} — ${msg.message}`);
  }
  return lines.join('\n');
}

async function reportCompilationErrors(module: GPUShaderModule, label: string): Promise<void> {
  const messages = await shaderCompilationMessages(module, label);
  const errors = messages.filter((msg) => msg.type === 'error');
  if (errors.length === 0) return;
  const text = formatShaderErrors(label, errors);
  console.error(text);
  shaderErrorHandler?.({ label, messages: errors, text });
}
