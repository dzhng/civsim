/* S0 stack-setup: the React overlay entry point.
 *
 * React mounts into #ui-root, a SIBLING of #battlefield/#minimap — never a
 * parent. The canvas stays raw DOM owned by the renderer/rAF loop; React only
 * ever owns the overlay above it (architecture decision 1). This module is a
 * second Vite entry alongside main.ts so the stack is exercised every build
 * without touching the scene bootstrap.
 *
 * For now it renders nothing on a normal load (the canary shows only under
 * `?canary`), so no pixels change. S2 replaces the canary with the real menu. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tailwind.css';
import { Canary } from './Canary';

const el = document.getElementById('ui-root');
if (el) {
  const showCanary = new URLSearchParams(location.search).has('canary');
  createRoot(el).render(<StrictMode>{showCanary ? <Canary /> : null}</StrictMode>);
}
