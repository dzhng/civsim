export const WEBGPU_SWIFTSHADER_FLAGS = [
  '--enable-unsafe-webgpu',
  '--enable-unsafe-swiftshader',
  '--enable-features=Vulkan,WebGPU',
  '--use-vulkan=swiftshader',
  '--use-angle=swiftshader',
  '--use-webgpu-adapter=swiftshader',
];

export const WEBGPU_HARDWARE_FLAGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=WebGPU',
];

export const WEBGPU_FLAGS = WEBGPU_SWIFTSHADER_FLAGS;

export const WEBGPU_PROBE_HTML = `<!doctype html>
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
  window.__webgpuProbeDevice = device;
} catch (error) {
  out.error = String(error && error.message ? error.message : error);
}
window.__webgpuProbe = out;
</script>`;

export function webgpuPixelLooksCleared(pixel) {
  const [r, g, b] = pixel;
  return r > 180 && g > 25 && g < 110 && b < 80;
}
