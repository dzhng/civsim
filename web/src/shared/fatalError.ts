// A renderer fatal error (failed init, lost device, rejected submission) must
// never leave a silent blank canvas. This renders one actionable panel over the
// canvas and records the fault on `window.__webgpuFatal` so the fault-injection
// lab and scene gates can observe that the renderer reached a defined state.

export interface FatalErrorSurface {
  kind: 'init' | 'device-lost' | 'submission';
  title: string;
  detail: string;
}

const SURFACE_ID = 'webgpu-fatal-surface';

declare global {
  interface Window {
    __webgpuFatal?: FatalErrorSurface | null;
  }
}

/** Overlay an actionable fatal-error panel over the canvas (idempotent). */
export function showFatalErrorSurface(canvas: HTMLCanvasElement, surface: FatalErrorSurface): void {
  window.__webgpuFatal = surface;
  const host = canvas.parentElement ?? document.body;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  let panel = document.getElementById(SURFACE_ID) as HTMLDivElement | null;
  if (!panel) {
    panel = document.createElement('div');
    panel.id = SURFACE_ID;
    Object.assign(panel.style, {
      position: 'absolute',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      background: 'rgba(18, 14, 12, 0.86)',
      color: '#f4ece0',
      font: '15px/1.5 system-ui, sans-serif',
      textAlign: 'center',
      padding: '24px',
      zIndex: '50',
    } satisfies Partial<CSSStyleDeclaration>);
    host.appendChild(panel);
  }
  // Cover exactly the canvas box, not the whole host — sibling panels (e.g. the
  // lab's diagnostics column) must stay readable during the error state.
  panel.style.left = `${canvas.offsetLeft}px`;
  panel.style.top = `${canvas.offsetTop}px`;
  panel.style.width = `${canvas.offsetWidth}px`;
  panel.style.height = `${canvas.offsetHeight}px`;
  panel.innerHTML = '';
  const title = document.createElement('div');
  title.style.fontSize = '18px';
  title.style.fontWeight = '600';
  title.textContent = surface.title;
  const detail = document.createElement('div');
  detail.style.maxWidth = '460px';
  detail.style.opacity = '0.85';
  detail.textContent = surface.detail;
  const reload = document.createElement('button');
  reload.textContent = 'Reload';
  Object.assign(reload.style, {
    marginTop: '6px',
    padding: '8px 18px',
    cursor: 'pointer',
    border: '1px solid #b89878',
    borderRadius: '6px',
    background: '#2c2420',
    color: '#f4ece0',
    font: 'inherit',
  } satisfies Partial<CSSStyleDeclaration>);
  reload.addEventListener('click', () => location.reload());
  panel.append(title, detail, reload);
}

/** Map a renderer fault to a user-facing surface. */
export function fatalSurfaceFor(kind: FatalErrorSurface['kind'], message: string): FatalErrorSurface {
  switch (kind) {
    case 'device-lost':
      return { kind, title: 'GPU was reset', detail: `${message} Reload to restart the renderer.` };
    case 'submission':
      return { kind, title: 'Renderer error', detail: `${message} Reload to restart the renderer.` };
    default:
      return { kind, title: 'WebGPU failed to start', detail: message };
  }
}
