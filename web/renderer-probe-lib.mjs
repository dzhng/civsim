export const GPU_SWIFTSHADER_FLAGS = [
  "--enable-unsafe-gpu",
  "--enable-unsafe-swiftshader",
  "--enable-features=Vulkan,WebGPU",
  "--use-vulkan=swiftshader",
  "--use-angle=swiftshader",
  "--use-gpu-adapter=swiftshader",
];

export const GPU_HARDWARE_FLAGS = ["--enable-unsafe-gpu", "--enable-features=WebGPU"];

export const GPU_FLAGS = GPU_SWIFTSHADER_FLAGS;

export const GPU_PROBE_HTML = `<!doctype html>
<meta charset="utf-8">
<title>WebGPU probe</title>
<style>html,body{margin:0;background:#111}canvas{display:block;width:256px;height:256px}</style>
<canvas id="c" width="256" height="256"></canvas>
<script type="module">
const out = { hasNavigatorGpu: !!navigator.gpu, adapter: false, device: false, rendered: false, error: null };
try {
  if (!navigator.gpu) throw new Error('navigator.gpu is absent');
  const adapter = await navigator.gpu.requestAdapter();
  out.adapter = !!adapter;
  if (!adapter) throw new Error('requestAdapter returned null');
  const device = await adapter.requestDevice();
  out.device = !!device;
  const canvas = document.getElementById('c');
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  const encoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: textureView,
      loadOp: 'clear',
      clearValue: { r: 0.92, g: 0.24, b: 0.08, a: 1 },
      storeOp: 'store',
    }],
  });
  pass.end();
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  out.rendered = true;
  window.__gpuProbeDevice = device;
} catch (error) {
  out.error = String(error && error.message ? error.message : error);
}
window.__gpuProbe = out;
</script>`;

export function gpuPixelLooksCleared(pixel) {
  const [r, g, b] = pixel;
  return r > 180 && g > 25 && g < 110 && b < 80;
}
